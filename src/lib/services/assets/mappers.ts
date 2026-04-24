import { Asset, AssetCategory as PrismaAssetCategory, AssetInspection as PrismaInspection } from "@prisma/client";
import { AssetWithHistory, AssetCondition, AssetStatus, HolderType } from "@/lib/types/asset";

/**
 * Representasi row mentah dari Prisma dengan relasinya.
 * Digunakan untuk menghindari penggunaan 'any'.
 */
export type AssetRowRaw = Asset & {
    categoryRel?: PrismaAssetCategory | null;
    assignedTo?: {
        employeeId: string;
        name: string;
        departmentRel: { name: string } | null;
        positionRel: { name: string } | null;
    } | null;
    inspections?: Pick<PrismaInspection, "inspectedAt" | "kondisiSaat">[];
};

/**
 * Mengubah row mentah Prisma menjadi object AssetWithHistory yang diketik ketat.
 */
export function toAsset(row: AssetRowRaw): AssetWithHistory {
    const emp = row.assignedTo ?? null;
    
    return {
        id: row.id,
        assetCode: row.assetCode,
        name: row.name,
        categoryId: row.categoryId,
        category: row.categoryRel ? {
            id: row.categoryRel.id,
            name: row.categoryRel.name,
            prefix: row.categoryRel.prefix,
            createdAt: new Date(row.categoryRel.createdAt).toISOString()
        } : undefined,
        kondisi: row.kondisi as AssetCondition,
        status: row.status as AssetStatus,
        holderType: row.holderType as HolderType,
        assignedToName: row.assignedToName ?? null,
        assignedToId: row.assignedToId ?? null,
        assignedAt: row.assignedAt ? new Date(row.assignedAt).toISOString() : null,
        assignedEmployee: emp ? {
            employeeId: emp.employeeId,
            name: emp.name,
            department: emp.departmentRel?.name ?? "-",
            position: emp.positionRel?.name ?? "-",
        } : null,
        nomorIndosat: row.nomorIndosat ?? null,
        expiredDate: row.expiredDate ? new Date(row.expiredDate).toISOString() : null,
        keterangan: row.keterangan ?? null,
        serialNumber: row.serialNumber ?? null,
        imei: row.imei ?? null,
        manufacturer: row.manufacturer ?? null,
        modelName: row.modelName ?? null,
        purchaseDate: row.purchaseDate ? new Date(row.purchaseDate).toISOString() : null,
        purchasePrice: row.purchasePrice ? Number(row.purchasePrice) : null,
        warrantyExpiry: row.warrantyExpiry ? new Date(row.warrantyExpiry).toISOString() : null,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
        lastInspection: row.inspections?.[0] ? {
            inspectedAt: new Date(row.inspections[0].inspectedAt).toISOString(),
            kondisiSaat: row.inspections[0].kondisiSaat as AssetCondition,
        } : null,
    };
}
