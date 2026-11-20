"use client";

import { useState, useEffect } from "react";
import {
    FileText, Send, Clock, CheckCircle, XCircle, Loader2,
    AlertCircle,
    Briefcase, DollarSign, UserCheck, Shield, Check, X,
    type LucideIcon,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import AccessibleModal from "@/components/ui/AccessibleModal";
import DataTablePagination from "@/components/ui/DataTablePagination";
import { StepperTimeline } from "@/components/ui/StepperTimeline";
import EmptyState from "@/components/ui/EmptyState";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import ListSkeleton from "@/components/ui/ListSkeleton";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge, { type StatusTone } from "@/components/ui/StatusBadge";
import { formatDisplayDateTime } from "@/lib/utils";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import DraftNotice from "@/components/ui/DraftNotice";
import { useEmployeeDraft } from "@/hooks/useEmployeeDraft";
import { isPlainObject } from "@/lib/formPersistence";

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
    SK_KERJA:          { label: "Surat Keterangan Kerja",  description: "Untuk keperluan bank, visa, atau instansi lain",    icon: Briefcase,  iconColor: "text-blue-600 dark:text-blue-400",    iconBg: "bg-blue-50 dark:bg-blue-950/40" },
    KET_PENGHASILAN:   { label: "Keterangan Penghasilan",  description: "Rincian gaji untuk keperluan kredit atau lainnya",   icon: DollarSign, iconColor: "text-green-600 dark:text-green-400",  iconBg: "bg-green-50 dark:bg-green-950/40" },
    KET_MASIH_BEKERJA: { label: "Masih Aktif Bekerja",     description: "Bukti masih berstatus karyawan aktif perusahaan",    icon: UserCheck,  iconColor: "text-purple-600 dark:text-purple-400", iconBg: "bg-purple-50 dark:bg-purple-950/40" },
    BPJS:              { label: "Surat Keterangan BPJS",   description: "Informasi keikutsertaan BPJS Kesehatan / TK",        icon: Shield,     iconColor: "text-rose-600 dark:text-rose-400",   iconBg: "bg-rose-50 dark:bg-rose-950/40" },
};

const STATUS_CONFIG: Record<LetterStatus, {
    label: string;
    tone: StatusTone;
    icon: LucideIcon;
    step: number;
}> = {
    PENDING:    { label: "Menunggu",     tone: "warning",  icon: Clock,         step: 1 },
    PROCESSING: { label: "Diproses",     tone: "info",     icon: Loader2,       step: 2 },
    READY:      { label: "Siap Diambil", tone: "success",  icon: CheckCircle,   step: 3 },
    REJECTED:   { label: "Ditolak",      tone: "danger",   icon: XCircle,       step: -1 },
};

const TIMELINE_STEPS = [
    { label: "Diajukan",    key: "PENDING" },
    { label: "Diproses HR", key: "PROCESSING" },
    { label: "Siap",        key: "READY" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
    const toast = useToast();

    const [requests, setRequests]         = useState<LetterRequest[]>([]);
    const [loadingList, setLoadingList]   = useState(true);
    const [showForm, setShowForm]         = useState(false);
    const [submitting, setSubmitting]     = useState(false);
    const [currentPage, setCurrentPage]   = useState(1);
    const [pageSize, setPageSize]         = useState(5);
    const [selectedType, setSelectedType] = useState<LetterType>("SK_KERJA");
    const [purpose, setPurpose]           = useState("");

    const {
        restored: letterDraftRestored,
        clearDraft: clearLetterDraft,
        discardDraft: discardLetterDraft,
    } = useEmployeeDraft<{ showForm: boolean; selectedType: LetterType; purpose: string }>({
        formKey: "documents:letter-request",
        value: { showForm, selectedType, purpose },
        isDirty: (draft) =>
            draft.purpose.trim().length > 0 || draft.selectedType !== "SK_KERJA",
        validate: (raw): raw is { showForm: boolean; selectedType: LetterType; purpose: string } =>
            isPlainObject(raw) &&
            typeof raw.showForm === "boolean" &&
            typeof raw.purpose === "string" &&
            (raw.selectedType === "SK_KERJA" ||
                raw.selectedType === "KET_PENGHASILAN" ||
                raw.selectedType === "KET_MASIH_BEKERJA" ||
                raw.selectedType === "BPJS"),
        onRestore: (draft) => {
            setSelectedType(draft.selectedType);
            setPurpose(draft.purpose);
            if (draft.showForm) {
                setShowForm(true);
            }
        },
    });

    // ── Fetch List ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const loadRequests = async () => {
            try {
                const res = await fetch("/api/letter-requests");
                if (!res.ok) {
                    throw new Error(await getResponseErrorMessage(res, "Gagal memuat data surat"));
                }

                const data = await res.json() as LetterRequest[];
                if (Array.isArray(data)) setRequests(data);
            } catch (err) {
                reportClientError("EmployeeDocumentsPage", "Gagal memuat data surat", err);
                toast(err instanceof Error ? err.message : "Gagal memuat data surat", "error");
            } finally {
                setLoadingList(false);
            }
        };

        void loadRequests();
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
            if (res.ok) {
                const data = await res.json() as LetterRequest;
                setRequests((prev) => [data, ...prev]);
                clearLetterDraft();
                setShowForm(false);
                setSelectedType("SK_KERJA");
                setPurpose("");
                toast("Permintaan surat berhasil dikirim ke HR!", "success");
            } else {
                toast(await getResponseErrorMessage(res, "Gagal mengirim permintaan"), "error");
            }
        } catch (error) {
            reportClientError("EmployeeDocumentsPage", "Gagal mengirim permintaan surat", error, { type: selectedType });
            toast("Permintaan surat belum terkirim karena koneksi bermasalah. Periksa internet lalu coba lagi.", "error");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Pagination ─────────────────────────────────────────────────────────────
    const totalPages = Math.ceil(requests.length / pageSize) || 1;
    const paginated  = requests.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
        <div className="space-y-5 animate-[fadeIn_0.5s_ease]">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <PageHeader
                title="Dokumen & Surat"
                subtitle="Ajukan permintaan surat keterangan ke HR"
                icon={FileText}
                action={
                    <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                        <Send className="w-4 h-4" />
                        Minta Surat
                    </button>
                }
            />

            {/* ── Info Banner ────────────────────────────────────────────────── */}
            <FeedbackMessage variant="info" title="Cara Kerja">
                <p>
                    Pilih jenis surat → Isi tujuan → Kirim ke HR.
                    Tim HR akan memproses dan menghubungi Anda saat surat siap diambil.
                    Estimasi proses: <strong>1–3 hari kerja</strong>.
                </p>
            </FeedbackMessage>

            {/* ── Form Modal ─────────────────────────────────────────────────── */}
            {showForm && (
                <AccessibleModal ariaLabel="Permintaan surat" onClose={() => setShowForm(false)}>
                    <div className="modal-header">
                        <h2 className="modal-title flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[var(--primary)]" />
                            Form Permintaan Surat
                        </h2>
                        <button className="modal-close" onClick={() => setShowForm(false)} aria-label="Tutup form permintaan surat">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <DraftNotice
                            compact
                            visible={letterDraftRestored}
                            onDiscard={() => {
                                discardLetterDraft();
                                setSelectedType("SK_KERJA");
                                setPurpose("");
                            }}
                        />
                        {/* Pilih Jenis Surat */}
                        <div className="form-group !mb-0">
                            <div className="flex items-center justify-between mb-2">
                                <label className="form-label !mb-0 font-semibold">Pilih Jenis Surat</label>
                                <span className="text-[11px] text-[var(--text-muted)]">Pilih salah satu</span>
                            </div>
                            <div className="grid grid-cols-1 gap-2.5" role="radiogroup" aria-label="Pilih Jenis Surat">
                                {(Object.entries(LETTER_TYPE_CONFIG) as [LetterType, typeof LETTER_TYPE_CONFIG[LetterType]][]).map(
                                    ([type, cfg]) => {
                                        const TypeIcon = cfg.icon;
                                        const isSelected = selectedType === type;
                                        return (
                                            <button
                                                key={type}
                                                type="button"
                                                role="radio"
                                                aria-checked={isSelected}
                                                onClick={() => setSelectedType(type)}
                                                className={`group relative flex items-center justify-between gap-3 p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                                                    isSelected
                                                        ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                                                        : "border-[var(--border)] bg-[var(--card)] hover:border-[color-mix(in_srgb,var(--primary)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--secondary)_40%,transparent)]"
                                                }`}
                                            >
                                                <div className="flex items-start gap-3 min-w-0">
                                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                                        isSelected ? "bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]" : `${cfg.iconBg} ${cfg.iconColor}`
                                                    }`}>
                                                        <TypeIcon className="w-4.5 h-4.5" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className={`text-xs font-bold transition-colors ${
                                                                isSelected ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
                                                            }`}>
                                                                {cfg.label}
                                                            </p>
                                                            {isSelected && (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--primary)] text-white">
                                                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                                    Dipilih
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 line-clamp-1">
                                                            {cfg.description}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="shrink-0 pl-2">
                                                    {isSelected ? (
                                                        <div className="w-6 h-6 rounded-full bg-[var(--primary)] text-white flex items-center justify-center">
                                                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-6 h-6 rounded-full border-2 border-[var(--border)] group-hover:border-[var(--text-muted)] transition-colors" />
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    }
                                )}
                            </div>

                            {/* Active Selection Summary Callout */}
                            <div className="mt-3 p-3 rounded-xl border border-[color-mix(in_srgb,var(--primary)_25%,transparent)] bg-[color-mix(in_srgb,var(--primary)_5%,transparent)] flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-7 h-7 rounded-lg bg-[var(--primary)] text-white flex items-center justify-center shrink-0">
                                        <Check className="w-4 h-4 stroke-[2.5]" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-[var(--text-muted)] font-medium">Surat yang dipilih:</p>
                                        <p className="text-xs font-bold text-[var(--primary)] truncate">
                                            {LETTER_TYPE_CONFIG[selectedType]?.label}
                                        </p>
                                    </div>
                                </div>
                                <StatusBadge tone="info" className="shrink-0">
                                    Siap Dibuat
                                </StatusBadge>
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
                </AccessibleModal>
            )}

            {/* ── Riwayat ────────────────────────────────────────────────────── */}
            <div className="space-y-3">
                <h2 className="emp-eyebrow flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Riwayat Permintaan
                    {requests.length > 0 && (
                        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 font-bold text-[var(--text-muted)]">
                            {requests.length}
                        </span>
                    )}
                </h2>

                {loadingList ? (
                    <ListSkeleton label="Memuat riwayat permintaan" />
                ) : requests.length === 0 ? (
                    <EmptyState
                        icon={FileText}
                        title="Belum ada permintaan surat"
                        description={'Gunakan tombol "Minta Surat" untuk membuat permintaan baru.'}
                    />
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
                                    <div key={req.id} className="emp-surface p-4 space-y-3">
                                        {/* Top Row */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${typeCfg.iconBg}`}>
                                                    <TypeIcon className={`w-4 h-4 ${typeCfg.iconColor}`} />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-[var(--text-primary)]">{typeCfg.label}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)]">{formatDisplayDateTime(req.createdAt)}</p>
                                                </div>
                                            </div>
                                            <StatusBadge tone={statusCfg.tone} icon={StatusIcon} className="shrink-0">
                                                {statusCfg.label}
                                            </StatusBadge>
                                        </div>

                                        {/* Tujuan */}
                                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                                            {req.purpose}
                                        </p>

                                        {/* Timeline Progress */}
                                        {req.status !== "REJECTED" && (
                                            <StepperTimeline
                                                steps={TIMELINE_STEPS.map((step, idx) => ({
                                                    label: step.label,
                                                    state:
                                                        currentStep > idx + 1
                                                            ? "done"
                                                            : currentStep === idx + 1
                                                              ? "active"
                                                              : "todo",
                                                }))}
                                            />
                                        )}

                                        {/* Status Rejected Banner */}
                                        {req.status === "REJECTED" && (
                                            <FeedbackMessage variant="error" compact>
                                                Permintaan ini ditolak oleh HR
                                            </FeedbackMessage>
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

                        <DataTablePagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={requests.length}
                            pageSize={pageSize}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                            pageSizeOptions={[5, 10, 20]}
                            itemLabel="permintaan"
                        />
                    </>
                )}
            </div>
        </div>
    );
}
