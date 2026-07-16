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
    hrChecked: boolean;
    notes?: string | null;
    createdAt: string;
}

export const STATUS_CONFIG: Record<VisitStatus, { label: string; class: string }> = {
    draft: { label: "Draft", class: "badge-secondary" },
    clocked_in: { label: "Clock In", class: "badge-info" },
    clocked_out: { label: "Clock Out", class: "badge-warning" },
};

export const FILTER_OPTIONS: Array<{ key: "all" | "unchecked" | "checked"; label: string }> = [
    { key: "all", label: "Semua" },
    { key: "unchecked", label: "Belum Dicek" },
    { key: "checked", label: "Sudah Dicek" },
];
