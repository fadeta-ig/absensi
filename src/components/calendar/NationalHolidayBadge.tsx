"use client";

import { AlertCircle } from "lucide-react";
import { useGlobalHolidays } from "@/hooks/useGlobalHolidays";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Penanda "Tanggal Merah" global: angka/nama merah + nama libur terlihat
 * sekaligus sebagai tooltip. Render null bila tanggal bukan libur
 * nasional/cuti bersama. Dipakai ulang semua permukaan kalender yang tidak
 * punya grid bulan (header/session Green Meeting, dsb).
 */
export default function NationalHolidayBadge({ dateKey, className = "" }: { dateKey: string; className?: string }) {
    const year = DATE_RE.test(dateKey) ? Number(dateKey.slice(0, 4)) : null;
    const { holidaysByDate } = useGlobalHolidays(year);
    const holiday = holidaysByDate.get(dateKey)?.[0] ?? null;
    if (!holiday) return null;

    const label = holiday.type === "joint-leave" ? "Cuti Bersama" : "Libur Nasional";
    return (
        <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20 flex items-center gap-1 ${className}`}
            title={`${label}: ${holiday.name}`}
        >
            <AlertCircle size={12} aria-hidden="true" className="shrink-0" />
            <span className="truncate">Tanggal Merah: {holiday.name}</span>
        </span>
    );
}
