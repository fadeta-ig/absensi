export interface VisitReport {
    id: string;
    employeeId: string;
    employeeName?: string | null;
    employeeDepartment?: string | null;
    date: string;
    visitStartTime?: string | null;
    visitEndTime?: string | null;
    clientName: string;
    clientAddress: string;
    purpose: string;
    result?: string | null;
    location?: { lat: number; lng: number } | null;
    photo?: string | null;
    status: "pending" | "approved" | "rejected";
    notes?: string | null;
    createdAt: string;
}

export const STATUS_CONFIG = {
    pending: { label: "Menunggu", class: "badge-warning" },
    approved: { label: "Disetujui", class: "badge-success" },
    rejected: { label: "Ditolak", class: "badge-error" },
};
