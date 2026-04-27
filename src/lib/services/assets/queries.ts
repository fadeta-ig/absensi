import { prisma } from "../../prisma";
import { AssetWithHistory, AssetHistoryRow } from "@/lib/types/asset";
import { toAsset, AssetRowRaw } from "./mappers";
import { ASSIGNED_TO_INCLUDE } from "./constants";
import { Prisma } from "@prisma/client";

// ─── Query Options ──────────────────────────────────────────────

export type GetAssetsOptions = {
    includeCompanyOwned?: boolean;
    category?: string;
    excludeCategory?: string;
    status?: string;
    kondisi?: string;
    search?: string;
    page?: number;
    limit?: number;
};

export type PaginatedAssets = {
    data: AssetWithHistory[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

// ─── Stats Type ─────────────────────────────────────────────────

export type AssetStats = {
    total: number;
    available: number;
    inUse: number;
    maintenance: number;
    retired: number;
    rusak: number;
    totalNilai: number;
    byCategory: { name: string; prefix: string; count: number }[];
    expiringNomor: number;
    expiringWarranty: number;
};

// ─── Queries ────────────────────────────────────────────────────

/**
 * Mengambil aset dengan filter server-side, search, dan pagination.
 */
export async function getAssets(options?: GetAssetsOptions): Promise<PaginatedAssets> {
    const where: Prisma.AssetWhereInput = {};

    if (!options?.includeCompanyOwned) {
        where.status = { not: "COMPANY_OWNED" };
    }

    if (options?.category) {
        where.categoryRel = { prefix: options.category };
    } else if (options?.excludeCategory) {
        where.categoryRel = { prefix: { not: options.excludeCategory } };
    }

    if (options?.status) {
        where.status = options.status as Prisma.EnumAssetStatusFilter;
    }

    if (options?.kondisi) {
        where.kondisi = options.kondisi as Prisma.EnumAssetKondisiFilter;
    }

    if (options?.search) {
        const q = options.search;
        where.OR = [
            { name: { contains: q } },
            { assetCode: { contains: q } },
            { assignedToName: { contains: q } },
            { serialNumber: { contains: q } },
        ];
    }

    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(5000, Math.max(1, options?.limit ?? 50));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
        prisma.asset.findMany({
            where,
            include: ASSIGNED_TO_INCLUDE,
            orderBy: [{ categoryRel: { name: "asc" } }, { assetCode: "asc" }],
            skip,
            take: limit,
        }),
        prisma.asset.count({ where }),
    ]);

    return {
        data: (rows as AssetRowRaw[]).map(toAsset),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

/**
 * Mengambil satu detail aset berdasarkan ID.
 */
export async function getAssetById(id: string): Promise<AssetWithHistory | null> {
    const row = (await prisma.asset.findUnique({
        where: { id },
        include: ASSIGNED_TO_INCLUDE,
    })) as AssetRowRaw | null;

    if (!row) return null;
    return toAsset(row);
}

/**
 * Mengambil aset yang sedang dikuasai oleh karyawan tertentu.
 */
export async function getAssetsByEmployeeId(employeeId: string): Promise<AssetWithHistory[]> {
    const rows = (await prisma.asset.findMany({
        where: { assignedToId: employeeId },
        include: ASSIGNED_TO_INCLUDE,
        orderBy: [{ categoryRel: { name: "asc" } }, { assetCode: "asc" }],
    })) as AssetRowRaw[];

    return rows.map(toAsset);
}

/**
 * Mengambil riwayat mutasi aset (sudah diketik ketat).
 */
export async function getAssetHistory(assetId: string): Promise<AssetHistoryRow[]> {
    const rows = await prisma.assetHistory.findMany({
        where: { assetId },
        orderBy: { createdAt: "desc" },
    });
    return rows.map(r => ({
        id: r.id,
        assetId: r.assetId,
        fromHolderType: r.fromHolderType as AssetHistoryRow["fromHolderType"],
        fromName: r.fromName,
        toHolderType: r.toHolderType as AssetHistoryRow["toHolderType"],
        toName: r.toName,
        action: r.action,
        kondisiSaat: r.kondisiSaat as AssetHistoryRow["kondisiSaat"],
        notes: r.notes,
        performedBy: r.performedBy,
        createdAt: new Date(r.createdAt).toISOString(),
    }));
}

/**
 * Mengambil statistik agregat aset (tanpa fetch seluruh row).
 */
export async function getAssetStats(includeCompanyOwned = false, excludeCategoryPrefix?: string): Promise<AssetStats> {
    const baseWhere: Prisma.AssetWhereInput = includeCompanyOwned ? {} : { status: { not: "COMPANY_OWNED" } };
    
    if (excludeCategoryPrefix) {
        baseWhere.categoryRel = { prefix: { not: excludeCategoryPrefix } };
    }

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
        total, available, inUse, maintenance, retired, rusak,
        nilaiResult, categoryGroups, expiringNomor, expiringWarranty,
    ] = await Promise.all([
        prisma.asset.count({ where: baseWhere }),
        prisma.asset.count({ where: { ...baseWhere, status: "AVAILABLE" } }),
        prisma.asset.count({ where: { ...baseWhere, status: "IN_USE" } }),
        prisma.asset.count({ where: { ...baseWhere, status: "MAINTENANCE" } }),
        prisma.asset.count({ where: { ...baseWhere, status: "RETIRED" } }),
        prisma.asset.count({ where: { ...baseWhere, kondisi: "RUSAK" } }),
        prisma.asset.aggregate({ where: baseWhere, _sum: { purchasePrice: true } }),
        prisma.asset.groupBy({
            by: ["categoryId"],
            where: baseWhere,
            _count: { id: true },
        }),
        prisma.asset.count({
            where: {
                ...baseWhere,
                categoryRel: { prefix: "NUM" },
                expiredDate: { lte: in30Days },
            },
        }),
        prisma.asset.count({
            where: {
                ...baseWhere,
                warrantyExpiry: { gt: now, lte: in30Days },
            },
        }),
    ]);

    // Resolve category names
    const categoryIds = categoryGroups.map(g => g.categoryId);
    const categories = await prisma.assetCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true, prefix: true },
    });
    const catMap = new Map(categories.map(c => [c.id, c]));

    return {
        total,
        available,
        inUse,
        maintenance,
        retired,
        rusak,
        totalNilai: nilaiResult._sum.purchasePrice ?? 0,
        byCategory: categoryGroups.map(g => ({
            name: catMap.get(g.categoryId)?.name ?? "Unknown",
            prefix: catMap.get(g.categoryId)?.prefix ?? "?",
            count: g._count.id,
        })),
        expiringNomor,
        expiringWarranty,
    };
}
