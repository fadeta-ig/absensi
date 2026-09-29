"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Moon, Sun, Briefcase, CalendarCheck } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface ScheduleItem {
    date: string;
    weekday: number;
    shiftId: string | null;
    shiftName: string | null;
    startTime: string | null;
    endTime: string | null;
    isOff: boolean;
    isOvernight: boolean;
    source: "assignment" | "fallback" | "default" | "none";
}

export default function EmployeeSchedulePage() {
    const toast = useToast();
    const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const daysToLoad = 14;

    useEffect(() => {
        const loadSchedule = async () => {
            setLoading(true);
            setLoadError("");
            try {
                const res = await fetch(`/api/employee/shift-schedule?days=${daysToLoad}`);
                if (!res.ok) {
                    throw new Error(await getResponseErrorMessage(res, "Gagal memuat jadwal shift."));
                }
                const data = await res.json();
                setSchedule(Array.isArray(data) ? data : []);
            } catch (error) {
                reportClientError("EmployeeSchedulePage", "Gagal memuat jadwal shift", error);
                const message = error instanceof Error ? error.message : "Gagal memuat jadwal shift.";
                setLoadError(message);
                toast(message, "error");
            } finally {
                setLoading(false);
            }
        };

        void loadSchedule();
    }, [toast, daysToLoad]);

    const formatDayName = (dateStr: string) => {
        return new Intl.DateTimeFormat("id-ID", { 
            timeZone: "Asia/Jakarta", 
            weekday: "long" 
        }).format(new Date(`${dateStr}T00:00:00+07:00`));
    };

    const formatDate = (dateStr: string) => {
        return new Intl.DateTimeFormat("id-ID", { 
            timeZone: "Asia/Jakarta", 
            day: "numeric", 
            month: "short",
            year: "numeric"
        }).format(new Date(`${dateStr}T00:00:00+07:00`));
    };

    const getSourceLabel = (source: string) => {
        switch (source) {
            case "assignment": return "Roster";
            case "fallback": return "Dasar";
            case "default": return "Dasar";
            default: return "";
        }
    };

    return (
        <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
            {/* ─── Header ──────────────────────────────────────── */}
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <CalendarCheck className="w-5 h-5 text-[var(--primary)]" />
                    Jadwal Saya
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Jadwal shift kerja {daysToLoad} hari ke depan</p>
            </div>

            {loading && (
                <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] px-4 py-8 flex flex-col items-center justify-center gap-3 text-sm text-[var(--text-secondary)]">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)]" />
                    <span>Memuat jadwal kerja...</span>
                </div>
            )}

            {loadError && (
                <div className="rounded-2xl border border-[var(--destructive)]/20 bg-[var(--destructive)]/10 px-4 py-3 flex items-start gap-2 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {!loading && !loadError && schedule.length === 0 && (
                <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">
                    Jadwal tidak tersedia.
                </div>
            )}

            {/* ─── Schedule List ────────────────────────────────── */}
            <div className="space-y-3 pb-8">
                {schedule.map((item, i) => (
                    <div 
                        key={i} 
                        className={`rounded-2xl border p-4 flex flex-col gap-3 transition-colors ${
                            item.isOff 
                                ? "bg-rose-50/50 border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/30" 
                                : "bg-[var(--card)] border-[var(--border)] hover:border-[var(--primary)]/40"
                        }`}
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[13px] font-bold text-[var(--text-primary)]">
                                    {formatDayName(item.date)}
                                </p>
                                <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">
                                    {formatDate(item.date)}
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-[50%]">
                                {item.isOff && (
                                    <span className="text-[10px] font-semibold text-rose-600 bg-rose-100 dark:bg-rose-500/20 dark:text-rose-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                                        Libur
                                    </span>
                                )}
                                {!item.isOff && item.isOvernight && (
                                    <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-400 px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
                                        <Moon className="w-3 h-3" /> Malam
                                    </span>
                                )}
                                {!item.isOff && !item.isOvernight && item.shiftName && (
                                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 dark:bg-amber-500/20 dark:text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
                                        <Sun className="w-3 h-3" /> Siang
                                    </span>
                                )}
                                {!item.isOff && item.source !== "none" && (
                                    <span className="text-[10px] font-semibold text-[var(--primary)] bg-[var(--primary)]/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                                        {getSourceLabel(item.source)}
                                    </span>
                                )}
                            </div>
                        </div>

                        {!item.isOff && item.shiftName && (
                            <div className="flex items-center gap-2 mt-1">
                                <div className="w-8 h-8 rounded-xl bg-[var(--secondary)] flex items-center justify-center shrink-0">
                                    <Briefcase className="w-4 h-4 text-[var(--text-secondary)]" />
                                </div>
                                <div>
                                    <p className="text-[12px] font-semibold text-[var(--text-primary)] leading-tight">
                                        {item.shiftName}
                                    </p>
                                    <p className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5 leading-tight flex items-center gap-1">
                                        {item.startTime} - {item.endTime} WIB
                                    </p>
                                </div>
                            </div>
                        )}
                        {!item.isOff && !item.shiftName && (
                            <p className="text-[11px] text-[var(--text-muted)] italic">Shift tidak ditentukan</p>
                        )}
                        {item.isOff && (
                            <p className="text-[11px] text-rose-500/80 dark:text-rose-400/80 italic mt-1 font-medium">Hari istirahat jadwal</p>
                        )}
                        
                        {/* Hidden descriptive text for easy testing / screen readers */}
                        <span className="sr-only">tanggal {item.date} shift {item.shiftName || 'libur'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
