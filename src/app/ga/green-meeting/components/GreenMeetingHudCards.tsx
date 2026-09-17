"use client";

import { CheckCircle2, ListTodo, AlertTriangle, Clock } from "lucide-react";
import type { GreenMeetingAttendance, GreenMeetingNote } from "../types";

interface GreenMeetingHudCardsProps {
    attendances: GreenMeetingAttendance[];
    activeTasks: GreenMeetingNote[];
    currentDateStr: string;
}

export default function GreenMeetingHudCards({
    attendances,
    activeTasks,
    currentDateStr,
}: GreenMeetingHudCardsProps) {
    const totalUnits = attendances.length;
    const hadirCount = attendances.filter((a) => a.status === "HADIR").length;
    const izinCount = attendances.filter((a) => a.status === "IZIN").length;
    const alpaCount = attendances.filter((a) => a.status === "ALPA").length;
    const attendancePercent = totalUnits > 0 ? Math.round((hadirCount / totalUnits) * 100) : 0;

    // Hitung tugas yang jatuh tempo hari ini
    const dueTodayTasks = activeTasks.filter((t) => {
        const latestDeadline = t.deadlines && t.deadlines.length > 0
            ? t.deadlines[t.deadlines.length - 1].deadlineDate.split("T")[0]
            : null;
        return latestDeadline === currentDateStr;
    });

    // Hitung tugas yang mengalami perpanjangan (sequence > 1)
    const extendedTasks = activeTasks.filter((t) => t.deadlines && t.deadlines.length > 1);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {/* Card 1: Presensi Hari Ini */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Presensi Departemen Hari Ini
                    </span>
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={18} />
                    </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">
                        {hadirCount} / {totalUnits}
                    </span>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        ({attendancePercent}%)
                    </span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                    <span className="text-emerald-600 font-medium">{hadirCount} Hadir</span>
                    <span>•</span>
                    <span className="text-amber-600 font-medium">{izinCount} Izin</span>
                    <span>•</span>
                    <span className="text-red-600 font-medium">{alpaCount} Alpa</span>
                </div>
            </div>

            {/* Card 2: Tugas Sedang Berjalan */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Tugas Aktif Berjalan
                    </span>
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <ListTodo size={18} />
                    </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">
                        {activeTasks.length}
                    </span>
                    <span className="text-xs text-muted-foreground">Tindak Lanjut</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                    Membutuhkan eksekusi di lapangan
                </p>
            </div>

            {/* Card 3: Jatuh Tempo Hari Ini */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Jatuh Tempo Hari Ini
                    </span>
                    <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                        <Clock size={18} />
                    </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className={`text-2xl font-bold ${dueTodayTasks.length > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                        {dueTodayTasks.length}
                    </span>
                    <span className="text-xs text-muted-foreground">Tugas</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                    {dueTodayTasks.length > 0 ? "Wajib dikonfirmasi progresnya" : "Tidak ada deadline hari ini"}
                </p>
            </div>

            {/* Card 4: Tugas Diperpanjang */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Riwayat Perpanjangan
                    </span>
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <AlertTriangle size={18} />
                    </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">
                        {extendedTasks.length}
                    </span>
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Tugas Molor</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                    Mendapatkan perpanjangan tenggat waktu
                </p>
            </div>
        </div>
    );
}
