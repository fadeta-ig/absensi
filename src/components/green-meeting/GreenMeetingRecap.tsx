"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table";
import { isValidCalendarDate } from "@/lib/timezone";

export interface RecapMemberStat {
    employeeId: string;
    name: string;
    departmentName: string;
    divisionName?: string;
    hadir: number;
    alpa: number;
    /** Izin dept (info; alpa tetap kompatibel = non-HADIR non-izin). */
    izin?: number;
    totalSesi: number;
}

export interface RecapDeptStat {
    departmentId: string;
    departmentName: string;
    totalSesi: number;
    sesiHadir: number;
    sesiIzin: number;
    sesiAlpa: number;
}

export interface RecapTaskSummary {
    totalTasks: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    cancelled: number;
    extended: number;
}

export interface GreenMeetingRecapData {
    startDate: string;
    endDate: string;
    totalSessions: number;
    kpi: { totalHadir: number; totalAlpa: number; totalIzin?: number; totalOrang: number; totalSesi: number };
    memberStats: RecapMemberStat[];
    deptStats: RecapDeptStat[];
    archiveStats: RecapDeptStat[];
    archiveSessions: number;
    taskSummary: RecapTaskSummary;
    sessions?: unknown[];
}

/** Validasi rentang rekap; "" berarti valid. Maks 366 hari kalender inklusif. */
export function validateRecapRange(startDate: string, endDate: string): string {
    if (!startDate || !endDate) return "Isi tanggal mulai dan tanggal akhir periode.";
    if (!isValidCalendarDate(startDate) || !isValidCalendarDate(endDate)) {
        return "Tanggal periode tidak valid (gunakan YYYY-MM-DD).";
    }
    if (startDate > endDate) return "Tanggal mulai tidak boleh setelah tanggal akhir.";
    const spanDays =
        (new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000;
    if (spanDays + 1 > 366) return "Rentang maksimal 366 hari.";
    return "";
}

export type DeptRecapStatus = "Alpa" | "Selalu terwakili" | "Terwakili sebagian" | "Izin" | "-";

/** Status keterwakilan satu departemen dalam satu periode. Data lama arsip tetap dihitung. */
export function deptStatusOf(
    stat: Pick<RecapDeptStat, "sesiHadir" | "sesiIzin" | "sesiAlpa" | "totalSesi">
): DeptRecapStatus {
    if (stat.totalSesi === 0) return "-";
    if (stat.sesiAlpa === stat.totalSesi && stat.totalSesi > 0) return "Alpa";
    if (stat.sesiHadir === stat.totalSesi && stat.totalSesi > 0) return "Selalu terwakili";
    if (stat.sesiHadir === 0 && stat.sesiIzin === stat.totalSesi && stat.totalSesi > 0) return "Izin";
    return "Terwakili sebagian";
}

interface UseRecapResult {
    recap: GreenMeetingRecapData | null;
    loading: boolean;
    error: string;
    fetchRecap: (startDate: string, endDate: string) => Promise<void>;
}

/** Fetch rekap bersama GA↔HR dengan validasi rentang + pesan server asli. */
export function useGreenMeetingRecap(): UseRecapResult {
    const [recap, setRecap] = useState<GreenMeetingRecapData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const abortRef = useRef<AbortController | null>(null);

    const fetchRecap = useCallback(async (startDate: string, endDate: string) => {
        const rangeError = validateRecapRange(startDate, endDate);
        if (rangeError) {
            // Jangan tampilkan data basi bersama banner error.
            abortRef.current?.abort();
            setRecap(null);
            setError(rangeError);
            return;
        }
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/green-meeting/recap?startDate=${startDate}&endDate=${endDate}`, {
                signal: controller.signal,
            });
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error((errJson as { error?: string }).error || "Gagal mengambil data rekapitulasi.");
            }
            if (controller.signal.aborted) return;
            setRecap(await res.json());
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return;
            // Error → clear data basi agar tidak diekspor salah periode.
            setRecap(null);
            setError(err instanceof Error ? err.message : "Terjadi kesalahan memuat rekap.");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => () => abortRef.current?.abort(), []);

    return { recap, loading, error, fetchRecap };
}

/** Ekspor Excel per-orang bersama (GA↔HR). Kolom izin info, alpa kompatibel. */
export function exportRecapMemberExcel(
    recap: GreenMeetingRecapData,
    memberQuery: string,
    startDate: string,
    endDate: string,
    filenamePrefix: string,
    exportToExcel: (
        rows: Array<Record<string, string | number>>,
        headers: Array<{ key: string; label: string }>,
        filename: string,
        sheetName: string
    ) => void
) {
    const q = memberQuery.trim().toLowerCase();
    const members = (recap.memberStats ?? []).filter((m) =>
        q ? `${m.name} ${m.departmentName}`.toLowerCase().includes(q) : true
    );
    const excelData = members.map((m, index) => ({
        no: index + 1,
        nama: m.name,
        departemen: m.departmentName,
        hadir: m.hadir,
        izin: m.izin ?? 0,
        tidakHadir: m.alpa,
        totalSesi: m.totalSesi,
    }));
    exportToExcel(
        excelData,
        [
            { key: "no", label: "No" },
            { key: "nama", label: "Nama" },
            { key: "departemen", label: "Departemen" },
            { key: "hadir", label: "Hadir" },
            { key: "izin", label: "Izin Dept" },
            { key: "tidakHadir", label: "Tidak Hadir" },
            { key: "totalSesi", label: "Total Sesi" },
        ],
        `${filenamePrefix}_${startDate}_sd_${endDate}${q ? "_tersaring" : ""}`,
        "Peringkat Kehadiran"
    );
}

/** Ekspor PDF per-departemen bersama (GA↔HR). */
export function exportRecapDeptPdf(
    recap: GreenMeetingRecapData,
    startDate: string,
    endDate: string,
    filename: string,
    title: string,
    exportToPdfTable: (
        data: string[][],
        headers: string[],
        title: string,
        filename: string,
        subtitle: string
    ) => void
) {
    const pdfData = recap.deptStats.map((s, index) => [
        String(index + 1),
        s.departmentName,
        String(s.totalSesi),
        String(s.sesiHadir),
        String(s.sesiIzin),
        String(s.sesiAlpa),
    ]);
    exportToPdfTable(
        pdfData,
        ["No", "Departemen", "Total Sesi", "Sesi Hadir", "Sesi Izin", "Sesi Alpa"],
        title,
        filename,
        `Periode: ${startDate} s/d ${endDate} | Total Sesi: ${recap.totalSessions}`
    );
}

/** Ekspor Excel per-orang bersama (GA↔HR). Kolom izin info, alpa kompatibel. */
export function exportRecapExcel(recap: GreenMeetingRecapData, filename: string) {
    // Dipanggil dari page dengan @/lib/export agar tidak duplikat logika.
    return { recap, filename };
}

/** Ekspor PDF per-departemen bersama (GA↔HR). */
export function exportRecapPdf(recap: GreenMeetingRecapData, filename: string) {
    return { recap, filename };
}

interface DeptRecapTableProps {
    title: string;
    subtitle?: string;
    stats: RecapDeptStat[];
    showStatus?: boolean;
    emptyText?: string;
}

/** Tabel keterwakilan departemen bersama GA↔HR (termasuk varian arsip). */
export function DeptRecapTable({ title, subtitle, stats, showStatus = true, emptyText }: DeptRecapTableProps) {
    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border">
                <h4 className="text-sm font-bold text-foreground">{title}</h4>
                {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[40px] text-center">No</TableHead>
                        <TableHead>Departemen</TableHead>
                        <TableHead className="text-center">Sesi Hadir</TableHead>
                        <TableHead className="text-center">Sesi Izin</TableHead>
                        <TableHead className="text-center">Sesi Alpa</TableHead>
                        {showStatus && <TableHead className="text-right">Status</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {stats.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={showStatus ? 6 : 5} className="text-center py-6 text-xs text-muted-foreground">
                                {emptyText || "Tidak ada data untuk periode tanggal yang dipilih."}
                            </TableCell>
                        </TableRow>
                    ) : (
                        stats.map((stat, idx) => {
                            const status = deptStatusOf(stat);
                            return (
                                <TableRow key={stat.departmentId}>
                                    <TableCell className="text-center font-medium text-muted-foreground text-xs">
                                        {idx + 1}
                                    </TableCell>
                                    <TableCell className="font-semibold text-foreground text-xs">
                                        {stat.departmentName}
                                    </TableCell>
                                    <TableCell className="text-center text-xs text-emerald-600 font-medium">
                                        {stat.sesiHadir}/{stat.totalSesi}
                                    </TableCell>
                                    <TableCell className="text-center text-xs text-amber-600 font-medium">
                                        {stat.sesiIzin}
                                    </TableCell>
                                    <TableCell className="text-center text-xs text-rose-600 font-medium">
                                        {stat.sesiAlpa}
                                    </TableCell>
                                    {showStatus && (
                                        <TableCell className="text-right">
                                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${status === "Alpa"
                                                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                                : status === "Selalu terwakili"
                                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                    : status === "Izin"
                                                        ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                                                        : status === "-"
                                                            ? "bg-muted text-muted-foreground"
                                                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                                }`}>
                                                {status}
                                            </span>
                                        </TableCell>
                                    )}
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
