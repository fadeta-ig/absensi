import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        permission: { upsert: vi.fn() },
        role: { upsert: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
        rolePermission: { upsert: vi.fn() },
        userAccount: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        userRoleAssignment: {
            createMany: vi.fn(),
            deleteMany: vi.fn(),
            findFirst: vi.fn(),
        },
        passkeyCredential: { deleteMany: vi.fn() },
        cleaningWorkerAssignment: {
            count: vi.fn(),
            deleteMany: vi.fn(),
            updateMany: vi.fn(),
        },
        equipmentAssignment: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
            deleteMany: vi.fn(),
            updateMany: vi.fn(),
        },
        equipmentUnit: { findUnique: vi.fn(), findMany: vi.fn() },
        equipmentInspection: {
            findUnique: vi.fn(),
            findUniqueOrThrow: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            updateMany: vi.fn(),
        },
        equipmentInspectionItem: { createMany: vi.fn() },
        employee: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
        appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn(),
    },
}));

vi.mock("@/lib/services/auditService", () => ({
    logAction: vi.fn().mockResolvedValue(undefined),
    actorFromSession: vi.fn((s: { userId?: string; username?: string }) => ({
        userId: s.userId ?? null,
        identifier: s.username ?? "TEST",
    })),
}));

import { prisma } from "@/lib/prisma";
import {
    PERMISSIONS,
    SYSTEM_ROLES,
    getLandingPath,
    getPrimaryRole,
    type PermissionCode,
    type SystemRole,
} from "@/lib/permissions";
import {
    createOutsourceUserAccount,
    deleteOutsourceUserAccount,
    resetOutsourceRbacEnsuredCache,
    resetOutsourceUserPassword,
    updateOutsourceUserAccount,
} from "@/lib/services/outsourceUserService";
import { syncCleaningWorkerRole } from "@/lib/services/cleaningService";
import { updateAdminUser } from "@/lib/services/userService";
import {
    approveEquipmentInspection,
    assignEquipmentUnit,
    cancelEquipmentInspection,
    checkEquipmentDone,
    getEmployeeEquipmentCapabilities,
    getMyEquipmentInspections,
    invalidateEquipmentQcMembersCache,
    setEquipmentApprovers,
    setEquipmentQcMembers,
    startEquipmentInspection,
} from "@/lib/services/equipmentService";
import { toOsActorToken } from "@/lib/services/equipmentAuth";

const mocked = vi.mocked(prisma, true);

function wigSession() {
    return {
        userId: "u-wig",
        username: "WIG002",
        name: "Admin GA",
        primaryRole: SYSTEM_ROLES.GA_ADMIN,
        roles: [SYSTEM_ROLES.GA_ADMIN],
        permissions: [PERMISSIONS.GA_MANAGE, PERMISSIONS.EMPLOYEE_SELF, PERMISSIONS.ASSET_READ],
        employeeId: null,
    } as never;
}

function nonWigGaSession() {
    return {
        userId: "u-ga2",
        username: "GA002",
        name: "Other GA",
        primaryRole: SYSTEM_ROLES.GA_ADMIN,
        roles: [SYSTEM_ROLES.GA_ADMIN],
        permissions: [PERMISSIONS.GA_MANAGE],
        employeeId: "ID-GA2",
    } as never;
}

function osSession(perms: PermissionCode[], roles: SystemRole[] = [SYSTEM_ROLES.OUTSOURCE_USER]) {
    return {
        userId: "u-os-1",
        username: "os.budi",
        name: "Budi OS",
        primaryRole: SYSTEM_ROLES.OUTSOURCE_USER,
        roles,
        permissions: [PERMISSIONS.OUTSOURCE_PORTAL, ...perms],
        employeeId: null,
    } as never;
}

function setupRbacMocks() {
    mocked.permission.upsert.mockImplementation((async (args: { where: { code: string } }) => ({
        id: `perm-${args.where.code}`,
        code: args.where.code,
    })) as never);
    mocked.role.upsert.mockImplementation((async (args: { where: { code: string } }) => ({
        id: `role-${args.where.code}`,
        code: args.where.code,
    })) as never);
    mocked.rolePermission.upsert.mockResolvedValue({} as never);
    mocked.role.findMany.mockImplementation((async (args: { where: { code: { in: string[] } } }) =>
        args.where.code.in.map((code) => ({ id: `role-${code}`, code }))
    ) as never);
}

beforeEach(() => {
    vi.resetAllMocks();
    resetOutsourceRbacEnsuredCache();
    invalidateEquipmentQcMembersCache();
    setupRbacMocks();
    mocked.$transaction.mockImplementation((async (cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma)) as never);
    mocked.auditLog.create.mockResolvedValue({} as never);
    mocked.appSetting.upsert.mockResolvedValue({} as never);
});

describe("Portal routing & RBAC helpers (zero redirect loop)", () => {
    it("getLandingPath & getPrimaryRole menempatkan OUTSOURCE_USER di /outsource dan tidak fallback ke /employee", () => {
        expect(
            getLandingPath({
                roles: [SYSTEM_ROLES.OUTSOURCE_USER],
                permissions: [PERMISSIONS.OUTSOURCE_PORTAL],
                employeeId: null,
            })
        ).toBe("/outsource");

        expect(
            getLandingPath({
                roles: [SYSTEM_ROLES.OUTSOURCE_USER, SYSTEM_ROLES.CLEANING_WORKER, SYSTEM_ROLES.EQUIPMENT_OPERATOR],
                permissions: [PERMISSIONS.OUTSOURCE_PORTAL, PERMISSIONS.CLEANING_EXECUTE, PERMISSIONS.EQUIPMENT_EXECUTE],
                employeeId: null,
            })
        ).toBe("/outsource");

        // Akun OS legacy (tanpa OUTSOURCE_USER, hanya CLEANING_WORKER) tetap mendarat di /cleaning
        expect(
            getLandingPath({
                roles: [SYSTEM_ROLES.CLEANING_WORKER],
                permissions: [PERMISSIONS.CLEANING_EXECUTE],
                employeeId: null,
            })
        ).toBe("/cleaning");

        expect(getPrimaryRole([SYSTEM_ROLES.OUTSOURCE_USER, SYSTEM_ROLES.EQUIPMENT_QC])).toBe(
            SYSTEM_ROLES.OUTSOURCE_USER
        );
    });
});

describe("CRUD Outsource & RBAC (ketat WIG002-only + HR userService isolation)", () => {
    it("menolak non-WIG002 saat membuat, mengubah, mereset password, atau menghapus akun OS", async () => {
        await expect(
            createOutsourceUserAccount(nonWigGaSession(), {
                username: "os.test",
                displayName: "OS Test",
                password: "password123",
                modules: ["cleaning_execute"],
            })
        ).rejects.toMatchObject({ statusCode: 403 });

        await expect(
            updateOutsourceUserAccount(nonWigGaSession(), "u-os-1", { displayName: "Baru" })
        ).rejects.toMatchObject({ statusCode: 403 });

        await expect(
            resetOutsourceUserPassword(nonWigGaSession(), "u-os-1", "newpassword123")
        ).rejects.toMatchObject({ statusCode: 403 });

        await expect(deleteOutsourceUserAccount(nonWigGaSession(), "u-os-1")).rejects.toMatchObject({
            statusCode: 403,
        });
    });

    it("updateAdminUser menolak mutasi target akun OS dari jalur HR /api/users", async () => {
        mocked.userAccount.findUnique.mockResolvedValue({
            id: "u-os-1",
            isActive: true,
            roles: [{ role: { code: SYSTEM_ROLES.OUTSOURCE_USER } }],
        } as never);

        await expect(
            updateAdminUser({
                id: "u-os-1",
                actorUserId: "u-hr",
                displayName: "Dibajak HR",
            })
        ).rejects.toMatchObject({ status: 400, message: "Akun bukan user admin." });
    });

    it("soft-deactivate akun OS menaikkan sessionVersion dan otomatis mengakhiri penugasan Cleaning & Equipment aktif", async () => {
        mocked.userAccount.findFirst.mockResolvedValue({
            id: "u-os-1",
            username: "os.budi",
            displayName: "Budi OS",
            email: "os.budi@outsource.wig.co.id",
            isActive: true,
            roles: [
                { role: { id: "role-OUTSOURCE_USER", code: SYSTEM_ROLES.OUTSOURCE_USER } },
                { role: { id: "role-CLEANING_WORKER", code: SYSTEM_ROLES.CLEANING_WORKER } },
            ],
        } as never);
        mocked.userAccount.findMany.mockResolvedValue([
            {
                id: "u-os-1",
                username: "os.budi",
                displayName: "Budi OS",
                email: "os.budi@outsource.wig.co.id",
                isActive: false,
                createdAt: new Date(),
                lastLoginAt: null,
                roles: [{ role: { code: SYSTEM_ROLES.OUTSOURCE_USER } }],
                cleaningAssignments: [],
                equipmentAssignments: [],
                _count: {
                    cleaningAssignments: 1,
                    cleaningItemChanges: 0,
                    cleaningEvidenceUploads: 0,
                    equipmentAssignments: 1,
                    startedEquipmentInspections: 0,
                    checkedEquipmentInspections: 0,
                    approvedEquipmentInspections: 0,
                    equipmentItemChanges: 0,
                },
            },
        ] as never);

        const updated = await updateOutsourceUserAccount(wigSession(), "u-os-1", { isActive: false });
        expect(updated.isActive).toBe(false);
        expect(mocked.cleaningWorkerAssignment.updateMany).toHaveBeenCalled();
        expect(mocked.equipmentAssignment.updateMany).toHaveBeenCalled();
        expect(mocked.userAccount.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "u-os-1" },
                data: expect.objectContaining({
                    isActive: false,
                    sessionVersion: { increment: 1 },
                }),
            })
        );
    });

    it("safe-delete menolak 409 jika akun OS punya riwayat dan mengizinkan hapus permanen jika bersih", async () => {
        mocked.userAccount.findFirst.mockResolvedValueOnce({
            id: "u-os-1",
            username: "os.budi",
            _count: {
                cleaningAssignments: 2,
                cleaningItemChanges: 0,
                cleaningEvidenceUploads: 0,
                equipmentAssignments: 0,
                startedEquipmentInspections: 0,
                checkedEquipmentInspections: 0,
                approvedEquipmentInspections: 0,
                equipmentItemChanges: 0,
            },
        } as never);

        await expect(deleteOutsourceUserAccount(wigSession(), "u-os-1")).rejects.toMatchObject({ statusCode: 409 });
        expect(mocked.userAccount.delete).not.toHaveBeenCalled();

        mocked.userAccount.findFirst.mockResolvedValueOnce({
            id: "u-os-2",
            username: "os.baru",
            _count: {
                cleaningAssignments: 0,
                cleaningItemChanges: 0,
                cleaningEvidenceUploads: 0,
                equipmentAssignments: 0,
                startedEquipmentInspections: 0,
                checkedEquipmentInspections: 0,
                approvedEquipmentInspections: 0,
                equipmentItemChanges: 0,
            },
        } as never);

        const deleted = await deleteOutsourceUserAccount(wigSession(), "u-os-2");
        expect(deleted).toEqual({ id: "u-os-2", username: "os.baru" });
        expect(mocked.userAccount.delete).toHaveBeenCalledWith({ where: { id: "u-os-2" } });
    });

    it("syncCleaningWorkerRole tidak menghapus role CLEANING_WORKER pada akun OS berbasis OUTSOURCE_USER", async () => {
        mocked.userRoleAssignment.findFirst.mockResolvedValueOnce({
            role: { code: SYSTEM_ROLES.OUTSOURCE_USER },
        } as never);
        await syncCleaningWorkerRole(prisma, "u-os-1", "2026-11-23");
        expect(mocked.cleaningWorkerAssignment.count).not.toHaveBeenCalled();
    });
});

describe("Equipment E-Checklist untuk akun OS (Operator, QC, Approver, Overview)", () => {
    it("penugasan unit menolak OS tanpa equipment.execute (422) dan menerima OS ber-izin equipment.execute", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({
            id: "unit-1",
            name: "Mixer 1",
            isActive: true,
            company: "WIG",
        } as never);
        mocked.userAccount.findFirst.mockResolvedValueOnce(null);

        await expect(
            assignEquipmentUnit(wigSession(), { unitId: "unit-1", userId: "u-os-1" })
        ).rejects.toMatchObject({ statusCode: 422 });

        mocked.userAccount.findFirst.mockResolvedValueOnce({
            id: "u-os-1",
            username: "os.budi",
            displayName: "Budi OS",
        } as never);
        mocked.equipmentAssignment.findFirst.mockResolvedValue(null);
        mocked.equipmentAssignment.create.mockResolvedValue({
            id: "asg-1",
            unitId: "unit-1",
            userId: "u-os-1",
        } as never);

        const created = await assignEquipmentUnit(wigSession(), {
            unitId: "unit-1",
            employeeId: toOsActorToken("u-os-1"),
        });
        expect(created).toMatchObject({ id: "asg-1", userId: "u-os-1" });
    });

    it("operator OS ber-izin equipment.execute dapat memulai, melihat, dan membatalkan inspeksi dengan startedByEmployeeId = null", async () => {
        const session = osSession([PERMISSIONS.EQUIPMENT_EXECUTE], [
            SYSTEM_ROLES.OUTSOURCE_USER,
            SYSTEM_ROLES.EQUIPMENT_OPERATOR,
        ]);

        mocked.equipmentUnit.findUnique.mockResolvedValue({
            id: "unit-1",
            name: "Mixer 1",
            isActive: true,
            company: "WIG",
            isSharedBoth: false,
            template: {
                id: "tpl-1",
                isActive: true,
                items: [{ id: "ti-1", name: "Kebersihan", sortOrder: 1, requirePhoto: false }],
            },
        } as never);
        mocked.equipmentAssignment.findMany.mockResolvedValue([
            { unitId: "unit-1", startsOnWibDate: "2020-01-01", endsOnWibDate: null },
        ] as never);

        const inspectionRow = {
            id: "insp-os-1",
            unitId: "unit-1",
            unitNameSnapshot: "Mixer 1",
            startedByEmployeeId: null,
            startedByUserId: "u-os-1",
            startedByNameSnapshot: "Budi OS",
            status: "OPEN",
            createdAt: new Date(),
            submittedAt: null,
            checkedByEmployeeId: null,
            checkedByUserId: null,
            checkedByNameSnapshot: null,
            checkedAt: null,
            qcNote: null,
            approvedByEmployeeId: null,
            approvedByUserId: null,
            approvedByNameSnapshot: null,
            approvedAt: null,
            unit: { id: "unit-1", name: "Mixer 1", brand: null, location: null, company: "WIG", isSharedBoth: false },
            startedBy: null,
            startedByUser: { username: "os.budi", displayName: "Budi OS" },
            checkedBy: null,
            approvedBy: null,
            items: [{ id: "ii-1", itemNameSnapshot: "Kebersihan", sortOrder: 1, requirePhoto: false, isActive: true, isPass: null, note: null, lastChangedAt: null, lastChangedBy: null }],
            evidence: [],
            qcEvidence: [],
        };
        mocked.equipmentInspection.create.mockResolvedValue({ id: "insp-os-1" } as never);
        mocked.equipmentInspection.findUniqueOrThrow.mockResolvedValue(inspectionRow as never);
        mocked.equipmentInspection.findMany.mockResolvedValue([inspectionRow] as never);
        mocked.equipmentInspection.findUnique.mockResolvedValue(inspectionRow as never);
        mocked.equipmentInspection.updateMany.mockResolvedValue({ count: 1 } as never);

        const started = await startEquipmentInspection(session, "unit-1");
        expect(started.startedBy).toEqual({ employeeId: "os.budi", name: "Budi OS", isOutsource: true });
        expect(mocked.equipmentInspection.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    startedByEmployeeId: null,
                    startedByUserId: "u-os-1",
                    startedByNameSnapshot: "Budi OS",
                }),
            })
        );

        const mine = await getMyEquipmentInspections(session);
        expect(mine).toHaveLength(1);

        await expect(cancelEquipmentInspection(session, "insp-os-1")).resolves.toMatchObject({ id: "insp-os-1" });

        // Tanpa equipment.execute -> 403
        await expect(startEquipmentInspection(osSession([]), "unit-1")).rejects.toMatchObject({ statusCode: 403 });
    });

    it("QC OS & Approver Final OS divalidasi berdasarkan izin RBAC dan menyimpan UserId + NameSnapshot (EmployeeId = null)", async () => {
        const osToken = toOsActorToken("u-os-1");
        mocked.userAccount.findFirst.mockResolvedValue({
            id: "u-os-1",
            username: "os.budi",
            displayName: "Budi OS",
        } as never);
        mocked.userAccount.findUnique.mockResolvedValue({ isActive: true } as never);

        // Simpan OS ke daftar QC & Approver
        await expect(
            setEquipmentQcMembers(wigSession(), "WIG", [osToken], { userId: "u-wig", username: "WIG002" })
        ).resolves.toEqual([osToken]);
        await expect(
            setEquipmentApprovers(wigSession(), "WIG", [osToken], { userId: "u-wig", username: "WIG002" })
        ).resolves.toEqual([osToken]);

        mocked.appSetting.findUnique.mockImplementation((async (args: { where: { key: string } }) => {
            if (args.where.key === "equipment.qcMembers.WIG" || args.where.key === "equipment.approvers.WIG") {
                return { value: JSON.stringify([osToken]) };
            }
            return null;
        }) as never);

        const qcSession = osSession([PERMISSIONS.EQUIPMENT_QC], [SYSTEM_ROLES.OUTSOURCE_USER, SYSTEM_ROLES.EQUIPMENT_QC]);
        const appSession = osSession([PERMISSIONS.EQUIPMENT_APPROVE], [SYSTEM_ROLES.OUTSOURCE_USER, SYSTEM_ROLES.EQUIPMENT_APPROVER]);

        const submittedRow = {
            id: "insp-1",
            unitId: "unit-1",
            startedByEmployeeId: "ID-1",
            startedByUserId: "u-1",
            startedByNameSnapshot: "Andi",
            status: "SUBMITTED",
            createdAt: new Date(),
            submittedAt: new Date(),
            checkedByEmployeeId: null,
            checkedByUserId: null,
            checkedByNameSnapshot: null,
            checkedAt: null,
            qcNote: null,
            approvedByEmployeeId: null,
            approvedByUserId: null,
            approvedByNameSnapshot: null,
            approvedAt: null,
            unit: { id: "unit-1", name: "Mixer 1", brand: null, location: null, company: "WIG", isSharedBoth: false },
            startedBy: { employeeId: "ID-1", name: "Andi" },
            startedByUser: null,
            checkedBy: null,
            approvedBy: null,
            items: [],
            evidence: [],
            qcEvidence: [],
        };

        mocked.equipmentInspection.findUnique.mockResolvedValueOnce(submittedRow as never);
        mocked.equipmentInspection.updateMany.mockResolvedValue({ count: 1 } as never);
        mocked.equipmentInspection.findUnique.mockResolvedValueOnce({ ...submittedRow, status: "DONE" } as never);

        await checkEquipmentDone(qcSession, "insp-1", "OK");
        expect(mocked.equipmentInspection.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: "DONE",
                    checkedByEmployeeId: null,
                    checkedByUserId: "u-os-1",
                    checkedByNameSnapshot: "Budi OS",
                }),
            })
        );

        mocked.equipmentInspection.findUnique.mockResolvedValueOnce({ ...submittedRow, status: "DONE" } as never);
        mocked.equipmentInspection.findUnique.mockResolvedValueOnce({ ...submittedRow, status: "APPROVED" } as never);

        await approveEquipmentInspection(appSession, "insp-1");
        expect(mocked.equipmentInspection.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: "APPROVED",
                    approvedByEmployeeId: null,
                    approvedByUserId: "u-os-1",
                    approvedByNameSnapshot: "Budi OS",
                }),
            })
        );

        // Capabilities untuk OS dengan overview + QC + Approver
        mocked.equipmentAssignment.count.mockResolvedValue(0);
        const fullOs = osSession([
            PERMISSIONS.EQUIPMENT_QC,
            PERMISSIONS.EQUIPMENT_APPROVE,
            PERMISSIONS.EQUIPMENT_OVERVIEW,
        ]);
        const caps = await getEmployeeEquipmentCapabilities(fullOs);
        expect(caps.canReview).toBe(true);
        expect(caps.canApprove).toBe(true);
        expect(caps.canTopView).toBe(true);
        expect(caps.canManageSettings).toBe(false);
    });
});
