import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
        employee: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
        equipmentUnit: { findMany: vi.fn(), findUnique: vi.fn() },
        equipmentAssignment: { findMany: vi.fn() },
        equipmentInspection: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
        equipmentInspectionItem: { findUnique: vi.fn(), update: vi.fn() },
        equipmentInspectionEvidence: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
        equipmentQcEvidence: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn(),
    },
}));

const requireAuthMock = vi.fn();

vi.mock("@/lib/middleware/apiGuard", async () => {
    const { NextResponse } = await import("next/server");
    return {
        requireAuth: (...args: unknown[]) => requireAuthMock(...args),
        unauthorizedResponse: () => NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        forbiddenResponse: () => NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        serverErrorResponse: (_ctx: string, err: unknown) =>
            NextResponse.json({ error: String(err) }, { status: 500 }),
    };
});

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    hasEmployeePortalAccess,
    isEquipmentMasterAdmin,
    normalizeEquipmentName,
} from "@/lib/services/equipmentAuth";
import {
    requireEmployeeEquipmentAuth,
    requireGaEquipmentAdminAuth,
} from "@/lib/middleware/equipmentGuard";
import {
    approveEquipmentInspection,
    cancelEquipmentInspection,
    checkEquipmentDone,
    getApprovalQueue,
    getEquipmentApproversForAdmin,
    getEquipmentQcMembersForAdmin,
    getEquipmentTopViewersForAdmin,
    getMyEquipmentInspections,
    getMyEquipmentUnits,
    getPendingEquipmentApprovals,
    getUnitInspectionHistory,
    invalidateEquipmentQcMembersCache,
    listEquipmentEvidenceForGA,
    listQcEvidenceForGA,
    saveQcEvidence,
    startEquipmentInspection,
    submitEquipmentInspection,
    updateEquipmentInspectionItem,
} from "@/lib/services/equipmentService";
import { GET as getGaRecapRoute } from "@/app/api/ga/equipment/recap/route";

const mocked = vi.mocked(prisma, true);

function makeSession(over: Record<string, unknown> = {}) {
    return {
        userId: "u-1",
        username: "ID-001",
        name: "Pegawai",
        primaryRole: "EMPLOYEE_USER",
        roles: ["EMPLOYEE_USER"],
        permissions: ["employee.self"],
        employeeId: "ID-001",
        ...over,
    } as never;
}

function wigSession(over: Record<string, unknown> = {}) {
    return makeSession({
        userId: "u-wig",
        username: "WIG002",
        name: "GA Admin",
        primaryRole: "GA_ADMIN",
        roles: ["GA_ADMIN"],
        permissions: ["ga.manage"],
        employeeId: null,
        ...over,
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    invalidateEquipmentQcMembersCache();
    mocked.auditLog.create.mockResolvedValue({} as never);
    mocked.equipmentAssignment.findMany.mockResolvedValue([]);
});

describe("equipmentAuth predicates", () => {
    it("isEquipmentMasterAdmin hanya meloloskan WIG002 dengan ga.manage", () => {
        expect(isEquipmentMasterAdmin({ username: "WIG002", permissions: ["ga.manage"] })).toBe(true);
        expect(isEquipmentMasterAdmin({ username: "WIG002", permissions: ["employee.self"] })).toBe(false);
        expect(isEquipmentMasterAdmin({ username: "GA001", permissions: ["ga.manage"] })).toBe(false);
        expect(isEquipmentMasterAdmin({ username: "wig002", permissions: ["ga.manage"] })).toBe(false);
    });

    it("hasEmployeePortalAccess mensyaratkan employeeId dan employee.self", () => {
        expect(hasEmployeePortalAccess({ employeeId: "ID-001", permissions: ["employee.self"] })).toBe(true);
        expect(hasEmployeePortalAccess({ employeeId: null, permissions: ["employee.self"] })).toBe(false);
        expect(hasEmployeePortalAccess({ employeeId: "ID-001", permissions: ["ga.manage"] })).toBe(false);
    });

    it("normalizeEquipmentName menormalisasi spasi dan huruf kecil", () => {
        expect(normalizeEquipmentName("  Mesin   Press  A ")).toBe("mesin press a");
    });
});

describe("equipmentGuard HTTP route wrappers", () => {
    it("requireGaEquipmentAdminAuth mengembalikan 401/403 dan meloloskan WIG002 tanpa employeeId", async () => {
        requireAuthMock.mockResolvedValueOnce(null);
        const unauth = await requireGaEquipmentAdminAuth();
        expect(unauth.error?.status).toBe(401);

        requireAuthMock.mockResolvedValueOnce(makeSession({ username: "GA999", permissions: ["ga.manage"] }));
        const nonWig = await requireGaEquipmentAdminAuth();
        expect(nonWig.error?.status).toBe(403);

        requireAuthMock.mockResolvedValueOnce(wigSession());
        const ok = await requireGaEquipmentAdminAuth();
        expect(ok.error).toBeUndefined();
        expect(ok.session?.username).toBe("WIG002");
    });

    it("requireEmployeeEquipmentAuth menolak sesi tanpa employeeId atau tanpa employee.self", async () => {
        requireAuthMock.mockResolvedValueOnce(null);
        expect((await requireEmployeeEquipmentAuth()).error?.status).toBe(401);

        requireAuthMock.mockResolvedValueOnce(makeSession({ employeeId: null }));
        expect((await requireEmployeeEquipmentAuth()).error?.status).toBe(403);

        requireAuthMock.mockResolvedValueOnce(makeSession({ permissions: ["ga.manage"] }));
        expect((await requireEmployeeEquipmentAuth()).error?.status).toBe(403);

        requireAuthMock.mockResolvedValueOnce(makeSession());
        const ok = await requireEmployeeEquipmentAuth();
        expect(ok.error).toBeUndefined();
        expect(ok.session?.employeeId).toBe("ID-001");
    });
});

describe("defense-in-depth service guards", () => {
    it("admin settings getters menolak non-WIG002 dengan 403", async () => {
        const otherGa = makeSession({ username: "GA001", permissions: ["ga.manage"] });
        await expect(getEquipmentQcMembersForAdmin(otherGa, "WIG")).rejects.toMatchObject({ statusCode: 403 });
        await expect(getEquipmentApproversForAdmin(otherGa, "WIG")).rejects.toMatchObject({ statusCode: 403 });
        await expect(getEquipmentTopViewersForAdmin(otherGa)).rejects.toMatchObject({ statusCode: 403 });
    });

    it("GA evidence list helpers memblokir user biasa dan mengizinkan WIG002", async () => {
        mocked.appSetting.findUnique.mockResolvedValue(null);
        await expect(listEquipmentEvidenceForGA(makeSession(), "in1")).rejects.toMatchObject({ statusCode: 403 });
        await expect(listQcEvidenceForGA(makeSession(), "in1")).rejects.toMatchObject({ statusCode: 403 });

        mocked.equipmentInspection.findUnique.mockResolvedValue({ id: "in1" } as never);
        mocked.equipmentInspectionEvidence.findMany.mockResolvedValue([] as never);
        mocked.equipmentQcEvidence.findMany.mockResolvedValue([] as never);
        await expect(listEquipmentEvidenceForGA(wigSession(), "in1")).resolves.toEqual([]);
        await expect(listQcEvidenceForGA(wigSession(), "in1")).resolves.toEqual([]);
    });

    it("saveQcEvidence menegakkan guard QC di dalam service", async () => {
        const jpeg = Buffer.from([0xff, 0xd8, 0x00, 0x00, 0xff, 0xd9]);
        const noSelf = makeSession({ permissions: [] });
        await expect(
            saveQcEvidence({ session: noSelf, inspectionId: "in1", buffer: jpeg, mime: "image/jpeg", uploaderUserId: "u-1" })
        ).rejects.toMatchObject({ statusCode: 403 });

        mocked.equipmentInspection.findUnique.mockResolvedValue({ id: "in1", unit: { company: "WIG", isSharedBoth: false } } as never);
        mocked.appSetting.findUnique.mockResolvedValue({ value: JSON.stringify(["QC-OTHER"]) } as never);
        await expect(
            saveQcEvidence({ session: makeSession(), inspectionId: "in1", buffer: jpeg, mime: "image/jpeg", uploaderUserId: "u-1" })
        ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("operasi employee service menolak sesi tanpa permission employee.self dengan 403", async () => {
        const noSelf = makeSession({ permissions: ["ga.manage"] });
        await expect(getMyEquipmentUnits(noSelf)).rejects.toMatchObject({ statusCode: 403 });
        await expect(getMyEquipmentInspections(noSelf)).rejects.toMatchObject({ statusCode: 403 });
        await expect(getUnitInspectionHistory(noSelf, "u1")).rejects.toMatchObject({ statusCode: 403 });
        await expect(startEquipmentInspection(noSelf, "u1")).rejects.toMatchObject({ statusCode: 403 });
        await expect(updateEquipmentInspectionItem(noSelf, "it1", { isPass: true })).rejects.toMatchObject({ statusCode: 403 });
        await expect(submitEquipmentInspection(noSelf, "in1")).rejects.toMatchObject({ statusCode: 403 });
        await expect(cancelEquipmentInspection(noSelf, "in1")).rejects.toMatchObject({ statusCode: 403 });
        await expect(getPendingEquipmentApprovals(noSelf)).rejects.toMatchObject({ statusCode: 403 });
        await expect(getApprovalQueue(noSelf)).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe("konsistensi akses & optimistic lock transisi status", () => {
    it("getUnitInspectionHistory mengizinkan Final Approver perusahaan unit dan menolak non-terkait", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({ company: "WIG", isSharedBoth: false } as never);
        mocked.appSetting.findUnique.mockImplementation((async (args: { where: { key: string } }) =>
            args.where.key === "equipment.approvers.WIG" ? { value: JSON.stringify(["AP-001"]) } : null) as never);
        mocked.employee.findUnique.mockResolvedValue({ isActive: true } as never);
        mocked.equipmentInspection.findMany.mockResolvedValue([] as never);

        const approver = makeSession({ userId: "u-ap", username: "AP-001", employeeId: "AP-001" });
        await expect(getUnitInspectionHistory(approver, "u1")).resolves.toEqual([]);

        const stranger = makeSession({ userId: "u-stranger", username: "ID-999", employeeId: "ID-999" });
        await expect(getUnitInspectionHistory(stranger, "u1")).rejects.toMatchObject({ statusCode: 403 });
    });

    it("optimistic lock menolak 409 dan tidak menulis auditLog saat race condition (updateMany.count === 0)", async () => {
        const txMock = {
            equipmentInspection: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
            auditLog: { create: vi.fn() },
        };
        mocked.$transaction.mockImplementation((async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock)) as never);

        const openInsp = {
            id: "in1",
            status: "OPEN",
            startedByEmployeeId: "ID-001",
            unit: { id: "u1", company: "WIG", isSharedBoth: false },
            items: [{ isActive: true, isPass: true, requirePhoto: false }],
            evidence: [],
            qcEvidence: [],
        };
        mocked.equipmentInspection.findUnique.mockResolvedValue(openInsp as never);
        mocked.equipmentAssignment.findMany.mockResolvedValue([
            { unitId: "u1", userId: "u-1", startsOnWibDate: "2026-01-01", endsOnWibDate: null },
        ] as never);

        await expect(submitEquipmentInspection(makeSession(), "in1")).rejects.toMatchObject({ statusCode: 409 });
        expect(txMock.equipmentInspection.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "in1", status: "OPEN" } })
        );
        expect(txMock.auditLog.create).not.toHaveBeenCalled();

        await expect(cancelEquipmentInspection(makeSession(), "in1")).rejects.toMatchObject({ statusCode: 409 });
        expect(txMock.auditLog.create).not.toHaveBeenCalled();

        // QC DONE race
        mocked.equipmentInspection.findUnique.mockResolvedValue({ ...openInsp, status: "SUBMITTED" } as never);
        mocked.appSetting.findUnique.mockImplementation((async (args: { where: { key: string } }) =>
            args.where.key === "equipment.qcMembers.WIG" ? { value: JSON.stringify(["QC-001"]) } : null) as never);
        mocked.employee.findUnique.mockResolvedValue({ isActive: true } as never);
        mocked.employee.findFirst.mockResolvedValue({ employeeId: "QC-001", name: "QC", isActive: true, userAccount: { id: "u-qc" } } as never);
        const qc = makeSession({ userId: "u-qc", username: "QC-001", employeeId: "QC-001" });
        await expect(checkEquipmentDone(qc, "in1", "ok")).rejects.toMatchObject({ statusCode: 409 });
        expect(txMock.equipmentInspection.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "in1", status: "SUBMITTED" } })
        );
        expect(txMock.auditLog.create).not.toHaveBeenCalled();

        // Approver APPROVED race
        mocked.equipmentInspection.findUnique.mockResolvedValue({ ...openInsp, status: "DONE" } as never);
        mocked.appSetting.findUnique.mockImplementation((async (args: { where: { key: string } }) =>
            args.where.key === "equipment.approvers.WIG" ? { value: JSON.stringify(["AP-001"]) } : null) as never);
        mocked.employee.findFirst.mockResolvedValue({ employeeId: "AP-001", name: "Approver", isActive: true, userAccount: { id: "u-ap" } } as never);
        const ap = makeSession({ userId: "u-ap", username: "AP-001", employeeId: "AP-001" });
        await expect(approveEquipmentInspection(ap, "in1")).rejects.toMatchObject({ statusCode: 409 });
        expect(txMock.equipmentInspection.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "in1", status: "DONE" } })
        );
        expect(txMock.auditLog.create).not.toHaveBeenCalled();
    });

    it("GET /api/ga/equipment/recap menerima status=APPROVED dan menolak status tak dikenal", async () => {
        requireAuthMock.mockResolvedValue(wigSession());
        mocked.equipmentInspection.findMany.mockResolvedValue([] as never);
        mocked.equipmentInspection.count.mockResolvedValue(0 as never);

        const okRes = await getGaRecapRoute(new NextRequest("http://localhost/api/ga/equipment/recap?status=APPROVED"));
        expect(okRes.status).toBe(200);
        expect(mocked.equipmentInspection.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ status: "APPROVED" }) })
        );

        const badRes = await getGaRecapRoute(new NextRequest("http://localhost/api/ga/equipment/recap?status=INVALID"));
        expect(badRes.status).toBe(400);
    });
});
