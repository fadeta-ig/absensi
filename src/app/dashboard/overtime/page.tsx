"use client";

import { useEffect, useState, useMemo } from "react";
import {
    AlertCircle, Clock4, Search, CheckCircle, XCircle, Clock,
    Calendar, FileText, User, Filter, Eye, X, Loader2,
    CheckSquare, Square, FileSpreadsheet, Check, RotateCcw
} from "lucide-react";
import { useToast } from "@/components/Toast";
import DataTablePagination from "@/components/ui/DataTablePagination";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { exportToExcel } from "@/lib/export";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface OvertimeRequest {
    id: string;
    employeeId: string;
    employee?: { name: string; department?: string };
    date: string;
    startTime: string;
    endTime: string;
    hours: number;
    approvedHours?: number | null;
    isHoliday: boolean;
    overtimePay: number;
    reason: string;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
}

const STATUS_CONFIG = {
    pending: { label: "Menunggu", class: "badge-warning" },
    approved: { label: "Disetujui", class: "badge-success" },
    rejected: { label: "Ditolak", class: "badge-error" },
};

export default function DashboardOvertimePage() {
    const toast = useToast();
    const [requests, setRequests] = useState<OvertimeRequest[]>([]);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [selectedReq, setSelectedReq] = useState<OvertimeRequest | null>(null);
    const [updating, setUpdating] = useState<string | null>(null);
    const [approvedHoursInput, setApprovedHoursInput] = useState<number>(0);
    const [isHolidayInput, setIsHolidayInput] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Multi-Select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkProcessing, setBulkProcessing] = useState(false);

    useEffect(() => {
        const loadRequests = async () => {
            setInitialLoading(true);
            setLoadError("");
            try {
                const res = await fetch("/api/overtime");
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat pengajuan lembur."));
                const data = await res.json();
                setRequests(Array.isArray(data) ? data : []);
            } catch (error) {
                reportClientError("DashboardOvertimePage", "Gagal memuat pengajuan lembur", error);
                const message = error instanceof Error ? error.message : "Gagal memuat pengajuan lembur.";
                setLoadError(message);
                toast(message, "error");
            } finally {
                setInitialLoading(false);
            }
        };

        void loadRequests();
    }, [toast]);

    // Reset pagination to page 1 on filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [search, filterStatus, pageSize]);

    const handleStatusUpdate = async (id: string, status: "approved" | "rejected") => {
        setUpdating(id);
        try {
            const body: Record<string, unknown> = { id, status };
            if (status === "approved") {
                body.approvedHours = approvedHoursInput;
                body.isHoliday = isHolidayInput;
            }
            const res = await fetch("/api/overtime", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const updated = await res.json();
                setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
                if (selectedReq?.id === id) setSelectedReq({ ...selectedReq, ...updated });
                toast(status === "approved" ? "Pengajuan lembur disetujui." : "Pengajuan lembur ditolak.", "success");
            } else {
                throw new Error(await getResponseErrorMessage(res, "Gagal memperbarui status lembur."));
            }
        } catch (error) {
            reportClientError("DashboardOvertimePage", "Gagal memperbarui status lembur", error, { overtimeId: id, status });
            toast(error instanceof Error ? error.message : "Gagal memperbarui status lembur.", "error");
        } finally {
            setUpdating(null);
        }
    };

    const handleBulkStatusUpdate = async (status: "approved" | "rejected") => {
        const targetList = requests.filter(r => selectedIds.has(r.id) && r.status === "pending");
        if (targetList.length === 0) {
            toast("Tidak ada pengajuan lembur berstatus menunggu yang dipilih.", "warning");
            return;
        }

        setBulkProcessing(true);
        try {
            for (const r of targetList) {
                await fetch("/api/overtime", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: r.id,
                        status,
                        approvedHours: r.hours,
                        isHoliday: r.isHoliday
                    }),
                });
            }
            // Reload requests
            const res = await fetch("/api/overtime");
            if (res.ok) {
                const data = await res.json();
                setRequests(Array.isArray(data) ? data : []);
            }
            clearSelection();
            toast(`${targetList.length} pengajuan lembur berhasil ${status === "approved" ? "disetujui" : "ditolak"}.`, "success");
        } catch (error) {
            reportClientError("DashboardOvertimePage", "Gagal memproses persetujuan lembur massal", error);
            toast("Sebagian persetujuan lembur massal gagal diperbarui.", "error");
        } finally {
            setBulkProcessing(false);
        }
    };

    const handleBulkExportExcel = () => {
        const targetList = requests.filter(r => selectedIds.has(r.id));
        if (targetList.length === 0) return;

        const data = targetList.map(r => ({
            employeeId: r.employeeId,
            name: r.employee?.name || r.employeeId,
            date: r.date,
            time: `${r.startTime} - ${r.endTime}`,
            hours: r.hours,
            approvedHours: r.approvedHours ?? r.hours,
            isHoliday: r.isHoliday ? "Hari Libur" : "Hari Kerja",
            overtimePay: r.overtimePay,
            reason: r.reason,
            status: STATUS_CONFIG[r.status]?.label || r.status,
            createdAt: new Date(r.createdAt).toLocaleDateString("id-ID")
        }));

        exportToExcel(
            data,
            [
                { key: "employeeId", label: "NIP" },
                { key: "name", label: "Nama Karyawan" },
                { key: "date", label: "Tanggal Lembur" },
                { key: "time", label: "Jam Lembur" },
                { key: "hours", label: "Jam Pengajuan" },
                { key: "approvedHours", label: "Jam Disetujui" },
                { key: "isHoliday", label: "Tipe Hari" },
                { key: "overtimePay", label: "Upah Lembur" },
                { key: "reason", label: "Alasan" },
                { key: "status", label: "Status" },
                { key: "createdAt", label: "Tgl Pengajuan" }
            ],
            `Data_Lembur_Export_${new Date().toISOString().slice(0, 10)}`,
            "Lembur"
        );
        toast(`${targetList.length} data lembur berhasil diekspor ke Excel.`, "success");
    };

    const filtered = useMemo(() => {
        return requests.filter((r) => {
            const empName = r.employee?.name || "";
            const matchSearch = r.employeeId.toLowerCase().includes(search.toLowerCase()) ||
                empName.toLowerCase().includes(search.toLowerCase()) ||
                r.reason.toLowerCase().includes(search.toLowerCase());
            const matchStatus = filterStatus === "all" || r.status === filterStatus;
            return matchSearch && matchStatus;
        });
    }, [requests, search, filterStatus]);

    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    const paginatedRequests = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, currentPage, pageSize]);

    const isAllCurrentPageSelected = paginatedRequests.length > 0 && paginatedRequests.every(r => selectedIds.has(r.id));
    const isAllFilteredSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));

    const toggleSelectAllCurrentPage = () => {
        const next = new Set(selectedIds);
        if (isAllCurrentPageSelected) {
            paginatedRequests.forEach(r => next.delete(r.id));
        } else {
            paginatedRequests.forEach(r => next.add(r.id));
        }
        setSelectedIds(next);
    };

    const selectAllFiltered = () => {
        const next = new Set(selectedIds);
        filtered.forEach(r => next.add(r.id));
        setSelectedIds(next);
    };

    const toggleSelectOne = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const clearSelection = () => setSelectedIds(new Set());

    const statusCounts = {
        all: requests.length,
        pending: requests.filter((r) => r.status === "pending").length,
        approved: requests.filter((r) => r.status === "approved").length,
        rejected: requests.filter((r) => r.status === "rejected").length,
    };

    const totalApprovedHours = requests.filter((r) => r.status === "approved").reduce((sum, r) => sum + r.hours, 0);

    const resetFilters = () => {
        setSearch("");
        setFilterStatus("all");
    };

    const hasActiveFilters = search || filterStatus !== "all";

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Clock4 className="w-5 h-5 text-[var(--primary)]" />
                    Manajemen Lembur
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">{requests.length} pengajuan lembur terdaftar</p>
            </div>

            {loadError && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                    { label: "Total", count: statusCounts.all, color: "bg-blue-50 text-blue-700 border-blue-200" },
                    { label: "Menunggu", count: statusCounts.pending, color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
                    { label: "Disetujui", count: statusCounts.approved, color: "bg-green-50 text-green-700 border-green-200" },
                    { label: "Ditolak", count: statusCounts.rejected, color: "bg-red-50 text-red-700 border-red-200" },
                    { label: "Total Jam", count: `${Number(totalApprovedHours.toFixed(2))}h`, color: "bg-purple-50 text-purple-700 border-purple-200" },
                ].map((stat) => (
                    <div key={stat.label} className={`p-3 rounded-xl border ${stat.color}`}>
                        <p className="text-2xl font-bold">{stat.count}</p>
                        <p className="text-xs font-medium">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Search & Filter Bar */}
            <div className="card p-4 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            className="form-input pl-10 w-full"
                            placeholder="Cari nama, NIP atau alasan lembur..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {(["all", "pending", "approved", "rejected"] as const).map((s) => (
                            <button
                                key={s}
                                onClick={() => setFilterStatus(s)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterStatus === s ? "bg-[var(--primary)] text-white shadow-sm" : "bg-[var(--secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]"}`}
                            >
                                {s === "all" ? "Semua" : STATUS_CONFIG[s].label}
                            </button>
                        ))}
                    </div>
                </div>

                {hasActiveFilters && (
                    <div className="flex justify-end pt-2 border-t border-[var(--border)]">
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reset Filter
                        </button>
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th className="w-10 text-center">
                                    <button
                                        type="button"
                                        onClick={toggleSelectAllCurrentPage}
                                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5"
                                        title={isAllCurrentPageSelected ? "Batalkan halaman ini" : "Pilih halaman ini"}
                                    >
                                        {isAllCurrentPageSelected ? (
                                            <CheckSquare className="w-4 h-4 text-[var(--primary)]" />
                                        ) : (
                                            <Square className="w-4 h-4" />
                                        )}
                                    </button>
                                </th>
                                <th>Karyawan</th>
                                <th>Tanggal</th>
                                <th className="hidden md:table-cell">Jam</th>
                                <th className="hidden md:table-cell text-center">Durasi</th>
                                <th className="hidden lg:table-cell">Alasan</th>
                                <th>Upah Lembur</th>
                                <th>Status</th>
                                <th className="text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {initialLoading ? (
                                <tr>
                                    <td colSpan={9} className="text-center py-12 text-sm text-[var(--text-muted)]">
                                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--primary)] opacity-60" />
                                        Memuat pengajuan lembur...
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-10 text-sm text-[var(--text-muted)]">Tidak ada pengajuan lembur yang cocok</td></tr>
                            ) : (
                                paginatedRequests.map((r) => {
                                    const cfg = STATUS_CONFIG[r.status];
                                    const isSelected = selectedIds.has(r.id);
                                    return (
                                        <tr key={r.id} className={isSelected ? "bg-[var(--primary)]/5" : undefined}>
                                            <td className="text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSelectOne(r.id)}
                                                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5"
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare className="w-4 h-4 text-[var(--primary)]" />
                                                    ) : (
                                                        <Square className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </td>
                                            <td>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-xs text-[var(--text-primary)]">{r.employee?.name || "Karyawan"}</span>
                                                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{r.employeeId}</span>
                                                </div>
                                            </td>
                                            <td className="text-xs font-medium">{r.date}</td>
                                            <td className="hidden md:table-cell text-xs font-mono text-blue-600">{r.startTime} — {r.endTime}</td>
                                            <td className="hidden md:table-cell text-xs text-center font-bold text-[var(--text-primary)]">
                                                <span className="px-2 py-0.5 rounded-full bg-[var(--secondary)]">
                                                    {Number(r.hours.toFixed(2))}h
                                                </span>
                                            </td>
                                            <td className="hidden lg:table-cell text-xs text-[var(--text-secondary)] max-w-[200px]">
                                                <p className="line-clamp-2" title={r.reason}>{r.reason}</p>
                                            </td>
                                            <td className="text-xs font-bold text-emerald-600">
                                                {r.overtimePay > 0 ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(r.overtimePay) : "-"}
                                            </td>
                                            <td><span className={`badge ${cfg.class}`}>{cfg.label}</span></td>
                                            <td className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => {
                                                        setSelectedReq(r);
                                                        setApprovedHoursInput(r.approvedHours ?? r.hours);
                                                        setIsHolidayInput(r.isHoliday ?? false);
                                                    }} className="btn btn-ghost btn-sm !p-1.5" title="Detail">
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    {r.status === "pending" && (
                                                        <>
                                                            <button
                                                                onClick={() => handleStatusUpdate(r.id, "approved")}
                                                                className="btn btn-ghost btn-sm !p-1.5 text-emerald-600 hover:!bg-emerald-50"
                                                                disabled={updating === r.id}
                                                                title="Setujui"
                                                            >
                                                                {updating === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                            </button>
                                                            <button
                                                                onClick={() => handleStatusUpdate(r.id, "rejected")}
                                                                className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50"
                                                                disabled={updating === r.id}
                                                                title="Tolak"
                                                            >
                                                                {updating === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <DataTablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={filtered.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                    itemLabel="pengajuan lembur"
                />
            </div>

            {/* Bulk Action Bar */}
            <BulkActionBar
                selectedCount={selectedIds.size}
                totalCount={filtered.length}
                allSelected={isAllFilteredSelected}
                onSelectAll={selectAllFiltered}
                onClearSelection={clearSelection}
                itemLabel="lembur"
            >
                <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate("approved")}
                    disabled={bulkProcessing}
                    className="btn btn-success btn-sm flex items-center gap-1.5"
                >
                    {bulkProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Setujui Terpilih
                </button>
                <button
                    type="button"
                    onClick={() => handleBulkStatusUpdate("rejected")}
                    disabled={bulkProcessing}
                    className="btn btn-danger btn-sm flex items-center gap-1.5"
                >
                    {bulkProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    Tolak Terpilih
                </button>
                <button
                    type="button"
                    onClick={handleBulkExportExcel}
                    className="btn btn-secondary btn-sm flex items-center gap-1.5 border border-[var(--border)]"
                >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Ekspor Excel
                </button>
            </BulkActionBar>

            {/* Detail Modal */}
            {selectedReq && (
                <div className="modal-overlay" onClick={() => setSelectedReq(null)}>
                    <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title flex items-center gap-2">
                                <Clock4 className="w-4 h-4 text-[var(--primary)]" />
                                Detail Pengajuan Lembur
                            </h2>
                            <button className="modal-close" onClick={() => setSelectedReq(null)}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="p-3 bg-[var(--secondary)] rounded-xl space-y-1">
                                <p className="font-bold text-sm text-[var(--text-primary)]">{selectedReq.employee?.name || "Karyawan"}</p>
                                <p className="text-xs text-[var(--text-muted)] font-mono">{selectedReq.employeeId}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <span className="text-[var(--text-muted)]">Tanggal</span>
                                    <p className="font-semibold">{selectedReq.date}</p>
                                </div>
                                <div>
                                    <span className="text-[var(--text-muted)]">Jam</span>
                                    <p className="font-semibold">{selectedReq.startTime} — {selectedReq.endTime}</p>
                                </div>
                                <div>
                                    <span className="text-[var(--text-muted)]">Durasi Diajukan</span>
                                    <p className="font-semibold">{Number(selectedReq.hours.toFixed(2))} jam</p>
                                </div>
                                <div>
                                    <span className="text-[var(--text-muted)]">Tipe Hari</span>
                                    <p className="font-semibold">{selectedReq.isHoliday ? "Hari Libur" : "Hari Kerja"}</p>
                                </div>
                            </div>

                            <div>
                                <span className="text-xs text-[var(--text-muted)]">Alasan Lembur</span>
                                <p className="text-xs text-[var(--text-primary)] mt-1 p-2 bg-[var(--secondary)] rounded-lg">
                                    {selectedReq.reason}
                                </p>
                            </div>

                            {selectedReq.overtimePay > 0 && (
                                <div className="p-3 bg-green-50 rounded-xl border border-green-200 text-xs">
                                    <span className="text-green-700">Estimasi Upah Lembur (PP 35/2021)</span>
                                    <p className="text-lg font-bold text-green-800">
                                        {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(selectedReq.overtimePay)}
                                    </p>
                                </div>
                            )}

                            {selectedReq.status === "pending" && (
                                <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                                    <p className="text-xs font-semibold text-[var(--text-primary)]">Penyesuaian Persetujuan</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="form-label text-[10px]">Jam Disetujui</label>
                                            <input
                                                type="number"
                                                className="form-input text-xs"
                                                value={approvedHoursInput}
                                                onChange={(e) => setApprovedHoursInput(Number(e.target.value))}
                                                min={0.5}
                                                max={12}
                                                step={0.5}
                                            />
                                        </div>
                                        <div className="flex items-center mt-5">
                                            <label className="flex items-center gap-2 text-xs cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={isHolidayInput}
                                                    onChange={(e) => setIsHolidayInput(e.target.checked)}
                                                    className="rounded border-[var(--border)]"
                                                />
                                                <span>Hari Libur</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <button
                                            onClick={() => handleStatusUpdate(selectedReq.id, "approved")}
                                            className="btn btn-success flex-1"
                                            disabled={updating === selectedReq.id}
                                        >
                                            {updating === selectedReq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                            Setujui
                                        </button>
                                        <button
                                            onClick={() => handleStatusUpdate(selectedReq.id, "rejected")}
                                            className="btn btn-danger flex-1"
                                            disabled={updating === selectedReq.id}
                                        >
                                            {updating === selectedReq.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                            Tolak
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
