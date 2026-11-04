import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn() },
        employee: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
        equipmentUnit: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
        equipmentAssignment: { findMany: vi.fn(), count: vi.fn() },
        equipmentInspection: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
        equipmentInspectionItem: { findUnique: vi.fn() },
        equipmentProduct: { findMany: vi.fn() },
        equipmentProductTool: { findFirst: vi.fn() },
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
    approveEquipmentInspection,
    assignEquipmentUnit,
    checkEquipmentDone,
    getApprovalQueue,
    getEmployeeEquipmentCapabilities,
    getEquipmentRecap,
    getMyEquipmentUnits,
    getPendingEquipmentApprovals,
    hasEquipmentEvidenceAccess,
    invalidateEquipmentQcMembersCache,
    startEquipmentInspection,
    submitEquipmentInspection,
    updateEquipmentInspectionItem,
    updateEquipmentUnit,
} from "@/lib/services/equipmentService";
import { listScopedEquipmentProducts } from "@/lib/services/equipmentProductService";

const mocked = vi.mocked(prisma, true);

function wigSession() {
    return {
        userId: "u-wig", username: "WIG002", name: "GA", primaryRole: "GA_ADMIN",
        roles: ["GA_ADMIN"], permissions: ["ga.manage", "employee.self"], employeeId: "ID-002",
    } as never;
}

function empSession(over: Record<string, unknown> = {}) {
    return {
        userId: "u-1", username: "ID-001", name: "Pegawai", primaryRole: "EMPLOYEE_USER",
        roles: ["EMPLOYEE_USER"], permissions: ["employee.self"], employeeId: "ID-001", ...over,
    } as never;
}

const qcSession = () => empSession({ userId: "u-qc", username: "QC-001", employeeId: "QC-001" });
const approverSession = () => empSession({ userId: "u-ap", username: "AP-001", employeeId: "AP-001" });

/** Nilai AppSetting per key; key tak dikenal → null (seolah belum di-set). */
function mockKeys(map: Record<string, string[]>) {
    mocked.appSetting.findUnique.mockImplementation((async (args: { where: { key: string } }) => {
        const v = map[args.where.key];
        return v === undefined ? null : { value: JSON.stringify(v) };
    }) as never);
}

beforeEach(() => {
    vi.resetAllMocks();
    invalidateEquipmentQcMembersCache();
    mocked.auditLog.create.mockResolvedValue({} as never);
    mocked.employee.findUnique.mockResolvedValue({ isActive: true } as never);
    mocked.equipmentAssignment.findMany.mockResolvedValue([]);
});

describe("antrean tersaring perusahaan keanggotaan", () => {
    it("QC WIG-only hanya melihat SUBMITTED unit WIG", async () => {
        mockKeys({ "equipment.qcMembers.WIG": ["QC-001"] });
        mocked.equipmentInspection.findMany.mockResolvedValue([] as never);
        await getPendingEquipmentApprovals(qcSession());
        expect(mocked.equipmentInspection.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { status: "SUBMITTED", unit: { company: { in: ["WIG"] } } } })
        );
    });
    it("approver MKI-only hanya melihat antrean MKI", async () => {
        mockKeys({ "equipment.approvers.MKI": ["AP-001"] });
        mocked.equipmentInspection.findMany.mockResolvedValue([] as never);
        await getApprovalQueue(approverSession());
        expect(mocked.equipmentInspection.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { status: "DONE", unit: { company: { in: ["MKI"] } } } })
        );
    });
    it("bukan anggota di perusahaan mana pun tetap 403", async () => {
        mockKeys({});
        await expect(getPendingEquipmentApprovals(empSession())).rejects.toMatchObject({ statusCode: 403 });
        await expect(getApprovalQueue(empSession())).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe("mutasi menolak lintas perusahaan dan unit belum berkategori", () => {
    const submittedWig = {
        id: "in1", status: "SUBMITTED", unit: { id: "u1", company: "WIG" },
        items: [], evidence: [], qcEvidence: [],
    };
    it("DONE lintas perusahaan 403; unit NULL 422", async () => {
        mockKeys({ "equipment.qcMembers.WIG": ["QC-001"] });
        mocked.equipmentInspection.findUnique.mockResolvedValue({ ...submittedWig, unit: { id: "u9", company: "MKI" } } as never);
        await expect(checkEquipmentDone(qcSession(), "in1", null)).rejects.toMatchObject({ statusCode: 403 });
        mocked.equipmentInspection.findUnique.mockResolvedValue({ ...submittedWig, unit: { id: "u9", company: null } } as never);
        await expect(checkEquipmentDone(qcSession(), "in1", null)).rejects.toMatchObject({ statusCode: 422 });
    });
    it("APPROVE lintas perusahaan 403; unit NULL 422", async () => {
        mockKeys({ "equipment.approvers.WIG": ["AP-001"] });
        const done = { ...submittedWig, status: "DONE" };
        mocked.equipmentInspection.findUnique.mockResolvedValue({ ...done, unit: { id: "u9", company: "MKI" } } as never);
        await expect(approveEquipmentInspection(approverSession(), "in1")).rejects.toMatchObject({ statusCode: 403 });
        mocked.equipmentInspection.findUnique.mockResolvedValue({ ...done, unit: { id: "u9", company: null } } as never);
        await expect(approveEquipmentInspection(approverSession(), "in1")).rejects.toMatchObject({ statusCode: 422 });
    });
    it("assign/start/nilai/submit unit NULL 422", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u1", isActive: true, company: null } as never);
        await expect(assignEquipmentUnit(wigSession(), { unitId: "u1", employeeId: "ID-001" })).rejects.toMatchObject({ statusCode: 422 });
        mocked.equipmentUnit.findUnique.mockResolvedValue({
            id: "u1", isActive: true, company: null,
            template: { isActive: true, items: [{ id: "t1" }] },
        } as never);
        await expect(startEquipmentInspection(empSession(), "u1")).rejects.toMatchObject({ statusCode: 422 });
        mocked.equipmentInspectionItem.findUnique.mockResolvedValue({
            id: "it1", isActive: true, inspection: { id: "in1", status: "OPEN", unitId: "u1", unit: { company: null } },
        } as never);
        await expect(updateEquipmentInspectionItem(empSession(), "it1", { isPass: true })).rejects.toMatchObject({ statusCode: 422 });
        mocked.equipmentInspection.findUnique.mockResolvedValue({ ...submittedWig, status: "OPEN", unit: { id: "u1", company: null } } as never);
        await expect(submitEquipmentInspection(empSession(), "in1")).rejects.toMatchObject({ statusCode: 422 });
    });
    it("pindah perusahaan saat inspeksi berjalan 409; NULL→WIG selalu boleh", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u1", company: "WIG" } as never);
        mocked.equipmentInspection.count.mockResolvedValue(2);
        mocked.equipmentProductTool.findFirst.mockResolvedValue(null);
        await expect(updateEquipmentUnit(wigSession(), "u1", { company: "MKI" })).rejects.toMatchObject({ statusCode: 409 });
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u2", company: null } as never);
        mocked.equipmentUnit.update.mockResolvedValue({ id: "u2", company: "WIG" } as never);
        await updateEquipmentUnit(wigSession(), "u2", { company: "WIG" });
        expect(mocked.equipmentInspection.count).toHaveBeenCalledTimes(1);
        expect(mocked.equipmentUnit.update).toHaveBeenCalledWith({ where: { id: "u2" }, data: { company: "WIG" } });
    });
});

describe("kapabilitas membawa cakupan per peran", () => {
    it("global = kedua perusahaan; QC WIG-only = [WIG]", async () => {
        mockKeys({ "equipment.qcMembers.WIG": ["QC-001"] });
        mocked.equipmentAssignment.count.mockResolvedValue(1);
        mocked.equipmentAssignment.findMany.mockResolvedValue([
            { unitId: null, startsOnWibDate: "2026-01-01", endsOnWibDate: null },
        ] as never);
        const out = await getEmployeeEquipmentCapabilities(qcSession());
        expect(out).toMatchObject({
            canExecute: true, canReview: true, canApprove: false,
            executeCompanies: ["WIG", "MKI"], reviewCompanies: ["WIG"], approveCompanies: [],
        });
    });
    it("tanpa apa pun semua kosong", async () => {
        mockKeys({});
        mocked.equipmentAssignment.count.mockResolvedValue(0);
        const out = await getEmployeeEquipmentCapabilities(empSession());
        expect(out).toMatchObject({
            canExecute: false, canReview: false, canTopView: false, canApprove: false,
            executeCompanies: [], reviewCompanies: [], approveCompanies: [],
        });
    });
});

describe("daftar unit, rekap, produk, dan evidence tersaring", () => {
    it("daftar unit: NULL dikecualikan + filter productId diteruskan", async () => {
        mocked.equipmentAssignment.findMany.mockResolvedValue([
            { unitId: "u1", startsOnWibDate: "2026-01-01", endsOnWibDate: null },
            { unitId: "u2", startsOnWibDate: "2026-01-01", endsOnWibDate: null },
        ] as never);
        mocked.equipmentUnit.findMany
            .mockResolvedValueOnce([{ company: "WIG" }, { company: null }] as never)
            .mockResolvedValueOnce([] as never);
        await getMyEquipmentUnits(empSession(), { productId: "p1" });
        expect(mocked.equipmentUnit.findMany).toHaveBeenLastCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    company: { in: ["WIG"] },
                    productTools: { some: { productId: "p1" } },
                }),
            })
        );
    });
    it("rekap meneruskan filter company dan productId", async () => {
        mocked.equipmentInspection.findMany.mockResolvedValue([] as never);
        mocked.equipmentInspection.count.mockResolvedValue(0);
        await getEquipmentRecap(wigSession(), { company: "MKI", productId: "p9" });
        expect(mocked.equipmentInspection.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ unit: { company: "MKI", productTools: { some: { productId: "p9" } } } }),
            })
        );
    });
    it("produk di luar cakupan 403; WIG002 melihat semua", async () => {
        mockKeys({});
        await expect(listScopedEquipmentProducts(empSession(), "MKI")).rejects.toMatchObject({ statusCode: 403 });
        mocked.equipmentProduct.findMany.mockResolvedValue([] as never);
        await listScopedEquipmentProducts(wigSession());
        expect(mocked.equipmentProduct.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { isActive: true, company: { in: ["WIG", "MKI"] } } })
        );
    });
    it("akses evidence lintas perusahaan ditolak; approver se-perusahaan boleh", async () => {
        mockKeys({ "equipment.qcMembers.WIG": ["QC-001"], "equipment.approvers.WIG": ["AP-001"] });
        mocked.equipmentInspection.findUnique.mockResolvedValue({
            id: "in1", unitId: "u9", startedByEmployeeId: "OTHER", unit: { company: "MKI" },
        } as never);
        await expect(hasEquipmentEvidenceAccess(qcSession(), { inspectionId: "in1" })).resolves.toBe(false);
        mocked.equipmentInspection.findUnique.mockResolvedValue({
            id: "in1", unitId: "u1", startedByEmployeeId: "OTHER", unit: { company: "WIG" },
        } as never);
        await expect(hasEquipmentEvidenceAccess(approverSession(), { inspectionId: "in1" })).resolves.toBe(true);
    });
});
