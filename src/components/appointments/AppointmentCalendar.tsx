"use client";

import { useState } from "react";
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";

export interface CalendarAppointment {
    id: string;
    title: string;
    status: string;
    lifecycle?: string;
    startAt: string;
    endAt: string;
    isFullDay: boolean;
    room?: { name: string } | null;
}

interface AppointmentCalendarProps {
    appointmentsByDate: Map<string, CalendarAppointment[]>;
    selectedDate: string;
    onSelectDate: (date: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
    SCHEDULED: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900",
    IN_PROGRESS: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900",
    COMPLETED: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    CANCELLED: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900 line-through",
    default: "bg-[var(--secondary)] text-[var(--text-secondary)] border-[var(--border)]",
};

function fmtTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function AppointmentCalendar({ appointmentsByDate, selectedDate, onSelectDate }: AppointmentCalendarProps) {
    const [currentDate, setCurrentDate] = useState(() => {
        const [y, m] = selectedDate.split("-").map(Number);
        return new Date(y || new Date().getFullYear(), (m || new Date().getMonth() + 1) - 1, 1);
    });

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const totalDays = daysInMonth(year, month);
    const startDay = new Date(year, month, 1).getDay();
    const prevMonthTotalDays = daysInMonth(year, month - 1);
    const allDays = [
        ...Array.from({ length: startDay }, (_, i) => ({ day: prevMonthTotalDays - startDay + i + 1, currentMonth: false })),
        ...Array.from({ length: totalDays }, (_, i) => ({ day: i + 1, currentMonth: true })),
    ];
    while (allDays.length % 7 !== 0) {
        allDays.push({ day: allDays.length - totalDays - startDay + 1, currentMonth: false });
    }

    const monthName = currentDate.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    const todayKey = (() => {
        const t = new Date();
        return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    })();

    return (
        <div className="card overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between gap-3 bg-[var(--secondary)]/50">
                <div className="flex min-w-0 items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-[var(--primary)]" />
                    <h3 className="font-bold text-sm text-[var(--text-primary)]">Kalender Meeting</h3>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-[var(--text-secondary)] capitalize" aria-live="polite">
                        {monthName}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                            className="min-w-11 min-h-11 p-2.5 flex items-center justify-center hover:bg-[var(--secondary)] rounded-xl transition-colors focus-visible:ring-2"
                            aria-label="Bulan sebelumnya"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                            className="min-w-11 min-h-11 p-2.5 flex items-center justify-center hover:bg-[var(--secondary)] rounded-xl transition-colors focus-visible:ring-2"
                            aria-label="Bulan berikutnya"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--secondary)]/30">
                {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d, index) => (
                    <div
                        key={d}
                        className={`py-2 text-center text-[10px] font-bold uppercase tracking-wider ${
                            index === 0
                                ? "bg-red-50 text-red-700 dark:bg-red-950/25 dark:text-red-300"
                                : index === 6
                                    ? "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300"
                                    : "text-[var(--text-muted)]"
                        }`}
                    >
                        {d}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 auto-rows-[minmax(76px,auto)] divide-x divide-y divide-[var(--border)] border-l border-t border-[var(--border)] sm:auto-rows-[minmax(88px,auto)]">
                {allDays.map((d, i) => {
                    const dateKey = d.currentMonth
                        ? `${year}-${String(month + 1).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
                        : "";
                    const items = d.currentMonth ? appointmentsByDate.get(dateKey) || [] : [];
                    const isSunday = i % 7 === 0;
                    const isSaturday = i % 7 === 6;
                    const isToday = dateKey === todayKey;
                    const isSelected = dateKey === selectedDate;
                    const cellBackground = !d.currentMonth
                        ? "bg-[var(--secondary)]/50"
                        : isSelected
                            ? "bg-[var(--primary)]/10"
                            : isSunday
                                ? "bg-red-50 dark:bg-red-950/25"
                                : isSaturday
                                    ? "bg-slate-100/80 dark:bg-slate-800/50"
                                    : "bg-[var(--card)]";
                    return (
                        <button
                            key={i}
                            type="button"
                            disabled={!d.currentMonth}
                            onClick={() => onSelectDate(dateKey)}
                            className={`p-1.5 text-left transition-colors min-h-11 ${cellBackground}`}
                            aria-label={d.currentMonth ? `Pilih tanggal ${dateKey}` : undefined}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-[11px] font-bold ${d.currentMonth ? (isToday ? "w-5 h-5 bg-[#800020] text-white rounded-full flex items-center justify-center -mt-0.5" : isSunday ? "text-red-700 dark:text-red-300" : "text-[var(--text-primary)]") : "text-[var(--text-muted)] opacity-50"}`}>
                                    {d.day}
                                </span>
                            </div>
                            <div className="space-y-1">
                                {items.slice(0, 2).map((a) => (
                                    <div
                                        key={a.id}
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium border truncate ${STATUS_COLORS[a.lifecycle ?? a.status] || STATUS_COLORS.default}`}
                                        title={`${fmtTime(a.startAt)} ${a.title}`}
                                    >
                                        {fmtTime(a.startAt)} {a.title}
                                    </div>
                                ))}
                                {items.length > 2 && (
                                    <div className="text-[8px] text-[var(--text-muted)] font-bold pl-1">
                                        +{items.length - 2} jadwal lainnya
                                    </div>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className="p-3 bg-[var(--secondary)]/50 border-t border-[var(--border)] flex flex-wrap gap-x-4 gap-y-2 items-center justify-center">
                <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded bg-blue-200" />
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">Terjadwal</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded bg-emerald-200" />
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">Sedang Berlangsung</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded bg-slate-200" />
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">Selesai</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded bg-rose-200" />
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">Dibatalkan</span>
                </div>
            </div>
        </div>
    );
}
