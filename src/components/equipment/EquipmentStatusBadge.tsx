"use client";

export const EQUIPMENT_STATUS_LABEL: Record<string, string> = {
    OPEN: "Berjalan",
    SUBMITTED: "Terkirim",
    DONE: "Selesai",
};

export function equipmentStatusLabel(status: string): string {
    return EQUIPMENT_STATUS_LABEL[status] ?? status;
}

function badgeClass(status: string): string {
    switch (status) {
        case "OPEN":
            return "badge badge-warning";
        case "SUBMITTED":
            return "badge badge-info";
        case "DONE":
            return "badge badge-success";
        default:
            return "badge badge-info";
    }
}

/** Badge status token-aware (ganti hardcode bg-yellow/blue/green-100 per halaman). */
export function EquipmentStatusBadge({ status }: { status: string }) {
    return <span className={badgeClass(status)}>{equipmentStatusLabel(status)}</span>;
}

function dotClass(status: string | null): string {
    switch (status) {
        case "OPEN":
            return "bg-orange-500";
        case "SUBMITTED":
            return "bg-blue-500";
        case "DONE":
            return "bg-green-500";
        default:
            return "bg-gray-300 dark:bg-gray-600";
    }
}

/** Titik status kecil untuk baris list (scannable di lapangan). */
export function EquipmentStatusDot({ status }: { status: string | null }) {
    return (
        <span
            aria-hidden="true"
            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass(status)}`}
        />
    );
}
