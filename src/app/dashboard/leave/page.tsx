"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import {
    AlertCircle,
    CalendarOff,
    CheckCircle,
    XCircle,
    Clock,
    Paperclip,
    Search,
    Eye,
    Calendar,
    Info,
    Check,
    X,
    LayoutDashboard,
    Loader2,
    CheckSquare,
    Square,
    RotateCcw,
    FileSpreadsheet
} from "lucide-react";
import { formatIndonesianDate } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import DataTablePagination from "@/components/ui/DataTablePagination";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { exportToExcel } from "@/lib/export";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface LeaveRequest {
    id: string;
    employeeId: string;
    employee?: { name: string; totalLeave: number; usedLeave: number };
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
    attachment?: string | null;
    createdAt: string;
}

export default function LeaveManagementPage() {
    const toast = useToast();
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterType, setFilterType] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Multi-select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkProcessing, setBulkProcessing] = useState(false);

    const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editStartDate, setEditStartDate] = useState("");
    const [editEndDate, setEditEndDate] = useState("");
    const [isUpdating, setIsUpdating] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const fetchLeaves = useCallback(async () => {
        const r = await fetch("/api/leave");
        if (!r.ok) throw new Error(await getResponseErrorMessage(r, "Gagal memuat data cuti."));
        const d = await r.json();
        if (Array.isArray(d)) setLeaves(d);
    }, []);

    useEffect(() => {
        const loadInitialData = async () => {
            setInitialLoading(true);
            setLoadError("");
            try {
                await fetchLeaves();
            } catch (error) {
                reportClientError("LeaveManagementPage", "Gagal memuat data cuti", error);
                const message = error instanceof Error ? error.message : "Gagal memuat data cuti.";
                setLoadError(message);
                toast(message, "error");
            } finally {
                setInitialLoading(false);
            }
        };

        void loadInitialData();
    }, [fetchLeaves, toast]);

    // Reset pagination to page 1 on filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [filterStatus, filterType, searchTerm, pageSize]);

    const stats = useMemo(() => ({
        total: leaves.length,
        pending: leaves.filter(l => l.status === "pending").length,
        approved: leaves.filter(l => l.status === "approved").length,
        rejected: leaves.filter(l => l.status === "rejected").length,
    }), [leaves]);

    const filtered = useMemo(() => {
        return leaves.filter((l) => {
            const matchesStatus = filterStatus === "all" || l.status === filterStatus;
            const matchesType = filterType === "all" || l.type === filterType;
            const matchesSearch = l.employee?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                l.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                l.reason.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesStatus && matchesType && matchesSearch;
        });
    }, [leaves, filterStatus, filterType, searchTerm]);

    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    const paginatedLeaves = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, currentPage, pageSize]);

    // Selection helpers
    const isAllCurrentPageSelected = paginatedLeaves.length > 0 && paginatedLeaves.every(l => selectedIds.has(l.id));
    const isAllFilteredSelected = filtered.length > 0 && filtered.every(l => selectedIds.has(l.id));

    const toggleSelectAllCurrentPage = () => {
        const next = new Set(selectedIds);
        if (isAllCurrentPageSelected) {
            paginatedLeaves.forEach(l => next.delete(l.id));
        } else {
            paginatedLeaves.forEach(l => next.add(l.id));
        }
        setSelectedIds(next);
    };

    const selectAllFiltered = () => {
        const next = new Set(selectedIds);
        filtered.forEach(l => next.add(l.id));
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

    const handleOpenDetail = (l: LeaveRequest) => {
        setSelectedLeave(l);
        setEditStartDate(l.startDate);
        setEditEndDate(l.endDate);
        setIsModalOpen(true);
    };

    const handleQuickAction = async (l: LeaveRequest, status: string) => {
        setIsUpdating(true);
        try {
            const res = await fetch("/api/leave", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: l.id,
                    status,
                    startDate: l.startDate,
                    endDate: l.endDate,
                }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memperbarui status cuti."));
            await fetchLeaves();
            toast(status === "approved" ? "Pengajuan cuti disetujui." : "Pengajuan cuti ditolak.", "success");
        } catch (error) {
            reportClientError("LeaveManagementPage", "Gagal memperbarui status cuti dari quick action", error, { leaveId: l.id, status });
            toast(error instanceof Error ? error.message : "Gagal memperbarui status cuti.", "error");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleUpdate = async (id: string, status: string) => {
        setIsUpdating(true);
        try {
            const res = await fetch("/api/leave", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    status,
                    startDate: editStartDate,
                    endDate: editEndDate,
                }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memperbarui status cuti."));
            await fetchLeaves();
            setIsModalOpen(false);
            setSelectedLeave(null);
            toast(status === "approved" ? "Pengajuan cuti disetujui." : "Pengajuan cuti ditolak.", "success");
        } catch (error) {
            reportClientError("LeaveManagementPage", "Gagal memperbarui status cuti dari modal", error, { leaveId: id, status });
            toast(error instanceof Error ? error.message : "Gagal memperbarui status cuti.", "error");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleBulkStatusUpdate = async (status: "approved" | "rejected") => {
        const targetLeaves = leaves.filter(l => selectedIds.has(l.id) && l.status === "pending");
        if (targetLeaves.length === 0) {
            toast("Tidak ada pengajuan berstatus menunggu yang dipilih.", "warning");
            return;
        }

        setBulkProcessing(true);
        try {
            for (const item of targetLeaves) {
                await fetch("/api/leave", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: item.id,
                        status,
                        startDate: item.startDate,
                        endDate: item.endDate,
                    }),
                });
            }
            await fetchLeaves();
            clearSelection();
            toast(`${targetLeaves.length} pengajuan cuti berhasil ${status === "approved" ? "disetujui" : "ditolak"}.`, "success");
        } catch (error) {
            reportClientError("LeaveManagementPage", "Gagal memproses persetujuan cuti massal", error);
            toast("Sebagian proses cuti massal gagal diperbarui.", "error");
        } finally {
            setBulkProcessing(false);
        }
    };

    const handleBulkExportExcel = () => {
        const targetList = leaves.filter(l => selectedIds.has(l.id));
        if (targetList.length === 0) return;

        const data = targetList.map(l => ({
            employeeId: l.employeeId,
            name: l.employee?.name || l.employeeId,
            type: getTypeLabel(l.type),
            startDate: l.startDate,
            endDate: l.endDate,
            duration: `${calculateDays(l.startDate, l.endDate)} hari`,
            reason: l.reason,
            status: getStatusInfo(l.status).label,
            createdAt: new Date(l.createdAt).toLocaleDateString("id-ID")
        }));

        exportToExcel(
            data,
            [
                { key: "employeeId", label: "NIP" },
                { key: "name", label: "Nama Karyawan" },
                { key: "type", label: "Jenis Cuti" },
                { key: "startDate", label: "Tgl Mulai" },
                { key: "endDate", label: "Tgl Selesai" },
                { key: "duration", label: "Durasi" },
                { key: "reason", label: "Alasan" },
                { key: "status", label: "Status" },
                { key: "createdAt", label: "Tgl Pengajuan" }
            ],
            `Data_Cuti_Export_${new Date().toISOString().slice(0, 10)}`,
            "Cuti"
        );
        toast(`${targetList.length} data cuti berhasil diekspor ke Excel.`, "success");
    };

    const getTypeLabel = (t: string) => {
        switch (t) {
            case "annual": return "Tahunan";
            case "sick": return "Sakit";
            case "personal": return "Pribadi";
            case "maternity": return "Melahirkan";
            default: return t;
        }
    };

    const getStatusInfo = (s: string) => {
        switch (s) {
            case "approved": return { label: "Disetujui", badge: "badge-success", icon: CheckCircle };
            case "rejected": return { label: "Ditolak", badge: "badge-error", icon: XCircle };
            default: return { label: "Menunggu", badge: "badge-warning", icon: Clock };
        }
    };

    const calculateDays = (start: string, end: string) => {
        if (!start || !end) return 0;
        const s = new Date(start);
        const e = new Date(end);
        const diff = e.getTime() - s.getTime();
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
    };

    const openAttachment = (data: string) => {
        const win = window.open();
        if (win) {
            win.document.write(`<iframe src="${data}" frameborder="0" style="border:0; top:0; left:0; bottom:0; right:0; width:100%; height:100%;" allowfullscreen></iframe>`);
        }
    };

    const statsConfig = [
        { label: "Total Pengajuan", value: stats.total, icon: LayoutDashboard, color: "text-[var(--primary)]", bg: "bg-[var(--primary)]/10" },
        { label: "Menunggu", value: stats.pending, icon: Clock, color: "text-orange-600", bg: "bg-orange-500/10", highlight: stats.pending > 0 },
        { label: "Disetujui", value: stats.approved, icon: CheckCircle, color: "text-green-600", bg: "bg-green-500/10" },
        { label: "Ditolak", value: stats.rejected, icon: XCircle, color: "text-red-600", bg: "bg-red-500/10" },
    ];

    const resetFilters = () => {
        setSearchTerm("");
        setFilterStatus("all");
        setFilterType("all");
    };

    const hasActiveFilters = searchTerm || filterStatus !== "all" || filterType !== "all";

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <CalendarOff className="w-5 h-5 text-[var(--primary)]" />
                        Manajemen Cuti
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Kelola dan tinjau pengajuan cuti karyawan</p>
                </div>
            </div>

            {loadError && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statsConfig.map((s) => {
                    const Icon = s.icon;
                    return (
                        <div key={s.label} className={`card p-4 ${s.highlight ? "ring-2 ring-orange-400" : ""}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg}`}>
                                    <Icon className={`w-5 h-5 ${s.color}`} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{s.label}</p>
                                    <h3 className="text-xl font-bold text-[var(--text-primary)]">{s.value}</h3>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Filter Bar */}
            <div className="card p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="relative md:col-span-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            className="form-input pl-10 w-full"
                            placeholder="Cari nama, NIP, atau alasan cuti..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div>
                        <select
                            className="form-select w-full"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                        >
                            <option value="all">Semua Status</option>
                            <option value="pending">Menunggu</option>
                            <option value="approved">Disetujui</option>
                            <option value="rejected">Ditolak</option>
                        </select>
                    </div>
                    <div>
                        <select
                            className="form-select w-full"
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                        >
                            <option value="all">Semua Tipe Cuti</option>
                            <option value="annual">Tahunan</option>
                            <option value="sick">Sakit</option>
                            <option value="personal">Pribadi</option>
                            <option value="maternity">Melahirkan</option>
                        </select>
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
                                <th>Jenis Cuti</th>
                                <th>Periode</th>
                                <th className="text-center">Durasi</th>
                                <th>Sisa Kuota Cuti</th>
                                <th className="hidden lg:table-cell">Alasan</th>
                                <th>Status</th>
                                <th className="text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {initialLoading ? (
                                <tr>
                                    <td colSpan={9} className="text-center py-12 text-sm text-[var(--text-muted)]">
                                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--primary)] opacity-60" />
                                        Memuat pengajuan cuti...
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="text-center py-10 text-sm text-[var(--text-muted)]">
                                        Tidak ada pengajuan cuti yang cocok
                                    </td>
                                </tr>
                            ) : (
                                paginatedLeaves.map((l) => {
                                    const info = getStatusInfo(l.status);
                                    const StatusIcon = info.icon;
                                    const days = calculateDays(l.startDate, l.endDate);
                                    const isSelected = selectedIds.has(l.id);
                                    const remainingQuota = l.employee ? l.employee.totalLeave - l.employee.usedLeave : null;

                                    return (
                                        <tr key={l.id} className={isSelected ? "bg-[var(--primary)]/5" : undefined}>
                                            <td className="text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSelectOne(l.id)}
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
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-7 h-7 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                                        {l.employee?.name?.charAt(0) || "?"}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-xs text-[var(--text-primary)]">{l.employee?.name || "Karyawan"}</p>
                                                        <p className="font-mono text-[10px] text-[var(--text-muted)]">{l.employeeId}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge badge-info text-[10px]">{getTypeLabel(l.type)}</span>
                                            </td>
                                            <td className="text-xs">
                                                <div className="font-medium text-[var(--text-primary)]">{formatIndonesianDate(l.startDate)}</div>
                                                <div className="text-[10px] text-[var(--text-muted)]">s/d {formatIndonesianDate(l.endDate)}</div>
                                            </td>
                                            <td className="text-center">
                                                <span className="px-2 py-0.5 rounded-full bg-[var(--secondary)] text-[var(--text-secondary)] font-semibold text-xs">
                                                    {days} Hari
                                                </span>
                                            </td>
                                            <td>
                                                {remainingQuota !== null ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <span
                                                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                                                remainingQuota <= 0
                                                                    ? "bg-red-100 text-red-700 border border-red-200"
                                                                    : remainingQuota <= 3
                                                                    ? "bg-amber-100 text-amber-700 border border-amber-200"
                                                                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                            }`}
                                                        >
                                                            Sisa {remainingQuota} Hari
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-[var(--text-muted)]">-</span>
                                                )}
                                            </td>
                                            <td className="hidden lg:table-cell text-xs text-[var(--text-secondary)] max-w-[200px]">
                                                <p className="truncate" title={l.reason}>{l.reason}</p>
                                                {l.attachment && (
                                                    <button
                                                        onClick={() => openAttachment(l.attachment!)}
                                                        className="inline-flex items-center gap-1 text-[10px] text-[var(--primary)] hover:underline mt-0.5"
                                                    >
                                                        <Paperclip className="w-3 h-3" /> Bukti Terlampir
                                                    </button>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`badge ${info.badge} flex items-center gap-1 w-fit`}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {info.label}
                                                </span>
                                            </td>
                                            <td className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    {l.status === "pending" && (
                                                        <>
                                                            <button
                                                                onClick={() => handleQuickAction(l, "approved")}
                                                                disabled={isUpdating}
                                                                className="btn btn-ghost btn-sm !p-1.5 text-emerald-600 hover:!bg-emerald-50"
                                                                title="Setujui Cuti"
                                                            >
                                                                <Check className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleQuickAction(l, "rejected")}
                                                                disabled={isUpdating}
                                                                className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:!bg-red-50"
                                                                title="Tolak Cuti"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => handleOpenDetail(l)}
                                                        className="btn btn-ghost btn-sm !p-1.5"
                                                        title="Lihat Detail"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <DataTablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={filtered.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                    itemLabel="pengajuan cuti"
                />
            </div>

            {/* Floating Bulk Action Bar */}
            <BulkActionBar
                selectedCount={selectedIds.size}
                totalCount={filtered.length}
                allSelected={isAllFilteredSelected}
                onSelectAll={selectAllFiltered}
                onClearSelection={clearSelection}
                itemLabel="pengajuan"
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

            {/* Detail Modal with Partial Approval */}
            {isModalOpen && selectedLeave && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
                    <div className="modal-content !max-w-lg !p-0 overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-[var(--primary)] p-6 text-white shrink-0">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">Detail Pengajuan Cuti</p>
                                    <h2 className="text-xl font-bold">{selectedLeave.employee?.name}</h2>
                                    <p className="text-sm opacity-80">{selectedLeave.employeeId} • {getTypeLabel(selectedLeave.type)}</p>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--card)]/10 hover:bg-[var(--card)]/20 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-5 overflow-y-auto flex-1">
                            <div className="flex items-center justify-between">
                                <span className="form-label">Status Saat Ini</span>
                                <span className={`badge ${getStatusInfo(selectedLeave.status).badge} flex items-center gap-1`}>
                                    {(() => { const Icon = getStatusInfo(selectedLeave.status).icon; return <Icon className="w-3 h-3" />; })()}
                                    {getStatusInfo(selectedLeave.status).label}
                                </span>
                            </div>

                            <div className="bg-[var(--secondary)]/30 p-4 rounded-lg border border-[var(--border)] border-dashed space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center gap-1.5">
                                        <Calendar className="w-3 h-3" /> Permohonan Karyawan
                                    </p>
                                    <span className="text-[10px] font-bold text-[var(--text-muted)]">
                                        {calculateDays(selectedLeave.startDate, selectedLeave.endDate)} Hari
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[10px] text-[var(--text-muted)]">Tanggal Mulai</p>
                                        <p className="text-xs font-semibold">{formatIndonesianDate(selectedLeave.startDate)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-[var(--text-muted)]">Tanggal Selesai</p>
                                        <p className="text-xs font-semibold">{formatIndonesianDate(selectedLeave.endDate)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[var(--primary)]/5 p-4 rounded-lg border border-[var(--primary)]/20 space-y-3">
                                <p className="text-[10px] font-bold text-[var(--primary)] uppercase flex items-center gap-1.5">
                                    <CheckCircle className="w-3 h-3" /> Periode Realisasi (Partial Approval)
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-[var(--text-muted)] mb-1 block uppercase font-medium">Ubah Mulai</label>
                                        <input
                                            type="date"
                                            className="form-input text-xs"
                                            value={editStartDate}
                                            onChange={(e) => setEditStartDate(e.target.value)}
                                            readOnly={selectedLeave.status !== "pending"}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-[var(--text-muted)] mb-1 block uppercase font-medium">Ubah Selesai</label>
                                        <input
                                            type="date"
                                            className="form-input text-xs"
                                            value={editEndDate}
                                            onChange={(e) => setEditEndDate(e.target.value)}
                                            readOnly={selectedLeave.status !== "pending"}
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-[var(--primary)]/10">
                                    <span className="text-xs font-medium text-[var(--text-secondary)]">Durasi Disetujui</span>
                                    <span className="text-lg font-bold text-[var(--primary)]">{calculateDays(editStartDate, editEndDate)} Hari</span>
                                </div>
                                {selectedLeave.status === "pending" && (
                                    <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 italic">
                                        <Info className="w-3 h-3 text-[var(--primary)]" /> Anda dapat mengubah tanggal di atas jika cuti disetujui sebagian.
                                    </p>
                                )}
                            </div>

                            <div>
                                <p className="form-label mb-2">Alasan Pengajuan</p>
                                <p className="text-sm text-[var(--text-secondary)] bg-[var(--card)] p-3 rounded-lg border border-[var(--border)] min-h-[60px]">
                                    {selectedLeave.reason}
                                </p>
                            </div>

                            {selectedLeave.attachment && (
                                <div className="flex items-center justify-between p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                                    <div className="flex items-center gap-2.5">
                                        <Paperclip className="w-4 h-4 text-blue-600" />
                                        <div>
                                            <p className="text-xs font-semibold text-[var(--text-primary)]">Dokumen Bukti</p>
                                            <p className="text-[10px] text-[var(--text-muted)]">Lampiran surat dokter / dokumen</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => openAttachment(selectedLeave.attachment!)}
                                        className="btn btn-sm text-blue-600 bg-blue-500/10 hover:bg-blue-500/20"
                                    >
                                        Buka Lampiran
                                    </button>
                                </div>
                            )}

                            {selectedLeave.employee && (
                                <div className="flex items-center justify-between p-3 bg-[var(--primary)]/5 rounded-lg border border-[var(--primary)]/10">
                                    <span className="text-xs font-medium text-[var(--text-secondary)]">Sisa Kuota Cuti Tahunan</span>
                                    <span className="text-sm font-bold text-[var(--primary)]">
                                        {selectedLeave.employee.totalLeave - selectedLeave.employee.usedLeave} / {selectedLeave.employee.totalLeave} Hari
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-[var(--border)] bg-[var(--secondary)]/50 shrink-0">
                            {selectedLeave.status === "pending" ? (
                                <div className="flex gap-3">
                                    <button
                                        disabled={isUpdating}
                                        onClick={() => handleUpdate(selectedLeave.id, "rejected")}
                                        className="btn btn-danger flex-1"
                                    >
                                        {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                        Tolak
                                    </button>
                                    <button
                                        disabled={isUpdating}
                                        onClick={() => handleUpdate(selectedLeave.id, "approved")}
                                        className="btn btn-success flex-1"
                                    >
                                        {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        Setujui
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="btn btn-secondary w-full"
                                >
                                    Tutup
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
