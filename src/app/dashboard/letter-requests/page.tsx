"use client";

import { useState, useEffect } from "react";
import {
    FileText, Search, Filter, Loader2, X,
    Clock, CheckCircle, XCircle, AlertCircle, Eye,
    Briefcase, DollarSign, UserCheck, Shield, Send,
    ChevronLeft, ChevronRight, Check,
    type LucideIcon,
} from "lucide-react";
import { useToast } from "@/components/Toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type LetterType = "SK_KERJA" | "KET_PENGHASILAN" | "KET_MASIH_BEKERJA" | "BPJS";
type LetterStatus = "PENDING" | "PROCESSING" | "READY" | "REJECTED";

interface LetterRequest {
    id: string;
    employeeId: string;
    employeeName: string | null;
    type: LetterType;
    purpose: string;
    status: LetterStatus;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<LetterType, { label: string; icon: LucideIcon; color: string; bg: string }> = {
    SK_KERJA:          { label: "SK Kerja",              icon: Briefcase,  color: "text-blue-600",   bg: "bg-blue-50" },
    KET_PENGHASILAN:   { label: "Ket. Penghasilan",      icon: DollarSign, color: "text-green-600",  bg: "bg-green-50" },
    KET_MASIH_BEKERJA: { label: "Masih Aktif Bekerja",   icon: UserCheck,  color: "text-purple-600", bg: "bg-purple-50" },
    BPJS:              { label: "Keterangan BPJS",       icon: Shield,     color: "text-rose-600",   bg: "bg-rose-50" },
};

const STATUS_CONFIG: Record<LetterStatus, { label: string; badge: string; icon: LucideIcon }> = {
    PENDING:    { label: "Menunggu",     badge: "badge-warning", icon: Clock },
    PROCESSING: { label: "Diproses",     badge: "badge-info",    icon: Loader2 },
    READY:      { label: "Siap Diambil", badge: "badge-success", icon: CheckCircle },
    REJECTED:   { label: "Ditolak",      badge: "badge-error",   icon: XCircle },
};

const ITEMS_PER_PAGE = 10;

function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString("id-ID", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LetterRequestsPage() {
    const toast = useToast();

    const [requests, setRequests]       = useState<LetterRequest[]>([]);
    const [loading, setLoading]         = useState(true);
    const [search, setSearch]           = useState("");
    const [statusFilter, setStatusFilter] = useState<LetterStatus | "ALL">("ALL");
    const [typeFilter, setTypeFilter]   = useState<LetterType | "ALL">("ALL");
    const [currentPage, setCurrentPage] = useState(1);

    // Action modal
    const [actionTarget, setActionTarget]   = useState<LetterRequest | null>(null);
    const [actionType, setActionType]       = useState<"PROCESSING" | "READY" | "REJECTED">("PROCESSING");
    const [actionNotes, setActionNotes]     = useState("");
    const [submitting, setSubmitting]       = useState(false);

    // Detail modal
    const [detail, setDetail] = useState<LetterRequest | null>(null);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        fetch("/api/letter-requests")
            .then((r) => r.json())
            .then((data: LetterRequest[]) => { if (Array.isArray(data)) setRequests(data); })
            .catch(() => toast("Gagal memuat data surat", "error"))
            .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Filter Logic ──────────────────────────────────────────────────────────
    const filtered = requests.filter((r) => {
        if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
        if (typeFilter !== "ALL" && r.type !== typeFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            const nameMatch = r.employeeName?.toLowerCase().includes(q);
            const idMatch = r.employeeId.toLowerCase().includes(q);
            const purposeMatch = r.purpose.toLowerCase().includes(q);
            if (!nameMatch && !idMatch && !purposeMatch) return false;
        }
        return true;
    });

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
    const paginated  = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => { setCurrentPage(1); }, [search, statusFilter, typeFilter]);

    // ── Summary Stats ─────────────────────────────────────────────────────────
    const countByStatus = (s: LetterStatus) => requests.filter((r) => r.status === s).length;

    // ── Action Handler ────────────────────────────────────────────────────────
    const handleAction = async () => {
        if (!actionTarget) return;
        setSubmitting(true);

        try {
            const res = await fetch("/api/letter-requests", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: actionTarget.id,
                    status: actionType,
                    notes: actionNotes.trim() || null,
                }),
            });

            if (res.ok) {
                const updated = await res.json() as LetterRequest;
                setRequests((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
                setActionTarget(null);
                setActionNotes("");
                toast(`Status berhasil diubah ke "${STATUS_CONFIG[actionType].label}"`, "success");
            } else {
                const err = await res.json() as { error?: string };
                toast(err.error ?? "Gagal mengubah status", "error");
            }
        } catch {
            toast("Terjadi kesalahan koneksi", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const openAction = (req: LetterRequest, type: "PROCESSING" | "READY" | "REJECTED") => {
        setActionTarget(req);
        setActionType(type);
        setActionNotes(req.notes ?? "");
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[var(--primary)]" />
                    Manajemen Surat Karyawan
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Kelola permintaan surat keterangan dari karyawan
                </p>
            </div>

            {/* ── Summary Cards ───────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(["PENDING", "PROCESSING", "READY", "REJECTED"] as LetterStatus[]).map((s) => {
                    const cfg = STATUS_CONFIG[s];
                    const StatusIcon = cfg.icon;
                    return (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(statusFilter === s ? "ALL" : s)}
                            className={`card p-4 text-center transition-all cursor-pointer ${statusFilter === s ? "ring-2 ring-[var(--primary)] bg-[var(--primary)]/5" : "hover:shadow-md"}`}
                        >
                            <StatusIcon className={`w-5 h-5 mx-auto mb-2 ${s === "PENDING" ? "text-orange-500" : s === "PROCESSING" ? "text-blue-500" : s === "READY" ? "text-green-500" : "text-red-500"}`} />
                            <p className="text-2xl font-extrabold text-[var(--text-primary)]">{countByStatus(s)}</p>
                            <p className="text-xs text-[var(--text-muted)] font-semibold mt-0.5">{cfg.label}</p>
                        </button>
                    );
                })}
            </div>

            {/* ── Filters ─────────────────────────────────────────────────── */}
            <div className="card p-4">
                <div className="flex flex-wrap gap-3">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            className="form-input pl-10"
                            placeholder="Cari nama, ID, atau tujuan..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="relative min-w-[160px]">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <select
                            className="form-select pl-10"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as LetterType | "ALL")}
                        >
                            <option value="ALL">Semua Jenis</option>
                            {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Table ───────────────────────────────────────────────────── */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)] opacity-40" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="card p-12 text-center">
                    <FileText className="w-12 h-12 text-[var(--text-muted)] opacity-20 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Tidak ada permintaan surat ditemukan</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Coba ubah filter pencarian Anda</p>
                </div>
            ) : (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Karyawan</th>
                                    <th>Jenis Surat</th>
                                    <th className="hidden lg:table-cell">Tujuan</th>
                                    <th>Tanggal</th>
                                    <th>Status</th>
                                    <th className="text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginated.map((req) => {
                                    const typeCfg = TYPE_CONFIG[req.type];
                                    const statusCfg = STATUS_CONFIG[req.status];
                                    const TypeIcon = typeCfg.icon;
                                    const StatusIcon = statusCfg.icon;

                                    return (
                                        <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="font-medium">
                                                <div>
                                                    <p className="text-[var(--text-primary)]">{req.employeeName ?? req.employeeId}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)]">{req.employeeId}</p>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${typeCfg.bg}`}>
                                                        <TypeIcon className={`w-3.5 h-3.5 ${typeCfg.color}`} />
                                                    </div>
                                                    <span className="text-sm font-medium text-[var(--text-primary)]">{typeCfg.label}</span>
                                                </div>
                                            </td>
                                            <td className="hidden lg:table-cell">
                                                <p className="text-sm text-[var(--text-secondary)] line-clamp-2 max-w-[300px]">{req.purpose}</p>
                                            </td>
                                            <td className="text-sm text-[var(--text-secondary)]">
                                                {fmtDate(req.createdAt)}
                                            </td>
                                            <td>
                                                <span className={`badge ${statusCfg.badge} flex items-center gap-1 !w-fit`}>
                                                    <StatusIcon className={`w-3 h-3 ${req.status === "PROCESSING" ? "animate-spin" : ""}`} />
                                                    {statusCfg.label}
                                                </span>
                                            </td>
                                            <td className="text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => setDetail(req)}
                                                        className="btn btn-ghost btn-sm !p-1.5 text-[var(--primary)]"
                                                        title="Lihat Detail"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>

                                                    {req.status === "PENDING" && (
                                                        <>
                                                            <button
                                                                onClick={() => openAction(req, "PROCESSING")}
                                                                className="btn btn-sm bg-blue-500 text-white hover:bg-blue-600 !py-1 !px-2 text-[10px]"
                                                            >
                                                                Proses
                                                            </button>
                                                            <button
                                                                onClick={() => openAction(req, "REJECTED")}
                                                                className="btn btn-sm bg-red-500 text-white hover:bg-red-600 !py-1 !px-2 text-[10px]"
                                                            >
                                                                Tolak
                                                            </button>
                                                        </>
                                                    )}

                                                    {req.status === "PROCESSING" && (
                                                        <button
                                                            onClick={() => openAction(req, "READY")}
                                                            className="btn btn-sm bg-green-500 text-white hover:bg-green-600 !py-1 !px-2 text-[10px]"
                                                        >
                                                            <Check className="w-3 h-3" /> Selesai
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {filtered.length > ITEMS_PER_PAGE && (
                        <div className="px-6 py-3 border-t border-[var(--border)] bg-[#F9FAFB] flex items-center justify-between">
                            <span className="text-xs font-medium text-[var(--text-muted)]">
                                Hal {currentPage} dari {totalPages} ({filtered.length} data)
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    className="btn btn-ghost btn-sm !p-1.5"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage((p) => p - 1)}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    className="btn btn-ghost btn-sm !p-1.5"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage((p) => p + 1)}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Detail Modal ────────────────────────────────────────────── */}
            {detail && (
                <div className="modal-overlay" onClick={() => setDetail(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Detail Permintaan Surat</h2>
                            <button className="modal-close" onClick={() => setDetail(null)}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${TYPE_CONFIG[detail.type].bg}`}>
                                    {(() => { const I = TYPE_CONFIG[detail.type].icon; return <I className={`w-5 h-5 ${TYPE_CONFIG[detail.type].color}`} />; })()}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[var(--text-primary)]">{TYPE_CONFIG[detail.type].label}</p>
                                    <span className={`badge ${STATUS_CONFIG[detail.status].badge} mt-0.5`}>{STATUS_CONFIG[detail.status].label}</span>
                                </div>
                            </div>

                            <div className="space-y-3 bg-[var(--secondary)] rounded-xl p-4">
                                <div>
                                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Karyawan</p>
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">{detail.employeeName ?? detail.employeeId}</p>
                                    <p className="text-xs text-[var(--text-muted)]">{detail.employeeId}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Tujuan</p>
                                    <p className="text-sm text-[var(--text-secondary)]">{detail.purpose}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Diajukan</p>
                                        <p className="text-xs text-[var(--text-secondary)]">{fmtDate(detail.createdAt)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Terakhir Update</p>
                                        <p className="text-xs text-[var(--text-secondary)]">{fmtDate(detail.updatedAt)}</p>
                                    </div>
                                </div>
                                {detail.notes && (
                                    <div>
                                        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Catatan HR</p>
                                        <p className="text-sm text-[var(--text-secondary)]">{detail.notes}</p>
                                    </div>
                                )}
                            </div>

                            {/* Quick Actions from Detail */}
                            {detail.status === "PENDING" && (
                                <div className="flex gap-2">
                                    <button onClick={() => { setDetail(null); openAction(detail, "PROCESSING"); }} className="btn btn-primary flex-1">
                                        <Send className="w-4 h-4" /> Proses
                                    </button>
                                    <button onClick={() => { setDetail(null); openAction(detail, "REJECTED"); }} className="btn btn-secondary flex-1 !text-red-600">
                                        <XCircle className="w-4 h-4" /> Tolak
                                    </button>
                                </div>
                            )}
                            {detail.status === "PROCESSING" && (
                                <button onClick={() => { setDetail(null); openAction(detail, "READY"); }} className="btn btn-primary w-full">
                                    <CheckCircle className="w-4 h-4" /> Tandai Siap Diambil
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Action Modal ────────────────────────────────────────────── */}
            {actionTarget && (
                <div className="modal-overlay" onClick={() => { if (!submitting) setActionTarget(null); }}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                {actionType === "PROCESSING" ? "Proses Surat" : actionType === "READY" ? "Tandai Siap" : "Tolak Permintaan"}
                            </h2>
                            <button className="modal-close" onClick={() => setActionTarget(null)} disabled={submitting}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-[var(--secondary)] rounded-xl">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${TYPE_CONFIG[actionTarget.type].bg}`}>
                                    {(() => { const I = TYPE_CONFIG[actionTarget.type].icon; return <I className={`w-4 h-4 ${TYPE_CONFIG[actionTarget.type].color}`} />; })()}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-[var(--text-primary)]">{actionTarget.employeeName}</p>
                                    <p className="text-xs text-[var(--text-muted)]">{TYPE_CONFIG[actionTarget.type].label}</p>
                                </div>
                            </div>

                            {actionType === "REJECTED" && (
                                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                    <p className="text-xs text-red-600">
                                        Permintaan yang ditolak tidak dapat dikembalikan. Pastikan alasan penolakan sudah diisi.
                                    </p>
                                </div>
                            )}

                            <div className="form-group !mb-0">
                                <label className="form-label">Catatan untuk Karyawan (Opsional)</label>
                                <textarea
                                    className="form-textarea"
                                    rows={3}
                                    value={actionNotes}
                                    onChange={(e) => setActionNotes(e.target.value)}
                                    placeholder={
                                        actionType === "READY"
                                            ? "Contoh: Surat bisa diambil di meja HR. Bawa KTP untuk verifikasi."
                                            : actionType === "REJECTED"
                                              ? "Contoh: Data kepegawaian belum lengkap. Harap update profil terlebih dahulu."
                                              : "Contoh: Estimasi selesai 2 hari kerja."
                                    }
                                />
                            </div>

                            <div className="flex gap-2">
                                <button
                                    className="btn btn-secondary flex-1"
                                    onClick={() => setActionTarget(null)}
                                    disabled={submitting}
                                >
                                    Batal
                                </button>
                                <button
                                    className={`btn flex-1 ${actionType === "REJECTED" ? "bg-red-500 text-white hover:bg-red-600" : "btn-primary"}`}
                                    onClick={handleAction}
                                    disabled={submitting}
                                >
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {actionType === "PROCESSING" ? "Mulai Proses" : actionType === "READY" ? "Tandai Siap" : "Tolak Permintaan"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
