import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";
import {
    OUTSOURCE_MODULE_DEFINITIONS,
    OUTSOURCE_MODULE_KEYS,
    PERMISSIONS,
    SYSTEM_ROLES,
    type OutsourceModuleKey,
    type PermissionCode,
    type SystemRole,
} from "@/lib/permissions";
import { toWIBDateString } from "@/lib/timezone";
import { actorFromSession, logAction } from "@/lib/services/auditService";

export class OutsourceUserError extends Error {
    constructor(
        message: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = "OutsourceUserError";
    }
}

const EXCLUDED_ADMIN_ROLES: SystemRole[] = [
    SYSTEM_ROLES.SUPER_ADMIN,
    SYSTEM_ROLES.HR_ADMIN,
    SYSTEM_ROLES.GA_ADMIN,
];

const OUTSOURCE_RBAC_PERMISSIONS: ReadonlyArray<readonly [PermissionCode, string]> = [
    [PERMISSIONS.OUTSOURCE_PORTAL, "Portal Outsource E-Checklist"],
    [PERMISSIONS.CLEANING_EXECUTE, "Eksekusi Kebersihan"],
    [PERMISSIONS.CLEANING_OVERVIEW, "Pantau Rekap Kebersihan"],
    [PERMISSIONS.EQUIPMENT_EXECUTE, "Eksekusi Inspeksi Alat"],
    [PERMISSIONS.EQUIPMENT_QC, "QC Inspeksi Alat"],
    [PERMISSIONS.EQUIPMENT_APPROVE, "Approver Final Alat"],
    [PERMISSIONS.EQUIPMENT_OVERVIEW, "Pantau Rekap Alat"],
];

const OUTSOURCE_RBAC_ROLES: ReadonlyArray<readonly [SystemRole, string, readonly PermissionCode[]]> = [
    [SYSTEM_ROLES.OUTSOURCE_USER, "Akun Outsource", [PERMISSIONS.OUTSOURCE_PORTAL]],
    [SYSTEM_ROLES.CLEANING_WORKER, "Petugas Kebersihan", [PERMISSIONS.CLEANING_EXECUTE]],
    [SYSTEM_ROLES.CLEANING_VIEWER, "Pemantau Kebersihan", [PERMISSIONS.CLEANING_OVERVIEW]],
    [SYSTEM_ROLES.EQUIPMENT_OPERATOR, "Operator Inspeksi Alat", [PERMISSIONS.EQUIPMENT_EXECUTE]],
    [SYSTEM_ROLES.EQUIPMENT_QC, "QC Inspeksi Alat", [PERMISSIONS.EQUIPMENT_QC]],
    [SYSTEM_ROLES.EQUIPMENT_APPROVER, "Approver Final Alat", [PERMISSIONS.EQUIPMENT_APPROVE]],
    [SYSTEM_ROLES.EQUIPMENT_VIEWER, "Pemantau Inspeksi Alat", [PERMISSIONS.EQUIPMENT_OVERVIEW]],
];

const ROLE_TO_MODULE = new Map<string, OutsourceModuleKey>(
    OUTSOURCE_MODULE_DEFINITIONS.map((m) => [m.roleCode, m.key])
);

const MODULE_TO_ROLE = new Map<OutsourceModuleKey, SystemRole>(
    OUTSOURCE_MODULE_DEFINITIONS.map((m) => [m.key, m.roleCode])
);

let rbacEnsured = false;

export function resetOutsourceRbacEnsuredCache(): void {
    rbacEnsured = false;
}

export function isWig002Session(session: SessionPayload): boolean {
    return session.username === "WIG002" && session.permissions.includes(PERMISSIONS.GA_MANAGE);
}

export function requireWig002ForOutsource(session: SessionPayload): void {
    if (!isWig002Session(session)) {
        throw new OutsourceUserError("Hanya Admin GA yang dapat mengelola akun outsource.", 403);
    }
}

/**
 * Self-healing idempotent upsert for Outsource RBAC roles & permissions.
 * Ensures production deploys never fail even if seedRbac was not re-run manually.
 */
export async function ensureOutsourceRbac(
    db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
    if (rbacEnsured && db === prisma) return;

    const permIdByCode = new Map<string, string>();
    for (const [code, name] of OUTSOURCE_RBAC_PERMISSIONS) {
        const perm = await db.permission.upsert({
            where: { code },
            update: { name },
            create: { code, name },
            select: { id: true, code: true },
        });
        permIdByCode.set(perm.code, perm.id);
    }

    for (const [code, name, permCodes] of OUTSOURCE_RBAC_ROLES) {
        const role = await db.role.upsert({
            where: { code },
            update: { name },
            create: { code, name },
            select: { id: true },
        });
        for (const pCode of permCodes) {
            const permissionId = permIdByCode.get(pCode);
            if (!permissionId) continue;
            await db.rolePermission.upsert({
                where: { roleId_permissionId: { roleId: role.id, permissionId } },
                update: {},
                create: { roleId: role.id, permissionId },
            });
        }
    }

    if (db === prisma) rbacEnsured = true;
}

/** Canonical filter matching both new OUTSOURCE_USER accounts and legacy WIG002 cleaning OS accounts. */
export function buildOutsourceAccountWhere(excludeUserId?: string): Prisma.UserAccountWhereInput {
    return {
        employeeId: null,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        roles: {
            none: { role: { code: { in: EXCLUDED_ADMIN_ROLES } } },
        },
        OR: [
            { roles: { some: { role: { code: SYSTEM_ROLES.OUTSOURCE_USER } } } },
            { roles: { some: { role: { code: SYSTEM_ROLES.CLEANING_WORKER } } } },
            { createdByUserId: { not: null } },
        ],
    };
}

export function extractModulesFromRoles(roleCodes: readonly string[]): OutsourceModuleKey[] {
    const set = new Set<OutsourceModuleKey>();
    for (const code of roleCodes) {
        const key = ROLE_TO_MODULE.get(code);
        if (key) set.add(key);
    }
    return OUTSOURCE_MODULE_KEYS.filter((k) => set.has(k));
}

function normalizeModules(raw: readonly OutsourceModuleKey[] | undefined): OutsourceModuleKey[] {
    if (!raw || raw.length === 0) return [];
    const set = new Set(raw);
    return OUTSOURCE_MODULE_KEYS.filter((k) => set.has(k));
}

function isPrismaUniqueError(err: unknown): boolean {
    return (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
    );
}

export interface OutsourceUserView {
    id: string;
    username: string;
    displayName: string;
    email: string;
    isActive: boolean;
    createdAt: Date;
    lastLoginAt: Date | null;
    isLegacyAccount: boolean;
    modules: OutsourceModuleKey[];
    cleaningAssignments: Array<{ id: string; room: { id: string; name: string } }>;
    activeEquipmentAssignmentsCount: number;
    canHardDelete: boolean;
}

export async function listOutsourceUsersForAdmin(
    session: SessionPayload,
    filters: { q?: string; status?: "all" | "active" | "inactive"; module?: OutsourceModuleKey | "all" } = {}
): Promise<OutsourceUserView[]> {
    requireWig002ForOutsource(session);
    const wibToday = toWIBDateString();

    const rows = await prisma.userAccount.findMany({
        where: buildOutsourceAccountWhere(session.userId),
        select: {
            id: true,
            username: true,
            displayName: true,
            email: true,
            isActive: true,
            createdAt: true,
            lastLoginAt: true,
            roles: { select: { role: { select: { code: true } } } },
            cleaningAssignments: {
                where: { OR: [{ endsOnWibDate: null }, { endsOnWibDate: { gt: wibToday } }] },
                select: { id: true, room: { select: { id: true, name: true } } },
                orderBy: { startsOnWibDate: "desc" },
            },
            equipmentAssignments: {
                where: { OR: [{ endsOnWibDate: null }, { endsOnWibDate: { gt: wibToday } }] },
                select: { id: true },
            },
            _count: {
                select: {
                    cleaningAssignments: true,
                    cleaningItemChanges: true,
                    cleaningEvidenceUploads: true,
                    equipmentAssignments: true,
                    startedEquipmentInspections: true,
                    checkedEquipmentInspections: true,
                    approvedEquipmentInspections: true,
                    equipmentItemChanges: true,
                },
            },
        },
        orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
    });

    const q = (filters.q ?? "").trim().toLowerCase();
    const status = filters.status ?? "all";
    const mod = filters.module ?? "all";

    return rows
        .map<OutsourceUserView>((u) => {
            const roleCodes = u.roles.map((r) => r.role.code);
            const modules = extractModulesFromRoles(roleCodes);
            const hasHistory =
                u._count.cleaningAssignments > 0 ||
                u._count.cleaningItemChanges > 0 ||
                u._count.cleaningEvidenceUploads > 0 ||
                u._count.equipmentAssignments > 0 ||
                u._count.startedEquipmentInspections > 0 ||
                u._count.checkedEquipmentInspections > 0 ||
                u._count.approvedEquipmentInspections > 0 ||
                u._count.equipmentItemChanges > 0;
            return {
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                email: u.email,
                isActive: u.isActive,
                createdAt: u.createdAt,
                lastLoginAt: u.lastLoginAt,
                isLegacyAccount: !roleCodes.includes(SYSTEM_ROLES.OUTSOURCE_USER),
                modules,
                cleaningAssignments: u.cleaningAssignments,
                activeEquipmentAssignmentsCount: u.equipmentAssignments.length,
                canHardDelete: !hasHistory,
            };
        })
        .filter((u) => {
            if (status === "active" && !u.isActive) return false;
            if (status === "inactive" && u.isActive) return false;
            if (mod !== "all" && !u.modules.includes(mod)) return false;
            if (q) {
                const hay = `${u.displayName} ${u.username} ${u.email}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
}

export async function createOutsourceUserAccount(
    session: SessionPayload,
    data: {
        username: string;
        displayName: string;
        password: string;
        email?: string;
        modules?: OutsourceModuleKey[];
    }
): Promise<OutsourceUserView> {
    requireWig002ForOutsource(session);

    const username = data.username.trim().toLowerCase();
    if (username.length < 3 || username.length > 100 || !/^[a-z0-9._-]+$/.test(username)) {
        throw new OutsourceUserError(
            "Username harus 3 sampai 100 karakter dan hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung.",
            400
        );
    }

    const displayName = data.displayName.trim();
    if (displayName.length < 2 || displayName.length > 150) {
        throw new OutsourceUserError("Nama lengkap harus 2 sampai 150 karakter.", 400);
    }

    const rawPassword = data.password;
    if (!rawPassword || rawPassword.length < 8 || rawPassword.length > 128) {
        throw new OutsourceUserError("Kata sandi harus 8 sampai 128 karakter.", 400);
    }

    const rawEmail = data.email?.trim().toLowerCase() ?? "";
    const finalEmail = rawEmail || `${username}@outsource.wig.co.id`;
    if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        throw new OutsourceUserError("Format email belum benar. Periksa kembali alamat email yang dimasukkan.", 400);
    }

    const modules = normalizeModules(data.modules);

    const existing = await prisma.userAccount.findFirst({
        where: { OR: [{ username }, { email: finalEmail }] },
        select: { username: true, email: true },
    });
    if (existing) {
        throw new OutsourceUserError(
            existing.username.toLowerCase() === username
                ? "Username sudah dipakai akun lain. Gunakan username yang berbeda."
                : "Email sudah dipakai akun lain. Gunakan email yang berbeda.",
            409
        );
    }

    await ensureOutsourceRbac(prisma);
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    const targetRoleCodes: SystemRole[] = [
        SYSTEM_ROLES.OUTSOURCE_USER,
        ...modules.map((m) => MODULE_TO_ROLE.get(m)!),
    ];

    let createdId = "";
    try {
        createdId = await prisma.$transaction(async (tx) => {
            const roles = await tx.role.findMany({
                where: { code: { in: targetRoleCodes } },
                select: { id: true, code: true },
            });
            if (roles.length !== targetRoleCodes.length) {
                throw new OutsourceUserError("Pengaturan akses akun belum siap. Coba lagi sebentar atau hubungi tim IT.", 500);
            }

            const user = await tx.userAccount.create({
                data: {
                    username,
                    displayName,
                    email: finalEmail,
                    passwordHash,
                    isActive: true,
                    employeeId: null,
                    createdByUserId: session.userId,
                },
                select: { id: true },
            });

            await tx.userRoleAssignment.createMany({
                data: roles.map((r) => ({
                    userId: user.id,
                    roleId: r.id,
                    assignedByUserId: session.userId,
                })),
            });

            return user.id;
        });
    } catch (err) {
        if (err instanceof OutsourceUserError) throw err;
        if (isPrismaUniqueError(err)) {
            throw new OutsourceUserError("Username atau email sudah dipakai akun lain. Gunakan data yang berbeda.", 409);
        }
        throw err;
    }

    await logAction("CREATE_OUTSOURCE_USER", "USER_ACCOUNT", actorFromSession(session), createdId, {
        username,
        displayName,
        email: finalEmail,
        modules,
    });

    const list = await listOutsourceUsersForAdmin(session);
    const found = list.find((u) => u.id === createdId);
    if (!found) {
        throw new OutsourceUserError("Akun berhasil dibuat, tetapi datanya gagal dimuat ulang. Muat ulang halaman untuk melihat hasilnya.", 500);
    }
    return found;
}

export async function updateOutsourceUserAccount(
    session: SessionPayload,
    id: string,
    data: {
        displayName?: string;
        email?: string;
        isActive?: boolean;
        modules?: OutsourceModuleKey[];
    }
): Promise<OutsourceUserView> {
    requireWig002ForOutsource(session);

    const target = await prisma.userAccount.findFirst({
        where: { id, ...buildOutsourceAccountWhere(session.userId) },
        include: { roles: { include: { role: { select: { id: true, code: true } } } } },
    });
    if (!target) {
        throw new OutsourceUserError("Akun outsource tidak ditemukan.", 404);
    }

    let nextEmail: string | undefined;
    if (data.email !== undefined) {
        const cleanEmail = data.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            throw new OutsourceUserError("Format email belum benar. Periksa kembali alamat email yang dimasukkan.", 400);
        }
        if (cleanEmail !== target.email.toLowerCase()) {
            const clash = await prisma.userAccount.findFirst({
                where: { email: cleanEmail, id: { not: id } },
                select: { id: true },
            });
            if (clash) throw new OutsourceUserError("Email sudah dipakai akun lain. Gunakan email yang berbeda.", 409);
        }
        nextEmail = cleanEmail;
    }

    let nextDisplayName: string | undefined;
    if (data.displayName !== undefined) {
        const cleanName = data.displayName.trim();
        if (cleanName.length < 2 || cleanName.length > 150) {
            throw new OutsourceUserError("Nama lengkap harus 2 sampai 150 karakter.", 400);
        }
        nextDisplayName = cleanName;
    }

    const modulesChanged = data.modules !== undefined;
    const statusChanged = data.isActive !== undefined && data.isActive !== target.isActive;
    const deactivating = data.isActive === false && target.isActive;
    const existingRoleCodes = target.roles.map((r) => r.role.code);
    const shouldPromoteBaseRole = !existingRoleCodes.includes(SYSTEM_ROLES.OUTSOURCE_USER);
    const nextModules = modulesChanged
        ? normalizeModules(data.modules)
        : extractModulesFromRoles(existingRoleCodes);

    if (modulesChanged || shouldPromoteBaseRole) {
        await ensureOutsourceRbac(prisma);
    }

    const wibToday = toWIBDateString();
    const shouldBumpSession = modulesChanged || statusChanged || shouldPromoteBaseRole;

    try {
        await prisma.$transaction(async (tx) => {
            if (modulesChanged || shouldPromoteBaseRole) {
                const desiredRoleCodes: SystemRole[] = [
                    SYSTEM_ROLES.OUTSOURCE_USER,
                    ...nextModules.map((m) => MODULE_TO_ROLE.get(m)!),
                ];
                const desiredRoles = await tx.role.findMany({
                    where: { code: { in: desiredRoleCodes } },
                    select: { id: true, code: true },
                });
                if (desiredRoles.length !== desiredRoleCodes.length) {
                    throw new OutsourceUserError("Pengaturan akses akun belum siap. Coba lagi sebentar atau hubungi tim IT.", 500);
                }

                await tx.userRoleAssignment.deleteMany({ where: { userId: target.id } });
                await tx.userRoleAssignment.createMany({
                    data: desiredRoles.map((r) => ({
                        userId: target.id,
                        roleId: r.id,
                        assignedByUserId: session.userId,
                    })),
                });
            }

            if (deactivating) {
                // Akhiri penugasan Cleaning aktif (unstarted dihapus, berjalan diakhiri hari ini)
                await tx.cleaningWorkerAssignment.deleteMany({
                    where: { userId: target.id, startsOnWibDate: { gt: wibToday } },
                });
                await tx.cleaningWorkerAssignment.updateMany({
                    where: {
                        userId: target.id,
                        startsOnWibDate: { lte: wibToday },
                        OR: [{ endsOnWibDate: null }, { endsOnWibDate: { gt: wibToday } }],
                    },
                    data: { endsOnWibDate: wibToday },
                });

                // Akhiri penugasan Equipment aktif
                await tx.equipmentAssignment.deleteMany({
                    where: { userId: target.id, startsOnWibDate: { gt: wibToday } },
                });
                await tx.equipmentAssignment.updateMany({
                    where: {
                        userId: target.id,
                        startsOnWibDate: { lte: wibToday },
                        OR: [{ endsOnWibDate: null }, { endsOnWibDate: { gt: wibToday } }],
                    },
                    data: { endsOnWibDate: wibToday },
                });
            }

            await tx.userAccount.update({
                where: { id: target.id },
                data: {
                    ...(nextDisplayName !== undefined ? { displayName: nextDisplayName } : {}),
                    ...(nextEmail !== undefined ? { email: nextEmail } : {}),
                    ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
                    ...(shouldBumpSession ? { sessionVersion: { increment: 1 } } : {}),
                },
            });
        });
    } catch (err) {
        if (err instanceof OutsourceUserError) throw err;
        if (isPrismaUniqueError(err)) {
            throw new OutsourceUserError("Email sudah digunakan oleh akun lain.", 409);
        }
        throw err;
    }

    await logAction("UPDATE_OUTSOURCE_USER", "USER_ACCOUNT", actorFromSession(session), target.id, {
        username: target.username,
        displayName: nextDisplayName ?? target.displayName,
        email: nextEmail ?? target.email,
        isActive: data.isActive ?? target.isActive,
        modules: nextModules,
        deactivatedAssignments: deactivating,
    });

    const list = await listOutsourceUsersForAdmin(session);
    const updated = list.find((u) => u.id === target.id);
    if (!updated) throw new OutsourceUserError("Akun outsource tidak ditemukan setelah pembaruan.", 404);
    return updated;
}

export async function resetOutsourceUserPassword(
    session: SessionPayload,
    id: string,
    newPassword: string
): Promise<{ id: string; username: string }> {
    requireWig002ForOutsource(session);

    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
        throw new OutsourceUserError("Kata sandi baru harus 8 sampai 128 karakter.", 400);
    }

    const target = await prisma.userAccount.findFirst({
        where: { id, ...buildOutsourceAccountWhere(session.userId) },
        select: { id: true, username: true },
    });
    if (!target) {
        throw new OutsourceUserError("Akun outsource tidak ditemukan.", 404);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction(async (tx) => {
        await tx.userAccount.update({
            where: { id: target.id },
            data: {
                passwordHash,
                passwordChangedAt: new Date(),
                sessionVersion: { increment: 1 },
            },
        });
        await tx.passkeyCredential.deleteMany({ where: { userId: target.id } });
    });

    await logAction("RESET_OUTSOURCE_PASSWORD", "USER_ACCOUNT", actorFromSession(session), target.id, {
        username: target.username,
    });

    return target;
}

export async function deleteOutsourceUserAccount(
    session: SessionPayload,
    id: string
): Promise<{ id: string; username: string }> {
    requireWig002ForOutsource(session);

    const target = await prisma.userAccount.findFirst({
        where: { id, ...buildOutsourceAccountWhere(session.userId) },
        select: {
            id: true,
            username: true,
            _count: {
                select: {
                    cleaningAssignments: true,
                    cleaningItemChanges: true,
                    cleaningEvidenceUploads: true,
                    equipmentAssignments: true,
                    startedEquipmentInspections: true,
                    checkedEquipmentInspections: true,
                    approvedEquipmentInspections: true,
                    equipmentItemChanges: true,
                },
            },
        },
    });
    if (!target) {
        throw new OutsourceUserError("Akun outsource tidak ditemukan.", 404);
    }

    const hasHistory =
        target._count.cleaningAssignments > 0 ||
        target._count.cleaningItemChanges > 0 ||
        target._count.cleaningEvidenceUploads > 0 ||
        target._count.equipmentAssignments > 0 ||
        target._count.startedEquipmentInspections > 0 ||
        target._count.checkedEquipmentInspections > 0 ||
        target._count.approvedEquipmentInspections > 0 ||
        target._count.equipmentItemChanges > 0;

    if (hasHistory) {
        throw new OutsourceUserError(
            "Akun ini sudah memiliki riwayat penugasan atau inspeksi sehingga tidak bisa dihapus permanen. Gunakan tombol Nonaktifkan agar riwayat tetap tersimpan.",
            409
        );
    }

    await prisma.userAccount.delete({ where: { id: target.id } });

    await logAction("DELETE_OUTSOURCE_USER", "USER_ACCOUNT", actorFromSession(session), target.id, {
        username: target.username,
    });

    return { id: target.id, username: target.username };
}

/**
 * Daftar akun OS aktif yang sudah diberi permission modul tertentu oleh WIG002.
 * Dipakai oleh picker Penugasan Unit / Anggota QC / Approver Final (untuk WIG002 maupun PIC Delegasi Equipment).
 */
export async function listEligibleOutsourceUsersForPermission(
    permissionCode: PermissionCode,
    q?: string
): Promise<Array<{ userId: string; username: string; displayName: string; email: string }>> {
    const query = (q ?? "").trim();
    const rows = await prisma.userAccount.findMany({
        where: {
            isActive: true,
            employeeId: null,
            roles: {
                none: { role: { code: { in: EXCLUDED_ADMIN_ROLES } } },
                some: {
                    role: {
                        permissions: {
                            some: { permission: { code: permissionCode } },
                        },
                    },
                },
            },
            ...(query
                ? {
                      OR: [
                          { displayName: { contains: query } },
                          { username: { contains: query } },
                      ],
                  }
                : {}),
        },
        select: { id: true, username: true, displayName: true, email: true },
        orderBy: { displayName: "asc" },
        take: 30,
    });
    return rows.map((r) => ({
        userId: r.id,
        username: r.username,
        displayName: r.displayName,
        email: r.email,
    }));
}

/** Validasi bahwa userId milik akun OS aktif dengan permission modul yang disyaratkan. */
export async function assertActiveOutsourceWithPermission(
    db: Prisma.TransactionClient | typeof prisma,
    userId: string,
    permissionCode: PermissionCode,
    moduleLabel: string
): Promise<{ userId: string; username: string; displayName: string }> {
    const user = await db.userAccount.findFirst({
        where: {
            id: userId,
            isActive: true,
            employeeId: null,
            roles: {
                none: { role: { code: { in: EXCLUDED_ADMIN_ROLES } } },
                some: {
                    role: {
                        permissions: {
                            some: { permission: { code: permissionCode } },
                        },
                    },
                },
            },
        },
        select: { id: true, username: true, displayName: true },
    });
    if (!user) {
        throw new OutsourceUserError(
            `Akun outsource ini tidak aktif atau belum diberi akses "${moduleLabel}" oleh Admin GA.`,
            422
        );
    }
    return { userId: user.id, username: user.username, displayName: user.displayName };
}
