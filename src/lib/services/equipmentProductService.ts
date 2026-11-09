import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";
import type { EquipmentCompany } from "@prisma/client";
import { toWIBDateString } from "@/lib/timezone";
import { normalizeName } from "@/lib/services/cleaningService";
import {
    EquipmentError,
    requireWig002,
    isPrismaUniqueViolation,
    logCreated,
    requireWig002OrTopViewer,
    getEmployeeEquipmentCompanies,
    isEffectiveOn,
    EQUIPMENT_COMPANIES,
} from "@/lib/services/equipmentService";

// ─── Produk per perusahaan (master WIG002) ───────────────────────────

export async function listEquipmentProducts(session: SessionPayload, company: EquipmentCompany) {
    requireWig002(session);
    return prisma.equipmentProduct.findMany({
        where: { company },
        orderBy: { name: "asc" },
        include: { _count: { select: { tools: true } } },
    });
}

export async function createEquipmentProduct(session: SessionPayload, input: { company: EquipmentCompany; name: string }) {
    requireWig002(session);
    const clean = normalizeName(input.name);
    if (!clean) throw new EquipmentError("Nama produk wajib diisi.", 400);
    try {
        const created = await prisma.equipmentProduct.create({
            data: { company: input.company, name: input.name.trim(), nameNormalized: clean },
        });
        await logCreated("CREATE_EQUIPMENT_PRODUCT", "EQUIPMENT_PRODUCT", created.id, session, {
            company: created.company,
            name: created.name,
        });
        return created;
    } catch (err) {
        if (isPrismaUniqueViolation(err)) throw new EquipmentError("Nama produk sudah dipakai di perusahaan ini.", 409);
        throw err;
    }
}

export async function deleteEquipmentProduct(session: SessionPayload, id: string) {
    requireWig002(session);
    const existing = await prisma.equipmentProduct.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new EquipmentError("Produk tidak ditemukan.", 404);
    await prisma.equipmentProduct.delete({ where: { id } });
    await logCreated("DELETE_EQUIPMENT_PRODUCT", "EQUIPMENT_PRODUCT", id, session, {});
    return { success: true };
}

export async function updateEquipmentProduct(session: SessionPayload, id: string, input: { name: string }) {
    requireWig002(session);
    const existing = await prisma.equipmentProduct.findUnique({ where: { id }, select: { id: true, company: true } });
    if (!existing) throw new EquipmentError("Produk tidak ditemukan.", 404);
    const clean = normalizeName(input.name);
    if (!clean) throw new EquipmentError("Nama produk wajib diisi.", 400);
    try {
        const updated = await prisma.equipmentProduct.update({
            where: { id },
            data: { name: input.name.trim(), nameNormalized: clean },
        });
        await logCreated("UPDATE_EQUIPMENT_PRODUCT", "EQUIPMENT_PRODUCT", id, session, { name: updated.name });
        return updated;
    } catch (err) {
        if (isPrismaUniqueViolation(err)) throw new EquipmentError("Nama produk sudah dipakai di perusahaan ini.", 409);
        throw err;
    }
}

// ─── Daftar alat per produk untuk employee: semua alat tampil, flag assigned ──

export interface ProductUnitRow {
    id: string;
    name: string;
    brand: string | null;
    location: string | null;
    assigned: boolean;
}

export async function listProductUnitsForEmployee(
    session: SessionPayload,
    productId: string
): Promise<{ product: { id: string; company: EquipmentCompany; name: string }; tools: ProductUnitRow[] }> {
    if (!session.employeeId || !session.userId) throw new EquipmentError("Hanya karyawan yang dapat mengakses modul ini.", 403);
    const product = await prisma.equipmentProduct.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) throw new EquipmentError("Produk tidak ditemukan.", 404);
    const isSuper = await requireWig002OrTopViewer(session)
        .then(() => true)
        .catch(() => false);
    const scope = isSuper ? [...EQUIPMENT_COMPANIES] : await getEmployeeEquipmentCompanies(session);
    if (!scope.includes(product.company)) {
        throw new EquipmentError("Di luar cakupan perusahaan Anda.", 403);
    }
    const today = toWIBDateString();
    const [rows, units] = await Promise.all([
        prisma.equipmentAssignment.findMany({ where: { userId: session.userId } }),
        prisma.equipmentUnit.findMany({
            where: { isActive: true, productTools: { some: { productId } } },
            select: { id: true, name: true, brand: true, location: true },
            orderBy: { name: "asc" },
        }),
    ]);
    const effective = rows.filter((r) => isEffectiveOn(today, r.startsOnWibDate, r.endsOnWibDate));
    const hasGlobal = effective.some((r) => r.unitId === null);
    const specificIds = new Set(effective.filter((r) => r.unitId !== null).map((r) => r.unitId as string));
    return {
        product: { id: product.id, company: product.company, name: product.name },
        tools: units.map((u) => ({ ...u, assigned: hasGlobal || specificIds.has(u.id) })),
    };
}

// ─── Checklist alat per produk (centang manual WIG002) ───────────────

export interface ProductToolChecklistRow {
    id: string;
    name: string;
    brand: string | null;
    location: string | null;
    checked: boolean;
}

export async function getProductToolChecklist(session: SessionPayload, productId: string) {
    requireWig002(session);
    const product = await prisma.equipmentProduct.findUnique({ where: { id: productId } });
    if (!product) throw new EquipmentError("Produk tidak ditemukan.", 404);
    const [units, mapped] = await Promise.all([
        prisma.equipmentUnit.findMany({
            where: { isActive: true, company: product.company },
            select: { id: true, name: true, brand: true, location: true },
            orderBy: { name: "asc" },
        }),
        prisma.equipmentProductTool.findMany({ where: { productId }, select: { equipmentUnitId: true } }),
    ]);
    const checkedIds = new Set(mapped.map((m) => m.equipmentUnitId));
    const tools: ProductToolChecklistRow[] = units.map((u) => ({ ...u, checked: checkedIds.has(u.id) }));
    return {
        product: { id: product.id, company: product.company, name: product.name },
        tools,
        checkedCount: tools.filter((t) => t.checked).length,
        totalCount: tools.length,
    };
}

export async function setProductTools(session: SessionPayload, productId: string, equipmentUnitIds: string[]) {
    requireWig002(session);
    const product = await prisma.equipmentProduct.findUnique({ where: { id: productId } });
    if (!product) throw new EquipmentError("Produk tidak ditemukan.", 404);
    const ids = [...new Set(equipmentUnitIds.map((v) => v.trim()).filter(Boolean))];
    if (ids.length > 0) {
        const rows = await prisma.equipmentUnit.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, isActive: true, company: true },
        });
        const found = new Set(rows.map((r) => r.id));
        if (found.size !== ids.length) throw new EquipmentError("Sebagian alat tidak ditemukan.", 404);
        const bad = rows.filter((r) => !r.isActive || r.company !== product.company);
        if (bad.length > 0) {
            const names = bad
                .slice(0, 3)
                .map((r) => r.name)
                .join(", ");
            throw new EquipmentError(
                `Ada ${bad.length} alat yang nonaktif atau bukan kategori ${product.company} (${names}${bad.length > 3 ? ", …" : ""}).`,
                422
            );
        }
    }
    await prisma.$transaction(async (tx) => {
        await tx.equipmentProductTool.deleteMany({ where: { productId } });
        if (ids.length > 0) {
            await tx.equipmentProductTool.createMany({
                data: ids.map((equipmentUnitId) => ({ productId, equipmentUnitId })),
            });
        }
    });
    await logCreated("SET_EQUIPMENT_PRODUCT_TOOLS", "EQUIPMENT_PRODUCT", productId, session, { toolCount: ids.length });
    return getProductToolChecklist(session, productId);
}

// ─── Produk dalam cakupan sesi (dropdown employee) ────────────────────

export async function listScopedEquipmentProducts(session: SessionPayload, company?: EquipmentCompany) {
    const isSuper = await requireWig002OrTopViewer(session)
        .then(() => true)
        .catch(() => false);
    const scope = isSuper ? [...EQUIPMENT_COMPANIES] : await getEmployeeEquipmentCompanies(session);
    if (company && !scope.includes(company)) {
        throw new EquipmentError("Di luar cakupan perusahaan Anda.", 403);
    }
    if (scope.length === 0) return [];
    return prisma.equipmentProduct.findMany({
        where: { isActive: true, ...(company ? { company } : { company: { in: scope } }) },
        orderBy: [{ company: "asc" }, { name: "asc" }],
        select: { id: true, company: true, name: true },
    });
}
