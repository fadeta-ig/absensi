"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCheck, History, Link2, Loader2, MapPin, Pencil, Trash2, Users, X } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { AppointmentStatusBadge, AttendanceMarkBadge, InviteResponseBadge } from "@/components/appointments/AppointmentBadges";
import AppointmentFormModal from "@/components/appointments/AppointmentFormModal";
import MeetingMinutesSection from "@/components/appointments/MeetingMinutesSection";
import MeetingTaskSection from "@/components/appointments/MeetingTaskSection";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import {
    participantDisplayName,
    type AppointmentListItem,
} from "@/components/appointments/useAppointments";

function fmtDT(iso: string): string {
    return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return (
        <Suspense fallback={<p className="text-sm text-[var(--text-muted)] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat meeting…</p>}>
            <DetailContent id={id} />
        </Suspense>
    );
}

function DetailContent({ id }: { id: string }) {
    const router = useRouter();
    const confirm = useConfirm();
    const toast = useToast();
    const [item, setItem] = useState<AppointmentListItem | null>(null);
    const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [actionLoading, setActionLoading] = useState(false);
    const [marking, setMarking] = useState(false);
    const [marks, setMarks] = useState<Record<string, "HADIR" | "TIDAK_HADIR">>({});
    const [cancelReason, setCancelReason] = useState("");
    const [askingCancel, setAskingCancel] = useState(false);
    const [rsvping, setRsvping] = useState(false);
    const [declineNote, setDeclineNote] = useState("");
    const [askingDecline, setAskingDecline] = useState(false);
    const [editing, setEditing] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [meRes, detailRes] = await Promise.all([
                fetch("/api/auth/me", { credentials: "same-origin" }),
                fetch(`/api/appointments/${id}`, { credentials: "same-origin" }),
            ]);
            if (meRes.ok) {
                const me = await meRes.json();
                setMyEmployeeId(me.employeeId ?? null);
            }
            if (!detailRes.ok) throw new Error(await getResponseErrorMessage(detailRes, "Gagal memuat detail meeting."));
            const json = await detailRes.json();
            setItem(json.data);
        } catch (err) {
            reportClientError("MeetingDetailPage", "Gagal memuat detail", err, { id });
            setError(err instanceof Error ? err.message : "Gagal memuat detail meeting.");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    async function handleRsvp(action: "ACCEPT" | "DECLINE", note?: string) {
        if (action === "DECLINE" && (!note || note.trim().length < 5)) return;
        setRsvping(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${id}/invite-response`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, note: note?.trim() || null }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal merespons undangan meeting."));
            await load();
        } catch (err) {
            reportClientError("MeetingDetailPage", "Gagal RSVP", err);
            setError(err instanceof Error ? err.message : "Gagal merespons undangan meeting.");
        } finally {
            setRsvping(false);
        }
    }

    async function handleCancel() {
        if (cancelReason.trim().length < 5) return;
        setActionLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: cancelReason.trim() }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal membatalkan meeting."));
            toast("Meeting dibatalkan.", "success");
            router.push("/employee/appointments");
        } catch (err) {
            reportClientError("MeetingDetailPage", "Gagal membatalkan meeting", err);
            setError(err instanceof Error ? err.message : "Gagal membatalkan meeting.");
        } finally {
            setActionLoading(false);
        }
    }

    async function handleComplete() {
        setActionLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${id}/complete`, { method: "POST" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyelesaikan meeting."));
            const json = await res.json();
            toast(`Meeting selesai. ${json.submitted ?? 0} task diteruskan ke penerima.`, "success");
            await load();
        } catch (err) {
            reportClientError("MeetingDetailPage", "Gagal menyelesaikan meeting", err);
            setError(err instanceof Error ? err.message : "Gagal menyelesaikan meeting.");
        } finally {
            setActionLoading(false);
        }
    }

    async function handleSaveMarks() {
        const payload = Object.entries(marks).map(([participantId, attendance]) => ({ participantId, attendance }));
        if (payload.length === 0) return;
        setMarking(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${id}/attendance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ marks: payload }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan data kehadiran."));
            setMarks({});
            await load();
        } catch (err) {
            reportClientError("MeetingDetailPage", "Gagal menyimpan kehadiran", err);
            setError(err instanceof Error ? err.message : "Gagal menyimpan data kehadiran.");
        } finally {
            setMarking(false);
        }
    }

    if (loading) {
        return (
            <p className="text-sm text-[var(--text-muted)] flex items-center gap-2 py-10 justify-center" aria-label="Memuat detail meeting">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat detail meeting…
            </p>
        );
    }

    if (error && !item) {
        return (
            <div className="space-y-4">
                <button type="button" onClick={() => router.push("/employee/appointments")} className="btn btn-secondary btn-sm">
                    <ArrowLeft className="w-4 h-4" /> Kembali
                </button>
                <FeedbackMessage variant="error">{error}</FeedbackMessage>
                <button type="button" onClick={() => { void load(); }} className="btn btn-secondary w-full">Coba Lagi</button>
            </div>
        );
    }

    if (!item) {
        return (
            <div className="space-y-4">
                <button type="button" onClick={() => router.push("/employee/appointments")} className="btn btn-secondary btn-sm">
                    <ArrowLeft className="w-4 h-4" /> Kembali
                </button>
                <p className="text-sm text-[var(--text-muted)]">Meeting tidak ditemukan.</p>
            </div>
        );
    }

    const canManage = !!myEmployeeId && item.requesterEmployeeId === myEmployeeId;
    const isFrozen = item.status === "COMPLETED" || item.status === "CANCELLED";
    const canEdit = canManage && item.status === "SCHEDULED" && item.lifecycle === "SCHEDULED";
    const canCancel = canManage && item.status === "SCHEDULED";
    const canComplete = canManage && item.lifecycle === "IN_PROGRESS";
    const nowMs = Date.now();
    const canMark = canManage && nowMs >= new Date(item.startAt).getTime() && nowMs <= new Date(item.endAt).getTime() + 24 * 60 * 60 * 1000;
    const myParticipant = myEmployeeId ? item.participants.find((p) => p.employeeId === myEmployeeId) ?? null : null;
    const myResponse = myParticipant?.inviteStatus ?? "PENDING";
    const rsvpLocked = myResponse === "ACCEPTED" || myResponse === "DECLINED";
    const canRsvp = myParticipant !== null && !rsvpLocked && item.status === "SCHEDULED" && nowMs <= new Date(item.endAt).getTime();
    const rsvpCounts = {
        accepted: item.participants.filter((p) => p.inviteStatus === "ACCEPTED").length,
        declined: item.participants.filter((p) => p.inviteStatus === "DECLINED").length,
        pending: item.participants.filter((p) => !p.inviteStatus || p.inviteStatus === "PENDING").length,
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => router.push("/employee/appointments")}
                    className="min-w-11 min-h-11 rounded-xl hover:bg-[var(--secondary)] flex items-center justify-center"
                    aria-label="Kembali ke E Meeting"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                    <h1 className="text-base font-extrabold text-[var(--text-primary)] truncate">{item.title}</h1>
                    <p className="text-xs text-[var(--text-muted)]">
                        {item.isFullDay ? "Seharian" : `${fmtDT(item.startAt)} – ${fmtDT(item.endAt)}`}
                    </p>
                </div>
            </div>

            {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}

            {isFrozen && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/60 px-3 py-2.5" role="status" aria-label="Meeting selesai read-only">
                    <p className="text-xs font-semibold text-[var(--text-secondary)]">Meeting sudah selesai — halaman ini read-only.</p>
                </div>
            )}

            <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <AppointmentStatusBadge status={item.status} lifecycle={item.lifecycle} />
                    <button
                        type="button"
                        onClick={() => router.push(`/employee/appointments/detail/${item.id}/history`)}
                        className="btn btn-secondary btn-sm shrink-0"
                    >
                        <History className="w-3.5 h-3.5" /> Riwayat
                    </button>
                </div>
                {item.room && (
                    <p className="text-sm text-[var(--text-secondary)] flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0" /> {item.room.name}
                    </p>
                )}
                {item.meetingLink && (
                    <p className="text-sm text-[var(--text-secondary)] flex items-center gap-1.5 min-w-0">
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.meetingLink}</span>
                    </p>
                )}

                <div>
                    <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> Peserta ({item.participants.length})
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mb-1.5">
                        {rsvpCounts.accepted} menerima · {rsvpCounts.declined} menolak · {rsvpCounts.pending} belum merespons
                    </p>
                    {myParticipant && !canRsvp && rsvpLocked && (
                        <div className="mb-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 px-3 py-2.5">
                            <p className="text-xs font-bold text-[var(--text-primary)]">
                                Keputusan Anda: {myResponse === "ACCEPTED" ? "Menerima Undangan" : "Menolak Undangan"}
                            </p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                Keputusan bersifat final. Hubungi penyelenggara apabila ada perubahan.
                            </p>
                        </div>
                    )}
                    {canRsvp && (
                        <div className="space-y-2 mb-2">
                            <div className="flex gap-1.5">
                                <span className="text-[11px] text-[var(--text-muted)] self-center">Respons Anda:</span>
                                <button
                                    type="button"
                                    disabled={rsvping}
                                    onClick={() => { void handleRsvp("ACCEPT"); }}
                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 flex items-center gap-1 ${myParticipant?.inviteStatus === "ACCEPTED" ? "bg-emerald-600 text-white" : "bg-[var(--secondary)] text-[var(--text-secondary)]"}`}
                                >
                                    {rsvping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    Terima Undangan
                                </button>
                                {!askingDecline ? (
                                    <button
                                        type="button"
                                        disabled={rsvping}
                                        onClick={() => setAskingDecline(true)}
                                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 flex items-center gap-1 ${myParticipant?.inviteStatus === "DECLINED" ? "bg-rose-600 text-white" : "bg-[var(--secondary)] text-[var(--text-secondary)]"}`}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                        Tolak Undangan
                                    </button>
                                ) : null}
                            </div>
                            {askingDecline && (
                                <div className="space-y-2 rounded-xl border border-[var(--border)] p-2.5">
                                    <label className="form-label" htmlFor="decline-note">Alasan Penolakan * (dapat dibaca oleh penyelenggara)</label>
                                    <input
                                        id="decline-note"
                                        className="form-input"
                                        value={declineNote}
                                        onChange={(e) => setDeclineNote(e.target.value)}
                                        placeholder="Tuliskan alasan (minimal 5 karakter)"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => { setAskingDecline(false); setDeclineNote(""); }}
                                            className="btn btn-secondary flex-1"
                                        >
                                            Kembali
                                        </button>
                                        <button
                                            type="button"
                                            disabled={rsvping || declineNote.trim().length < 5}
                                            onClick={() =>
                                                confirm({
                                                    title: "Tolak Undangan?",
                                                    message: "Keputusan menolak bersifat final dan alasan Anda dapat dibaca penyelenggara.",
                                                    confirmLabel: "Ya, Tolak",
                                                    variant: "warning",
                                                    onConfirm: () => { void handleRsvp("DECLINE", declineNote); },
                                                })
                                            }
                                            className="btn flex-1 bg-rose-600 text-white hover:bg-rose-700"
                                        >
                                            {rsvping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                            Tolak Undangan
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <ul className="space-y-1.5">
                        {item.participants.map((p) => (
                            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                                <span className="min-w-0 truncate text-[var(--text-primary)]">
                                    {participantDisplayName(p)}
                                    {p.isExternal && <span className="text-[11px] text-[var(--text-muted)]"> (Tamu Eksternal)</span>}
                                    {p.inviteStatus === "DECLINED" && p.inviteNote && (
                                        <span className="block text-[11px] text-[var(--text-muted)] truncate">Alasan: {p.inviteNote}</span>
                                    )}
                                </span>
                                <span className="flex gap-1 shrink-0 items-center">
                                    {!p.isExternal && <InviteResponseBadge status={p.inviteStatus ?? "PENDING"} />}
                                    {canMark ? (
                                    <span className="flex gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setMarks({ ...marks, [p.id]: "HADIR" })}
                                            className={`px-2 py-1 rounded-lg text-[11px] font-semibold min-h-9 ${marks[p.id] === "HADIR" || (!marks[p.id] && p.attendance === "HADIR") ? "bg-emerald-600 text-white" : "bg-[var(--secondary)] text-[var(--text-secondary)]"}`}
                                        >
                                            Hadir
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMarks({ ...marks, [p.id]: "TIDAK_HADIR" })}
                                            className={`px-2 py-1 rounded-lg text-[11px] font-semibold min-h-9 ${marks[p.id] === "TIDAK_HADIR" || (!marks[p.id] && p.attendance === "TIDAK_HADIR") ? "bg-rose-600 text-white" : "bg-[var(--secondary)] text-[var(--text-secondary)]"}`}
                                        >
                                            Tidak Hadir
                                        </button>
                                    </span>
                                ) : (
                                    <AttendanceMarkBadge mark={p.attendance} />
                                )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                {canMark && Object.keys(marks).length > 0 && (
                    <button type="button" onClick={handleSaveMarks} disabled={marking} className="btn btn-secondary w-full">
                        {marking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                        {marking ? "Menyimpan…" : `Simpan Kehadiran (${Object.keys(marks).length})`}
                    </button>
                )}

                <div className="flex gap-2">
                    {canEdit && (
                        <button type="button" onClick={() => setEditing(true)} disabled={actionLoading} className="btn btn-secondary flex-1">
                            <Pencil className="w-4 h-4" /> Ubah Jadwal
                        </button>
                    )}
                    {canComplete && (
                        <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() =>
                                confirm({
                                    title: "Selesaikan Meeting?",
                                    message: `Meeting "${item.title}" akan ditandai selesai sekarang dan seluruh task diteruskan ke penerima.`,
                                    confirmLabel: "Ya, Selesaikan",
                                    variant: "info",
                                    onConfirm: () => { void handleComplete(); },
                                })
                            }
                            className="btn btn-primary flex-1"
                        >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />} Selesaikan
                        </button>
                    )}
                    {canCancel && !askingCancel && (
                        <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() =>
                                confirm({
                                    title: "Batalkan Meeting?",
                                    message: `Meeting "${item.title}" akan dibatalkan dan seluruh peserta akan diberi tahu.`,
                                    confirmLabel: "Lanjutkan",
                                    variant: "warning",
                                    onConfirm: () => setAskingCancel(true),
                                })
                            }
                            className="btn flex-1 bg-rose-600 text-white hover:bg-rose-700"
                        >
                            <Trash2 className="w-4 h-4" /> Batalkan
                        </button>
                    )}
                </div>
                {askingCancel && (
                    <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                        <label className="form-label" htmlFor="cancel-reason">Alasan Pembatalan *</label>
                        <input
                            id="cancel-reason"
                            className="form-input"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder="Tuliskan alasan (minimal 5 karakter)"
                        />
                        <button
                            type="button"
                            onClick={() => { void handleCancel(); }}
                            disabled={actionLoading || cancelReason.trim().length < 5}
                            className="btn w-full bg-rose-600 text-white hover:bg-rose-700"
                        >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {actionLoading ? "Membatalkan…" : "Ya, Batalkan Meeting"}
                        </button>
                    </div>
                )}
            </div>

            <div className="card p-4">
                <MeetingMinutesSection appointmentId={item.id} readOnly={isFrozen} />
            </div>

            <div className="card p-4">
                <MeetingTaskSection appointmentId={item.id} participants={item.participants} readOnly={isFrozen} />
            </div>

            {editing && (
                <AppointmentFormModal
                    initialDate={item.startAt.slice(0, 10)}
                    editing={item}
                    onClose={() => setEditing(false)}
                    onSaved={() => { setEditing(false); void load(); }}
                />
            )}
        </div>
    );
}
