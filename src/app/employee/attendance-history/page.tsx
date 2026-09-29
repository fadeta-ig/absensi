"use client";

import { useEffect, useState, useMemo } from "react";
import {
    ClipboardList, CalendarDays, Clock, CheckCircle, AlertTriangle,
    XCircle, Filter, ChevronLeft, ChevronRight, Loader2, AlertCircle,
    FileSpreadsheet
} from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import DataTablePagination from "@/components/ui/DataTablePagination";
import { exportToExcel } from "@/lib/export";
import { useToast } from "@/components/Toast";
import { useAttendanceServerContext } from "@/hooks/useAttendanceServerContext";

interface AttendanceRecord {
    id: string;
    date: string;
    clockIn?: string | null;
    clockOut?: string | null;
    status: string;
    notes?: string | null;
    isOffDay?: boolean;
    offDayReason?: string | null;
    shiftDate?: string;
    shiftId?: string | null;
    shiftName?: string | null;
    shiftStartTime?: string | null;
    shiftEndTime?: string | null;
    shiftSource?: "assignment" | "fallback" | "default" | "none";
    isOvernight?: boolean;
}

type FilterMode = "day" | "month" | "year";

const MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const STATUS_MAP: Record<string, { label: string; badge: string; icon: typeof CheckCircle }> = {
    present: { label: "Hadir", badge: "badge-success", icon: CheckCircle },
    late: { label: "Terlambat", badge: "badge-warning", icon: AlertTriangle },
    absent: { label: "Alpha", badge: "badge-error", icon: XCircle },
    leave: { label: "Cuti", badge: "badge-info", icon: CalendarDays },
};

/** Format ISO string or HH:mm → HH:mm */
function fmtTime(val?: string | null): string {
    if (!val) return "--:--";

    if (/^\d{2}:\d{2}(:\d{2})?$/.test(val)) {
        return `${val.substring(0, 5)} WIB`;
    }

    const d = new Date(val);
    if (isNaN(d.getTime())) return "--:--";
    return `${new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(d)} WIB`;
}

/** Calculate work duration in hours & minutes */
function calcDuration(clockIn?: string | null, clockOut?: string | null): string {
    if (!clockIn || !clockOut) return "-";

    const t1 = new Date(clockIn).getTime();
    const t2 = new Date(clockOut).getTime();

    if (isNaN(t1) || isNaN(t2)) return "-";

    const diff = t2 - t1;
    if (diff <= 0) return "-";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}j ${minutes}m`;
}

/** Format date string → readable */
function fmtDate(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00+07:00`);
    return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(d);
}

function dateParts(dateStr: string): { year: number; month: number; day: number } {
    const [year, month, day] = dateStr.split("-").map(Number);
    return { year, month, day };
}

function shiftCalendarDate(dateStr: string, amount: number): string {
    const { year, month, day } = dateParts(dateStr);
    const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export default function AttendanceHistoryPage() {
    const toast = useToast();
    const serverContext = useAttendanceServerContext();
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [filterMode, setFilterMode] = useState<FilterMode>("month");
    const [selectedDate, setSelectedDate] = useState("");
    const [selectedMonth, setSelectedMonth] = useState(0);
    const [selectedYear, setSelectedYear] = useState(0);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        const serverDate = serverContext.context?.serverWibDate;
        if (!serverDate || selectedDate) return;
        const { year, month } = dateParts(serverDate);
        setSelectedDate(serverDate);
        setSelectedMonth(month - 1);
        setSelectedYear(year);
    }, [selectedDate, serverContext.context?.serverWibDate]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterMode, selectedDate, selectedMonth, selectedYear, pageSize]);

    useEffect(() => {
        const loadRecords = async () => {
            setLoading(true);
            setLoadError("");
            try {
                const res = await fetch("/api/attendance");
                if (!res.ok) {
                    throw new Error(await getResponseErrorMessage(res, "Gagal memuat riwayat kehadiran."));
                }

                const data = await res.json();
                if (!Array.isArray(data)) throw new Error("Format data riwayat kehadiran tidak sesuai.");
                setRecords(data);
            } catch (err) {
                reportClientError("AttendanceHistoryPage", "Gagal memuat riwayat kehadiran", err);
                setRecords([]);
                setLoadError(err instanceof Error ? err.message : "Gagal memuat riwayat kehadiran.");
            } finally {
                setLoading(false);
            }
        };

        void loadRecords();
    }, []);

    /** Filter records based on current mode & selection */
    const filteredRecords = useMemo(() => {
        return records.filter((r) => {
            const { year, month } = dateParts(r.date);
            if (filterMode === "day") {
                return r.date === selectedDate;
            }
            if (filterMode === "month") {
                return month - 1 === selectedMonth && year === selectedYear;
            }
            return year === selectedYear;
        });
    }, [records, filterMode, selectedDate, selectedMonth, selectedYear]);

    /** Summary stats from filtered data */
    const stats = useMemo(() => {
        const present = filteredRecords.filter((r) => r.status === "present").length;
        const late = filteredRecords.filter((r) => r.status === "late").length;
        const absent = filteredRecords.filter((r) => r.status === "absent").length;
        const leave = filteredRecords.filter((r) => r.status === "leave").length;
        return { present, late, absent, leave, total: filteredRecords.length };
    }, [filteredRecords]);

    const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredRecords.slice(start, start + pageSize);
    }, [filteredRecords, currentPage, pageSize]);

    /** Available years from data, or default to current year */
    const availableYears = useMemo(() => {
        const years = new Set(records.map((r) => dateParts(r.date).year));
        if (serverContext.context?.serverWibDate) years.add(dateParts(serverContext.context.serverWibDate).year);
        return Array.from(years).sort((a, b) => b - a);
    }, [records, serverContext.context?.serverWibDate]);

    /** Navigation: go prev / next based on mode */
    const goNav = (dir: -1 | 1) => {
        if (filterMode === "day") {
            setSelectedDate(shiftCalendarDate(selectedDate, dir));
        } else if (filterMode === "month") {
            let m = selectedMonth + dir;
            let y = selectedYear;
            if (m < 0) { m = 11; y--; }
            if (m > 11) { m = 0; y++; }
            setSelectedMonth(m);
            setSelectedYear(y);
        } else {
            setSelectedYear((prev) => prev + dir);
        }
    };

    /** Label for current filter period */
    const periodLabel = useMemo(() => {
        if (filterMode === "day") return fmtDate(selectedDate);
        if (filterMode === "month") return `${MONTHS[selectedMonth]} ${selectedYear}`;
        return `${selectedYear}`;
    }, [filterMode, selectedDate, selectedMonth, selectedYear]);

    const serverDateParts = serverContext.context?.serverWibDate
        ? dateParts(serverContext.context.serverWibDate)
        : null;
    const isNextNavigationDisabled = !serverDateParts || (
        filterMode === "day"
            ? selectedDate >= serverContext.context!.serverWibDate
            : filterMode === "month"
                ? selectedYear > serverDateParts.year || (selectedYear === serverDateParts.year && selectedMonth >= serverDateParts.month - 1)
                : selectedYear >= serverDateParts.year
    );

    const handleExportExcel = () => {
        if (filteredRecords.length === 0) return;

        const data = filteredRecords.map(r => ({
            date: r.date,
            clockIn: fmtTime(r.clockIn),
            clockOut: fmtTime(r.clockOut),
            duration: calcDuration(r.clockIn, r.clockOut),
            status: STATUS_MAP[r.status]?.label || r.status,
            notes: r.offDayReason || r.notes || "-"
        }));

        exportToExcel(
            data,
            [
                { key: "date", label: "Tanggal" },
                { key: "clockIn", label: "Jam Masuk" },
                { key: "clockOut", label: "Jam Pulang" },
                { key: "duration", label: "Durasi Kerja" },
                { key: "status", label: "Status" },
                { key: "notes", label: "Catatan" },
            ],
            `Riwayat_Presensi_${periodLabel.replace(/\s+/g, "_")}`,
            "Presensi"
        );
        toast("Riwayat presensi berhasil diekspor ke Excel.", "success");
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease] min-w-0 overflow-hidden">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-[var(--primary)]" />
                        Riwayat Kehadiran
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Lihat detail kehadiran harian, bulanan, atau tahunan
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleExportExcel}
                    disabled={filteredRecords.length === 0}
                    className="btn btn-secondary btn-sm flex items-center gap-1.5 border border-[var(--border)]"
                >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Ekspor Excel
                </button>
            </div>

            {!serverContext.context && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-800 dark:text-amber-300" role="status">
                    Navigasi tanggal menunggu tanggal WIB resmi dari server.
                </div>
            )}

            {/* Filter Controls */}
            <div className="card p-4 space-y-4">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[var(--text-muted)]" />
                    <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Filter Periode</span>
                </div>

                {/* Mode Toggle */}
                <div className="flex bg-[var(--secondary)] rounded-lg p-1 w-fit">
                    {(["day", "month", "year"] as FilterMode[]).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setFilterMode(mode)}
                            disabled={!serverContext.context}
                            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${filterMode === mode
                                ? "bg-[var(--card)] text-[var(--primary)] shadow-sm"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                }`}
                        >
                            {mode === "day" ? "Hari" : mode === "month" ? "Bulan" : "Tahun"}
                        </button>
                    ))}
                </div>

                {/* Period Navigation */}
                <div className="flex items-center gap-3">
                    <button type="button" onClick={() => goNav(-1)} disabled={!serverContext.context} className="btn btn-ghost btn-sm !p-1.5">
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    {filterMode === "day" ? (
                        <input
                            type="date"
                            value={selectedDate}
                            max={serverContext.context?.serverWibDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="form-input !py-1.5 !text-sm w-auto"
                        />
                    ) : filterMode === "month" ? (
                        <div className="flex items-center gap-2">
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                className="form-select !py-1.5 !text-sm w-auto"
                            >
                                {MONTHS.map((m, i) => (
                                    <option key={i} value={i}>{m}</option>
                                ))}
                            </select>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="form-select !py-1.5 !text-sm w-auto"
                            >
                                {availableYears.map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="form-select !py-1.5 !text-sm w-auto"
                        >
                            {availableYears.map((y) => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    )}

                    <button
                        type="button"
                        onClick={() => goNav(1)}
                        disabled={isNextNavigationDisabled}
                        className="btn btn-ghost btn-sm !p-1.5"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>

                    <span className="text-sm font-semibold text-[var(--text-primary)] ml-1 hidden sm:inline">
                        {periodLabel}
                    </span>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <div className="card p-3 sm:p-4 text-center min-w-0">
                    <div className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-green-50 mb-1.5 sm:mb-2">
                        <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
                    </div>
                    <p className="text-xl sm:text-2xl font-extrabold text-green-600">{stats.present}</p>
                    <p className="text-[9px] sm:text-[10px] text-[var(--text-muted)] uppercase font-semibold mt-0.5 truncate" title="Hadir tepat waktu (tidak termasuk Terlambat)">Tepat Waktu</p>
                </div>
                <div className="card p-3 sm:p-4 text-center min-w-0">
                    <div className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-orange-50 mb-1.5 sm:mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500" />
                    </div>
                    <p className="text-xl sm:text-2xl font-extrabold text-orange-500">{stats.late}</p>
                    <p className="text-[9px] sm:text-[10px] text-[var(--text-muted)] uppercase font-semibold mt-0.5 truncate">Terlambat</p>
                </div>
                <div className="card p-3 sm:p-4 text-center min-w-0">
                    <div className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-red-50 mb-1.5 sm:mb-2">
                        <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
                    </div>
                    <p className="text-xl sm:text-2xl font-extrabold text-red-500">{stats.absent}</p>
                    <p className="text-[9px] sm:text-[10px] text-[var(--text-muted)] uppercase font-semibold mt-0.5 truncate">Alpha</p>
                </div>
                <div className="card p-3 sm:p-4 text-center min-w-0">
                    <div className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-50 mb-1.5 sm:mb-2">
                        <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
                    </div>
                    <p className="text-xl sm:text-2xl font-extrabold text-blue-500">{stats.leave}</p>
                    <p className="text-[9px] sm:text-[10px] text-[var(--text-muted)] uppercase font-semibold mt-0.5 truncate">Cuti</p>
                </div>
            </div>

            {/* Data Table / Mobile Cards */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)] opacity-50" />
                </div>
            ) : loadError ? (
                <div className="card p-8 text-center">
                    <AlertCircle className="w-8 h-8 mx-auto opacity-70 mb-2 text-[var(--destructive)]" />
                    <p className="text-sm font-semibold text-[var(--destructive)]">{loadError}</p>
                </div>
            ) : filteredRecords.length === 0 ? (
                <div className="card p-8 text-center text-[var(--text-muted)]">
                    <ClipboardList className="w-8 h-8 mx-auto opacity-20 mb-2" />
                    <p className="text-sm font-medium">Tidak ada data kehadiran</p>
                    <p className="text-xs mt-1">untuk periode {periodLabel}</p>
                </div>
            ) : (
                <div className="card overflow-hidden">
                    {/* Unified Card List (Consistent across mobile and desktop canvas) */}
                    <div className="divide-y divide-[var(--border)]">
                        {paginatedRecords.map((r) => {
                            const si = STATUS_MAP[r.status] ?? STATUS_MAP["present"];
                            const StatusIcon = si.icon;
                            return (
                                <div key={r.id} className="p-3.5 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-semibold text-[var(--text-primary)]">{fmtDate(r.shiftDate ?? r.date)}</span>
                                            {r.isOffDay && <span className="badge badge-warning text-[9px]">Hari Libur</span>}
                                            {r.isOvernight && (
                                                <span
                                                    className="badge badge-info text-[9px]"
                                                    title={r.shiftName && r.shiftStartTime && r.shiftEndTime ? `${r.shiftName}: ${r.shiftStartTime}-${r.shiftEndTime}` : "Shift lintas hari"}
                                                >
                                                    Lintas Hari
                                                </span>
                                            )}
                                        </div>
                                        <span className={`badge ${si.badge} flex items-center gap-1 text-[10px] px-2 py-0.5`}>
                                            <StatusIcon className="w-3 h-3" />
                                            {si.label}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center bg-[var(--secondary)]/40 p-2 rounded-lg">
                                        <div>
                                            <p className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Masuk</p>
                                            <div className="flex items-center justify-center gap-1 mt-0.5">
                                                <Clock className="w-3 h-3 text-blue-500" />
                                                <span className="text-xs font-mono font-medium text-[var(--text-secondary)]">{fmtTime(r.clockIn)}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Keluar</p>
                                            <div className="flex items-center justify-center gap-1 mt-0.5">
                                                <Clock className="w-3 h-3 text-orange-500" />
                                                <span className="text-xs font-mono font-medium text-[var(--text-secondary)]">{fmtTime(r.clockOut)}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Durasi</p>
                                            <span className="text-xs font-medium text-[var(--text-secondary)] mt-0.5 block">{calcDuration(r.clockIn, r.clockOut)}</span>
                                        </div>
                                    </div>
                                    {(r.offDayReason || r.notes) && (
                                        <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">Alasan: {r.offDayReason || r.notes}</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <DataTablePagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filteredRecords.length}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={setPageSize}
                        itemLabel="catatan kehadiran"
                    />
                </div>
            )}
        </div>
    );
}
