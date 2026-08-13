"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    FileEdit, Send, Clock, CheckCircle, XCircle, Loader2,
    Calendar, AlertCircle, ClipboardCheck, ChevronLeft, ChevronRight
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CorrectionRequest {
    id: string;
    targetDate: string;
    proposedClockIn: string | null;
    proposedClockOut: string | null;
    reason: string;
    attachmentUrl: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED";
    createdAt: string;
}

interface FormState {
    targetDate: string;
    proposedClockIn: string;
    proposedClockOut: string;
    reason: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 6;

const STATUS_CONFIG: Record<CorrectionRequest["status"], { label: string; badge: string; icon: typeof CheckCircle }> = {
    PENDING:  { label: "Menunggu",  badge: "badge-warning", icon: Clock },
    APPROVED: { label: "Disetujui", badge: "badge-success", icon: CheckCircle },
    REJECTED: { label: "Ditolak",   badge: "badge-error",   icon: XCircle },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

function fmtDateTime(isoStr: string): string {
    return new Date(isoStr).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Pastikan tanggal target tidak hari ini atau masa depan */
function isValidTargetDate(dateStr: string): boolean {
    if (!dateStr) return false;
    const target = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return target < today;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AttendanceCorrectionPage() {
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [requests, setRequests] = useState<CorrectionRequest[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const [form, setForm] = useState<FormState>({
        targetDate:       yesterdayStr,
        proposedClockIn:  "",
        proposedClockOut: "",
        reason:           "",
    });

    const [attachmentBase64, setAttachmentBase64] = useState<string | null>(null);
    const [attachmentName, setAttachmentName] = useState<string | null>(null);

    // ── Fetch List ─────────────────────────────────────────────────────────────
    const fetchList = useCallback(async () => {
        setLoadingList(true);
        try {
            const res = await fetch("/api/attendance/correction");
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat data koreksi"));
            }

            const data = await res.json() as CorrectionRequest[];
            if (Array.isArray(data)) {
                setRequests(data.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
            }
        } catch (err) {
            reportClientError("AttendanceCorrectionPage", "Gagal memuat data koreksi absensi", err);
            toast(err instanceof Error ? err.message : "Gagal memuat data koreksi", "error");
        } finally {
            setLoadingList(false);
        }
    }, [toast]);

    useEffect(() => { fetchList(); }, [fetchList]);

    // ── File Handler ───────────────────────────────────────────────────────────
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            toast("File maksimal 2MB", "warning");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setAttachmentBase64(reader.result as string);
            setAttachmentName(file.name);
            toast("Dokumen berhasil dilampirkan", "success");
        };
        reader.onerror = () => toast("Gagal membaca file", "error");
        reader.readAsDataURL(file);
    }, [toast]);

    // ── Submit Handler ─────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Client-side validasi tanggal
        if (!isValidTargetDate(form.targetDate)) {
            toast("Tanggal koreksi tidak boleh hari ini atau masa depan", "warning");
            return;
        }

        // Minimal salah satu jam harus diisi
        if (!form.proposedClockIn && !form.proposedClockOut) {
            toast("Isi minimal satu: Jam Masuk atau Jam Keluar yang diajukan", "warning");
            return;
        }

        setSubmitting(true);

        try {
            const res = await fetch("/api/attendance/correction", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    targetDate:       form.targetDate,
                    proposedClockIn:  form.proposedClockIn  ? `${form.targetDate}T${form.proposedClockIn}:00` : null,
                    proposedClockOut: form.proposedClockOut ? `${form.targetDate}T${form.proposedClockOut}:00` : null,
                    reason:           form.reason,
                    attachmentUrl:    attachmentBase64 ?? null,
                }),
            });

            if (!res.ok) {
                toast(await getResponseErrorMessage(res, "Gagal mengirim pengajuan koreksi."), "error");
                return;
            }

            const data = await res.json() as CorrectionRequest;
            setRequests((prev) => [data, ...prev]);
            setShowForm(false);
            setForm({ targetDate: yesterdayStr, proposedClockIn: "", proposedClockOut: "", reason: "" });
            setAttachmentBase64(null);
            setAttachmentName(null);
            toast("Pengajuan koreksi berhasil dikirim!", "success");
        } catch (error) {
            reportClientError("AttendanceCorrectionPage", "Gagal mengirim koreksi absensi", error, { targetDate: form.targetDate });
            toast("Pengajuan koreksi belum terkirim karena koneksi bermasalah. Periksa internet lalu coba lagi.", "error");
        } finally {
            setSubmitting(false);
        }
    };

    // ── Pagination ─────────────────────────────────────────────────────────────
    const totalPages = Math.ceil(requests.length / ITEMS_PER_PAGE) || 1;
    const paginated = requests.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease] pb-20 lg:pb-0">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <FileEdit className="w-5 h-5 text-[var(--primary)]" />
                        Koreksi Absensi
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Ajukan koreksi jam masuk/keluar yang terlewat atau salah
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => setShowForm((prev) => !prev)}
                >
                    <Send className="w-4 h-4" />
                    Ajukan Koreksi
                </button>
            </div>

            {/* ── Info Box ───────────────────────────────────────────────────── */}
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                    <p className="font-semibold">Syarat Pengajuan Koreksi</p>
                    <ul className="mt-1 space-y-0.5 text-xs list-disc list-inside text-amber-700">
                        <li>Hanya untuk tanggal <strong>sebelum hari ini</strong></li>
                        <li>Sertakan alasan yang jelas dan bukti jika tersedia</li>
                        <li>Pengajuan akan diverifikasi oleh atasan atau HR</li>
                    </ul>
                </div>
            </div>

            {/* ── Form ───────────────────────────────────────────────────────── */}
            {showForm && (
                <div className="card p-6 border-2 border-[var(--primary)]/20 shadow-xl">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                        <ClipboardCheck className="w-4 h-4 text-[var(--primary)]" />
                        Form Koreksi Absensi
                    </h3>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Tanggal Target */}
                        <div className="form-group !mb-0">
                            <label className="form-label flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> Tanggal yang Dikoreksi
                            </label>
                            <input
                                type="date"
                                className="form-input"
                                value={form.targetDate}
                                max={yesterdayStr}
                                onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
                                required
                            />
                            {form.targetDate && !isValidTargetDate(form.targetDate) && (
                                <p className="text-[10px] text-red-500 mt-1 font-medium">
                                    ⚠️ Tanggal tidak boleh hari ini atau masa depan
                                </p>
                            )}
                        </div>

                        {/* Jam yang diajukan */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-group !mb-0">
                                <label className="form-label flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Jam Masuk (Diajukan)
                                </label>
                                <input
                                    type="time"
                                    className="form-input"
                                    value={form.proposedClockIn}
                                    onChange={(e) => setForm((f) => ({ ...f, proposedClockIn: e.target.value }))}
                                />
                                <p className="text-[10px] text-[var(--text-muted)] mt-1">Kosongkan jika sudah benar</p>
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Jam Keluar (Diajukan)
                                </label>
                                <input
                                    type="time"
                                    className="form-input"
                                    value={form.proposedClockOut}
                                    onChange={(e) => setForm((f) => ({ ...f, proposedClockOut: e.target.value }))}
                                />
                                <p className="text-[10px] text-[var(--text-muted)] mt-1">Kosongkan jika sudah benar</p>
                            </div>
                        </div>

                        {/* Alasan */}
                        <div className="form-group !mb-0">
                            <label className="form-label">Alasan / Keterangan</label>
                            <textarea
                                className="form-textarea"
                                rows={3}
                                value={form.reason}
                                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                                placeholder="Jelaskan alasan koreksi dengan jelas (misal: lupa clock-out, gangguan sistem, dll.)"
                                required
                            />
                        </div>

                        {/* Bukti (opsional) */}
                        <div className="form-group !mb-0">
                            <label className="form-label">Lampiran Bukti (Opsional)</label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,.pdf"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center justify-center gap-2 w-full p-3 border-2 border-dashed border-[var(--border)] rounded-lg hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
                            >
                                {attachmentName
                                    ? <span className="text-green-600 font-medium text-xs">✅ {attachmentName}</span>
                                    : "Klik untuk lampirkan foto/dokumen (maks 2MB)"
                                }
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="btn btn-primary w-full"
                        >
                            {submitting
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Send className="w-4 h-4" />
                            }
                            {submitting ? "Mengirim..." : "Kirim Pengajuan Koreksi"}
                        </button>
                    </form>
                </div>
            )}

            {/* ── List ───────────────────────────────────────────────────────── */}
            <div className="space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-[var(--primary)]" />
                    Riwayat Pengajuan
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
                        <FileEdit className="w-10 h-10 text-[var(--text-muted)] opacity-20 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada pengajuan koreksi</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            Gunakan tombol &quot;Ajukan Koreksi&quot; di atas untuk membuat pengajuan baru.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            {paginated.map((req) => {
                                const cfg = STATUS_CONFIG[req.status];
                                const StatusIcon = cfg.icon;
                                return (
                                    <div key={req.id} className="card p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Calendar className="w-4 h-4 text-[var(--primary)] shrink-0" />
                                                    <p className="text-sm font-bold text-[var(--text-primary)]">
                                                        {fmtDate(req.targetDate)}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] font-mono">
                                                    <span>
                                                        Masuk: <strong className="text-[var(--text-secondary)]">
                                                            {req.proposedClockIn
                                                                ? new Date(req.proposedClockIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
                                                                : "—"
                                                            }
                                                        </strong>
                                                    </span>
                                                    <span>
                                                        Keluar: <strong className="text-[var(--text-secondary)]">
                                                            {req.proposedClockOut
                                                                ? new Date(req.proposedClockOut).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
                                                                : "—"
                                                            }
                                                        </strong>
                                                    </span>
                                                </div>
                                            </div>
                                            <span className={`badge ${cfg.badge} flex items-center gap-1 shrink-0`}>
                                                <StatusIcon className="w-3 h-3" />
                                                {cfg.label}
                                            </span>
                                        </div>

                                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                                            {req.reason}
                                        </p>

                                        <p className="text-[10px] text-[var(--text-muted)]">
                                            Diajukan: {fmtDateTime(req.createdAt)}
                                        </p>
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
