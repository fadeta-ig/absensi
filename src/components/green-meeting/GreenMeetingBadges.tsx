"use client";

import { CheckCircle2, History, XCircle, Clock, Loader2 } from "lucide-react";

/** Badge kehadiran rapat bersama (mobile + desktop): Hadir / Izin / Belum hadir. */
export function AttendanceBadge({ status, hasIzin }: { status: string; hasIzin: boolean }) {
    if (status === "HADIR") {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 size={11} aria-hidden="true" /> Hadir
            </span>
        );
    }
    if (status === "IZIN" || hasIzin) {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <History size={11} aria-hidden="true" /> Izin
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle size={11} aria-hidden="true" /> Belum hadir
        </span>
    );
}

/** Badge status tugas bersama (GA + HR + employee). */
export function TaskStatusBadge({ status }: { status: string }) {
    switch (status) {
        case "SELESAI":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <CheckCircle2 size={11} aria-hidden="true" />
                    Selesai
                </span>
            );
        case "SEDANG_BERJALAN":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                    <Loader2 size={11} aria-hidden="true" />
                    Sedang Berjalan
                </span>
            );
        case "BELUM_DIMULAI":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                    <Clock size={11} aria-hidden="true" />
                    Belum Dimulai
                </span>
            );
        case "DIBATALKAN":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
                    <XCircle size={11} aria-hidden="true" />
                    Dibatalkan
                </span>
            );
        default:
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
                    {status}
                </span>
            );
    }
}
