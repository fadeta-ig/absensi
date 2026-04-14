"use client";

import { useEffect, useState, useMemo } from "react";
import {
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
    Loader2
} from "lucide-react";
import { formatIndonesianDate } from "@/lib/utils";

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
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterType, setFilterType] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editStartDate, setEditStartDate] = useState("");
    const [editEndDate, setEditEndDate] = useState("");
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        fetchLeaves();
    }, []);

    const fetchLeaves = async () => {
        const r = await fetch("/api/leave");
        const d = await r.json();
        if (Array.isArray(d)) setLeaves(d);
    };

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
                l.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesStatus && matchesType && matchesSearch;
        });
    }, [leaves, filterStatus, filterType, searchTerm]);

    const handleOpenDetail = (l: LeaveRequest) => {
        setSelectedLeave(l);
        setEditStartDate(l.startDate);
        setEditEndDate(l.endDate);
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
            if (res.ok) {
                await fetchLeaves();
            }
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
            if (res.ok) {
                await fetchLeaves();
                setIsModalOpen(false);
                setSelectedLeave(null);
            }
        } finally {
            setIsUpdating(false);
        }
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
            <div className="card p-4">
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            className="form-input pl-10"
                            placeholder="Cari nama atau NIK..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select
                        className="form-select md:max-w-[180px]"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">Semua Status</option>
                        <option value="pending">Menunggu</option>
                        <option value="approved">Disetujui</option>
                        <option value="rejected">Ditolak</option>
                    </select>
                    <select
                        className="form-select md:max-w-[180px]"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="all">Semua Tipe</option>
                        <option value="annual">Tahunan</option>
                        <option value="sick">Sakit</option>
                        <option value="personal">Pribadi</option>
                        <option value="maternity">Melahirkan</option>
                    </select>
                </div>
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="card p-12 text-center">
                    <CalendarOff className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Tidak ada pengajuan cuti ditemukan</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Coba ubah filter atau kata pencarian.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((l) => {
                        const info = getStatusInfo(l.status);
                        const StatusIcon = info.icon;
                        const days = calculateDays(l.startDate, l.endDate);
                        return (
                            <div key={l.id} className="card p-5">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="flex items-start gap-3 flex-1">
                                        <div className="w-9 h-9 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold shrink-0">
                                            {l.employee?.name?.charAt(0) || "?"}
                                        </div>
                                        <div className="space-y-1.5 flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-bold text-[var(--text-primary)]">{l.employee?.name || "Karyawan"}</span>
                                                <span className="text-[10px] font-mono text-[var(--text-muted)]">{l.employeeId}</span>
                                                <span className="badge badge-info">{getTypeLabel(l.type)}</span>
                                                <span className={`badge ${info.badge} flex items-center gap-1`}>
                                                    <StatusIcon className="w-3 h-3" /> {info.label}
                                                </span>
                                                <span className="text-xs px-2 py-0.5 bg-[var(--secondary)] rounded-full text-[var(--text-secondary)] font-medium">
                                                    {days} Hari
                                                </span>
                                                {l.employee && (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] ml-auto md:ml-0">
                                                        Sisa: {l.employee.totalLeave - l.employee.usedLeave} Cuti
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs sm:text-sm text-[var(--text-secondary)] flex items-center gap-1.5">
                                                <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                                {formatIndonesianDate(l.startDate)} — {formatIndonesianDate(l.endDate)}
                                            </p>
                                            <p className="text-xs text-[var(--text-muted)] truncate">{l.reason}</p>
                                            <p className="text-[10px] text-[var(--text-muted)]">
                                                Diajukan: {new Date(l.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 self-center">
                                        {l.attachment && (
                                            <button
                                                onClick={() => openAttachment(l.attachment!)}
                                                className="btn btn-ghost btn-sm !p-1.5 text-[var(--primary)]"
                                                title="Lihat Lampiran"
                                            >
                                                <Paperclip className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        {l.status === "pending" && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleQuickAction(l, "approved")}
                                                    disabled={isUpdating}
                                                    className="btn btn-success btn-sm !px-2"
                                                    title="Setujui Cuti"
                                                >
                                                    <Check className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Setujui</span>
                                                </button>
                                                <button
                                                    onClick={() => handleQuickAction(l, "rejected")}
                                                    disabled={isUpdating}
                                                    className="btn btn-danger btn-sm !px-2"
                                                    title="Tolak Cuti"
                                                >
                                                    <X className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Tolak</span>
                                                </button>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => handleOpenDetail(l)}
                                            className="btn btn-secondary btn-sm"
                                        >
                                            <Eye className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Detail</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Detail Modal */}
            {isModalOpen && selectedLeave && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
                    <div className="modal-content !max-w-lg !p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="bg-[var(--primary)] p-6 text-white">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">Detail Pengajuan</p>
                                    <h2 className="text-xl font-bold">{selectedLeave.employee?.name}</h2>
                                    <p className="text-sm opacity-80">{selectedLeave.employeeId} • {getTypeLabel(selectedLeave.type)}</p>
                                </div>
                                <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-5">
                            {/* Status Badge */}
                            <div className="flex items-center justify-between">
                                <span className="form-label">Status Saat Ini</span>
                                <span className={`badge ${getStatusInfo(selectedLeave.status).badge} flex items-center gap-1`}>
                                    {(() => { const Icon = getStatusInfo(selectedLeave.status).icon; return <Icon className="w-3 h-3" />; })()}
                                    {getStatusInfo(selectedLeave.status).label}
                                </span>
                            </div>

                            {/* Original Request Info (Read Only) */}
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

                            {/* Date Editing (Approved Period) */}
                            <div className="bg-[var(--primary)]/5 p-4 rounded-lg border border-[var(--primary)]/20 space-y-3">
                                <p className="text-[10px] font-bold text-[var(--primary)] uppercase flex items-center gap-1.5">
                                    <CheckCircle className="w-3 h-3" /> Periode Disetujui (Partial Approval)
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
                                    <span className="text-xs font-medium text-[var(--text-secondary)]">Durasi Realisasi</span>
                                    <span className="text-lg font-bold text-[var(--primary)]">{calculateDays(editStartDate, editEndDate)} Hari</span>
                                </div>
                                {selectedLeave.status === "pending" && (
                                    <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 italic">
                                        <Info className="w-3 h-3 text-[var(--primary)]" /> Atasan dapat mengubah tanggal di atas jika cuti hanya disetujui sebagian.
                                    </p>
                                )}
                            </div>

                            {/* Reason */}
                            <div>
                                <p className="form-label mb-2">Alasan Pengajuan</p>
                                <p className="text-sm text-[var(--text-secondary)] bg-white p-3 rounded-lg border border-[var(--border)] min-h-[60px]">
                                    {selectedLeave.reason}
                                </p>
                            </div>

                            {/* Attachment */}
                            {selectedLeave.attachment && (
                                <div className="flex items-center justify-between p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                                    <div className="flex items-center gap-2.5">
                                        <Paperclip className="w-4 h-4 text-blue-600" />
                                        <div>
                                            <p className="text-xs font-semibold text-[var(--text-primary)]">Dokumen Lampiran</p>
                                            <p className="text-[10px] text-[var(--text-muted)]">Klik untuk melihat bukti</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => openAttachment(selectedLeave.attachment!)}
                                        className="btn btn-sm text-blue-600 bg-blue-500/10 hover:bg-blue-500/20"
                                    >
                                        Buka
                                    </button>
                                </div>
                            )}

                            {/* Leave Balance */}
                            {selectedLeave.employee && (
                                <div className="flex items-center justify-between p-3 bg-[var(--primary)]/5 rounded-lg border border-[var(--primary)]/10">
                                    <span className="text-xs font-medium text-[var(--text-secondary)]">Sisa Cuti Tahunan</span>
                                    <span className="text-sm font-bold text-[var(--primary)]">
                                        {selectedLeave.employee.totalLeave - selectedLeave.employee.usedLeave} / {selectedLeave.employee.totalLeave} Hari
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 border-t border-[var(--border)] bg-[var(--secondary)]/50">
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
