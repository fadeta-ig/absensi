"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun, Briefcase, CalendarCheck } from "lucide-react";
import { useToast } from "@/components/Toast";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import StateCard from "@/components/ui/StateCard";
import StatusBadge from "@/components/ui/StatusBadge";
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

const DAYS_TO_LOAD = 14;

export default function EmployeeSchedulePage() {
    const toast = useToast();
    const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const loadSchedule = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            const res = await fetch(`/api/employee/shift-schedule?days=${DAYS_TO_LOAD}`);
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
    }, [toast]);

    useEffect(() => {
        void loadSchedule();
    }, [loadSchedule]);

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
            case "default": return "Default";
            default: return "";
        }
    };

    const getTimeBand = (item: ScheduleItem): "pagi" | "siang" | "malam" | null => {
        if (item.isOff || !item.shiftName) return null;
        if (item.isOvernight) return "malam";
        const hour = Number.parseInt((item.startTime ?? "").slice(0, 2), 10);
        if (Number.isNaN(hour)) return "siang";
        if (hour >= 18 || hour < 5) return "malam";
        if (hour >= 12) return "siang";
        return "pagi";
    };

    return (
        <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
            <PageHeader
                title="Jadwal Saya"
                subtitle={`Jadwal shift kerja ${DAYS_TO_LOAD} hari ke depan`}
                icon={CalendarCheck}
            />

            {loading && <StateCard variant="loading" title="Memuat jadwal kerja..." />}

            {!loading && loadError && (
                <StateCard
                    variant="error"
                    title="Jadwal shift gagal dimuat"
                    description={loadError}
                    action={
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadSchedule()}>
                            Coba lagi
                        </button>
                    }
                />
            )}

            {!loading && !loadError && schedule.length === 0 && (
                <EmptyState
                    icon={CalendarCheck}
                    title="Jadwal belum tersedia"
                    description="Roster shift Anda akan muncul di sini setelah dijadwalkan."
                />
            )}

            {/* ─── Schedule List ────────────────────────────────── */}
            <div className="space-y-3 pb-8">
                {schedule.map((item) => (
                    <div
                        key={item.date}
                        className={`emp-surface emp-surface-hover flex flex-col gap-3 p-4 ${item.isOff ? "bg-[color-mix(in_srgb,var(--secondary)_40%,transparent)]" : ""}`}
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
                                    <StatusBadge tone="neutral">Libur</StatusBadge>
                                )}
                                {(() => {
                                    const band = getTimeBand(item);
                                    if (band === "malam") {
                                        return (
                                            <StatusBadge tone="neutral" icon={Moon}>
                                                Malam
                                            </StatusBadge>
                                        );
                                    }
                                    if (band === "siang") {
                                        return (
                                            <StatusBadge tone="neutral" icon={Sun}>
                                                Siang
                                            </StatusBadge>
                                        );
                                    }
                                    if (band === "pagi") {
                                        return (
                                            <StatusBadge tone="neutral" icon={Sun}>
                                                Pagi
                                            </StatusBadge>
                                        );
                                    }
                                    return null;
                                })()}
                                {!item.isOff && item.source !== "none" && (
                                    <StatusBadge tone="neutral">{getSourceLabel(item.source)}</StatusBadge>
                                )}
                            </div>
                        </div>

                        {!item.isOff && item.shiftName && (
                            <div className="flex items-center gap-2 mt-1">
                                <div className="w-8 h-8 rounded-xl bg-[var(--secondary)] flex items-center justify-center shrink-0">
                                    <Briefcase className="w-4 h-4 text-[var(--text-secondary)]" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight">
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
                            <p className="mt-1 text-[11px] font-medium italic text-[var(--text-muted)]">Hari istirahat jadwal</p>
                        )}
                        
                        {/* Hidden descriptive text for easy testing / screen readers */}
                        <span className="sr-only">tanggal {item.date} shift {item.shiftName || 'libur'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
