"use client";

export const EQUIPMENT_STATUS_LABEL: Record<string, string> = {
    OPEN: "Berjalan",
    SUBMITTED: "Menunggu Verifikasi",
    DONE: "Menunggu Approval",
    APPROVED: "Selesai",
    CANCELLED: "Dibatalkan",
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
            return "badge badge-warning";
        case "APPROVED":
            return "badge badge-success";
        case "CANCELLED":
            return "badge";
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
            return "bg-amber-500";
        case "APPROVED":
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

export function resolveDisplayCompanies(input: {
    company?: string | null;
    isSharedBoth?: boolean | null;
    companies?: readonly string[] | null;
}): Array<"WIG" | "MKI"> {
    if (Array.isArray(input.companies) && input.companies.length > 0) {
        return (["WIG", "MKI"] as const).filter((c) => input.companies!.includes(c));
    }
    if (!input.company) return [];
    if (input.isSharedBoth) return ["WIG", "MKI"];
    if (input.company === "WIG" || input.company === "MKI") return [input.company];
    return [];
}

/** Badge perusahaan pemilik alat (WIG, MKI, atau WIG + MKI sekaligus). Null/kosong = belum dikategorikan (tak tampil). */
export function EquipmentCompanyBadge({
    company,
    isSharedBoth,
    companies,
}: {
    company?: string | null;
    isSharedBoth?: boolean | null;
    companies?: readonly string[] | null;
}) {
    const list = resolveDisplayCompanies({ company, isSharedBoth, companies });
    if (list.length === 0) return null;
    return (
        <span className="inline-flex items-center gap-1 align-middle">
            {list.map((c) => (
                <span
                    key={c}
                    className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        c === "WIG"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    }`}
                >
                    {c}
                </span>
            ))}
        </span>
    );
}

/** Badge penugasan global (semua unit WIG+MKI). */
export function EquipmentGlobalBadge() {
    return (
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            GLOBAL
        </span>
    );
}
