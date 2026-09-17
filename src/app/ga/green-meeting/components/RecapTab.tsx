"use client";

import { useState, useEffect, useCallback } from "react";
import {
    FileSpreadsheet,
    Printer,
    Calendar,
    BarChart3,
} from "lucide-react";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table";
import { exportToExcel, exportToPdfTable } from "@/lib/export";
import { toWIBDateString } from "@/lib/timezone";

interface UnitAttendanceStat {
    departmentName: string;
    totalSessions: number;
    hadir: number;
    izin: number;
    alpa: number;
    attendanceRate: number;
}

interface TaskSummary {
    totalTasks: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    cancelled: number;
    extended: number;
}

interface RecapData {
    startDate: string;
    endDate: string;
    totalSessions: number;
    unitAttendanceStats: UnitAttendanceStat[];
    taskSummary: TaskSummary;
}

export default function RecapTab() {
    const today = toWIBDateString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const defaultStart = toWIBDateString(thirtyDaysAgo);

    const [startDate, setStartDate] = useState(defaultStart);
    const [endDate, setEndDate] = useState(today);
    const [recap, setRecap] = useState<RecapData | null>(null);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const fetchRecap = useCallback(async () => {
        setLoading(true);
        setErrorMsg("");
        try {
            const res = await fetch(`/api/green-meeting/recap?startDate=${startDate}&endDate=${endDate}`);
            if (!res.ok) throw new Error("Gagal mengambil data rekapitulasi.");
            const data = await res.json();
            setRecap(data);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan memuat rekap.");
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        void fetchRecap();
    }, [fetchRecap]);

    // Handler Ekspor Excel
    const handleExportExcel = () => {
        if (!recap) return;

        const excelData = recap.unitAttendanceStats.map((s, index) => ({
            no: index + 1,
            unit: s.departmentName,
            totalSesi: s.totalSessions,
            hadir: s.hadir,
            izin: s.izin,
            alpa: s.alpa,
            persentase: `${s.attendanceRate}%`,
        }));

        const headers = [
            { key: "no", label: "No" },
            { key: "unit", label: "Departemen" },
            { key: "totalSesi", label: "Total Sesi Rapat" },
            { key: "hadir", label: "Total Hadir" },
            { key: "izin", label: "Total Izin" },
            { key: "alpa", label: "Total Alpa" },
            { key: "persentase", label: "Tingkat Kehadiran" },
        ];

        exportToExcel(
            excelData,
            headers,
            `Rekap_Green_Meeting_${startDate}_sd_${endDate}`,
            "Rekap Kehadiran"
        );
    };

    // Handler Ekspor PDF
    const handleExportPdf = () => {
        if (!recap) return;

        const pdfData = recap.unitAttendanceStats.map((s, index) => [
            String(index + 1),
            s.departmentName,
            String(s.totalSessions),
            String(s.hadir),
            String(s.izin),
            String(s.alpa),
            `${s.attendanceRate}%`,
        ]);

        const headers = ["No", "Departemen", "Total Sesi", "Hadir", "Izin", "Alpa", "% Kehadiran"];

        exportToPdfTable(
            pdfData,
            headers,
            "Laporan Rekapitulasi Rapat Koordinasi Green Meeting",
            `Laporan_Green_Meeting_${startDate}_sd_${endDate}`,
            `Periode: ${startDate} s/d ${endDate} | Total Sesi: ${recap.totalSessions}`
        );
    };

    return (
        <div className="space-y-6">
            {/* Filter & Tombol Unduh */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar size={14} />
                        <span>Periode:</span>
                    </div>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-xs text-muted-foreground">s/d</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                        type="button"
                        onClick={fetchRecap}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors disabled:opacity-50"
                    >
                        {loading ? "Memuat..." : "Terapkan Filter"}
                    </button>
                </div>

                {/* Export Buttons */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleExportExcel}
                        disabled={!recap || recap.unitAttendanceStats.length === 0}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
                    >
                        <FileSpreadsheet size={14} />
                        <span>Ekspor Excel</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleExportPdf}
                        disabled={!recap || recap.unitAttendanceStats.length === 0}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-white shadow-sm transition-colors disabled:opacity-50"
                    >
                        <Printer size={14} />
                        <span>Cetak PDF</span>
                    </button>
                </div>
            </div>

            {errorMsg && (
                <div className="p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 font-medium">
                    {errorMsg}
                </div>
            )}

            {/* Metrik Ringkasan Periode */}
            {recap && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                        <span className="text-xs text-muted-foreground uppercase font-medium">Total Sesi Rapat</span>
                        <div className="text-2xl font-bold text-foreground mt-1">{recap.totalSessions}</div>
                        <p className="text-[11px] text-muted-foreground mt-1">Sesi terlaksana</p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                        <span className="text-xs text-muted-foreground uppercase font-medium">Total Tugas Selesai</span>
                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                            {recap.taskSummary.completed} / {recap.taskSummary.totalTasks}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                            {recap.taskSummary.totalTasks > 0
                                ? `${Math.round((recap.taskSummary.completed / recap.taskSummary.totalTasks) * 100)}% terselesaikan`
                                : "Belum ada tugas"}
                        </p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                        <span className="text-xs text-muted-foreground uppercase font-medium">Tugas Sedang Berjalan</span>
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                            {recap.taskSummary.inProgress + recap.taskSummary.notStarted}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">Dalam proses pengerjaan</p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                        <span className="text-xs text-muted-foreground uppercase font-medium">Tugas Pernah Molor</span>
                        <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                            {recap.taskSummary.extended}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">Mengalami perpanjangan waktu</p>
                    </div>
                </div>
            )}

            {/* Tabel Agregat Kehadiran Per Departemen */}
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart3 size={16} className="text-primary" />
                        <h4 className="text-sm font-bold text-foreground">
                            Rekapitulasi Tingkat Kehadiran per Departemen
                        </h4>
                    </div>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40px] text-center">No</TableHead>
                            <TableHead>Departemen</TableHead>
                            <TableHead className="text-center">Total Sesi</TableHead>
                            <TableHead className="text-center">Hadir</TableHead>
                            <TableHead className="text-center">Izin</TableHead>
                            <TableHead className="text-center">Alpa</TableHead>
                            <TableHead className="text-right">% Kehadiran</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!recap || recap.unitAttendanceStats.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                                    Tidak ada data untuk periode tanggal yang dipilih.
                                </TableCell>
                            </TableRow>
                        ) : (
                            recap.unitAttendanceStats.map((stat, idx) => (
                                <TableRow key={stat.departmentName}>
                                    <TableCell className="text-center font-medium text-muted-foreground text-xs">
                                        {idx + 1}
                                    </TableCell>
                                    <TableCell className="font-semibold text-foreground text-xs">
                                        {stat.departmentName}
                                    </TableCell>
                                    <TableCell className="text-center text-xs text-foreground">
                                        {stat.totalSessions}
                                    </TableCell>
                                    <TableCell className="text-center text-xs text-emerald-600 font-medium">
                                        {stat.hadir}
                                    </TableCell>
                                    <TableCell className="text-center text-xs text-amber-600 font-medium">
                                        {stat.izin}
                                    </TableCell>
                                    <TableCell className="text-center text-xs text-rose-600 font-medium">
                                        {stat.alpa}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${stat.attendanceRate >= 85
                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                            : stat.attendanceRate >= 60
                                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                            }`}>
                                            {stat.attendanceRate}%
                                        </span>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
