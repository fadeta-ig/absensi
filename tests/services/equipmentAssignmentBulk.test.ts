import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
        employee: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
        equipmentTemplate: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
        equipmentTemplateItem: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        equipmentUnit: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
        equipmentAssignment: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
        equipmentInspection: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
        equipmentInspectionItem: { findUnique: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), update: vi.fn() },
        equipmentInspectionEvidence: { count: vi.fn(), create: vi.fn() },
        equipmentQcEvidence: { count: vi.fn(), create: vi.fn() },
        userAccount: { findMany: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn(),
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

import { prisma } from "@/lib/prisma";
import { assignEquipmentUnitsBulk, endEquipmentAssignmentsBulk, updateEquipmentAssignment } from "@/lib/services/equipmentService";

const mocked = vi.mocked(prisma, true);

function wigSession() {
    return {
        userId: "u-wig",
        username: "WIG002",
        name: "GA",
        primaryRole: "GA_ADMIN",
        roles: ["GA_ADMIN"],
        permissions: ["ga.manage", "employee.self"],
        employeeId: "ID-002",
    } as never;
}

function empSession() {
    return {
        userId: "u-1",
        username: "ID-001",
        name: "Pegawai",
        primaryRole: "EMPLOYEE_USER",
        roles: ["EMPLOYEE_USER"],
        permissions: ["employee.self"],
        employeeId: "ID-001",
    } as never;
}

function mockActiveEmployee(userId = "u-1") {
    mocked.employee.findFirst.mockResolvedValue({
        employeeId: "ID-001",
        name: "A",
        isActive: true,
        userAccount: { id: userId },
    } as never);
}

beforeEach(() => {
    vi.resetAllMocks();
    mocked.auditLog.create.mockResolvedValue({} as never);
});

describe("assignEquipmentUnitsBulk", () => {
    it("non-WIG002 ditolak 403", async () => {
        await expect(assignEquipmentUnitsBulk(empSession(), { unitIds: ["u1"], employeeId: "ID-001" })).rejects.toMatchObject({
            statusCode: 403,
        });
    });
    it("unitIds kosong ditolak 400", async () => {
        await expect(assignEquipmentUnitsBulk(wigSession(), { unitIds: [], employeeId: "ID-001" })).rejects.toMatchObject({
            statusCode: 400,
        });
    });
    it("membuat banyak baris sekaligus", async () => {
        mockActiveEmployee();
        mocked.equipmentUnit.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => ({
            id: where.id,
            name: `Unit ${where.id}`,
            isActive: true,
            company: "WIG",
        })) as never);
        mocked.equipmentAssignment.findFirst.mockResolvedValue(null);
        mocked.equipmentAssignment.create.mockImplementation((async ({ data }: { data: { unitId: string } }) => ({
            id: `a-${data.unitId}`,
            ...data,
        })) as never);
        const out = await assignEquipmentUnitsBulk(wigSession(), { unitIds: ["u1", "u2", "u3"], employeeId: "ID-001" });
        expect(out.created).toHaveLength(3);
        expect(out.skipped).toHaveLength(0);
        expect(mocked.equipmentAssignment.create).toHaveBeenCalledTimes(3);
    });
    it("duplikat unitIds didedup", async () => {
        mockActiveEmployee();
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u1", name: "U1", isActive: true, company: "MKI" } as never);
        mocked.equipmentAssignment.findFirst.mockResolvedValue(null);
        mocked.equipmentAssignment.create.mockResolvedValue({ id: "a1" } as never);
        const out = await assignEquipmentUnitsBulk(wigSession(), { unitIds: ["u1", "u1", " u1 "], employeeId: "ID-001" });
        expect(out.created).toHaveLength(1);
    });
    it("yang overlap di-skip dengan alasan, sisanya tetap dibuat", async () => {
        mockActiveEmployee();
        mocked.equipmentUnit.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => ({
            id: where.id,
            name: `Unit ${where.id}`,
            isActive: true,
            company: "WIG",
        })) as never);
        mocked.equipmentAssignment.findFirst.mockImplementation((async ({ where }: { where: { AND?: Array<{ OR?: Array<{ unitId?: string | null }> }> } }) => {
            const ors = where.AND?.[0]?.OR;
            const hit = ors?.some((o) => o.unitId === "u2");
            return hit ? { id: "a0" } : null;
        }) as never);
        mocked.equipmentAssignment.create.mockImplementation((async ({ data }: { data: { unitId: string } }) => ({
            id: `a-${data.unitId}`,
        })) as never);
        const out = await assignEquipmentUnitsBulk(wigSession(), { unitIds: ["u1", "u2"], employeeId: "ID-001" });
        expect(out.created).toHaveLength(1);
        expect(out.skipped).toHaveLength(1);
        expect(out.skipped[0]).toMatchObject({ unitId: "u2", reason: "Bertabrakan dengan periode yang sudah ada." });
    });
    it("unit belum berkategori di-skip 422-per-item", async () => {
        mockActiveEmployee();
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u9", name: "U9", isActive: true, company: null } as never);
        mocked.equipmentAssignment.findFirst.mockResolvedValue(null);
        const out = await assignEquipmentUnitsBulk(wigSession(), { unitIds: ["u9"], employeeId: "ID-001" });
        expect(out.created).toHaveLength(0);
        expect(out.skipped[0]).toMatchObject({ unitId: "u9", reason: "Belum berkategori WIG/MKI." });
        expect(mocked.equipmentAssignment.create).not.toHaveBeenCalled();
    });
    it("tanggal selesai sebelum mulai ditolak 400", async () => {
        mockActiveEmployee();
        await expect(
            assignEquipmentUnitsBulk(wigSession(), {
                unitIds: ["u1"],
                employeeId: "ID-001",
                startsOnWibDate: "2026-11-05",
                endsOnWibDate: "2026-11-04",
            })
        ).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe("updateEquipmentAssignment", () => {
    it("non-WIG002 ditolak 403", async () => {
        await expect(updateEquipmentAssignment(empSession(), "a1", { endsOnWibDate: "2026-12-01" })).rejects.toMatchObject({
            statusCode: 403,
        });
    });
    it("penugasan tidak ada 404", async () => {
        mocked.equipmentAssignment.findUnique.mockResolvedValue(null);
        await expect(updateEquipmentAssignment(wigSession(), "missing", { endsOnWibDate: "2026-12-01" })).rejects.toMatchObject({
            statusCode: 404,
        });
    });
    it("riwayat berakhir terkunci 409", async () => {
        mocked.equipmentAssignment.findUnique.mockResolvedValue({
            id: "a1",
            unitId: "u1",
            userId: "u-1",
            startsOnWibDate: "2026-10-01",
            endsOnWibDate: "2026-10-31",
        } as never);
        await expect(updateEquipmentAssignment(wigSession(), "a1", { endsOnWibDate: "2026-12-01" })).rejects.toMatchObject({
            statusCode: 409,
        });
    });
    it("ganti tanggal lolos bila tidak overlap (self dikecualikan)", async () => {
        mocked.equipmentAssignment.findUnique.mockResolvedValue({
            id: "a1",
            unitId: "u1",
            userId: "u-1",
            startsOnWibDate: "2026-11-01",
            endsOnWibDate: null,
        } as never);
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u1", name: "U1", isActive: true, company: "WIG" } as never);
        mocked.equipmentAssignment.findFirst.mockResolvedValue(null);
        mocked.equipmentAssignment.update.mockResolvedValue({ id: "a1" } as never);
        const out = (await updateEquipmentAssignment(wigSession(), "a1", { endsOnWibDate: "2026-12-31" })) as { id: string };
        expect(out.id).toBe("a1");
        expect(mocked.equipmentAssignment.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ id: { not: "a1" } }) })
        );
    });
    it("ganti unit ke yang belum berkategori ditolak 422", async () => {
        mocked.equipmentAssignment.findUnique.mockResolvedValue({
            id: "a1",
            unitId: "u1",
            userId: "u-1",
            startsOnWibDate: "2026-11-01",
            endsOnWibDate: null,
        } as never);
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u9", name: "U9", isActive: true, company: null } as never);
        await expect(updateEquipmentAssignment(wigSession(), "a1", { unitId: "u9" })).rejects.toMatchObject({ statusCode: 422 });
    });
    it("tabrakan dengan baris lain ditolak 409", async () => {
        mocked.equipmentAssignment.findUnique.mockResolvedValue({
            id: "a1",
            unitId: "u1",
            userId: "u-1",
            startsOnWibDate: "2026-11-01",
            endsOnWibDate: null,
        } as never);
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u2", name: "U2", isActive: true, company: "WIG" } as never);
        mocked.equipmentAssignment.findFirst.mockResolvedValue({ id: "a2" } as never);
        await expect(updateEquipmentAssignment(wigSession(), "a1", { unitId: "u2" })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("ganti karyawan memindahkan userId", async () => {
        mocked.equipmentAssignment.findUnique.mockResolvedValue({
            id: "a1",
            unitId: null,
            userId: "u-1",
            startsOnWibDate: "2026-11-01",
            endsOnWibDate: null,
        } as never);
        mockActiveEmployee("u-2");
        mocked.equipmentAssignment.findFirst.mockResolvedValue(null);
        mocked.equipmentAssignment.update.mockResolvedValue({ id: "a1" } as never);
        await updateEquipmentAssignment(wigSession(), "a1", { employeeId: "ID-001" });
        expect(mocked.equipmentAssignment.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ userId: "u-2" }) })
        );
    });
});

describe("endEquipmentAssignmentsBulk", () => {
    it("non-WIG002 ditolak 403", async () => {
        await expect(endEquipmentAssignmentsBulk(empSession(), ["a1"])).rejects.toMatchObject({ statusCode: 403 });
    });
    it("ids kosong ditolak 400", async () => {
        await expect(endEquipmentAssignmentsBulk(wigSession(), [])).rejects.toMatchObject({ statusCode: 400 });
    });
    it("mengakhiri banyak baris sekaligus", async () => {
        mocked.equipmentAssignment.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => ({
            id: where.id,
            unitId: "u1",
            userId: "u-1",
            startsOnWibDate: "2026-10-01",
            endsOnWibDate: null,
        })) as never);
        mocked.equipmentAssignment.update.mockResolvedValue({} as never);
        const out = await endEquipmentAssignmentsBulk(wigSession(), ["a1", "a2"]);
        expect(out.ended).toEqual(["a1", "a2"]);
        expect(out.skipped).toHaveLength(0);
        expect(mocked.equipmentAssignment.update).toHaveBeenCalledTimes(2);
    });
    it("yang sudah berakhir / tidak ada di-skip dengan alasan", async () => {
        mocked.equipmentAssignment.findUnique.mockImplementation((async ({ where }: { where: { id: string } }) => {
            if (where.id === "gone") return null;
            return {
                id: where.id,
                unitId: "u1",
                userId: "u-1",
                startsOnWibDate: "2026-10-01",
                endsOnWibDate: where.id === "done" ? "2026-10-31" : null,
            };
        }) as never);
        mocked.equipmentAssignment.update.mockResolvedValue({} as never);
        const out = await endEquipmentAssignmentsBulk(wigSession(), ["a1", "done", "gone"]);
        expect(out.ended).toEqual(["a1"]);
        expect(out.skipped).toHaveLength(2);
        expect(out.skipped).toContainEqual({ assignmentId: "done", reason: "Penugasan sudah berakhir." });
        expect(out.skipped).toContainEqual({ assignmentId: "gone", reason: "Penugasan tidak ditemukan." });
    });
    it("yang belum mulai di-skip", async () => {
        mocked.equipmentAssignment.findUnique.mockResolvedValue({
            id: "future",
            unitId: "u1",
            userId: "u-1",
            startsOnWibDate: "2999-01-01",
            endsOnWibDate: null,
        } as never);
        const out = await endEquipmentAssignmentsBulk(wigSession(), ["future"]);
        expect(out.ended).toHaveLength(0);
        expect(out.skipped[0]).toMatchObject({ assignmentId: "future" });
        expect(mocked.equipmentAssignment.update).not.toHaveBeenCalled();
    });
});
