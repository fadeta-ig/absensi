"use client";

import { useState, useEffect } from "react";
import {
    FileText, Send, Clock, CheckCircle, XCircle, Loader2,
    ChevronLeft, ChevronRight, AlertCircle, Info,
    Briefcase, DollarSign, UserCheck, Shield, Check,
    type LucideIcon,
} from "lucide-react";
import { useToast } from "@/components/Toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type LetterType = "SK_KERJA" | "KET_PENGHASILAN" | "KET_MASIH_BEKERJA" | "BPJS";
type LetterStatus = "PENDING" | "PROCESSING" | "READY" | "REJECTED";

interface LetterRequest {
    id: string;
    type: LetterType;
    purpose: string;
    status: LetterStatus;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LETTER_TYPE_CONFIG: Record<LetterType, {
    label: string;
    description: string;
    icon: LucideIcon;
    iconColor: string;
    iconBg: string;
}> = {
    SK_KERJA:          { label: "Surat Keterangan Kerja",  description: "Untuk keperluan bank, visa, atau instansi lain",    icon: Briefcase,  iconColor: "text-blue-600",   iconBg: "bg-blue-50" },
    KET_PENGHASILAN:   { label: "Keterangan Penghasilan",  description: "Rincian gaji untuk keperluan kredit atau lainnya",   icon: DollarSign, iconColor: "text-green-600",  iconBg: "bg-green-50" },
    KET_MASIH_BEKERJA: { label: "Masih Aktif Bekerja",     description: "Bukti masih berstatus karyawan aktif perusahaan",    icon: UserCheck,  iconColor: "text-purple-600", iconBg: "bg-purple-50" },
    BPJS:              { label: "Surat Keterangan BPJS",   description: "Informasi keikutsertaan BPJS Kesehatan / TK",        icon: Shield,     iconColor: "text-rose-600",   iconBg: "bg-rose-50" },
};

const STATUS_CONFIG: Record<LetterStatus, {
    label: string;
    badge: string;
    icon: LucideIcon;
    step: number;
}> = {
    PENDING:    { label: "Menunggu",     badge: "badge-warning", icon: Clock,         step: 1 },
    PROCESSING: { label: "Diproses",     badge: "badge-info",    icon: Loader2,       step: 2 },
    READY:      { label: "Siap Diambil", badge: "badge-success", icon: CheckCircle,   step: 3 },
    REJECTED:   { label: "Ditolak",      badge: "badge-error",   icon: XCircle,       step: -1 },
};

const TIMELINE_STEPS = [
    { label: "Diajukan",    key: "PENDING" },
    { label: "Diproses HR", key: "PROCESSING" },
    { label: "Siap",        key: "READY" },
];

const ITEMS_PER_PAGE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(isoStr: string): string {
    return new Date(isoStr).toLocaleDateString("id-ID", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
    const toast = useToast();

    const [requests, setRequests]         = useState<LetterRequest[]>([]);
    const [loadingList, setLoadingList]   = useState(true);
    const [showForm, setShowForm]         = useState(false);
    const [submitting, setSubmitting]     = useState(false);
    const [currentPage, setCurrentPage]   = useState(1);
    const [selectedType, setSelectedType] = useState<LetterType>("SK_KERJA");
    const [purpose, setPurpose]           = useState("");

    // ── Fetch List ─────────────────────────────────────────────────────────────
    useEffect(() => {
        fetch("/api/letter-requests")
            .then((r) => r.json())
            .then((data: LetterRequest[]) => { if (Array.isArray(data)) setRequests(data); })
            .catch(() => toast("Gagal memuat data surat", "error"))
            .finally(() => setLoadingList(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Submit ─────────────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!purpose.trim()) { toast("Tujuan surat harus diisi", "warning"); return; }
        setSubmitting(true);

        try {
            const res  = await fetch("/api/letter-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: selectedType, purpose }),
            });
            const data = await res.json() as LetterRequest & { error?: string };

            if (res.ok) {
                setRequests((prev) => [data, ...prev]);
                setShowForm(false);
                setPurpose("");
                toast("Permintaan surat berhasil dikirim ke HR!", "success");
            } else {
                toast(data.error ?? "Gagal mengirim permintaan", "error");
            }
        } catch {
            toast("Terjadi kesalahan koneksi", "error");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Pagination ─────────────────────────────────────────────────────────────
    const totalPages = Math.ceil(requests.length / ITEMS_PER_PAGE) || 1;
    const paginated  = requests.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease] pb-20 lg:pb-0">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <FileText className="w-5 h-5 text-[var(--primary)]" />
                        Dokumen &amp; Surat
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Ajukan permintaan surat keterangan ke HR
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm((p) => !p)}>
                    <Send className="w-4 h-4" />
                    {showForm ? "Tutup Form" : "Minta Surat"}
                </button>
            </div>

            {/* ── Info Banner ────────────────────────────────────────────────── */}
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                    <p className="font-semibold">Cara Kerja</p>
                    <p className="text-xs text-blue-600 mt-1">
                        Pilih jenis surat → Isi tujuan → Kirim ke HR.
                        Tim HR akan memproses dan menghubungi Anda saat surat siap diambil.
                        Estimasi proses: <strong>1–3 hari kerja</strong>.
                    </p>
                </div>
            </div>

            {/* ── Form ───────────────────────────────────────────────────────── */}
            {showForm && (
                <div className="card p-6 border-2 border-[var(--primary)]/20 shadow-xl">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[var(--primary)]" />
                        Form Permintaan Surat
                    </h3>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Pilih Jenis Surat */}
                        <div className="form-group !mb-0">
                            <label className="form-label">Jenis Surat</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {(Object.entries(LETTER_TYPE_CONFIG) as [LetterType, typeof LETTER_TYPE_CONFIG[LetterType]][]).map(
                                    ([type, cfg]) => {
                                        const TypeIcon = cfg.icon;
                                        const isSelected = selectedType === type;
                                        return (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => setSelectedType(type)}
                                                className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                                                    isSelected
                                                        ? "border-[var(--primary)] bg-[var(--primary)]/5"
                                                        : "border-[var(--border)] hover:border-[var(--primary)]/40 hover:bg-[var(--secondary)]"
                                                }`}
                                            >
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.iconBg}`}>
                                                    <TypeIcon className={`w-4 h-4 ${cfg.iconColor}`} />
                                                </div>
                                                <div>
                                                    <p className={`text-xs font-bold ${isSelected ? "text-[var(--primary)]" : "text-[var(--text-primary)]"}`}>
                                                        {cfg.label}
                                                    </p>
                                                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{cfg.description}</p>
                                                </div>
                                            </button>
                                        );
                                    }
                                )}
                            </div>
                        </div>

                        {/* Tujuan */}
                        <div className="form-group !mb-0">
                            <label className="form-label">Tujuan Penggunaan Surat</label>
                            <textarea
                                className="form-textarea"
                                rows={3}
                                value={purpose}
                                onChange={(e) => setPurpose(e.target.value)}
                                placeholder="Contoh: Untuk pengajuan kredit pemilikan rumah di Bank BCA atas nama saya..."
                                required
                            />
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">
                                Mohon jelaskan tujuan spesifik agar HR dapat menyesuaikan isi surat.
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || !purpose.trim()}
                            className="btn btn-primary w-full"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {submitting ? "Mengirim..." : "Kirim Permintaan ke HR"}
                        </button>
                    </form>
                </div>
            )}

            {/* ── Riwayat ────────────────────────────────────────────────────── */}
            <div className="space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--primary)]" />
                    Riwayat Permintaan
                    {requests.length > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--secondary)] text-[var(--text-muted)]">
                            {requests.length}
                        </span>
                    )}
                </h2>

                {loadingList ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin text-[var(--primary)] opacity-50" />
                    </div>
                ) : requests.length === 0 ? (
                    <div className="card p-8 text-center">
                        <FileText className="w-10 h-10 text-[var(--text-muted)] opacity-20 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada permintaan surat</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            Gunakan tombol &quot;Minta Surat&quot; untuk membuat permintaan baru.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-3">
                            {paginated.map((req) => {
                                const typeCfg   = LETTER_TYPE_CONFIG[req.type];
                                const statusCfg = STATUS_CONFIG[req.status];
                                const TypeIcon   = typeCfg.icon;
                                const StatusIcon = statusCfg.icon;
                                const currentStep = statusCfg.step;

                                return (
                                    <div key={req.id} className="card p-4 space-y-3">
                                        {/* Top Row */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${typeCfg.iconBg}`}>
                                                    <TypeIcon className={`w-4 h-4 ${typeCfg.iconColor}`} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-[var(--text-primary)]">{typeCfg.label}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)]">{fmtDate(req.createdAt)}</p>
                                                </div>
                                            </div>
                                            <span className={`badge ${statusCfg.badge} flex items-center gap-1 shrink-0`}>
                                                <StatusIcon className="w-3 h-3" />
                                                {statusCfg.label}
                                            </span>
                                        </div>

                                        {/* Tujuan */}
                                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                                            {req.purpose}
                                        </p>

                                        {/* Timeline Progress */}
                                        {req.status !== "REJECTED" && (
                                            <div className="flex items-center gap-1 pt-1 border-t border-[var(--border)]">
                                                {TIMELINE_STEPS.map((step, idx) => {
                                                    const isCompleted = currentStep > idx + 1;
                                                    const isActive    = currentStep === idx + 1;
                                                    return (
                                                        <div key={step.key} className="flex items-center flex-1">
                                                            <div className="flex-1 flex flex-col items-center gap-0.5">
                                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                                                    isCompleted ? "bg-green-500 text-white" :
                                                                    isActive    ? "bg-[var(--primary)] text-white" :
                                                                                  "bg-gray-100 text-gray-400"
                                                                }`}>
                                                                    {isCompleted
                                                                        ? <Check className="w-2.5 h-2.5" />
                                                                        : <span className="text-[9px] font-bold">{idx + 1}</span>
                                                                    }
                                                                </div>
                                                                <p className={`text-[9px] font-semibold text-center leading-tight ${
                                                                    isCompleted ? "text-green-600" :
                                                                    isActive    ? "text-[var(--primary)]" :
                                                                                  "text-gray-400"
                                                                }`}>
                                                                    {step.label}
                                                                </p>
                                                            </div>
                                                            {idx < TIMELINE_STEPS.length - 1 && (
                                                                <div className={`h-px flex-1 mx-1 mb-3 transition-colors ${isCompleted ? "bg-green-300" : "bg-gray-200"}`} />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Status Rejected Banner */}
                                        {req.status === "REJECTED" && (
                                            <div className="flex items-center gap-2 p-2.5 bg-red-50 rounded-lg border border-red-100">
                                                <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                                <p className="text-[11px] text-red-600 font-medium">Permintaan ini ditolak oleh HR</p>
                                            </div>
                                        )}

                                        {/* Notes dari HR */}
                                        {req.notes && (
                                            <div className="flex items-start gap-2 p-2.5 bg-[var(--secondary)] rounded-lg">
                                                <AlertCircle className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mt-0.5" />
                                                <p className="text-xs text-[var(--text-secondary)]">
                                                    <span className="font-semibold">Catatan HR: </span>{req.notes}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {requests.length > ITEMS_PER_PAGE && (
                            <div className="flex items-center justify-between px-2 py-2">
                                <button
                                    className="btn btn-secondary btn-sm"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage((p) => p - 1)}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-xs font-medium text-[var(--text-muted)]">
                                    Hal {currentPage} dari {totalPages}
                                </span>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage((p) => p + 1)}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
