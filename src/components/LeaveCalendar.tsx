"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, User } from "lucide-react";

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
    default: "bg-slate-100 text-slate-700 border-slate-200",
};

const TYPE_LABELS: Record<string, string> = {
    annual: "Tahunan",
    sick: "Sakit",
    personal: "Pribadi",
    maternity: "Melahirkan",
};

export default function LeaveCalendar({ leaves }: LeaveCalendarProps) {
    const [currentDate, setCurrentDate] = useState(new Date());

    const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

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
            const start = l.startDate;
            const end = l.endDate;
            return dateStr >= start && dateStr <= end;
        });
    };

    return (
        <div className="card overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-[var(--primary)]" />
                    <h3 className="font-bold text-sm text-[var(--text-primary)]">Kalender Cuti</h3>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-[var(--text-secondary)] capitalize">{monthName}</span>
                    <div className="flex items-center gap-1">
                        <button onClick={prevMonth} className="p-1 hover:bg-[var(--secondary)] rounded transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button onClick={nextMonth} className="p-1 hover:bg-[var(--secondary)] rounded transition-colors">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-7 border-b border-[var(--border)] bg-slate-50/30">
                {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d) => (
                    <div key={d} className="py-2 text-center text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                        {d}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 grid-rows-5 divide-x divide-y divide-[var(--border)] border-l border-t border-[var(--border)]">
                {allDays.map((d, i) => {
                    const dateLeaves = getLeavesForDate(d.day, d.currentMonth);
                    const isToday = d.currentMonth && d.day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

                    return (
                        <div key={i} className={`min-h-[100px] p-1.5 transition-colors ${d.currentMonth ? "bg-white" : "bg-slate-50/50"}`}>
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-[11px] font-bold ${d.currentMonth ? (isToday ? "w-5 h-5 bg-[var(--primary)] text-white rounded-full flex items-center justify-center -mt-0.5" : "text-[var(--text-primary)]") : "text-[var(--text-muted)] opacity-50"}`}>
                                    {d.day}
                                </span>
                            </div>
                            <div className="space-y-1">
                                {dateLeaves.slice(0, 3).map((l) => (
                                    <div
                                        key={l.id}
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium border truncate ${l.status === "approved" ? (TYPE_COLORS[l.type] || TYPE_COLORS.default) : "bg-white text-orange-600 border-orange-200"}`}
                                        title={`${l.employee?.name || l.employeeId} - ${TYPE_LABELS[l.type] || l.type}`}
                                    >
                                        <div className="flex items-center gap-1">
                                            {l.status === "pending" && <div className="w-1 h-1 rounded-full bg-orange-500 animate-pulse" />}
                                            {l.employee?.name || l.employeeId}
                                        </div>
                                    </div>
                                ))}
                                {dateLeaves.length > 3 && (
                                    <div className="text-[8px] text-[var(--text-muted)] font-bold pl-1">
                                        +{dateLeaves.length - 3} lainnya
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="p-3 bg-slate-50/50 border-t border-[var(--border)] flex flex-wrap gap-4 items-center justify-center">
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded ${TYPE_COLORS[key].split(" ")[0]}`} />
                        <span className="text-[10px] text-[var(--text-secondary)] font-medium">{label}</span>
                    </div>
                ))}
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded border border-orange-200 bg-white" />
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">Pending</span>
                </div>
            </div>
        </div>
    );
}
