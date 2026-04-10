"use client";

import { useEffect, useState, useMemo } from "react";
import {
    ClipboardList, CalendarDays, Clock, CheckCircle, AlertTriangle,
    XCircle, Filter, ChevronLeft, ChevronRight, Loader2
} from "lucide-react";

interface AttendanceRecord {
    id: string;
    date: string;
    clockIn?: string | null;
    clockOut?: string | null;
    status: string;
    notes?: string | null;
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

    // Validasi apabila nilainya berupa hh:mm atau hh:mm:ss
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(val)) {
        return val.substring(0, 5);
    }

    // Attempt parse as date (ISO)
    const d = new Date(val);
    if (isNaN(d.getTime())) return "--:--";
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/** Calculate work duration in hours & minutes */
function calcDuration(clockIn?: string | null, clockOut?: string | null): string {
    if (!clockIn || !clockOut) return "-";

    let t1, t2;
    // Process clockIn
    if (/^\d{2}:\d{2}/.test(clockIn)) {
        const [h, m] = clockIn.split(':').map(Number);
        t1 = new Date().setHours(h, m, 0, 0);
    } else {
        t1 = new Date(clockIn).getTime();
    }
    // Process clockOut
    if (/^\d{2}:\d{2}/.test(clockOut)) {
        const [h, m] = clockOut.split(':').map(Number);
        t2 = new Date().setHours(h, m, 0, 0);
    } else {
        t2 = new Date(clockOut).getTime();
    }

    if (isNaN(t1) || isNaN(t2)) return "-";

    const diff = t2 - t1;
    if (diff <= 0) return "-";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}j ${minutes}m`;
}

/** Format date string → readable */
function fmtDate(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function AttendanceHistoryPage() {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const now = new Date();
    const [filterMode, setFilterMode] = useState<FilterMode>("month");
    const [selectedDate, setSelectedDate] = useState(now.toISOString().split("T")[0]);
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    useEffect(() => {
        setCurrentPage(1);
    }, [filterMode, selectedDate, selectedMonth, selectedYear]);

    useEffect(() => {
        setLoading(true);
        fetch("/api/attendance")
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data)) setRecords(data);
            })
            .finally(() => setLoading(false));
    }, []);

    /** Filter records based on current mode & selection */
    const filteredRecords = useMemo(() => {
        return records.filter((r) => {
            const d = new Date(r.date + "T00:00:00");
            if (filterMode === "day") {
                return r.date === selectedDate;
            }
            if (filterMode === "month") {
                return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
            }
            // year
            return d.getFullYear() === selectedYear;
        });
    }, [records, filterMode, selectedDate, selectedMonth, selectedYear]);

    /** Summary stats from filtered data */
    const stats = useMemo(() => {
        const present = filteredRecords.filter((r) => r.status === "present" || r.status === "late").length;
        const late = filteredRecords.filter((r) => r.status === "late").length;
        const absent = filteredRecords.filter((r) => r.status === "absent").length;
        const leave = filteredRecords.filter((r) => r.status === "leave").length;
        return { present, late, absent, leave, total: filteredRecords.length };
    }, [filteredRecords]);

    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredRecords.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredRecords, currentPage]);

    const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE) || 1;

    /** Available years from data, or default to current year */
    const availableYears = useMemo(() => {
        const years = new Set(records.map((r) => new Date(r.date + "T00:00:00").getFullYear()));
        years.add(now.getFullYear());
        return Array.from(years).sort((a, b) => b - a);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [records]);

    /** Navigation: go prev / next based on mode */
    const goNav = (dir: -1 | 1) => {
        if (filterMode === "day") {
            const d = new Date(selectedDate + "T00:00:00");
            d.setDate(d.getDate() + dir);
            setSelectedDate(d.toISOString().split("T")[0]);
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

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease] min-w-0 overflow-hidden">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-[var(--primary)]" />
                    Riwayat Kehadiran
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Lihat detail kehadiran harian, bulanan, atau tahunan
                </p>
            </div>

            {/* Filter Controls */}
            <div className="card p-4 space-y-4">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[var(--text-muted)]" />
                    <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Filter</span>
                </div>

                {/* Mode Toggle */}
                <div className="flex bg-[var(--secondary)] rounded-lg p-1 w-fit">
                    {(["day", "month", "year"] as FilterMode[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setFilterMode(mode)}
                            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${filterMode === mode
                                ? "bg-white text-[var(--primary)] shadow-sm"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                }`}
                        >
                            {mode === "day" ? "Hari" : mode === "month" ? "Bulan" : "Tahun"}
                        </button>
                    ))}
                </div>

                {/* Period Navigation */}
                <div className="flex items-center gap-3">
                    <button onClick={() => goNav(-1)} className="btn btn-ghost btn-sm !p-1.5">
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    {filterMode === "day" ? (
                        <input
                            type="date"
                            value={selectedDate}
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

                    <button onClick={() => goNav(1)} className="btn btn-ghost btn-sm !p-1.5">
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
                    <p className="text-[9px] sm:text-[10px] text-[var(--text-muted)] uppercase font-semibold mt-0.5 truncate">Hadir</p>
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
            ) : filteredRecords.length === 0 ? (
                <div className="card p-8 text-center text-[var(--text-muted)]">
                    <ClipboardList className="w-8 h-8 mx-auto opacity-20 mb-2" />
                    <p className="text-sm font-medium">Tidak ada data kehadiran</p>
                    <p className="text-xs mt-1">untuk periode {periodLabel}</p>
                </div>
            ) : (
                <>
                    {/* ── Desktop Table (hidden on mobile) ── */}
                    <div className="hidden sm:block card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="data-table w-full">
                                <thead className="bg-[var(--secondary)]">
                                    <tr className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider text-left border-b border-[var(--border)]">
                                        <th className="py-3 px-4">Tanggal</th>
                                        <th className="py-3 px-3">Clock In</th>
                                        <th className="py-3 px-3">Clock Out</th>
                                        <th className="py-3 px-3">Durasi</th>
                                        <th className="py-3 px-3">Status</th>
                                        <th className="py-3 px-3">Catatan</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedRecords.map((r) => {
                                        const si = STATUS_MAP[r.status] ?? STATUS_MAP["present"];
                                        const StatusIcon = si.icon;
                                        return (
                                            <tr key={r.id} className="border-b border-[var(--border)] hover:bg-[var(--secondary)]/30 transition-colors">
                                                <td className="py-2.5 px-4 align-middle">
                                                    <div className="font-semibold text-[var(--text-primary)] text-sm whitespace-nowrap">
                                                        {fmtDate(r.date)}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-3 align-middle">
                                                    <div className="flex items-center gap-1.5 text-sm">
                                                        <Clock className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                                        <span className="font-mono text-[var(--text-secondary)]">{fmtTime(r.clockIn)}</span>
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-3 align-middle">
                                                    <div className="flex items-center gap-1.5 text-sm">
                                                        <Clock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                                        <span className="font-mono text-[var(--text-secondary)]">{fmtTime(r.clockOut)}</span>
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-3 align-middle">
                                                    <span className="text-xs px-2 py-0.5 bg-[var(--secondary)] text-[var(--text-secondary)] rounded-full font-medium whitespace-nowrap border border-[var(--border)]">
                                                        {calcDuration(r.clockIn, r.clockOut)}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3 align-middle">
                                                    <span className={`badge ${si.badge} flex items-center gap-1 w-fit text-[11px] px-2 py-1`}>
                                                        <StatusIcon className="w-3 h-3" />
                                                        {si.label}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3 align-middle">
                                                    <span className="text-xs text-[var(--text-muted)] line-clamp-1 italic max-w-[120px]">
                                                        {r.notes || "-"}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ── Mobile Card List (visible only on small screens) ── */}
                    <div className="sm:hidden space-y-2">
                        {paginatedRecords.map((r) => {
                            const si = STATUS_MAP[r.status] ?? STATUS_MAP["present"];
                            const StatusIcon = si.icon;
                            return (
                                <div key={r.id} className="card p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-[var(--text-primary)]">{fmtDate(r.date)}</span>
                                        <span className={`badge ${si.badge} flex items-center gap-1 text-[10px] px-2 py-0.5`}>
                                            <StatusIcon className="w-3 h-3" />
                                            {si.label}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div>
                                            <p className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Masuk</p>
                                            <div className="flex items-center justify-center gap-1 mt-0.5">
                                                <Clock className="w-3 h-3 text-green-500" />
                                                <span className="text-xs font-mono text-[var(--text-secondary)]">{fmtTime(r.clockIn)}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Keluar</p>
                                            <div className="flex items-center justify-center gap-1 mt-0.5">
                                                <Clock className="w-3 h-3 text-red-500" />
                                                <span className="text-xs font-mono text-[var(--text-secondary)]">{fmtTime(r.clockOut)}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-[var(--text-muted)] uppercase font-semibold">Durasi</p>
                                            <span className="text-xs font-medium text-[var(--text-secondary)] mt-0.5 block">{calcDuration(r.clockIn, r.clockOut)}</span>
                                        </div>
                                    </div>
                                    {r.notes && (
                                        <p className="text-[10px] text-[var(--text-muted)] italic truncate border-t border-[var(--border)] pt-1.5">{r.notes}</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Pagination (shared) ── */}
                    {filteredRecords.length > ITEMS_PER_PAGE && (
                        <div className="card px-3 sm:px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 text-sm">
                            <span className="text-[10px] sm:text-xs text-[var(--text-muted)]">
                                Menampilkan <strong className="text-[var(--text-primary)]">{paginatedRecords.length}</strong> dari <strong className="text-[var(--text-primary)]">{filteredRecords.length}</strong> catatan
                            </span>
                            <div className="flex items-center gap-2">
                                <button className="btn btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Prev</button>
                                <span className="text-[10px] sm:text-xs font-medium text-[var(--text-muted)]">Hal {currentPage} / {totalPages}</span>
                                <button className="btn btn-secondary btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
