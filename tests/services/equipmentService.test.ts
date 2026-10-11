import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
        employee: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
        equipmentTemplate: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
        equipmentTemplateItem: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        equipmentUnit: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
        equipmentAssignment: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
        equipmentInspection: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
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
import {
    assignEquipmentUnit,
    checkEquipmentDone,
    createEquipmentTemplate,
    createEquipmentUnit,
    getEmployeeEquipmentCapabilities,
    getEquipmentQcMemberIds,
    getPendingEquipmentApprovals,
    invalidateEquipmentQcMembersCache,
    requireActiveInternalEmployee,
    setEquipmentQcMembers,
    setEquipmentTopViewers,
    startEquipmentInspection,
    submitEquipmentInspection,
    updateEquipmentInspectionItem,
} from "@/lib/services/equipmentService";

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
        ...{},
    } as never;
}

function empSession(over: Record<string, unknown> = {}) {
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

function qcSession(over: Record<string, unknown> = {}) {
    return empSession({ userId: "u-qc", username: "QC-001", name: "Daffa", employeeId: "QC-001", ...over });
}

const actor = { userId: "u-1", username: "ID-001" };

function mockQcMembers(ids: string[]) {
    mocked.appSetting.findUnique.mockResolvedValue({ value: JSON.stringify(ids) } as never);
    mocked.employee.findUnique.mockResolvedValue({ isActive: true } as never);
}

beforeEach(() => {
    vi.resetAllMocks();
    invalidateEquipmentQcMembersCache();
    mocked.auditLog.create.mockResolvedValue({} as never);
    mocked.equipmentAssignment.findMany.mockResolvedValue([]);
});

describe("template & unit guards", () => {
    it("non-WIG002 ditolak 403", async () => {
        await expect(createEquipmentTemplate(empSession(), "T")).rejects.toMatchObject({ statusCode: 403 });
        await expect(createEquipmentUnit(empSession(), { name: "U", templateId: "t1" })).rejects.toMatchObject({ statusCode: 403 });
    });
    it("qc members fallback kosong bila setting kosong", async () => {
        mocked.appSetting.findUnique.mockResolvedValue(null);
        await expect(getEquipmentQcMemberIds()).resolves.toEqual([]);
    });
});

describe("mode penugasan (WIG002 menentukan siapa)", () => {
    it("outsource (tanpa employee aktif) ditolak 422", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u1", isActive: true } as never);
        mocked.employee.findFirst.mockResolvedValue(null);
        await expect(assignEquipmentUnit(wigSession(), { unitId: "u1", employeeId: "OUT-001" })).rejects.toMatchObject({ statusCode: 422 });
    });
    it("assignment global (tanpa unitId) diterima", async () => {
        mocked.employee.findFirst.mockResolvedValue({ employeeId: "ID-001", name: "A", isActive: true, userAccount: { id: "u-1" } } as never);
        mocked.equipmentAssignment.findFirst.mockResolvedValue(null);
        mocked.equipmentAssignment.create.mockResolvedValue({ id: "a1", unitId: null } as never);
        const out = (await assignEquipmentUnit(wigSession(), { unitId: null, employeeId: "ID-001" })) as { unitId: null };
        expect(out.unitId).toBeNull();
    });
    it("global vs spesifik bertabrakan 409", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "unit-9", isActive: true } as never);
        mocked.employee.findFirst.mockResolvedValue({ employeeId: "ID-001", name: "A", isActive: true, userAccount: { id: "u-1" } } as never);
        mocked.equipmentAssignment.findFirst.mockResolvedValue({ id: "a0" } as never);
        await expect(assignEquipmentUnit(wigSession(), { unitId: "unit-9", employeeId: "ID-001" })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("bukan karyawan (tanpa employeeId) ditolak 403", async () => {
        await expect(requireActiveInternalEmployee(empSession({ employeeId: null }))).rejects.toMatchObject({ statusCode: 403 });
    });
    it("capabilities canExecute ikut penugasan efektif", async () => {
        mocked.equipmentAssignment.count.mockResolvedValue(1);
        mockQcMembers([]);
        await expect(getEmployeeEquipmentCapabilities(empSession())).resolves.toMatchObject({ canExecute: true, canReview: false });
    });
    it("tanpa penugasan canExecute false (mis. IT/creative tak melihat modul)", async () => {
        mocked.equipmentAssignment.count.mockResolvedValue(0);
        mockQcMembers([]);
        await expect(getEmployeeEquipmentCapabilities(empSession())).resolves.toMatchObject({ canExecute: false, canReview: false });
    });
});

describe("qc members & recap", () => {
    it("bukan WIG002 ditolak 403", async () => {
        await expect(setEquipmentQcMembers(empSession(), ["ID-001"], actor)).rejects.toMatchObject({ statusCode: 403 });
    });
    it("lebih dari 20 ditolak 409", async () => {
        const ids = Array.from({ length: 21 }, (_, i) => `QC-${i}`);
        await expect(setEquipmentQcMembers(wigSession(), ids, actor)).rejects.toMatchObject({ statusCode: 409 });
    });
    it("recap tanpa hak ditolak 403", async () => {
        const { getEquipmentRecap } = await import("@/lib/services/equipmentService");
        mocked.appSetting.findUnique.mockResolvedValue(null);
        await expect(getEquipmentRecap(empSession(), {})).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe("inspection flow guards", () => {
    it("unit nonaktif ditolak 422", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u1", isActive: false } as never);
        mocked.employee.findFirst.mockResolvedValue({ employeeId: "ID-001", name: "A", isActive: true, userAccount: { id: "u-1" } } as never);
        await expect(startEquipmentInspection(empSession(), "u1")).rejects.toMatchObject({ statusCode: 422 });
    });
    it("tanpa penugasan mulai ditolak 403", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({
            id: "u1",
            name: "Mixer",
            isActive: true,
            template: { isActive: true, items: [{ id: "ti1", name: "Fungsi", sortOrder: 0, requirePhoto: false }] },
        } as never);
        mocked.equipmentAssignment.findMany.mockResolvedValue([]);
        await expect(startEquipmentInspection(empSession(), "u1")).rejects.toMatchObject({ statusCode: 403 });
    });
    it("ubah item di luar OPEN ditolak 409", async () => {
        mocked.equipmentInspectionItem.findUnique.mockResolvedValue({
            id: "it1",
            isActive: true,
            inspection: { id: "in1", status: "SUBMITTED", unitId: "u1" },
        } as never);
        await expect(updateEquipmentInspectionItem(empSession(), "it1", { isPass: true })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("submit dengan item belum dinilai ditolak 422", async () => {
        const insp = {
            id: "in1",
            status: "OPEN",
            unit: { id: "u1" },
            items: [{ isActive: true, isPass: null, requirePhoto: false }],
            evidence: [],
        };
        mocked.equipmentInspection.findUnique.mockResolvedValue(insp as never);
        mocked.equipmentAssignment.findMany.mockResolvedValue([{ unitId: "u1", userId: "u-1", startsOnWibDate: "2026-01-01", endsOnWibDate: null }] as never);
        await expect(submitEquipmentInspection(empSession(), "in1")).rejects.toMatchObject({ statusCode: 422 });
    });
    it("submit tanpa foto dokumentasi ditolak 422", async () => {
        const insp = {
            id: "in1",
            status: "OPEN",
            unit: { id: "u1" },
            items: [{ isActive: true, isPass: true, requirePhoto: true }],
            evidence: [],
        };
        mocked.equipmentInspection.findUnique.mockResolvedValue(insp as never);
        mocked.equipmentAssignment.findMany.mockResolvedValue([{ unitId: "u1", userId: "u-1", startsOnWibDate: "2026-01-01", endsOnWibDate: null }] as never);
        await expect(submitEquipmentInspection(empSession(), "in1")).rejects.toMatchObject({ statusCode: 422 });
    });
    it("submit lolos bila 1 foto mewakili semua item", async () => {
        const insp = {
            id: "in1",
            status: "OPEN",
            unit: { id: "u1" },
            items: [
                { isActive: true, isPass: true, requirePhoto: true },
                { isActive: true, isPass: false, requirePhoto: true },
            ],
            evidence: [{ id: "e1" }],
        };
        mocked.equipmentInspection.findUnique.mockResolvedValue(insp as never);
        mocked.employee.findFirst.mockResolvedValue({ employeeId: "ID-001", name: "A", isActive: true, userAccount: { id: "u-1" } } as never);
        (mocked.$transaction as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(undefined);
        const done = { ...insp, status: "SUBMITTED", qcEvidence: [], checkedBy: null, checkedByNameSnapshot: null, checkedAt: null, qcNote: null };
        mocked.equipmentAssignment.findMany.mockResolvedValue([{ unitId: "u1", userId: "u-1", startsOnWibDate: "2026-01-01", endsOnWibDate: null }] as never);
        mocked.equipmentInspection.findUnique
            .mockResolvedValueOnce(insp as never)
            .mockResolvedValue(done as never);
        const out = await submitEquipmentInspection(empSession(), "in1");
        expect(out.status).toBe("SUBMITTED");
    });
});

describe("antrean QC (wadah)", () => {
    it("bukan anggota QC ditolak 403", async () => {
        mockQcMembers(["QC-001"]);
        await expect(getPendingEquipmentApprovals(empSession())).rejects.toMatchObject({ statusCode: 403 });
    });
    it("anggota QC melihat semua SUBMITTED terbaru di atas", async () => {
        mockQcMembers(["QC-001"]);
        const rows = [
            { id: "new", status: "SUBMITTED", submittedAt: new Date("2026-10-10T10:00:00+07:00"), items: [], evidence: [], qcEvidence: [], checkedBy: null, checkedByNameSnapshot: null, checkedAt: null, qcNote: null },
            { id: "old", status: "SUBMITTED", submittedAt: new Date("2026-10-09T10:00:00+07:00"), items: [], evidence: [], qcEvidence: [], checkedBy: null, checkedByNameSnapshot: null, checkedAt: null, qcNote: null },
        ];
        mocked.equipmentInspection.findMany.mockResolvedValue(rows as never);
        const out = await getPendingEquipmentApprovals(qcSession());
        expect(mocked.equipmentInspection.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { status: "SUBMITTED" }, orderBy: { submittedAt: "desc" } })
        );
        expect(out.map((r) => (r as { id: string }).id)).toEqual(["new", "old"]);
    });
});

describe("QC DONE", () => {
    const submitted = {
        id: "in1",
        status: "SUBMITTED",
        unit: { id: "u1" },
        items: [],
        evidence: [],
        qcEvidence: [],
    };
    it("bukan anggota QC ditolak 403", async () => {
        mockQcMembers(["QC-001"]);
        mocked.equipmentInspection.findUnique.mockResolvedValue(submitted as never);
        await expect(checkEquipmentDone(empSession(), "in1", null)).rejects.toMatchObject({ statusCode: 403 });
    });
    it("DONE di luar SUBMITTED ditolak 409", async () => {
        mockQcMembers(["QC-001"]);
        mocked.equipmentInspection.findUnique.mockResolvedValue({ ...submitted, status: "OPEN" } as never);
        mocked.employee.findFirst.mockResolvedValue({ employeeId: "QC-001", name: "Daffa", isActive: true, userAccount: { id: "u-qc" } } as never);
        await expect(checkEquipmentDone(qcSession(), "in1", null)).rejects.toMatchObject({ statusCode: 409 });
    });
    it("DONE sukses mencatat checked-by QC", async () => {
        mockQcMembers(["QC-001"]);
        mocked.employee.findFirst.mockResolvedValue({ employeeId: "QC-001", name: "Daffa Fakhuddin Arrozy", isActive: true, userAccount: { id: "u-qc" } } as never);
        const updated = {
            ...submitted,
            status: "DONE",
            checkedByEmployeeId: "QC-001",
            checkedByNameSnapshot: "Daffa Fakhuddin Arrozy",
            checkedAt: new Date(),
            qcNote: "OK",
            checkedBy: { employeeId: "QC-001", name: "Daffa Fakhuddin Arrozy" },
        };
        (mocked.$transaction as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(undefined);
        const done = { ...updated, items: [], evidence: [], qcEvidence: [] };
        mocked.equipmentInspection.findUnique
            .mockResolvedValueOnce(submitted as never)
            .mockResolvedValue(done as never);
        const out = await checkEquipmentDone(qcSession(), "in1", "OK");
        expect(out.status).toBe("DONE");
        expect(out.checkedByNameSnapshot).toBe("Daffa Fakhuddin Arrozy");
        expect(out.qcNote).toBe("OK");
    });
});

describe("top viewers & recap", () => {
    it("set top viewers bukan WIG002 ditolak 403", async () => {
        await expect(setEquipmentTopViewers(empSession(), ["ID-001"], actor)).rejects.toMatchObject({ statusCode: 403 });
    });
    it("top viewers lebih dari 5 ditolak 409", async () => {
        await expect(
            setEquipmentTopViewers(wigSession(), ["A", "B", "C", "D", "E", "F"], actor)
        ).rejects.toMatchObject({ statusCode: 409 });
    });
});
