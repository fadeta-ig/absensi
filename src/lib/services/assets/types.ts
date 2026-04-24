import { AssetCondition, AssetStatus, HolderType } from "@/lib/types/asset";

// ─── Inspection Types ───────────────────────────────────────────

export type InspectionChecklist = Record<string, boolean>;

export type InspectionResult = {
    id: string;
    assetId: string;
    kondisiSaat: AssetCondition;
    checklist: InspectionChecklist;
    notes: string | null;
    performedBy: string;
    inspectedAt: string;
};

// ─── Public Asset Types ─────────────────────────────────────────

export type PublicAssetInfo = {
    id: string;
    assetCode: string;
    name: string;
    categoryName: string | null;
    status: AssetStatus;
    kondisi: AssetCondition;
    holderType: HolderType;
    assignedToName: string | null;
    manufacturer: string | null;
    modelName: string | null;
    lastInspection: { inspectedAt: string; kondisiSaat: AssetCondition } | null;
};
