"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
    FileSpreadsheet,
    Printer,
    Calendar,
    Users,
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
import {
    DeptRecapTable,
    exportRecapDeptPdf,
    exportRecapMemberExcel,
    useGreenMeetingRecap,
} from "@/components/green-meeting/GreenMeetingRecap";

export default function RecapTab() {
    const today = toWIBDateString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const defaultStart = toWIBDateString(thirtyDaysAgo);

    const [startDate, setStartDate] = useState(defaultStart);
    const [endDate, setEndDate] = useState(today);
    const [memberQuery, setMemberQuery] = useState("");
    const mountedRef = useRef(false);
    const { recap, loading, error: errorMsg, fetchRecap } = useGreenMeetingRecap();

    // Muat sekali saat dibuka; perubahan tanggal hanya diterapkan via tombol.
    useEffect(() => {
        if (mountedRef.current) return;
        mountedRef.current = true;
        void fetchRecap(startDate, endDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredMembers = useMemo(() => (recap?.memberStats ?? []).filter((m) => {
        const q = memberQuery.trim().toLowerCase();
        if (!q) return true;
        return `${m.name} ${m.departmentName}`.toLowerCase().includes(q);
    }), [recap, memberQuery]);

    // Handler Ekspor Excel (peringkat per orang, bersama dengan HR)
    const handleExportExcel = () => {
        if (!recap) return;
        exportRecapMemberExcel(recap, memberQuery, startDate, endDate, "Rekap_Green_Meeting", exportToExcel);
    };

    // Handler Ekspor PDF (rekap dept, bersama dengan HR)
    const handleExportPdf = () => {
        if (!recap) return;
        exportRecapDeptPdf(
            recap,
            startDate,
            endDate,
            `Laporan_Green_Meeting_${startDate}_sd_${endDate}`,
            "Laporan Rekapitulasi Rapat Koordinasi Green Meeting",
            exportToPdfTable
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
                        onClick={() => void fetchRecap(startDate, endDate)}
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
                        disabled={!recap || filteredMembers.length === 0}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
                    >
                        <FileSpreadsheet size={14} />
                        <span>Ekspor Excel</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleExportPdf}
                        disabled={!recap || recap.deptStats.length === 0}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-white shadow-sm transition-colors disabled:opacity-50"
                    >
                        <Printer size={14} />
                        <span>Cetak PDF</span>
                    </button>
                </div>
            </div>

            {errorMsg && (
                <div className="p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 font-medium flex items-center justify-between gap-2">
                    <span>{errorMsg}</span>
                    <button
                        type="button"
                        onClick={() => void fetchRecap(startDate, endDate)}
                        disabled={loading}
                        className="shrink-0 px-3 py-1 text-xs font-semibold rounded-lg border border-rose-500/30 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                    >
                        Coba lagi
                    </button>
                </div>
            )}

            {/* Skeleton saat memuat awal */}
            {loading && !recap && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4" aria-label="Memuat rekap">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2 animate-pulse">
                            <div className="h-3 w-1/2 rounded bg-muted" />
                            <div className="h-6 w-1/3 rounded bg-muted" />
                        </div>
                    ))}
                </div>
            )}

            {/* KPI: hitung hadir vs tidak hadir */}
            {recap && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                        <span className="text-xs text-muted-foreground uppercase font-medium">Total Sesi</span>
                        <div className="text-2xl font-bold text-foreground mt-1">{recap.kpi.totalSesi}</div>
                        <p className="text-[11px] text-muted-foreground mt-1">Sesi terlaksana</p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                        <span className="text-xs text-muted-foreground uppercase font-medium">Hadir</span>
                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                            {recap.kpi.totalHadir}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                            dari {recap.kpi.totalOrang} orang tercatat
                        </p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                        <span className="text-xs text-muted-foreground uppercase font-medium">Tidak Hadir</span>
                        <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                            {recap.kpi.totalAlpa}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">ketidakhadiran orang-sesi</p>
                    </div>

                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                        <span className="text-xs text-muted-foreground uppercase font-medium">Tugas Selesai</span>
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                            {recap.taskSummary.completed} / {recap.taskSummary.totalTasks}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                            {recap.taskSummary.extended} diperpanjang
                        </p>
                    </div>
                </div>
            )}

            {/* Tabel peringkat per orang */}
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Users size={16} className="text-primary" />
                        <h4 className="text-sm font-bold text-foreground">
                            Kehadiran Per Orang
                        </h4>
                    </div>
                    <input
                        type="text"
                        value={memberQuery}
                        onChange={(e) => setMemberQuery(e.target.value)}
                        placeholder="Cari nama / departemen…"
                        className="px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40px] text-center">No</TableHead>
                            <TableHead>Nama</TableHead>
                            <TableHead>Departemen</TableHead>
                            <TableHead className="text-center">Hadir</TableHead>
                            <TableHead className="text-center">Tidak Hadir</TableHead>
                            <TableHead className="text-center">Total Sesi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && !recap ? (
                            <TableRow>
                                <TableCell colSpan={6} className="py-4">
                                    <div className="space-y-2 animate-pulse" aria-label="Memuat data kehadiran">
                                        {[0, 1, 2].map((i) => (
                                            <div key={i} className="h-6 rounded-lg bg-muted" />
                                        ))}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : !recap || filteredMembers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                                    Tidak ada data untuk periode tanggal yang dipilih.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredMembers.map((m, idx) => (
                                <TableRow key={m.employeeId}>
                                    <TableCell className="text-center font-medium text-muted-foreground text-xs">
                                        {idx + 1}
                                    </TableCell>
                                    <TableCell className="font-semibold text-foreground text-xs">
                                        {m.name}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {m.departmentName}
                                    </TableCell>
                                    <TableCell className="text-center text-xs text-emerald-600 font-bold">
                                        {m.hadir}
                                    </TableCell>
                                    <TableCell className="text-center text-xs text-rose-600 font-bold">
                                        {m.alpa}
                                    </TableCell>
                                    <TableCell className="text-center text-xs text-foreground">
                                        {m.totalSesi}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Tabel keterwakilan dept */}
            <DeptRecapTable title="Keterwakilan Departemen" stats={recap?.deptStats ?? []} />

            {/* Arsip sesi lama (format per departemen, tidak campur) */}
            {recap && recap.archiveSessions > 0 && (
                <DeptRecapTable
                    title={`Arsip Sesi Lama (${recap.archiveSessions} sesi, format per departemen)`}
                    subtitle="Data periode awal, hanya baca. Tidak dihitung dalam KPI di atas."
                    stats={recap.archiveStats}
                    showStatus={false}
                />
            )}
        </div>
    );
}
