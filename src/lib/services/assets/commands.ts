import { prisma } from "../../prisma";
import { Prisma } from "@prisma/client";
import logger from "@/lib/logger";
import { AssetWithHistory } from "@/lib/types/asset";
import { toAsset, AssetRowRaw } from "./mappers";
import { ASSIGNED_TO_INCLUDE } from "./constants";

/**
 * Menciptakan entitas aset baru dengan logika pembuatan kode otomatis.
 */
export async function createAsset(data: {
    name: string;
    categoryId: string;
    kondisi?: string;
    holderType?: string;
    assignedToName?: string | null;
    assignedToId?: string | null;
    nomorIndosat?: string | null;
    expiredDate?: string | null;
    keterangan?: string | null;
    serialNumber?: string | null;
    imei?: string | null;
    manufacturer?: string | null;
    modelName?: string | null;
    purchaseDate?: string | null;
    purchasePrice?: number | null;
    warrantyExpiry?: string | null;
}, performedBy: string): Promise<AssetWithHistory> {
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const categoryObj = await prisma.assetCategory.findUnique({ where: { id: data.categoryId } });
            if (!categoryObj) throw new Error("Kategori aset tidak valid");
            const prefix = categoryObj.prefix;
            
            const lastAsset = await prisma.asset.findFirst({
                where: { categoryId: data.categoryId },
                orderBy: { assetCode: "desc" },
                select: { assetCode: true },
            });
            
            const lastNum = lastAsset ? parseInt(lastAsset.assetCode.split("-")[1] ?? "0", 10) : 0;
            if (isNaN(lastNum)) throw new Error("Format kode aset terakhir tidak valid");
            
            const assetCode = `${prefix}-${String(lastNum + 1 + attempt).padStart(3, "0")}`;

            const holderType = (data.holderType ?? "GA_POOL") as never;
            const status: string =
                holderType === "GA_POOL"       ? "AVAILABLE"      :
                holderType === "COMPANY_OWNED" ? "COMPANY_OWNED"  :
                "IN_USE"; 

            const row = (await prisma.asset.create({
                data: {
                    assetCode,
                    name: data.name,
                    categoryId: data.categoryId,
                    kondisi: (data.kondisi ?? "BAIK") as never,
                    status: status as never,
                    holderType,
                    assignedToName: data.assignedToName ?? null,
                    assignedToId: (holderType === "EMPLOYEE" && data.assignedToId) ? data.assignedToId : null,
                    assignedAt: data.assignedToName ? new Date() : null,
                    nomorIndosat: data.nomorIndosat ?? null,
                    expiredDate: data.expiredDate ? new Date(data.expiredDate) : null,
                    keterangan: data.keterangan ?? null,
                    serialNumber: data.serialNumber ?? null,
                    imei: data.imei ?? null,
                    manufacturer: data.manufacturer ?? null,
                    modelName: data.modelName ?? null,
                    purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
                    purchasePrice: data.purchasePrice ?? null,
                    warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
                },
                include: ASSIGNED_TO_INCLUDE,
            })) as AssetRowRaw;

            if (data.assignedToName) {
                await prisma.assetHistory.create({
                    data: {
                        assetId: row.id,
                        fromHolderType: "GA_POOL",
                        fromName: null,
                        toHolderType: holderType,
                        toName: data.assignedToName,
                        action: "assigned",
                        kondisiSaat: (data.kondisi ?? "BAIK") as never,
                        notes: "Initial assignment saat pencatatan aset",
                        performedBy,
                    },
                });
            }

            logger.info("Aset dibuat", { assetCode, name: data.name, performedBy });
            return toAsset(row);
        } catch (err: unknown) {
            const isPrismaUniqueError =
                err !== null &&
                typeof err === "object" &&
                "code" in err &&
                (err as { code: string }).code === "P2002";

            if (isPrismaUniqueError && attempt < MAX_RETRIES - 1) {
                logger.warn("Asset code collision, retrying", { attempt: attempt + 1 });
                continue;
            }
            throw err;
        }
    }

    throw new Error("Gagal membuat aset setelah beberapa percobaan.");
}

/**
 * Memperbarui properti aset.
 */
export async function updateAsset(id: string, data: {
    name?: string;
    kondisi?: string;
    keterangan?: string | null;
    nomorIndosat?: string | null;
    expiredDate?: string | null;
    categoryId?: string;
    serialNumber?: string | null;
    imei?: string | null;
    manufacturer?: string | null;
    modelName?: string | null;
    purchaseDate?: string | null;
    purchasePrice?: number | null;
    warrantyExpiry?: string | null;
    status?: string;
    holderType?: string;
    assignedToId?: string | null;
    assignedToName?: string | null;
}): Promise<AssetWithHistory | null> {
    try {
        const row = (await prisma.asset.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
                ...(data.kondisi !== undefined && { kondisi: data.kondisi as never }),
                ...(data.keterangan !== undefined && { keterangan: data.keterangan }),
                ...(data.nomorIndosat !== undefined && { nomorIndosat: data.nomorIndosat }),
                ...(data.expiredDate !== undefined && {
                    expiredDate: data.expiredDate ? new Date(data.expiredDate) : null,
                }),
                ...(data.serialNumber !== undefined && { serialNumber: data.serialNumber }),
                ...(data.imei !== undefined && { imei: data.imei }),
                ...(data.manufacturer !== undefined && { manufacturer: data.manufacturer }),
                ...(data.modelName !== undefined && { modelName: data.modelName }),
                ...(data.purchaseDate !== undefined && {
                    purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
                }),
                ...(data.purchasePrice !== undefined && { purchasePrice: data.purchasePrice }),
                ...(data.warrantyExpiry !== undefined && {
                    warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
                }),
                ...(data.status !== undefined && { status: data.status as never }),
                ...(data.holderType !== undefined && { holderType: data.holderType as never }),
                ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }),
                ...(data.assignedToName !== undefined && { assignedToName: data.assignedToName }),
                ...(data.assignedToName !== undefined && { assignedAt: data.assignedToName ? new Date() : null }),
            },
            include: ASSIGNED_TO_INCLUDE,
        })) as AssetRowRaw;
        return toAsset(row);
    } catch (err) {
        logger.error("Gagal memperbarui aset", { assetId: id, error: err });
        return null;
    }
}

/**
 * Menghentikan penggunaan aset (Retired).
 */
export async function retireAsset(id: string, performedBy: string): Promise<AssetWithHistory | null> {
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) return null;

    await prisma.assetHistory.create({
        data: {
            assetId: id,
            fromHolderType: existing.holderType,
            fromName: existing.assignedToName,
            toHolderType: "GA_POOL",
            toName: null,
            action: "retired",
            kondisiSaat: existing.kondisi,
            notes: "Aset di-retire oleh GA",
            performedBy,
        },
    });

    const row = (await prisma.asset.update({
        where: { id },
        data: { status: "RETIRED", holderType: "GA_POOL", assignedToName: null, assignedToId: null, assignedAt: null },
        include: ASSIGNED_TO_INCLUDE,
    })) as AssetRowRaw;

    logger.info("Aset di-retire", { assetCode: existing.assetCode, performedBy });
    return toAsset(row);
}

/**
 * Melakukan mutasi atau serah terima aset.
 */
export async function assignAsset(id: string, payload: {
    toHolderType: string;
    toName: string | null;
    toEmployeeId?: string | null;
    notes?: string;
    kondisi?: string;
}, performedBy: string): Promise<AssetWithHistory | null> {
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) return null;

    if (existing.status === "RETIRED" || existing.status === "MAINTENANCE") {
        throw new Error(`Aset tidak dapat ditugaskan karena berstatus ${existing.status}`);
    }

    const isReturning = payload.toHolderType === "GA_POOL";
    const newStatus = isReturning ? "AVAILABLE" : "IN_USE";

    await prisma.assetHistory.create({
        data: {
            assetId: id,
            fromHolderType: existing.holderType,
            fromName: existing.assignedToName,
            toHolderType: payload.toHolderType as never,
            toName: payload.toName,
            action: isReturning ? "returned" : "assigned",
            kondisiSaat: (payload.kondisi ?? existing.kondisi) as never,
            notes: payload.notes ?? null,
            performedBy,
        },
    });

    const row = (await prisma.asset.update({
        where: { id },
        data: {
            holderType: payload.toHolderType as never,
            assignedToName: payload.toName,
            assignedToId: (!isReturning && payload.toHolderType === "EMPLOYEE" && payload.toEmployeeId)
                ? payload.toEmployeeId : null,
            assignedAt: isReturning ? null : new Date(),
            status: newStatus as never,
            ...(payload.kondisi && { kondisi: payload.kondisi as never }),
        },
        include: ASSIGNED_TO_INCLUDE,
    })) as AssetRowRaw;

    logger.info("Aset di-assign", { assetCode: existing.assetCode, to: payload.toName, performedBy });
    return toAsset(row);
}

/**
 * Menghapus aset secara permanen beserta seluruh relasi (history, inspeksi).
 */
export async function deleteAsset(id: string, performedBy: string): Promise<boolean> {
    const existing = await prisma.asset.findUnique({ where: { id }, select: { assetCode: true } });
    if (!existing) return false;

    await prisma.$transaction([
        prisma.assetHistory.deleteMany({ where: { assetId: id } }),
        prisma.assetInspection.deleteMany({ where: { assetId: id } }),
        prisma.asset.delete({ where: { id } }),
    ]);

    logger.warn("Aset DIHAPUS PERMANEN", { assetCode: existing.assetCode, performedBy });
    return true;
}

/**
 * Bulk insert massal registrasi aset langsung ke GA Pool.
 */
export async function createBulkAssets(payloads: Array<{
    categoryPrefix: string;
    name: string;
    kondisi: string;
    manufacturer?: string | null;
    modelName?: string | null;
    serialNumber?: string | null;
    keterangan?: string | null;
}>, performedBy: string): Promise<number> {
    if (payloads.length === 0) return 0;

    // Resolve prefixes to Category IDs
    const prefixes = Array.from(new Set(payloads.map(p => p.categoryPrefix.toUpperCase())));
    const categories = await prisma.assetCategory.findMany({
        where: { prefix: { in: prefixes } }
    });
    const prefixMap = new Map<string, string>();
    for (const c of categories) {
        prefixMap.set(c.prefix, c.id);
    }

    // Group items by category to batch generate assetCodes securely
    const grouped = payloads.reduce((acc, curr) => {
        const pfx = curr.categoryPrefix.toUpperCase();
        if (!acc[pfx]) acc[pfx] = [];
        acc[pfx].push(curr);
        return acc;
    }, {} as Record<string, typeof payloads>);

    let totalInserted = 0;

    await prisma.$transaction(async (tx) => {
        const assetsToCreate: Prisma.AssetUncheckedCreateInput[] = [];
        const historyToCreate: Prisma.AssetHistoryUncheckedCreateInput[] = [];

        for (const [prefix, items] of Object.entries(grouped)) {
            const categoryId = prefixMap.get(prefix);
            if (!categoryId) {
                throw new Error(`Kategori dengan prefix ${prefix} tidak ditemukan di sistem.`);
            }

            // Get latest asset code for this category
            const lastAsset = await tx.asset.findFirst({
                where: { categoryId },
                orderBy: { assetCode: "desc" },
                select: { assetCode: true },
            });

            let lastNum = lastAsset ? parseInt(lastAsset.assetCode.split("-")[1] ?? "0", 10) : 0;
            if (isNaN(lastNum)) lastNum = 0;

            for (const item of items) {
                lastNum++;
                const assetCode = `${prefix}-${String(lastNum).padStart(3, "0")}`;

                assetsToCreate.push({
                    assetCode,
                    name: item.name,
                    categoryId,
                    kondisi: item.kondisi as never,
                    status: "AVAILABLE",
                    holderType: "GA_POOL",
                    manufacturer: item.manufacturer || null,
                    modelName: item.modelName || null,
                    serialNumber: item.serialNumber || null,
                    keterangan: item.keterangan || null,
                    assignedToName: null,
                    assignedToId: null,
                    assignedAt: null,
                });
            }
        }

        // To create relations nicely (history requires assetId which isn't generated in createMany)
        // We either do create loops, or createMany, then query them back to createHistory.
        // Doing a sequential create is safer, considering bulk payloads are typically < 200 items.
        for (const assetData of assetsToCreate) {
            await tx.asset.create({ data: assetData });
            totalInserted++;
        }
    }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    logger.info(`Bulk import sukses: ${totalInserted} aset didaftarkan ke GA Pool`, { performedBy });
    return totalInserted;
}
