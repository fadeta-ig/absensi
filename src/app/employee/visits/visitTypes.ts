import { VisitStatus } from "@/types";

export const VISIT_STATUS_CONFIG: Record<VisitStatus, { label: string; class: string; color: string }> = {
    draft: {
        label: "Draft",
        class: "badge-secondary",
        color: "text-gray-700 bg-gray-50 border-gray-200",
    },
    clocked_in: {
        label: "Clock In",
        class: "badge-info",
        color: "text-blue-700 bg-blue-50 border-blue-200",
    },
    clocked_out: {
        label: "Clock Out",
        class: "badge-warning",
        color: "text-orange-700 bg-orange-50 border-orange-200",
    },
    pending_approval: {
        label: "Menunggu",
        class: "badge-warning",
        color: "text-yellow-700 bg-yellow-50 border-yellow-200",
    },
    approved: {
        label: "Disetujui",
        class: "badge-success",
        color: "text-green-700 bg-green-50 border-green-200",
    },
    rejected: {
        label: "Ditolak",
        class: "badge-error",
        color: "text-red-700 bg-red-50 border-red-200",
    },
};

export const VISIT_FILTER_OPTIONS: Array<{ key: VisitStatus | "all"; label: string }> = [
    { key: "all", label: "Semua" },
    { key: "draft", label: "Draft" },
    { key: "clocked_in", label: "Clock In" },
    { key: "pending_approval", label: "Menunggu" },
    { key: "approved", label: "Disetujui" },
    { key: "rejected", label: "Ditolak" },
];

export const MIN_PHOTOS_REQUIRED = 2;
export const DEFAULT_VISIT_RADIUS = 300;
