"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Lock, Pencil, Trash2, UserCheck, Users } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { useConfirm } from "@/components/ConfirmModal";

interface EligibleMember {
    employeeId: string;
    name: string;
    isOrganizer: boolean;
}

interface MinutesData {
    id: string;
    status: string;
    lifecycle: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    startAt: string;
    endAt: string;
    requesterEmployeeId: string | null;
    notulisEmployeeId: string | null;
    notulisName: string | null;
    minutes: string | null;
    minutesUpdatedBy: string | null;
    minutesUpdatedByName: string | null;
    minutesUpdatedAt: string | null;
    myEmployeeId: string | null;
    isOrganizer: boolean;
    canConfigureNotulis: boolean;
    canWriteMinutes: boolean;
    requiresChangeReason: boolean;
    eligibleMembers: EligibleMember[];
}

export default function MeetingMinutesSection({
    appointmentId,
    readOnly = false,
    refreshKey,
}: {
    appointmentId: string;
    readOnly?: boolean;
    refreshKey?: string | number;
}) {
    const [data, setData] = useState<MinutesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [text, setText] = useState("");
    const [reason, setReason] = useState("");
    const [saving, setSaving] = useState(false);
    const [savingNotulis, setSavingNotulis] = useState(false);
    const [error, setError] = useState("");
    const confirm = useConfirm();

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/minutes`, { credentials: "same-origin" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat notulensi."));
            const json = await res.json();
            setData(json.data);
            setText(json.data?.minutes ?? "");
        } catch (err) {
            reportClientError("MeetingMinutesSection", "Gagal memuat notulensi", err, { appointmentId });
            setError(err instanceof Error ? err.message : "Gagal memuat notulensi.");
        } finally {
            setLoading(false);
        }
    }, [appointmentId]);

    useEffect(() => {
        void load();
    }, [load, refreshKey]);

    async function handleNotulisChange(nextNotulisId: string) {
        setSavingNotulis(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/minutes`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ notulisEmployeeId: nextNotulisId || null }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengatur petugas notulensi."));
            const json = await res.json();
            setData(json.data);
            if (!json.data?.canWriteMinutes) {
                setEditing(false);
                setDeleting(false);
            }
        } catch (err) {
            reportClientError("MeetingMinutesSection", "Gagal mengatur petugas notulensi", err, { appointmentId });
            setError(err instanceof Error ? err.message : "Gagal mengatur petugas notulensi.");
        } finally {
            setSavingNotulis(false);
        }
    }

    async function handleSave() {
        setSaving(true);
        setError("");
        try {
            const payload: { minutes: string; changeReason?: string } = { minutes: text };
            if (reason.trim()) payload.changeReason = reason.trim();
            const res = await fetch(`/api/appointments/${appointmentId}/minutes`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan notulensi."));
            const json = await res.json();
            setData(json.data);
            setEditing(false);
            setReason("");
        } catch (err) {
            reportClientError("MeetingMinutesSection", "Gagal menyimpan notulensi", err, { appointmentId });
            setError(err instanceof Error ? err.message : "Gagal menyimpan notulensi.");
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        setSaving(true);
        setError("");
        try {
            const payload: { changeReason?: string } = {};
            if (reason.trim()) payload.changeReason = reason.trim();
            const res = await fetch(`/api/appointments/${appointmentId}/minutes`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus notulensi."));
            const json = await res.json();
            setData(json.data);
            setText("");
            setDeleting(false);
            setEditing(false);
            setReason("");
        } catch (err) {
            reportClientError("MeetingMinutesSection", "Gagal menghapus notulensi", err, { appointmentId });
            setError(err instanceof Error ? err.message : "Gagal menghapus notulensi.");
        } finally {
            setSaving(false);
        }
    }

    const requiresReason = Boolean(data?.requiresChangeReason);
    const canModify = !readOnly && Boolean(data?.canWriteMinutes);
    const isBeforeStart = data?.lifecycle === "SCHEDULED";

    return (
        <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> Notulensi
                </p>
                {data && !isBeforeStart && data.status !== "CANCELLED" && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                        {data.notulisEmployeeId ? (
                            <>
                                <UserCheck className="w-3 h-3 text-[var(--primary)]" />
                                Notulis: {stripGelar(data.notulisName ?? data.notulisEmployeeId)} ({data.notulisEmployeeId})
                            </>
                        ) : (
                            <>
                                <Users className="w-3 h-3 text-[var(--text-muted)]" />
                                Semua Peserta Berhak Input
                            </>
                        )}
                    </span>
                )}
            </div>

            {loading ? (
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5" aria-label="Memuat notulensi">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat notulensi…
                </p>
            ) : error && !data ? (
                <FeedbackMessage variant="error">{error}</FeedbackMessage>
            ) : (
                <>
                    {error && !editing && !deleting && <FeedbackMessage variant="error">{error}</FeedbackMessage>}

                    {/* Setup Petugas Notulis oleh Penyelenggara saat meeting sedang berjalan */}
                    {!readOnly && data?.canConfigureNotulis && (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/40 p-2.5 space-y-1.5">
                            <label htmlFor="meeting-notulis-select" className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                                Pengaturan Petugas Notulensi (Penyelenggara)
                            </label>
                            <div className="flex items-center gap-2">
                                <select
                                    id="meeting-notulis-select"
                                    className="form-input text-xs py-1.5"
                                    value={data.notulisEmployeeId ?? ""}
                                    disabled={savingNotulis}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        confirm({
                                            title: "Ubah Petugas Notulis?",
                                            message: next
                                                ? "Hanya petugas terpilih (dan penyelenggara) yang dapat mengisi notulensi setelah ini."
                                                : "Semua peserta kembali berhak mengisi notulensi.",
                                            confirmLabel: "Ya, Ubah",
                                            variant: "info",
                                            onConfirm: () => { void handleNotulisChange(next); },
                                        });
                                    }}
                                >
                                    <option value="">Semua Peserta Berhak Input (Tidak Dibatasi)</option>
                                    {data.eligibleMembers.map((m) => (
                                        <option key={m.employeeId} value={m.employeeId}>
                                            {stripGelar(m.name)} ({m.employeeId}){m.isOrganizer ? " — Penyelenggara" : ""}
                                        </option>
                                    ))}
                                </select>
                                {savingNotulis && <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)] shrink-0" />}
                            </div>
                            <p className="text-[11px] text-[var(--text-muted)]">
                                {data.notulisEmployeeId
                                    ? "Hanya petugas notulis terpilih (dan penyelenggara) yang dapat mengisi atau mengubah notulensi."
                                    : "Belum ditentukan petugas khusus — seluruh peserta meeting di ruangan dapat mengisi notulensi."}
                            </p>
                        </div>
                    )}

                    {/* Status terkunci sebelum jam meeting dimulai */}
                    {isBeforeStart ? (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 px-3 py-2.5 flex items-start gap-2">
                            <Lock className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                            <p className="text-xs text-[var(--text-muted)]">
                                Notulensi belum dibuka. Pengaturan petugas notulis dan pengisian notulensi baru dapat dilakukan saat meeting dimulai sesuai jadwal.
                            </p>
                        </div>
                    ) : deleting ? (
                        <div className="space-y-2.5 rounded-xl border border-red-300 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20 p-3">
                            {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}
                            <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                                Hapus seluruh isi notulensi meeting ini?
                            </p>
                            {requiresReason && (
                                <div>
                                    <label className="form-label" htmlFor="meeting-minutes-delete-reason">
                                        Alasan Penghapusan * (Audit Pasca-Meeting)
                                    </label>
                                    <input
                                        id="meeting-minutes-delete-reason"
                                        className="form-input"
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Tuliskan alasan penghapusan (minimal 5 karakter)"
                                    />
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDeleting(false);
                                        setReason("");
                                        setError("");
                                    }}
                                    disabled={saving}
                                    className="btn btn-secondary btn-sm flex-1"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void handleDelete();
                                    }}
                                    disabled={saving || (requiresReason && reason.trim().length < 5)}
                                    className="btn btn-sm flex-1 bg-red-600 text-white hover:bg-red-700"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    {saving ? "Menghapus…" : "Ya, Hapus Notulensi"}
                                </button>
                            </div>
                        </div>
                    ) : !editing || !canModify ? (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 px-3 py-2.5">
                            {data?.minutes ? (
                                <>
                                    <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{data.minutes}</p>
                                    {data.minutesUpdatedAt && (
                                        <p className="text-[11px] text-[var(--text-muted)] mt-2 pt-1.5 border-t border-[var(--border)]">
                                            Diinput/diperbarui oleh{" "}
                                            <span className="font-semibold text-[var(--text-secondary)]">
                                                {data.minutesUpdatedByName
                                                    ? `${stripGelar(data.minutesUpdatedByName)} (${data.minutesUpdatedBy})`
                                                    : (data.minutesUpdatedBy ?? "-")}
                                            </span>{" "}
                                            pada{" "}
                                            {new Date(data.minutesUpdatedAt).toLocaleString("id-ID", {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}{" "}
                                            WIB
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="text-xs text-[var(--text-muted)]">
                                    {canModify
                                        ? "Belum ada notulensi. Anda dapat mulai menuliskan hasil meeting di sini."
                                        : data?.notulisEmployeeId
                                            ? `Belum ada notulensi. Hanya petugas notulis (${stripGelar(data.notulisName ?? data.notulisEmployeeId)}) atau penyelenggara yang dapat mengisi notulensi.`
                                            : "Belum ada notulensi."}
                                </p>
                            )}

                            {canModify && (
                                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setText(data?.minutes ?? "");
                                            setReason("");
                                            setError("");
                                            setEditing(true);
                                        }}
                                        className="btn btn-secondary btn-sm"
                                    >
                                        <Pencil className="w-3.5 h-3.5" /> {data?.minutes ? "Ubah Notulensi" : "Mulai / Tulis Notulensi"}
                                    </button>
                                    {data?.minutes && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setReason("");
                                                setError("");
                                                setDeleting(true);
                                            }}
                                            className="btn btn-sm border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" /> Hapus Notulensi
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2.5 rounded-xl border border-[var(--border)] p-3">
                            {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}
                            <label className="form-label" htmlFor="meeting-minutes">
                                Isi Notulensi *
                            </label>
                            <textarea
                                id="meeting-minutes"
                                className="form-textarea min-h-28"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder="Tuliskan hasil, pembahasan, dan kesepakatan meeting…"
                                maxLength={20000}
                            />
                            {requiresReason && (
                                <div>
                                    <label className="form-label" htmlFor="meeting-minutes-reason">
                                        Alasan Perubahan * (Meeting Sudah Selesai — Wajib untuk Audit)
                                    </label>
                                    <input
                                        id="meeting-minutes-reason"
                                        className="form-input"
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Tuliskan alasan perubahan notulensi (minimal 5 karakter)"
                                    />
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditing(false);
                                        setReason("");
                                        setError("");
                                    }}
                                    disabled={saving}
                                    className="btn btn-secondary flex-1"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        void handleSave();
                                    }}
                                    disabled={saving || !text.trim() || (requiresReason && reason.trim().length < 5)}
                                    className="btn btn-primary flex-1"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {saving ? "Menyimpan…" : "Simpan Notulensi"}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
