import { rename, access } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { normalizeEmployeeId } from "@/lib/security/pii";
import { PERMISSIONS } from "@/lib/permissions";
import type { AuditActor } from "@/lib/services/auditService";
import type { SessionPayload } from "@/lib/auth";
import logger from "@/lib/logger";

export class NipFixError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = "NipFixError";
        this.statusCode = statusCode;
    }
}

/** Kunci WIG001 — tiru verbatim canManageCorrections. */
export function canFixEmployeeNip(session: SessionPayload | null): boolean {
    return Boolean(session && session.username === "WIG001" && session.permissions.includes(PERMISSIONS.HR_MANAGE));
}

const NIP_PATTERN = /^[A-Za-z0-9-]+$/;

function validateNewNipFormat(raw: string): string {
    const value = raw.trim();
    if (value.length < 3 || value.length > 50) {
        throw new NipFixError("NIP baru wajib 3–50 karakter.", 422);
    }
    if (!NIP_PATTERN.test(value)) {
        throw new NipFixError("NIP baru hanya boleh huruf, angka, dan strip.", 422);
    }
    return value;
}

export type NipFixImpact = {
    employee: { id: string; employeeId: string; name: string };
    newEmployeeId: string;
    counts: {
        attendance: number;
        corrections: number;
        pendingCorrections: number;
        pendingLeave: number;
        pendingOvertime: number;
        documents: number;
        shiftAssignments: number;
        subordinates: number;
        assetsHeld: number;
    };
    usernameClash: boolean;
    blockedReasons: string[];
};

/** Hitung dampak tanpa mengubah apapun (dipakai preview modal). */
export async function previewNipFixImpact(employeeUuid: string, rawNewId: string): Promise<NipFixImpact> {
    const newEmployeeId = validateNewNipFormat(rawNewId);
    const employee = await prisma.employee.findUnique({
        where: { id: employeeUuid },
        select: { id: true, employeeId: true, name: true },
    });
    if (!employee) throw new NipFixError("Karyawan tidak ditemukan.", 404);
    if (newEmployeeId === employee.employeeId) {
        throw new NipFixError("NIP baru sama dengan NIP saat ini.", 422);
    }

    const newNormalized = normalizeEmployeeId(newEmployeeId);
    const [idTaken, normalizedTaken, usernameTaken] = await Promise.all([
        prisma.employee.findUnique({ where: { employeeId: newEmployeeId }, select: { id: true } }),
        prisma.employee.findUnique({ where: { employeeIdNormalized: newNormalized }, select: { id: true } }),
        prisma.userAccount.findUnique({ where: { username: newEmployeeId }, select: { id: true, employeeId: true } }),
    ]);
    if (idTaken || normalizedTaken) throw new NipFixError("NIP baru sudah dipakai karyawan lain.", 409);
    const usernameClash = Boolean(usernameTaken && usernameTaken.employeeId !== employee.employeeId);

    const [attendance, corrections, pendingCorrections, pendingLeave, pendingOvertime, documents, shiftAssignments, subordinates, assetsHeld] =
        await Promise.all([
            prisma.attendanceRecord.count({ where: { employeeId: employee.employeeId } }),
            prisma.attendanceCorrection.count({ where: { employeeId: employee.employeeId } }),
            prisma.attendanceCorrection.count({ where: { employeeId: employee.employeeId, status: "PENDING" } }),
            prisma.leaveRequest.count({ where: { employeeId: employee.employeeId, status: "pending" } }),
            prisma.overtimeRequest.count({ where: { employeeId: employee.employeeId, status: "pending" } }),
            prisma.employeeDocument.count({ where: { employeeId: employee.employeeId } }),
            prisma.shiftAssignment.count({ where: { employeeId: employee.employeeId } }),
            prisma.employee.count({ where: { managerId: employee.employeeId } }),
            prisma.asset.count({ where: { assignedToId: employee.employeeId } }),
        ]);

    const blockedReasons: string[] = [];
    if (pendingCorrections > 0) blockedReasons.push(`${pendingCorrections} koreksi presensi masih PENDING.`);
    if (pendingLeave > 0) blockedReasons.push(`${pendingLeave} pengajuan cuti masih pending.`);
    if (pendingOvertime > 0) blockedReasons.push(`${pendingOvertime} pengajuan lembur masih pending.`);

    return {
        employee,
        newEmployeeId,
        counts: { attendance, corrections, pendingCorrections, pendingLeave, pendingOvertime, documents, shiftAssignments, subordinates, assetsHeld },
        usernameClash,
        blockedReasons,
    };
}

const STORAGE_SUBDIRS = ["employee-documents", "attendance-photos", "avatars"] as const;

async function pathExists(p: string): Promise<boolean> {
    try {
        await access(p);
        return true;
    } catch {
        return false;
    }
}

/**
 * Perbaiki NIP karyawan secara transaksional.
 * Urutan: validasi + lock terurut → transaksi DB → rename folder pasca-commit.
 * Folder lama yang sudah tidak ada dilewati; kegagalan rename dicatat warn (kompensasi manual).
 */
export async function fixEmployeeNip(
    employeeUuid: string,
    rawNewId: string,
    session: SessionPayload,
    actor: AuditActor,
): Promise<{ oldEmployeeId: string; newEmployeeId: string }> {
    if (!canFixEmployeeNip(session)) {
        throw new NipFixError("Hanya WIG001 yang dapat memperbaiki NIP.", 403);
    }
    const newEmployeeId = validateNewNipFormat(rawNewId);
    const newNormalized = normalizeEmployeeId(newEmployeeId);

    const employee = await prisma.employee.findUnique({
        where: { id: employeeUuid },
        select: { id: true, employeeId: true, name: true },
    });
    if (!employee) throw new NipFixError("Karyawan tidak ditemukan.", 404);
    if (newEmployeeId === employee.employeeId) {
        throw new NipFixError("NIP baru sama dengan NIP saat ini.", 422);
    }
    const oldEmployeeId = employee.employeeId;

    const storageRoot = path.resolve(process.cwd(), "storage");
    const renames = STORAGE_SUBDIRS.map((dir) => ({
        from: path.join(storageRoot, dir, oldEmployeeId),
        to: path.join(storageRoot, dir, newEmployeeId),
    }));
    for (const { to } of renames) {
        if (await pathExists(to)) {
            throw new NipFixError(`Folder tujuan sudah ada (${to}). Batalkan untuk menghindari tabrakan.`, 409);
        }
    }

    try {
        await prisma.$transaction(async (tx) => {
            // Lock terurut ASC agar dua eksekusi bersamaan tidak deadlock.
            await tx.$queryRaw`SELECT employee_id FROM employees WHERE employee_id IN (${oldEmployeeId}, ${newEmployeeId}) ORDER BY employee_id ASC FOR UPDATE`;

            const clash = await tx.employee.findFirst({
                where: {
                    OR: [{ employeeId: newEmployeeId }, { employeeIdNormalized: newNormalized }],
                    NOT: { id: employee.id },
                },
                select: { id: true },
            });
            if (clash) throw new NipFixError("NIP baru sudah dipakai karyawan lain.", 409);

            const usernameOwner = await tx.userAccount.findUnique({
                where: { username: newEmployeeId },
                select: { employeeId: true },
            });
            if (usernameOwner && usernameOwner.employeeId !== oldEmployeeId) {
                throw new NipFixError("Username tujuan sudah dipakai akun lain.", 409);
            }

            const pendingCorrections = await tx.attendanceCorrection.count({
                where: { employeeId: oldEmployeeId, status: "PENDING" },
            });
            const pendingLeave = await tx.leaveRequest.count({
                where: { employeeId: oldEmployeeId, status: "pending" },
            });
            const pendingOvertime = await tx.overtimeRequest.count({
                where: { employeeId: oldEmployeeId, status: "pending" },
            });
            if (pendingCorrections + pendingLeave + pendingOvertime > 0) {
                throw new NipFixError("Masih ada pengajuan pending (koreksi/cuti/lembur). Selesaikan dulu.", 409);
            }

            await tx.employee.update({
                where: { id: employee.id },
                data: { employeeId: newEmployeeId, employeeIdNormalized: newNormalized },
            });

            // String path berprefix NIP tidak ikut CASCADE — sinkronkan eksplisit.
            // Catatan: Prisma tidak mendukung REPLACE() via updateMany; gunakan raw per tabel path.
            await tx.$executeRaw`UPDATE employee_documents SET file_url = REPLACE(file_url, ${`${oldEmployeeId}/`}, ${`${newEmployeeId}/`}) WHERE employee_id = ${newEmployeeId} AND file_url LIKE ${`${oldEmployeeId}/%`}`;
            await tx.$executeRaw`UPDATE employees SET avatar_path = REPLACE(avatar_path, ${`${oldEmployeeId}/`}, ${`${newEmployeeId}/`}) WHERE employee_id = ${newEmployeeId} AND avatar_path LIKE ${`${oldEmployeeId}/%`}`;
            await tx.$executeRaw`UPDATE attendance_records SET clock_in_photo_path = REPLACE(clock_in_photo_path, ${`${oldEmployeeId}/`}, ${`${newEmployeeId}/`}) WHERE employee_id = ${newEmployeeId}`;
            await tx.$executeRaw`UPDATE attendance_records SET clock_out_photo_path = REPLACE(clock_out_photo_path, ${`${oldEmployeeId}/`}, ${`${newEmployeeId}/`}) WHERE employee_id = ${newEmployeeId}`;

            // Username ikut NIP (konvensi seed) + paksa relogin via sessionVersion.
            await tx.userAccount.updateMany({
                where: { employeeId: newEmployeeId },
                data: { username: newEmployeeId, sessionVersion: { increment: 1 } },
            });

            await tx.auditLog.create({
                data: {
                    action: "FIX_EMPLOYEE_NIP",
                    entity: "EMPLOYEE",
                    entityId: employee.id,
                    actorType: actor.type ?? "USER",
                    actorUserId: actor.userId,
                    actorIdentifier: actor.identifier,
                    actorName: actor.name ?? null,
                    actorRole: actor.role ?? null,
                    details: JSON.stringify({
                        oldEmployeeId,
                        newEmployeeId,
                        employeeName: employee.name,
                    }),
                },
            });
        });
    } catch (error) {
        if ((error as { code?: string })?.code === "P2002") {
            throw new NipFixError("NIP baru sudah dipakai (duplikat).", 409);
        }
        throw error;
    }

    // Di luar transaksi: rename folder (best-effort + kompensasi tercatat).
    for (const { from, to } of renames) {
        if (!(await pathExists(from))) continue;
        try {
            await rename(from, to);
        } catch (error) {
            logger.error("NIP-fix folder rename gagal, perlu tindakan manual", {
                from,
                to,
                oldEmployeeId,
                newEmployeeId,
                error,
            });
        }
    }

    return { oldEmployeeId, newEmployeeId };
}
