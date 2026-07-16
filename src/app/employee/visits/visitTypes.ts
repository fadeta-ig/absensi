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
};

export const VISIT_FILTER_OPTIONS: Array<{ key: "all" | "draft" | "clocked_in" | "unchecked" | "checked"; label: string }> = [
    { key: "all", label: "Semua" },
    { key: "draft", label: "Draft" },
    { key: "clocked_in", label: "Clock In" },
    { key: "unchecked", label: "Belum Dicek" },
    { key: "checked", label: "Sudah Dicek" },
];

export const MIN_PHOTOS_REQUIRED = 2;
export const DEFAULT_VISIT_RADIUS = 300;
