"use client";

import { useMemo } from "react";
import { CheckCircle2, ListTodo, AlertTriangle, Clock } from "lucide-react";
import { toWIBDateString } from "@/lib/timezone";
import { countAttendance, deptRepresentationOf, personRowsOf } from "../selectors";
import type { GreenMeetingAttendance, GreenMeetingDeptIzin, GreenMeetingNote } from "../types";

interface GreenMeetingHudCardsProps {
    attendances: GreenMeetingAttendance[];
    deptIzins: GreenMeetingDeptIzin[];
    activeTasks: GreenMeetingNote[];
    currentDateStr: string;
}

/** Tenggat terkini = entri dengan sequence terbesar. */
function latestDeadlineOf(task: GreenMeetingNote) {
    if (!task.deadlines || task.deadlines.length === 0) return null;
    return task.deadlines.reduce((a, b) => (b.sequence > a.sequence ? b : a));
}

export default function GreenMeetingHudCards({
    attendances,
    deptIzins,
    activeTasks,
    currentDateStr,
}: GreenMeetingHudCardsProps) {
    const personRows = useMemo(
        () => personRowsOf(attendances),
        [attendances]
    );
    const { hadir: hadirCount, belumHadir: alpaCount, percent: attendancePercent } = useMemo(
        () => countAttendance(personRows),
        [personRows]
    );

    // Keterwakilan dept via helper bersama (sama dengan chip Tab): HADIR/IZIN/ALPA.
    const { deptCount, deptTerwakili, izinDeptCount } = useMemo(() => {
        const rep = deptRepresentationOf(personRows, deptIzins);
        let hadir = 0;
        let izin = 0;
        for (const status of rep.values()) {
            if (status === "HADIR") hadir += 1;
            else if (status === "IZIN") izin += 1;
        }
        return {
            deptCount: rep.size,
            deptTerwakili: hadir,
            izinDeptCount: izin,
        };
    }, [personRows, deptIzins]);

    // Tugas yang jatuh tempo hari ini (acuan tanggal WIB halaman).
    const dueTodayTasks = useMemo(
        () => activeTasks.filter((t) => {
            const latest = latestDeadlineOf(t);
            return latest ? latest.deadlineDate.split("T")[0] === currentDateStr : false;
        }),
        [activeTasks, currentDateStr]
    );

    // Tugas yang mengalami perpanjangan (sequence > 1) + yang sudah terlambat.
    const { extendedTasks, overdueTasks } = useMemo(() => {
        const todayStr = toWIBDateString();
        const extended = activeTasks.filter((t) => t.deadlines && t.deadlines.length > 1);
        const overdue = activeTasks.filter((t) => {
            if (t.taskStatus === "SELESAI" || t.taskStatus === "DIBATALKAN") return false;
            const latest = latestDeadlineOf(t);
            return latest ? latest.deadlineDate.slice(0, 10) < todayStr : false;
        });
        return { extendedTasks: extended, overdueTasks: overdue };
    }, [activeTasks]);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {/* Card 1: Presensi Hari Ini */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Presensi Karyawan Hari Ini
                    </span>
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={18} />
                    </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">
                        {hadirCount} / {personRows.length}
                    </span>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        ({attendancePercent}%)
                    </span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                    <span className="text-emerald-600 font-medium">{hadirCount} Hadir</span>
                    <span>•</span>
                    <span className="text-red-600 font-medium">{alpaCount} Belum hadir</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                    Dept terwakili: <span className="font-bold text-foreground">{deptTerwakili} dari {deptCount}</span>
                    {izinDeptCount > 0 && (
                        <span> · {izinDeptCount} dept izin</span>
                    )}
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
                    {overdueTasks.length > 0
                        ? `${overdueTasks.length} tugas terlambat — prioritaskan tindak lanjut`
                        : "Membutuhkan eksekusi di lapangan"}
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
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Diperpanjang</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                    Mendapatkan perpanjangan tenggat waktu
                </p>
            </div>
        </div>
    );
}
