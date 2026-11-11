import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        equipmentProduct: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        equipmentProductTool: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
        equipmentAssignment: { findMany: vi.fn() },
        equipmentUnit: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
        appSetting: { findUnique: vi.fn() },
        employee: { findUnique: vi.fn() },
        equipmentInspection: { count: vi.fn() },
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
    listEquipmentProducts,
    createEquipmentProduct,
    updateEquipmentProduct,
    deleteEquipmentProduct,
    getProductToolChecklist,
    setProductTools,
    listProductUnitsForEmployee,
} from "@/lib/services/equipmentProductService";
import { updateEquipmentUnit } from "@/lib/services/equipmentService";

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

beforeEach(() => {
    vi.resetAllMocks();
    mocked.auditLog.create.mockResolvedValue({} as never);
});

describe("produk per perusahaan (WIG002)", () => {
    it("non-WIG002 ditolak 403", async () => {
        await expect(listEquipmentProducts(empSession(), "WIG")).rejects.toMatchObject({ statusCode: 403 });
        await expect(createEquipmentProduct(empSession(), { company: "WIG", name: "X" })).rejects.toMatchObject({ statusCode: 403 });
        await expect(deleteEquipmentProduct(empSession(), "p1")).rejects.toMatchObject({ statusCode: 403 });
        await expect(getProductToolChecklist(empSession(), "p1")).rejects.toMatchObject({ statusCode: 403 });
        await expect(setProductTools(empSession(), "p1", [])).rejects.toMatchObject({ statusCode: 403 });
    });
    it("nama kosong ditolak 400, duplikat per perusahaan 409", async () => {
        await expect(createEquipmentProduct(wigSession(), { company: "WIG", name: "   " })).rejects.toMatchObject({ statusCode: 400 });
        mocked.equipmentProduct.create.mockRejectedValue({ code: "P2002" });
        await expect(createEquipmentProduct(wigSession(), { company: "WIG", name: "Mokuru" })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("buat produk menulis audit", async () => {
        mocked.equipmentProduct.create.mockResolvedValue({ id: "p1", company: "MKI", name: "Agra" } as never);
        const out = await createEquipmentProduct(wigSession(), { company: "MKI", name: "Agra" });
        expect(out).toMatchObject({ id: "p1" });
        expect(mocked.auditLog.create).toHaveBeenCalled();
    });
    it("hapus produk tak ada 404; hapus ok kembalikan success", async () => {
        mocked.equipmentProduct.findUnique.mockResolvedValue(null);
        await expect(deleteEquipmentProduct(wigSession(), "p9")).rejects.toMatchObject({ statusCode: 404 });
        mocked.equipmentProduct.findUnique.mockResolvedValue({ id: "p1" } as never);
        mocked.equipmentProduct.delete.mockResolvedValue({ id: "p1" } as never);
        await expect(deleteEquipmentProduct(wigSession(), "p1")).resolves.toEqual({ success: true });
    });
});

describe("checklist alat per produk", () => {
    it("produk tak ada 404", async () => {
        mocked.equipmentProduct.findUnique.mockResolvedValue(null);
        await expect(getProductToolChecklist(wigSession(), "p9")).rejects.toMatchObject({ statusCode: 404 });
    });
    it("hanya alat aktif se-perusahaan (termasuk alat shared WIG+MKI), tercentang ditandai", async () => {
        mocked.equipmentProduct.findUnique.mockResolvedValue({ id: "p1", company: "WIG", name: "Mokuru" } as never);
        mocked.equipmentUnit.findMany.mockResolvedValue([
            { id: "u1", name: "Mixer", brand: null, location: null, company: "WIG", isSharedBoth: false },
            { id: "u2", name: "Spatula Silicon", brand: null, location: null, company: "WIG", isSharedBoth: true },
        ] as never);
        mocked.equipmentProductTool.findMany.mockResolvedValue([{ equipmentUnitId: "u2" }] as never);
        const out = await getProductToolChecklist(wigSession(), "p1");
        expect(mocked.equipmentUnit.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    isActive: true,
                    OR: [
                        { company: "WIG" },
                        { company: { not: null }, isSharedBoth: true },
                    ],
                },
            })
        );
        expect(out.tools).toEqual([
            expect.objectContaining({ id: "u1", checked: false, companies: ["WIG"] }),
            expect.objectContaining({ id: "u2", checked: true, companies: ["WIG", "MKI"] }),
        ]);
        expect(out).toMatchObject({ checkedCount: 1, totalCount: 2 });
    });
});

describe("simpan set alat produk", () => {
    it("unit tak dikenal 404, nonaktif/beda perusahaan 422", async () => {
        mocked.equipmentProduct.findUnique.mockResolvedValue({ id: "p1", company: "WIG", name: "Mokuru" } as never);
        mocked.equipmentUnit.findMany.mockResolvedValue([] as never);
        await expect(setProductTools(wigSession(), "p1", ["ux"])).rejects.toMatchObject({ statusCode: 404 });
        mocked.equipmentUnit.findMany.mockResolvedValue([
            { id: "u1", name: "A", isActive: true, company: "WIG" },
            { id: "u2", name: "B", isActive: true, company: "MKI" },
            { id: "u3", name: "C", isActive: false, company: "WIG" },
        ] as never);
        await expect(setProductTools(wigSession(), "p1", ["u1", "u2", "u3"])).rejects.toMatchObject({ statusCode: 422 });
        expect(mocked.$transaction).not.toHaveBeenCalled();
    });
    it("sukses: ganti set dalam satu transaksi + kembalikan checklist baru (termasuk alat shared WIG+MKI)", async () => {
        mocked.equipmentProduct.findUnique.mockResolvedValue({ id: "p1", company: "MKI", name: "Produk B" } as never);
        mocked.equipmentUnit.findMany.mockResolvedValue([
            { id: "u1", name: "Spatula Silicon", brand: null, location: null, isActive: true, company: "WIG", isSharedBoth: true },
        ] as never);
        const tx = { equipmentProductTool: { deleteMany: vi.fn(), createMany: vi.fn() } };
        mocked.$transaction.mockImplementation((async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)) as never);
        mocked.equipmentProductTool.findMany.mockResolvedValue([{ equipmentUnitId: "u1" }] as never);
        const out = await setProductTools(wigSession(), "p1", ["u1", "u1 "]);
        expect(tx.equipmentProductTool.deleteMany).toHaveBeenCalledWith({ where: { productId: "p1" } });
        expect(tx.equipmentProductTool.createMany).toHaveBeenCalledWith({
            data: [{ productId: "p1", equipmentUnitId: "u1" }],
        });
        expect(out).toMatchObject({ checkedCount: 1, totalCount: 1 });
    });
});

describe("kategori perusahaan unit (via update unit existing)", () => {
    it("pindah perusahaan yang terpetakan ke produk lain 409", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u1", company: "WIG" } as never);
        mocked.equipmentProductTool.findFirst.mockResolvedValue({ id: "m1" } as never);
        await expect(updateEquipmentUnit(wigSession(), "u1", { company: "MKI" })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("kosongkan perusahaan yang masih terpetakan 409", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u1", company: "WIG" } as never);
        mocked.equipmentProductTool.findFirst.mockResolvedValue({ id: "m1" } as never);
        await expect(updateEquipmentUnit(wigSession(), "u1", { company: null })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("pindah bersih menulis company", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u1", company: "WIG" } as never);
        mocked.equipmentProductTool.findFirst.mockResolvedValue(null);
        mocked.equipmentUnit.update.mockResolvedValue({ id: "u1", company: "MKI" } as never);
        await updateEquipmentUnit(wigSession(), "u1", { company: "MKI" });
        expect(mocked.equipmentUnit.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { company: "MKI" } });
    });
    it("company tak berubah tidak mengecek pemetaan", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u1", company: "WIG" } as never);
        mocked.equipmentUnit.update.mockResolvedValue({ id: "u1" } as never);
        await updateEquipmentUnit(wigSession(), "u1", { company: "WIG", location: "Gudang" });
        expect(mocked.equipmentProductTool.findFirst).not.toHaveBeenCalled();
    });
    it("perluas dari 1 perusahaan ke 2 perusahaan (WIG & MKI) selalu diizinkan tanpa melepas pemetaan produk lama", async () => {
        mocked.equipmentUnit.findUnique.mockResolvedValue({ id: "u1", company: "WIG", isSharedBoth: false } as never);
        mocked.equipmentUnit.update.mockResolvedValue({ id: "u1", company: "WIG", isSharedBoth: true } as never);
        const out = await updateEquipmentUnit(wigSession(), "u1", { companies: ["WIG", "MKI"] });
        expect(mocked.equipmentProductTool.findFirst).not.toHaveBeenCalled();
        expect(mocked.equipmentUnit.update).toHaveBeenCalledWith({
            where: { id: "u1" },
            data: { company: "WIG", isSharedBoth: true },
        });
        expect(out.companies).toEqual(["WIG", "MKI"]);
    });
});

describe("ubah nama produk (WIG002)", () => {
    it("non-WIG002 ditolak 403; produk hilang 404", async () => {
        await expect(updateEquipmentProduct(empSession(), "p1", { name: "Baru" })).rejects.toMatchObject({ statusCode: 403 });
        mocked.equipmentProduct.findUnique.mockResolvedValue(null);
        await expect(updateEquipmentProduct(wigSession(), "p9", { name: "Baru" })).rejects.toMatchObject({ statusCode: 404 });
    });
    it("nama kosong 400; duplikat per perusahaan 409", async () => {
        mocked.equipmentProduct.findUnique.mockResolvedValue({ id: "p1", company: "WIG" } as never);
        await expect(updateEquipmentProduct(wigSession(), "p1", { name: "   " })).rejects.toMatchObject({ statusCode: 400 });
        mocked.equipmentProduct.update.mockRejectedValue({ code: "P2002" });
        await expect(updateEquipmentProduct(wigSession(), "p1", { name: "Sama" })).rejects.toMatchObject({ statusCode: 409 });
    });
    it("rename sukses menulis nama + audit", async () => {
        mocked.equipmentProduct.findUnique.mockResolvedValue({ id: "p1", company: "WIG" } as never);
        mocked.equipmentProduct.update.mockResolvedValue({ id: "p1", name: "Bumbu" } as never);
        const out = await updateEquipmentProduct(wigSession(), "p1", { name: "Bumbu" });
        expect(out).toMatchObject({ id: "p1", name: "Bumbu" });
        expect(mocked.equipmentProduct.update).toHaveBeenCalledWith({
            where: { id: "p1" },
            data: { name: "Bumbu", nameNormalized: "bumbu" },
        });
        expect(mocked.auditLog.create).toHaveBeenCalled();
    });
});

describe("daftar alat produk untuk employee", () => {
    it("tanpa sesi employee 403; produk hilang 404", async () => {
        const noEmp = { userId: "u-1", username: "ID-001", name: "Pegawai", primaryRole: "EMPLOYEE_USER", roles: ["EMPLOYEE_USER"], permissions: ["employee.self"], employeeId: null } as never;
        await expect(listProductUnitsForEmployee(noEmp, "p1")).rejects.toMatchObject({ statusCode: 403 });
        mocked.equipmentProduct.findUnique.mockResolvedValue(null);
        await expect(listProductUnitsForEmployee(empSession(), "p9")).rejects.toMatchObject({ statusCode: 404 });
    });
    it("di luar cakupan perusahaan 403", async () => {
        mocked.appSetting.findUnique.mockResolvedValue(null);
        mocked.equipmentAssignment.findMany.mockResolvedValue([] as never);
        mocked.equipmentProduct.findUnique.mockResolvedValue({ id: "p1", company: "MKI", name: "Teh", isActive: true } as never);
        await expect(listProductUnitsForEmployee(empSession(), "p1")).rejects.toMatchObject({ statusCode: 403 });
    });
    it("semua alat tampil + flag assigned ikut penugasan efektif", async () => {
        mocked.equipmentProduct.findUnique.mockResolvedValue({ id: "p1", company: "WIG", name: "Bumbu", isActive: true } as never);
        mocked.appSetting.findUnique.mockResolvedValue({ value: JSON.stringify(["ID-001"]) } as never);
        mocked.employee.findUnique.mockResolvedValue({ isActive: true } as never);
        mocked.equipmentAssignment.findMany.mockResolvedValue([
            { unitId: "u1", startsOnWibDate: "2026-01-01", endsOnWibDate: null },
        ] as never);
        mocked.equipmentUnit.findMany.mockResolvedValue([
            { id: "u1", name: "Baskom", brand: null, location: null },
            { id: "u2", name: "Sendok", brand: null, location: "Dapur" },
        ] as never);
        const out = await listProductUnitsForEmployee(empSession(), "p1");
        expect(out.product).toMatchObject({ id: "p1", company: "WIG", name: "Bumbu" });
        expect(out.tools).toEqual([
            { id: "u1", name: "Baskom", brand: null, location: null, assigned: true },
            { id: "u2", name: "Sendok", brand: null, location: "Dapur", assigned: false },
        ]);
    });
});
