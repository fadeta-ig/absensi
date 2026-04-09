import { prisma } from "../prisma";
import logger from "@/lib/logger";

export type AssetWithHistory = {
    id: string;
    assetCode: string;
    name: string;
    category: "HANDPHONE" | "LAPTOP" | "NOMOR_HP";
    kondisi: "BAIK" | "KURANG_BAIK" | "RUSAK";
    status: "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "RETIRED" | "COMPANY_OWNED";
    holderType: "EMPLOYEE" | "FORMER_EMPLOYEE" | "TEAM" | "GA_POOL" | "COMPANY_OWNED";
    assignedToName: string | null;
    assignedAt: string | null;
    nomorIndosat: string | null;
    expiredDate: string | null;
    keterangan: string | null;
    createdAt: string;
    updatedAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAsset(row: any): AssetWithHistory {
    return {
        id: row.id,
        assetCode: row.assetCode,
        name: row.name,
        category: row.category,
        kondisi: row.kondisi,
        status: row.status,
        holderType: row.holderType,
        assignedToName: row.assignedToName ?? null,
        assignedAt: row.assignedAt ? new Date(row.assignedAt).toISOString() : null,
        nomorIndosat: row.nomorIndosat ?? null,
        expiredDate: row.expiredDate ? new Date(row.expiredDate).toISOString() : null,
        keterangan: row.keterangan ?? null,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
    };
}

/** GET semua aset — GA lihat semua, HR tidak lihat COMPANY_OWNED */
export async function getAssets(options?: { includeCompanyOwned?: boolean; category?: string }): Promise<AssetWithHistory[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (!options?.includeCompanyOwned) {
        where.status = { not: "COMPANY_OWNED" };
    }
    if (options?.category) {
        where.category = options.category;
    }
    const rows = await prisma.asset.findMany({
        where,
        orderBy: [{ category: "asc" }, { assetCode: "asc" }],
    });
    return rows.map(toAsset);
}

/** GET satu aset by ID */
export async function getAssetById(id: string): Promise<AssetWithHistory | null> {
    const row = await prisma.asset.findUnique({ where: { id } });
    if (!row) return null;
    return toAsset(row);
}

/** CREATE aset baru — with retry for asset code collision */
export async function createAsset(data: {
    name: string;
    category: string;
    kondisi?: string;
    holderType?: string;
    assignedToName?: string | null;
    nomorIndosat?: string | null;
    expiredDate?: string | null;
    keterangan?: string | null;
}, performedBy: string): Promise<AssetWithHistory> {
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            // Generate assetCode: HP-001, LT-042, NUM-023
            const prefix = data.category === "HANDPHONE" ? "HP" : data.category === "LAPTOP" ? "LT" : "NUM";
            const count = await prisma.asset.count({ where: { category: data.category as never } });
            const assetCode = `${prefix}-${String(count + 1 + attempt).padStart(3, "0")}`;

            const holderType = (data.holderType ?? "GA_POOL") as never;
            // Derive AssetStatus dari HolderType yang dipilih
            const status: string =
                holderType === "GA_POOL"       ? "AVAILABLE"      :
                holderType === "COMPANY_OWNED" ? "COMPANY_OWNED"  :
                "IN_USE"; // EMPLOYEE, FORMER_EMPLOYEE, TEAM

            const row = await prisma.asset.create({
                data: {
                    assetCode,
                    name: data.name,
                    category: data.category as never,
                    kondisi: (data.kondisi ?? "BAIK") as never,
                    status: status as never,
                    holderType,
                    assignedToName: data.assignedToName ?? null,
                    assignedAt: data.assignedToName ? new Date() : null,
                    nomorIndosat: data.nomorIndosat ?? null,
                    expiredDate: data.expiredDate ? new Date(data.expiredDate) : null,
                    keterangan: data.keterangan ?? null,
                },
            });

            // Catat history initial assign jika bukan GA pool
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
            // Prisma unique constraint violation → retry with incremented code
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

    // Should never reach here, but TypeScript needs the return
    throw new Error("Gagal membuat aset setelah beberapa percobaan.");
}

/** UPDATE aset */
export async function updateAsset(id: string, data: {
    name?: string;
    kondisi?: string;
    keterangan?: string | null;
    nomorIndosat?: string | null;
    expiredDate?: string | null;
    status?: string;
}): Promise<AssetWithHistory | null> {
    try {
        const row = await prisma.asset.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name }),
                ...(data.kondisi !== undefined && { kondisi: data.kondisi as never }),
                ...(data.keterangan !== undefined && { keterangan: data.keterangan }),
                ...(data.nomorIndosat !== undefined && { nomorIndosat: data.nomorIndosat }),
                ...(data.expiredDate !== undefined && {
                    expiredDate: data.expiredDate ? new Date(data.expiredDate) : null,
                }),
                ...(data.status !== undefined && { status: data.status as never }),
            },
        });
        return toAsset(row);
    } catch {
        return null;
    }
}

/** ASSIGN / RETURN aset ke seseorang */
export async function assignAsset(id: string, payload: {
    toHolderType: string;
    toName: string | null;
    notes?: string;
    kondisi?: string;
}, performedBy: string): Promise<AssetWithHistory | null> {
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) return null;

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

    const row = await prisma.asset.update({
        where: { id },
        data: {
            holderType: payload.toHolderType as never,
            assignedToName: payload.toName,
            assignedAt: isReturning ? null : new Date(),
            status: newStatus as never,
            ...(payload.kondisi && { kondisi: payload.kondisi as never }),
        },
    });

    logger.info("Aset di-assign", { assetCode: existing.assetCode, to: payload.toName, performedBy });
    return toAsset(row);
}

/** GET history perpindahan aset */
export async function getAssetHistory(assetId: string) {
    const rows = await prisma.assetHistory.findMany({
        where: { assetId },
        orderBy: { createdAt: "desc" },
    });
    return rows.map(r => ({
        ...r,
        createdAt: new Date(r.createdAt).toISOString(),
    }));
}

/** DELETE aset (soft: ubah jadi RETIRED) */
export async function retireAsset(id: string, performedBy: string): Promise<boolean> {
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) return false;

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

    await prisma.asset.update({
        where: { id },
        data: { status: "RETIRED", holderType: "GA_POOL", assignedToName: null, assignedAt: null },
    });

    logger.info("Aset di-retire", { assetCode: existing.assetCode, performedBy });
    return true;
}
