export type AssetCategory = {
    id: string;
    name: string;
    prefix: string;
    createdAt: string;
    _count?: { assets: number };
};

export type AssetCondition = "BAIK" | "KURANG_BAIK" | "RUSAK";
export type AssetStatus = "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "RETIRED" | "COMPANY_OWNED";
export type HolderType = "EMPLOYEE" | "FORMER_EMPLOYEE" | "TEAM" | "GA_POOL" | "COMPANY_OWNED";

export type AssignedEmployeeInfo = {
    employeeId: string;
    name: string;
    department: string;
    position: string;
};

export type AssetWithHistory = {
    id: string;
    assetCode: string;
    name: string;
    categoryId: string;
    category?: AssetCategory;
    kondisi: AssetCondition;
    status: AssetStatus;
    holderType: HolderType;
    assignedToName: string | null;
    assignedToId: string | null;
    assignedAt: string | null;
    assignedEmployee: AssignedEmployeeInfo | null;
    nomorIndosat: string | null;
    expiredDate: string | null;
    keterangan: string | null;
    
    // Identifikasi Perangkat
    serialNumber: string | null;
    imei: string | null;
    manufacturer: string | null;
    modelName: string | null;
    
    // Finansial & Garansi
    purchaseDate: string | null;
    purchasePrice: number | null;
    warrantyExpiry: string | null;
    
    createdAt: string;
    updatedAt: string;
    
    // Inspeksi
    lastInspection?: { inspectedAt: string; kondisiSaat: AssetCondition } | null;
};

export type AssetHistoryRow = {
    id: string;
    assetId: string;
    fromHolderType: HolderType | null;
    fromName: string | null;
    toHolderType: HolderType;
    toName: string | null;
    action: string;
    kondisiSaat: AssetCondition;
    notes: string | null;
    performedBy: string;
    createdAt: string;
};
