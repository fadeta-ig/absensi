"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
    AlertCircle,
    CakeSlice,
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Loader2,
} from "lucide-react";
import { toDateString } from "@/lib/utils";
import type { IndonesianHoliday } from "@/lib/services/holidayService";
import {
    groupBirthdaysByDay,
    normalizeBirthdayPayload,
    type EmployeeBirthday,
} from "@/lib/services/birthdayService";

interface LeaveRequest {
    id: string;
    employeeId: string;
    employee?: { name: string };
    type: string;
    startDate: string;
    endDate: string;
    status: string;
}

interface LeaveCalendarProps {
    leaves: LeaveRequest[];
}

const TYPE_COLORS: Record<string, string> = {
    annual: "bg-blue-100 text-blue-700 border-blue-200",
    sick: "bg-red-100 text-red-700 border-red-200",
    personal: "bg-yellow-100 text-yellow-700 border-yellow-200",
    maternity: "bg-purple-100 text-purple-700 border-purple-200",
    default: "bg-[var(--secondary)] text-[var(--text-secondary)] border-[var(--border)]",
};

const TYPE_LABELS: Record<string, string> = {
    annual: "Tahunan",
    sick: "Sakit",
    personal: "Pribadi",
    maternity: "Melahirkan",
};

export default function LeaveCalendar({ leaves }: LeaveCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [holidays, setHolidays] = useState<IndonesianHoliday[]>([]);
    const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);
    const [holidayError, setHolidayError] = useState("");
    const [birthdays, setBirthdays] = useState<EmployeeBirthday[]>([]);
    const [isLoadingBirthdays, setIsLoadingBirthdays] = useState(true);
    const [birthdayError, setBirthdayError] = useState("");

    const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    useEffect(() => {
        const controller = new AbortController();

        async function fetchHolidays() {
            setIsLoadingHolidays(true);
            setHolidayError("");

            try {
                const response = await fetch(`/api/holidays?year=${year}`, {
                    signal: controller.signal,
                });
                const result: unknown = await response.json();

                if (!response.ok) {
                    const message = result && typeof result === "object" && "error" in result
                        ? String((result as { error: unknown }).error)
                        : "Data hari libur nasional tidak dapat dimuat.";
                    throw new Error(message);
                }

                const data = result && typeof result === "object" && Array.isArray((result as { data?: unknown }).data)
                    ? (result as { data: IndonesianHoliday[] }).data
                    : [];
                setHolidays(data);
            } catch (error) {
                if (controller.signal.aborted) return;
                setHolidays([]);
                setHolidayError(error instanceof Error ? error.message : "Data hari libur nasional tidak dapat dimuat.");
            } finally {
                if (!controller.signal.aborted) setIsLoadingHolidays(false);
            }
        }

        void fetchHolidays();
        return () => controller.abort();
    }, [year]);

    useEffect(() => {
        const controller = new AbortController();

        async function fetchBirthdays() {
            setIsLoadingBirthdays(true);
            setBirthdayError("");

            try {
                const response = await fetch("/api/employees/birthdays", {
                    signal: controller.signal,
                });
                const result: unknown = await response.json();

                if (!response.ok) {
                    const message = result && typeof result === "object" && "error" in result
                        ? String((result as { error: unknown }).error)
                        : "Data ulang tahun karyawan tidak dapat dimuat.";
                    throw new Error(message);
                }

                setBirthdays(normalizeBirthdayPayload(result));
            } catch (error) {
                if (controller.signal.aborted) return;
                setBirthdays([]);
                setBirthdayError(error instanceof Error ? error.message : "Data ulang tahun karyawan tidak dapat dimuat.");
            } finally {
                if (!controller.signal.aborted) setIsLoadingBirthdays(false);
            }
        }

        void fetchBirthdays();
        return () => controller.abort();
    }, []);

    const holidaysByDate = useMemo(() => {
        const result = new Map<string, IndonesianHoliday[]>();
        for (const holiday of holidays) {
            const current = result.get(holiday.date) || [];
            current.push(holiday);
            result.set(holiday.date, current);
        }
        return result;
    }, [holidays]);

    const birthdaysByDay = useMemo(
        () => groupBirthdaysByDay(birthdays, month + 1),
        [birthdays, month]
    );

    const calendarError = [holidayError, birthdayError].filter(Boolean).join(" ");

    const monthName = currentDate.toLocaleDateString("id-ID", { month: "long", year: "numeric" });

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);

    // Days from previous month to fill the first row
    const prevMonthTotalDays = daysInMonth(year, month - 1);
    const daysFromPrevMonth = Array.from({ length: startDay }, (_, i) => ({
        day: prevMonthTotalDays - startDay + i + 1,
        currentMonth: false,
    }));

    // Days for current month
    const daysInCurrentMonth = Array.from({ length: totalDays }, (_, i) => ({
        day: i + 1,
        currentMonth: true,
    }));

    // All days to display (grid 7 columns)
    const allDays = [...daysFromPrevMonth, ...daysInCurrentMonth];
    while (allDays.length % 7 !== 0) {
        allDays.push({ day: allDays.length - totalDays - startDay + 1, currentMonth: false });
    }

    const getLeavesForDate = (day: number, isCurrentMonth: boolean) => {
        if (!isCurrentMonth) return [];
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return leaves.filter((l) => {
            const start = toDateString(l.startDate);
            const end = toDateString(l.endDate);
            return dateStr >= start && dateStr <= end;
        });
    };

    return (
        <div className="card overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between gap-3 bg-[var(--secondary)]/50">
                <div className="flex min-w-0 items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-[var(--primary)]" />
                    <h3 className="font-bold text-sm text-[var(--text-primary)]">Kalender Cuti</h3>
                    {(isLoadingHolidays || isLoadingBirthdays) && (
                        <Loader2
                            className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]"
                            aria-label="Memuat data kalender"
                        />
                    )}
                    {calendarError && (
                        <span
                            className="flex min-w-0 items-center gap-1 text-[10px] font-medium text-red-600"
                            title={calendarError}
                        >
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            <span className="hidden truncate sm:inline">Data kalender belum lengkap</span>
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span
                        className="text-xs font-semibold text-[var(--text-secondary)] capitalize"
                        aria-live="polite"
                    >
                        {monthName}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={prevMonth}
                            className="p-1 hover:bg-[var(--secondary)] rounded transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                            aria-label="Bulan sebelumnya"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={nextMonth}
                            className="p-1 hover:bg-[var(--secondary)] rounded transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
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
                    const dateLeaves = getLeavesForDate(d.day, d.currentMonth);
                    const dateKey = d.currentMonth
                        ? `${year}-${String(month + 1).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
                        : "";
                    const dateHolidays = d.currentMonth ? holidaysByDate.get(dateKey) || [] : [];
                    const dateBirthdays = d.currentMonth ? birthdaysByDay.get(d.day) || [] : [];
                    const isSunday = i % 7 === 0;
                    const isSaturday = i % 7 === 6;
                    const isToday = d.currentMonth && d.day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                    const cellBackground = !d.currentMonth
                        ? "bg-[var(--secondary)]/50"
                        : dateHolidays.length > 0
                            ? "bg-rose-50 dark:bg-rose-950/35"
                            : isSunday
                                ? "bg-red-50 dark:bg-red-950/25"
                                : isSaturday
                                    ? "bg-slate-100/80 dark:bg-slate-800/50"
                                    : "bg-[var(--card)]";
                    const dayColor = dateHolidays.length > 0 || isSunday
                        ? "text-red-700 dark:text-red-300"
                        : isSaturday
                            ? "text-slate-600 dark:text-slate-300"
                            : "text-[var(--text-primary)]";

                    return (
                        <div key={i} className={`p-1.5 transition-colors ${cellBackground}`}>
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-[11px] font-bold ${d.currentMonth ? (isToday ? "w-5 h-5 bg-[#800020] text-white rounded-full flex items-center justify-center -mt-0.5" : dayColor) : "text-[var(--text-muted)] opacity-50"}`}>
                                    {d.day}
                                </span>
                            </div>
                            <div className="space-y-1">
                                {dateHolidays.slice(0, 1).map((holiday) => (
                                    <div
                                        key={`${holiday.date}-${holiday.name}`}
                                        className="truncate rounded border border-red-200 bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-800 dark:border-red-800/70 dark:bg-red-900/50 dark:text-red-100"
                                        title={`${holiday.type === "joint-leave" ? "Cuti Bersama" : "Libur Nasional"}: ${holiday.name}`}
                                    >
                                        {holiday.name}
                                    </div>
                                ))}
                                {dateHolidays.length > 1 && (
                                    <div className="pl-1 text-[8px] font-bold text-red-700 dark:text-red-300">
                                        +{dateHolidays.length - 1} hari libur
                                    </div>
                                )}
                                {dateBirthdays.slice(0, 1).map((birthday) => (
                                    <div
                                        key={birthday.employeeId}
                                        className="flex min-w-0 items-center gap-1 rounded border border-cyan-200 bg-cyan-100 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-800 dark:border-cyan-800/70 dark:bg-cyan-900/50 dark:text-cyan-100"
                                        title={`Ulang tahun: ${birthday.name}`}
                                    >
                                        <CakeSlice className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                        <span className="truncate">{birthday.name}</span>
                                    </div>
                                ))}
                                {dateBirthdays.length > 1 && (
                                    <div className="pl-1 text-[8px] font-bold text-cyan-700 dark:text-cyan-300">
                                        +{dateBirthdays.length - 1} ulang tahun
                                    </div>
                                )}
                                {dateLeaves.slice(0, 2).map((l) => (
                                    <div
                                        key={l.id}
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium border truncate ${l.status === "approved" ? (TYPE_COLORS[l.type] || TYPE_COLORS.default) : "bg-[var(--card)] text-orange-600 border-orange-200"}`}
                                        title={`${l.employee?.name || l.employeeId} - ${TYPE_LABELS[l.type] || l.type}`}
                                    >
                                        <div className="flex items-center gap-1">
                                            {l.status === "pending" && <div className="w-1 h-1 rounded-full bg-orange-500 animate-pulse" />}
                                            {l.employee?.name || l.employeeId}
                                        </div>
                                    </div>
                                ))}
                                {dateLeaves.length > 2 && (
                                    <div className="text-[8px] text-[var(--text-muted)] font-bold pl-1">
                                        +{dateLeaves.length - 2} lainnya
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="p-3 bg-[var(--secondary)]/50 border-t border-[var(--border)] flex flex-wrap gap-x-4 gap-y-2 items-center justify-center">
                <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded border border-red-200 bg-red-100 dark:border-red-800 dark:bg-red-900/50" />
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">Libur nasional / cuti bersama</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50" />
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">Minggu</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">Sabtu</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded border border-cyan-200 bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-900/50" />
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">Ulang tahun</span>
                </div>
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded ${TYPE_COLORS[key].split(" ")[0]}`} />
                        <span className="text-[10px] text-[var(--text-secondary)] font-medium">{label}</span>
                    </div>
                ))}
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded border border-orange-200 bg-[var(--card)]" />
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">Pending</span>
                </div>
            </div>
        </div>
    );
}
