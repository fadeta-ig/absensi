import { prisma } from "../../prisma";
import logger from "@/lib/logger";
import { AssetCondition, AssetStatus, HolderType } from "@/lib/types/asset";
import { PublicAssetInfo, InspectionResult, InspectionChecklist } from "./types";

/**
 * Mengambil informasi publik aset (hanya field aman).
 */
export async function getPublicAssetById(id: string): Promise<PublicAssetInfo | null> {
    const row = await prisma.asset.findUnique({
        where: { id },
        select: {
            id: true,
            assetCode: true,
            name: true,
            status: true,
            kondisi: true,
            holderType: true,
            assignedToName: true,
            manufacturer: true,
            modelName: true,
            categoryRel: { select: { name: true } },
            inspections: {
                orderBy: { inspectedAt: "desc" },
                take: 1,
                select: { inspectedAt: true, kondisiSaat: true },
            },
        },
    });
    
    if (!row || row.status === "COMPANY_OWNED") return null;

    const last = row.inspections[0] ?? null;
    return {
        id: row.id,
        assetCode: row.assetCode,
        name: row.name,
        categoryName: row.categoryRel?.name ?? null,
        status: row.status as AssetStatus,
        kondisi: row.kondisi as AssetCondition,
        holderType: row.holderType as HolderType,
        assignedToName: row.assignedToName,
        manufacturer: row.manufacturer,
        modelName: row.modelName,
        lastInspection: last ? {
            inspectedAt: new Date(last.inspectedAt).toISOString(),
            kondisiSaat: last.kondisiSaat as AssetCondition,
        } : null,
    };
}

/**
 * Mencatat hasil inspeksi fisik oleh GA.
 */
export async function createAssetInspection(data: {
    assetId: string;
    kondisiSaat: string;
    checklist: InspectionChecklist;
    notes?: string | null;
    performedBy: string;
}): Promise<InspectionResult> {
    const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
    if (!asset) throw new Error("Aset tidak ditemukan");

    const inspection = await prisma.assetInspection.create({
        data: {
            assetId: data.assetId,
            kondisiSaat: data.kondisiSaat as never,
            checklistJson: JSON.stringify(data.checklist),
            notes: data.notes ?? null,
            performedBy: data.performedBy,
        },
    });

    if (asset.kondisi !== data.kondisiSaat) {
        await prisma.asset.update({
            where: { id: data.assetId },
            data: { kondisi: data.kondisiSaat as never },
        });
        logger.info("Kondisi aset diperbarui via inspeksi", {
            assetCode: asset.assetCode,
            from: asset.kondisi,
            to: data.kondisiSaat,
            performedBy: data.performedBy,
        });
    }

    return {
        id: inspection.id,
        assetId: inspection.assetId,
        kondisiSaat: inspection.kondisiSaat as AssetCondition,
        checklist: JSON.parse(inspection.checklistJson) as InspectionChecklist,
        notes: inspection.notes,
        performedBy: inspection.performedBy,
        inspectedAt: new Date(inspection.inspectedAt).toISOString(),
    };
}

/**
 * Mengambil riwayat inspeksi untuk detail aset.
 */
export async function getAssetInspections(assetId: string): Promise<InspectionResult[]> {
    const rows = await prisma.assetInspection.findMany({
        where: { assetId },
        orderBy: { inspectedAt: "desc" },
    });
    return rows.map(r => ({
        id: r.id,
        assetId: r.assetId,
        kondisiSaat: r.kondisiSaat as AssetCondition,
        checklist: JSON.parse(r.checklistJson) as InspectionChecklist,
        notes: r.notes,
        performedBy: r.performedBy,
        inspectedAt: new Date(r.inspectedAt).toISOString(),
    }));
}
