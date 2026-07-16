import { VisitStatus } from "@/types";

export interface VisitReport {
    id: string;
    employeeId: string;
    employeeName?: string | null;
    employeeDepartment?: string | null;
    date: string;
    clockInTime?: string | null;
    clockOutTime?: string | null;
    clientName: string;
    clientAddress: string;
    purpose: string;
    result?: string | null;
    visitLocation?: { lat: number; lng: number } | null;
    visitRadius: number;
    clockInLocation?: { lat: number; lng: number } | null;
    clockOutLocation?: { lat: number; lng: number } | null;
    clockInPhotos?: string[] | null;
    clockOutPhotos?: string[] | null;
    status: VisitStatus;
    notes?: string | null;
    rejectionReason?: string | null;
    createdAt: string;
}

export const STATUS_CONFIG: Record<VisitStatus, { label: string; class: string }> = {
    draft: { label: "Draft", class: "badge-secondary" },
    clocked_in: { label: "Clock In", class: "badge-info" },
    clocked_out: { label: "Clock Out", class: "badge-warning" },
    pending_approval: { label: "Menunggu", class: "badge-warning" },
    approved: { label: "Disetujui", class: "badge-success" },
    rejected: { label: "Ditolak", class: "badge-error" },
};

export const FILTER_OPTIONS: Array<{ key: VisitStatus | "all"; label: string }> = [
    { key: "all", label: "Semua" },
    { key: "draft", label: "Draft" },
    { key: "clocked_in", label: "Clock In" },
    { key: "clocked_out", label: "Clock Out" },
    { key: "pending_approval", label: "Menunggu" },
    { key: "approved", label: "Disetujui" },
    { key: "rejected", label: "Ditolak" },
];
