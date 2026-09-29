"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
    FileEdit, Send, Clock, CheckCircle, XCircle, Loader2,
    Calendar, AlertCircle, ClipboardCheck, ChevronLeft, ChevronRight
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { useAttendanceServerContext } from "@/hooks/useAttendanceServerContext";

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
    const d = new Date(`${dateStr}T00:00:00+07:00`);
    return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "long", year: "numeric" }).format(d);
}

function fmtDateTime(isoStr: string): string {
    return `${new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(isoStr))} WIB`;
}

function fmtWibTime(isoStr: string | null): string {
    if (!isoStr) return "—";
    return `${new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(isoStr))} WIB`;
}

function shiftCalendarDate(dateStr: string, amount: number): string {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Pastikan tanggal target tidak hari ini atau masa depan menurut WIB server. */
function isValidTargetDate(dateStr: string, serverDate?: string): boolean {
    if (!dateStr) return false;
    return Boolean(serverDate && dateStr < serverDate);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AttendanceCorrectionPage() {
    const toast = useToast();
    const serverContext = useAttendanceServerContext();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const submitLockRef = useRef(false);

    const [requests, setRequests] = useState<CorrectionRequest[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const serverDate = serverContext.context?.serverWibDate ?? "";
    const yesterdayStr = serverDate ? shiftCalendarDate(serverDate, -1) : "";

    const [form, setForm] = useState<FormState>({
        targetDate:       yesterdayStr,
        proposedClockIn:  "",
        proposedClockOut: "",
        reason:           "",
    });

    const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
    const [attachmentName, setAttachmentName] = useState<string | null>(null);
    const [clockOutIsNextDay, setClockOutIsNextDay] = useState(false);
    const [shiftSchedule, setShiftSchedule] = useState<{
        startTime: string; endTime: string; isOff: boolean; isOvernight: boolean; shiftName: string;
    } | null>(null);

    // Jadwal shift tanggal target: menentukan otomatis apakah jam masuk H+1.
    useEffect(() => {
        if (!form.targetDate || !isValidTargetDate(form.targetDate, serverDate)) {
            setShiftSchedule(null);
            return;
        }
        let cancelled = false;
        fetch(`/api/attendance/shift-schedule?date=${form.targetDate}`, { cache: "no-store" })
            .then(async (res) => {
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setShiftSchedule(data.schedule ?? null);
            })
            .catch(() => { if (!cancelled) setShiftSchedule(null); });
        return () => { cancelled = true; };
    }, [form.targetDate, serverDate]);

    // Jam 00:xx-07:xx pada shift malam otomatis milik H+1 dari tanggal target.
    const clockInDate = useMemo(() => {
        if (
            shiftSchedule && !shiftSchedule.isOff && shiftSchedule.isOvernight &&
            form.proposedClockIn && form.proposedClockIn <= shiftSchedule.endTime
        ) {
            return shiftCalendarDate(form.targetDate, 1);
        }
        return form.targetDate;
    }, [shiftSchedule, form.proposedClockIn, form.targetDate]);

    useEffect(() => {
        if (!yesterdayStr || form.targetDate) return;
        setForm((current) => ({ ...current, targetDate: yesterdayStr }));
    }, [form.targetDate, yesterdayStr]);

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
            reportClientError("AttendanceCorrectionPage", "Gagal memuat data koreksi presensi", err);
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

        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
        if (!allowedTypes.includes(file.type)) {
            toast("Format file harus JPG, PNG, WEBP, atau PDF", "warning");
            return;
        }

        setAttachmentFile(file);
        setAttachmentName(file.name);
        toast("Dokumen berhasil dilampirkan", "success");
    }, [toast]);

    // ── Submit Handler ─────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Client-side validasi tanggal
        if (submitLockRef.current) return;
        if (!serverContext.isOnline || !serverContext.isFresh || !serverDate) {
            toast("Konteks waktu server belum segar. Sambungkan perangkat ke internet lalu coba lagi.", "warning");
            return;
        }

        if (!isValidTargetDate(form.targetDate, serverDate)) {
            toast("Tanggal koreksi tidak boleh hari ini atau masa depan", "warning");
            return;
        }

        // Minimal salah satu jam harus diisi
        if (!form.proposedClockIn && !form.proposedClockOut) {
            toast("Isi minimal satu: Jam Masuk atau Jam Keluar yang diajukan", "warning");
            return;
        }

        submitLockRef.current = true;
        setSubmitting(true);

        try {
            let attachmentUrl: string | null = null;
            if (attachmentFile) {
                const uploadData = new FormData();
                uploadData.append("file", attachmentFile);
                const uploadResponse = await fetch("/api/attendance/correction/upload", { method: "POST", body: uploadData });
                if (!uploadResponse.ok) {
                    toast(await getResponseErrorMessage(uploadResponse, "Gagal mengunggah lampiran."), "error");
                    return;
                }
                attachmentUrl = (await uploadResponse.json() as { url: string }).url;
            }

            const res = await fetch("/api/attendance/correction", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    targetDate:       form.targetDate,
                    proposedClockIn:  form.proposedClockIn  ? `${clockInDate}T${form.proposedClockIn}:00+07:00` : null,
                    proposedClockOut: form.proposedClockOut
                        ? `${clockOutIsNextDay ? shiftCalendarDate(form.targetDate, 1) : form.targetDate}T${form.proposedClockOut}:00+07:00`
                        : null,
                    reason:           form.reason,
                    attachmentUrl,
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
            setAttachmentFile(null);
            setAttachmentName(null);
            setClockOutIsNextDay(false);
            toast("Pengajuan koreksi berhasil dikirim!", "success");
        } catch (error) {
            reportClientError("AttendanceCorrectionPage", "Gagal mengirim koreksi presensi", error, { targetDate: form.targetDate });
            toast("Pengajuan koreksi belum terkirim karena koneksi bermasalah. Periksa internet lalu coba lagi.", "error");
        } finally {
            setSubmitting(false);
            submitLockRef.current = false;
        }
    };

    // ── Pagination ─────────────────────────────────────────────────────────────
    const totalPages = Math.ceil(requests.length / ITEMS_PER_PAGE) || 1;
    const paginated = requests.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <FileEdit className="w-5 h-5 text-[var(--primary)]" />
                        Koreksi Presensi
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Ajukan koreksi jam masuk/keluar yang terlewat atau salah
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => setShowForm((prev) => !prev)}
                    disabled={!serverContext.isOnline || !serverContext.isFresh}
                >
                    <Send className="w-4 h-4" />
                    Ajukan Koreksi
                </button>
            </div>

            {(!serverContext.isFresh || !serverContext.isOnline) && (
                <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300" role="status">
                    <span>
                        {serverContext.isOnline ? "Konteks waktu server belum segar." : "Perangkat offline."} Pengajuan koreksi dinonaktifkan sampai waktu server dapat diverifikasi.
                    </span>
                    <button type="button" onClick={() => void serverContext.refresh()} className="font-bold text-[var(--primary)] shrink-0">Coba lagi</button>
                </div>
            )}

            {/* ── Info Box ───────────────────────────────────────────────────── */}
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                    <p className="font-semibold">Syarat Pengajuan Koreksi</p>
                    <ul className="mt-1 space-y-0.5 text-xs list-disc list-inside text-amber-700">
                        <li>Hanya untuk tanggal <strong>sebelum hari ini</strong></li>
                        <li>Sertakan alasan yang jelas dan bukti jika tersedia</li>
                        <li>Pengajuan akan diverifikasi oleh HR</li>
                    </ul>
                </div>
            </div>

            {/* ── Form ───────────────────────────────────────────────────────── */}
            {showForm && (
                <div className="card p-6 border-2 border-[var(--primary)]/20 shadow-xl">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                        <ClipboardCheck className="w-4 h-4 text-[var(--primary)]" />
                        Form Koreksi Presensi
                    </h3>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Tanggal Target */}
                        <div className="form-group !mb-0">
                            <label htmlFor="correction-target-date" className="form-label flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> Tanggal yang Dikoreksi
                            </label>
                            <input
                                type="date"
                                id="correction-target-date"
                                className="form-input"
                                value={form.targetDate}
                                max={yesterdayStr || undefined}
                                onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
                                required
                            />
                            {form.targetDate && !isValidTargetDate(form.targetDate, serverDate) && (
                                <p className="text-[10px] text-red-500 mt-1 font-medium flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 shrink-0" /> Tanggal tidak boleh hari ini atau masa depan
                                </p>
                            )}
                        </div>

                        {/* Jam yang diajukan */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="form-group !mb-0">
                                <label htmlFor="correction-clock-in" className="form-label flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Jam Masuk (Diajukan)
                                </label>
                                <input
                                    type="time"
                                    id="correction-clock-in"
                                    className="form-input"
                                    value={form.proposedClockIn}
                                    onChange={(e) => setForm((f) => ({ ...f, proposedClockIn: e.target.value }))}
                                />
                                <p className="text-[10px] text-[var(--text-muted)] mt-1">Kosongkan jika sudah benar</p>
                                {clockInDate !== form.targetDate && form.proposedClockIn && (
                                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                                        Otomatis H+1 shift malam: {shiftCalendarDate(form.targetDate, 1)}T{form.proposedClockIn}:00+07:00.
                                    </p>
                                )}
                            </div>
                            <div className="form-group !mb-0">
                                <label htmlFor="correction-clock-out" className="form-label flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Jam Keluar (Diajukan)
                                </label>
                                <input
                                    type="time"
                                    id="correction-clock-out"
                                    className="form-input"
                                    value={form.proposedClockOut}
                                    onChange={(e) => setForm((f) => ({ ...f, proposedClockOut: e.target.value }))}
                                />
                                <p className="text-[10px] text-[var(--text-muted)] mt-1">Kosongkan jika sudah benar</p>
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                            <input
                                type="checkbox"
                                checked={clockOutIsNextDay}
                                onChange={(event) => setClockOutIsNextDay(event.target.checked)}
                                disabled={!form.proposedClockOut || submitting}
                            />
                            Jam keluar terjadi H+1 dari tanggal koreksi
                        </label>
                        {clockOutIsNextDay && form.proposedClockOut && (
                            <p className="text-[10px] text-[var(--text-muted)] -mt-2">
                                Timestamp dikirim sebagai {shiftCalendarDate(form.targetDate, 1)}T{form.proposedClockOut}:00+07:00.
                            </p>
                        )}

                        {/* Alasan */}
                        <div className="form-group !mb-0">
                            <label htmlFor="correction-reason" className="form-label">Alasan / Keterangan</label>
                            <textarea
                                className="form-textarea"
                                id="correction-reason"
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
                                disabled={submitting || !serverContext.isOnline || !serverContext.isFresh}
                                className="flex items-center justify-center gap-2 w-full p-3 border-2 border-dashed border-[var(--border)] rounded-lg hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
                            >
                                {attachmentName
                                    ? <span className="text-green-600 font-medium text-xs flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> {attachmentName}</span>
                                    : "Klik untuk lampirkan foto/dokumen (maks 2MB)"
                                }
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={submitting || !serverContext.isOnline || !serverContext.isFresh}
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
                                                            {fmtWibTime(req.proposedClockIn)}
                                                        </strong>
                                                    </span>
                                                    <span>
                                                        Keluar: <strong className="text-[var(--text-secondary)]">
                                                            {fmtWibTime(req.proposedClockOut)}
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
