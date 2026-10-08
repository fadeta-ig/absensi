"use client";

import { useState } from "react";
import { X, Loader2, MapPin, Link2, Users, Trash2, Pencil, CheckCheck, Check } from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { AppointmentStatusBadge, AttendanceMarkBadge, InviteResponseBadge } from "@/components/appointments/AppointmentBadges";
import { useConfirm } from "@/components/ConfirmModal";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import type { AppointmentListItem } from "@/components/appointments/useAppointments";
import { participantDisplayName } from "@/components/appointments/useAppointments";
import MeetingMinutesSection from "@/components/appointments/MeetingMinutesSection";
import MeetingTaskSection from "@/components/appointments/MeetingTaskSection";

interface AppointmentDetailModalProps {
    item: AppointmentListItem;
    canManage: boolean;
    myEmployeeId: string | null;
    onClose: () => void;
    onChanged: () => void;
    onEdit: () => void;
}

function fmtDT(iso: string): string {
    return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AppointmentDetailModal({ item, canManage, myEmployeeId, onClose, onChanged, onEdit }: AppointmentDetailModalProps) {
    const confirm = useConfirm();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [marking, setMarking] = useState(false);
    const [marks, setMarks] = useState<Record<string, "HADIR" | "TIDAK_HADIR">>({});
    const [cancelReason, setCancelReason] = useState("");
    const [askingCancel, setAskingCancel] = useState(false);
    const [rsvping, setRsvping] = useState(false);
    const [declineNote, setDeclineNote] = useState("");
    const [askingDecline, setAskingDecline] = useState(false);

    const canEdit = canManage && item.status === "SCHEDULED";
    const canCancel = canManage && item.status === "SCHEDULED";
    const canMark = canManage && (item.lifecycle === "IN_PROGRESS" || item.status === "COMPLETED");
    const myParticipant = myEmployeeId ? item.participants.find((p) => p.employeeId === myEmployeeId) ?? null : null;
    const myResponse = myParticipant?.inviteStatus ?? "PENDING";
    const rsvpLocked = myResponse === "ACCEPTED" || myResponse === "DECLINED";
    const canRsvp = myParticipant !== null && !rsvpLocked && item.status === "SCHEDULED";
    const rsvpCounts = {
        accepted: item.participants.filter((p) => p.inviteStatus === "ACCEPTED").length,
        declined: item.participants.filter((p) => p.inviteStatus === "DECLINED").length,
        pending: item.participants.filter((p) => !p.inviteStatus || p.inviteStatus === "PENDING").length,
    };

    async function handleRsvp(action: "ACCEPT" | "DECLINE", note?: string) {
        if (action === "DECLINE" && (!note || note.trim().length < 5)) return;
        setRsvping(true);
        setError(null);
        try {
            const res = await fetch(`/api/appointments/${item.id}/invite-response`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, note: note?.trim() || null }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal merespons undangan meeting."));
            onChanged();
        } catch (err) {
            reportClientError("AppointmentDetailModal", "Gagal RSVP", err);
            setError(err instanceof Error ? err.message : "Gagal merespons undangan meeting.");
        } finally {
            setRsvping(false);
        }
    }

    async function handleCancel() {
        if (cancelReason.trim().length < 5) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/appointments/${item.id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: cancelReason.trim() }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal membatalkan meeting."));
            onChanged();
            onClose();
        } catch (err) {
            reportClientError("AppointmentDetailModal", "Gagal membatalkan rapat", err);
            setError(err instanceof Error ? err.message : "Gagal membatalkan meeting.");
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveMarks() {
        const payload = Object.entries(marks).map(([participantId, attendance]) => ({ participantId, attendance }));
        if (payload.length === 0) return;
        setMarking(true);
        setError(null);
        try {
            const res = await fetch(`/api/appointments/${item.id}/attendance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ marks: payload }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan data kehadiran."));
            onChanged();
        } catch (err) {
            reportClientError("AppointmentDetailModal", "Gagal menyimpan kehadiran", err);
            setError(err instanceof Error ? err.message : "Gagal menyimpan data kehadiran.");
        } finally {
            setMarking(false);
        }
    }

    return (
        <AccessibleModal ariaLabel="Detail meeting" onClose={onClose} className="max-w-md" disableClose={loading}>
            <div className="modal-header">
                <h2 className="modal-title">{item.title}</h2>
                <button className="modal-close" onClick={onClose} disabled={loading} aria-label="Tutup detail">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {error && (
                <FeedbackMessage variant="error" className="mb-4">
                    {error}
                </FeedbackMessage>
            )}

            <div className="space-y-3">
                <AppointmentStatusBadge status={item.status} lifecycle={item.lifecycle} />
                <p className="text-sm text-[var(--text-secondary)]">
                    {item.isFullDay ? "Seharian" : `${fmtDT(item.startAt)} – ${fmtDT(item.endAt)}`}
                </p>
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
                                            onClick={() => { void handleRsvp("DECLINE", declineNote); }}
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

                <MeetingMinutesSection appointmentId={item.id} />
                <MeetingTaskSection appointmentId={item.id} participants={item.participants} />

                {canMark && Object.keys(marks).length > 0 && (
                    <button type="button" onClick={handleSaveMarks} disabled={marking} className="btn btn-secondary w-full">
                        {marking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                        {marking ? "Menyimpan…" : `Simpan Kehadiran (${Object.keys(marks).length})`}
                    </button>
                )}

                <div className="flex gap-2">
                    {canEdit && (
                        <button type="button" onClick={onEdit} disabled={loading} className="btn btn-secondary flex-1">
                            <Pencil className="w-4 h-4" /> Ubah Jadwal
                        </button>
                    )}
                    {canCancel && !askingCancel && (
                        <button
                            type="button"
                            disabled={loading}
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
                            disabled={loading || cancelReason.trim().length < 5}
                            className="btn w-full bg-rose-600 text-white hover:bg-rose-700"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {loading ? "Membatalkan…" : "Ya, Batalkan Meeting"}
                        </button>
                    </div>
                )}
            </div>
        </AccessibleModal>
    );
}
