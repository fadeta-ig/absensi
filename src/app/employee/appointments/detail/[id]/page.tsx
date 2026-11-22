"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, Check, CheckCheck, ExternalLink, History, Link2, Loader2, MapPin, Settings, StickyNote, Trash2, User, Users, X } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import PageHeader from "@/components/ui/PageHeader";
import StateCard from "@/components/ui/StateCard";
import EmptyState from "@/components/ui/EmptyState";
import { AppointmentStatusBadge, AttendanceMarkBadge, InviteResponseBadge } from "@/components/appointments/AppointmentBadges";
import AppointmentFormModal from "@/components/appointments/AppointmentFormModal";
import MeetingMinutesSection from "@/components/appointments/MeetingMinutesSection";
import MeetingTaskSummary from "@/components/appointments/MeetingTaskSummary";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import {
    participantDisplayName,
    requesterDisplayName,
    type AppointmentListItem,
} from "@/components/appointments/useAppointments";
import { formatWIBDateTime } from "@/lib/timezone";
import DraftNotice from "@/components/ui/DraftNotice";
import { useEmployeeDraft } from "@/hooks/useEmployeeDraft";
import { useEmployeeDraftOwner } from "@/components/employee/EmployeeDraftContext";
import {
    isPlainObject,
    readEmployeeDraft,
    removeEmployeeDraft,
    writeEmployeeDraft,
} from "@/lib/formPersistence";

function fmtDT(iso: string): string {
    return formatWIBDateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDateOnly(iso: string): string {
    return formatWIBDateTime(new Date(iso), { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return (
        <Suspense fallback={<StateCard variant="loading" title="Memuat meeting…" />}>
            <DetailContent id={id} />
        </Suspense>
    );
}

function DetailContent({ id }: { id: string }) {
    const router = useRouter();
    const confirm = useConfirm();
    const toast = useToast();
    const draftOwner = useEmployeeDraftOwner();
    const [item, setItem] = useState<AppointmentListItem | null>(null);
    const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
    const [myEmployeeName, setMyEmployeeName] = useState<string | null>(null);
    const [canManageAll, setCanManageAll] = useState(false);
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
    const [syncKey, setSyncKey] = useState(0);
    const [editModalChecked, setEditModalChecked] = useState(false);

    const canManage = Boolean(
        item &&
            (canManageAll ||
                (!!myEmployeeId &&
                    (item.requesterEmployeeId === myEmployeeId ||
                        item.leaderEmployeeId === myEmployeeId ||
                        item.notulisEmployeeId === myEmployeeId)))
    );
    const isFrozen = Boolean(item && (item.status === "COMPLETED" || item.status === "CANCELLED"));
    const isOverdueStored = Boolean(
        item && item.status === "SCHEDULED" && (item.lifecycle === "COMPLETED" || item.lifecycle === "CANCELLED")
    );
    // Pengaturan Meeting (termasuk pimpinan rapat & PIC) juga dibuka saat
    // meeting berjalan; perubahan jadwal/ruang tetap ditolak service.
    const canMeetingSettings = Boolean(
        item && canManage && item.status === "SCHEDULED" && (item.lifecycle === "SCHEDULED" || item.lifecycle === "IN_PROGRESS")
    );
    const canCancel = Boolean(item && canManage && item.status === "SCHEDULED" && item.lifecycle === "SCHEDULED");
    const [nowMs, setNowMs] = useState(() => Date.now());
    const meetingStartMs = item ? new Date(item.startAt).getTime() : 0;
    const meetingEndMs = item ? new Date(item.endAt).getTime() : 0;
    const canComplete = Boolean(item && canManage && item.status === "SCHEDULED" && nowMs >= meetingStartMs);
    const isInvolved = Boolean(
        item && (!myEmployeeId || item.requesterEmployeeId === myEmployeeId || item.participants.some((p) => p.employeeId === myEmployeeId))
    );
    const canAccessWorkspace = item ? (item.canAccessWorkspace ?? isInvolved) : false;
    const canCreateMeetingTask = Boolean(
        item &&
            item.status === "SCHEDULED" &&
            nowMs >= meetingStartMs &&
            nowMs < meetingEndMs &&
            myEmployeeId &&
            (myEmployeeId === item.notulisEmployeeId || myEmployeeId === item.leaderEmployeeId)
    );
    const canMark = Boolean(
        item && canManage && item.status !== "CANCELLED" && nowMs >= meetingStartMs && nowMs <= meetingEndMs + 24 * 60 * 60 * 1000
    );
    const myParticipant = item && myEmployeeId ? item.participants.find((p) => p.employeeId === myEmployeeId) ?? null : null;
    const myResponse = myParticipant?.inviteStatus ?? "PENDING";
    const rsvpLocked = myResponse === "ACCEPTED" || myResponse === "DECLINED";
    const canRsvp = Boolean(item && myParticipant !== null && !rsvpLocked && item.status === "SCHEDULED" && nowMs <= meetingEndMs);

    const {
        restored: declineDraftRestored,
        clearDraft: clearDeclineDraft,
        discardDraft: discardDeclineDraft,
    } = useEmployeeDraft<{ askingDecline: boolean; declineNote: string }>({
        formKey: `appointments:detail:${id}:decline`,
        value: { askingDecline, declineNote },
        enabled: Boolean(item && canRsvp),
        isDirty: (draft) => draft.declineNote.trim().length > 0,
        validate: (raw): raw is { askingDecline: boolean; declineNote: string } =>
            isPlainObject(raw) &&
            typeof raw.askingDecline === "boolean" &&
            typeof raw.declineNote === "string",
        onRestore: (draft) => {
            setDeclineNote(draft.declineNote);
            if (draft.askingDecline) setAskingDecline(true);
        },
    });

    const {
        restored: cancelDraftRestored,
        clearDraft: clearCancelDraft,
        discardDraft: discardCancelDraft,
    } = useEmployeeDraft<{ askingCancel: boolean; cancelReason: string }>({
        formKey: `appointments:detail:${id}:cancel`,
        value: { askingCancel, cancelReason },
        enabled: Boolean(item && canCancel),
        isDirty: (draft) => draft.cancelReason.trim().length > 0,
        validate: (raw): raw is { askingCancel: boolean; cancelReason: string } =>
            isPlainObject(raw) &&
            typeof raw.askingCancel === "boolean" &&
            typeof raw.cancelReason === "string",
        onRestore: (draft) => {
            setCancelReason(draft.cancelReason);
            if (draft.askingCancel) setAskingCancel(true);
        },
    });

    const {
        restored: marksDraftRestored,
        clearDraft: clearMarksDraft,
        discardDraft: discardMarksDraft,
    } = useEmployeeDraft<{ marks: Record<string, "HADIR" | "TIDAK_HADIR"> }>({
        formKey: `appointments:detail:${id}:marks`,
        value: { marks },
        enabled: Boolean(item && canMark),
        isDirty: (draft) => Object.keys(draft.marks).length > 0,
        validate: (raw): raw is { marks: Record<string, "HADIR" | "TIDAK_HADIR"> } => {
            if (!isPlainObject(raw) || !isPlainObject(raw.marks)) return false;
            return Object.values(raw.marks).every((v) => v === "HADIR" || v === "TIDAK_HADIR");
        },
        onRestore: (draft) => {
            if (!item) return;
            const validIds = new Map(item.participants.map((p) => [p.id, p.attendance]));
            const filtered: Record<string, "HADIR" | "TIDAK_HADIR"> = {};
            for (const [pid, mark] of Object.entries(draft.marks)) {
                if (validIds.has(pid) && validIds.get(pid) !== mark) {
                    filtered[pid] = mark;
                }
            }
            if (Object.keys(filtered).length > 0) {
                setMarks(filtered);
            }
        },
    });

    // Bersihkan draf aksi detail jika status meeting tidak lagi mengizinkan aksi tersebut.
    useEffect(() => {
        if (!draftOwner || !item) return;
        if (!canRsvp) removeEmployeeDraft(draftOwner, `appointments:detail:${id}:decline`);
        if (!canCancel) removeEmployeeDraft(draftOwner, `appointments:detail:${id}:cancel`);
        if (!canMark) removeEmployeeDraft(draftOwner, `appointments:detail:${id}:marks`);
        if (!canMeetingSettings) {
            removeEmployeeDraft(draftOwner, `appointments:detail:${id}:edit-open`);
            removeEmployeeDraft(draftOwner, `appointments:edit:${id}`);
        }
    }, [draftOwner, item, id, canRsvp, canCancel, canMark, canMeetingSettings]);

    useEffect(() => {
        if (!draftOwner || !item || editModalChecked) return;
        setEditModalChecked(true);
        if (!canMeetingSettings) return;
        const flag = readEmployeeDraft<{ open: boolean }>(draftOwner, `appointments:detail:${id}:edit-open`, {
            validate: (raw): raw is { open: boolean } => isPlainObject(raw) && raw.open === true,
        });
        if (flag.status === "found") {
            if (readEmployeeDraft(draftOwner, `appointments:edit:${id}`).status === "found") {
                setEditing(true);
            } else {
                removeEmployeeDraft(draftOwner, `appointments:detail:${id}:edit-open`);
            }
        }
    }, [draftOwner, item, editModalChecked, canMeetingSettings, id]);

    useEffect(() => {
        if (!draftOwner || !editModalChecked) return;
        if (editing && canMeetingSettings) {
            writeEmployeeDraft(draftOwner, `appointments:detail:${id}:edit-open`, { open: true });
        } else {
            removeEmployeeDraft(draftOwner, `appointments:detail:${id}:edit-open`);
        }
    }, [draftOwner, editModalChecked, editing, canMeetingSettings, id]);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [meRes, detailRes, capsRes] = await Promise.all([
                fetch("/api/auth/me", { credentials: "same-origin" }),
                fetch(`/api/appointments/${id}`, { credentials: "same-origin" }),
                fetch("/api/employee/meeting-capabilities", { credentials: "same-origin" }).catch(() => null),
            ]);
            if (meRes.ok) {
                const me = await meRes.json();
                setMyEmployeeId(me.employeeId ?? null);
                setMyEmployeeName(typeof me.name === "string" && me.name.trim() ? me.name : null);
            }
            if (capsRes && capsRes.ok) {
                const caps = await capsRes.json().catch(() => null);
                setCanManageAll(caps?.data?.canManageAll === true);
            } else {
                setCanManageAll(false);
            }
            if (!detailRes.ok) throw new Error(await getResponseErrorMessage(detailRes, "Gagal memuat detail meeting."));
            const json = await detailRes.json();
            setNowMs(Date.now());
            setItem(json.data);
            setSyncKey((k) => k + 1);
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
        if (action === "DECLINE" && (!note || note.trim().length < 5)) {
            toast("Alasan penolakan minimal 5 karakter.", "error");
            setError("Alasan penolakan minimal 5 karakter.");
            return;
        }
        setRsvping(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${id}/invite-response`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, note: note?.trim() || null }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal merespons undangan meeting."));
            clearDeclineDraft();
            setAskingDecline(false);
            setDeclineNote("");
            await load();
        } catch (err) {
            reportClientError("MeetingDetailPage", "Gagal RSVP", err);
            setError(err instanceof Error ? err.message : "Gagal merespons undangan meeting.");
        } finally {
            setRsvping(false);
        }
    }

    async function handleCancel() {
        if (cancelReason.trim().length < 5) {
            toast("Alasan pembatalan minimal 5 karakter.", "error");
            setError("Alasan pembatalan minimal 5 karakter.");
            return;
        }
        setActionLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${id}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: cancelReason.trim() }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal membatalkan meeting."));
            clearCancelDraft();
            clearMarksDraft();
            removeEmployeeDraft(draftOwner, `appointments:edit:${id}`);
            removeEmployeeDraft(draftOwner, `appointments:detail:${id}:edit-open`);
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
            clearMarksDraft();
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
        return <StateCard variant="loading" title="Memuat detail meeting…" />;
    }

    if (error && !item) {
        return (
            <div className="space-y-5">
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
            <div className="space-y-5">
                <button type="button" onClick={() => router.push("/employee/appointments")} className="btn btn-secondary btn-sm">
                    <ArrowLeft className="w-4 h-4" /> Kembali
                </button>
                <EmptyState icon={CalendarClock} title="Meeting tidak ditemukan." />
            </div>
        );
    }

    const rsvpCounts = {
        accepted: item.participants.filter((p) => p.inviteStatus === "ACCEPTED").length,
        declined: item.participants.filter((p) => p.inviteStatus === "DECLINED").length,
        pending: item.participants.filter((p) => !p.inviteStatus || p.inviteStatus === "PENDING").length,
    };
    const taskParticipants = [
        ...(item.requesterEmployeeId && !item.participants.some((p) => p.employeeId === item.requesterEmployeeId)
            ? [{
                employeeId: item.requesterEmployeeId,
                guestName: null,
                isExternal: false,
                employee: { name: item.requester?.name ?? item.requesterEmployeeId },
            }]
            : []),
        ...item.participants,
    ];

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-2">
                <button
                    type="button"
                    onClick={() => router.push("/employee/appointments")}
                    className="min-w-11 min-h-11 rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--secondary)] flex items-center justify-center active:scale-[0.99]"
                    aria-label="Kembali ke E Meeting"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <PageHeader
                    className="min-w-0 flex-1"
                    title={item.title}
                    subtitle={item.isFullDay ? `${fmtDateOnly(item.startAt)} · Seharian Penuh` : `${fmtDT(item.startAt)} – ${fmtDT(item.endAt)}`}
                    icon={CalendarClock}
                />
            </div>

            {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}

            {isFrozen && (
                <FeedbackMessage variant="info" role="status">
                    {item.status === "CANCELLED"
                        ? "Meeting ini telah dibatalkan."
                        : "Meeting telah selesai. Revisi notulensi tetap dapat dilakukan dengan mencantumkan alasan perubahan."}
                </FeedbackMessage>
            )}
            {isOverdueStored && (
                <FeedbackMessage variant="warning" role="status">
                    Jadwal sudah lewat. Tekan Selesaikan untuk menutup meeting, atau biarkan sistem menyelesaikannya otomatis. Task baru tidak dapat ditambahkan; pengerjaan task dibuka setelah meeting selesai.
                </FeedbackMessage>
            )}

            <div className="emp-surface p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <AppointmentStatusBadge status={item.status} lifecycle={item.lifecycle} />
                    {canAccessWorkspace && (
                        <button
                            type="button"
                            onClick={() => router.push(`/employee/appointments/detail/${item.id}/history`)}
                            className="btn btn-secondary btn-sm shrink-0"
                        >
                            <History className="w-3.5 h-3.5" /> Riwayat
                        </button>
                    )}
                </div>

                {item.requesterEmployeeId && (
                    <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                        <span>
                            Penyelenggara: <strong className="font-semibold text-[var(--text-primary)]">{requesterDisplayName(item)}</strong>
                            {item.requesterEmployeeId === myEmployeeId ? " (Anda)" : ""}
                        </span>
                    </p>
                )}

                {item.leaderEmployeeId && (
                    <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                        <span>
                            Pimpinan Rapat: <strong className="font-semibold text-[var(--text-primary)]">{participantDisplayName(item.participants.find((p) => p.employeeId === item.leaderEmployeeId) ?? { employeeId: item.leaderEmployeeId, guestName: null })}</strong>
                            {item.leaderEmployeeId === myEmployeeId ? " (Anda)" : ""}
                        </span>
                    </p>
                )}

                {item.room && (
                    <p className="text-sm text-[var(--text-secondary)] flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0" /> {item.room.name}
                    </p>
                )}
                {item.meetingLink && (
                    <p className="text-sm text-[var(--text-secondary)] flex items-center gap-1.5 min-w-0">
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        <a
                            href={item.meetingLink.startsWith("http") ? item.meetingLink : `https://${item.meetingLink}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate text-[var(--primary)] hover:underline inline-flex items-center gap-1 min-w-0"
                        >
                            <span className="truncate">{item.meetingLink}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                    </p>
                )}

                {item.agenda && (
                    <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--secondary)_40%,transparent)] p-3 space-y-1">
                        <p className="emp-eyebrow flex items-center gap-1.5">
                            <StickyNote className="w-3.5 h-3.5" /> Agenda / Pokok Bahasan
                        </p>
                        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                            {item.agenda}
                        </p>
                    </div>
                )}

                <div>
                    <p className="emp-eyebrow flex items-center gap-1.5 mb-1.5">
                        <Users className="w-3.5 h-3.5" /> Peserta ({item.participants.length})
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mb-1.5">
                        {rsvpCounts.accepted} menerima · {rsvpCounts.declined} menolak · {rsvpCounts.pending} belum merespons
                    </p>
                    {myParticipant && !canRsvp && rsvpLocked && (
                        <div className="mb-2 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--secondary)_50%,transparent)] px-3 py-2.5">
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
                                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold min-h-9 flex items-center gap-1 transition-colors ${myParticipant?.inviteStatus === "ACCEPTED" ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)]"}`}
                                >
                                    {rsvping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    Terima Undangan
                                </button>
                                {!askingDecline ? (
                                    <button
                                        type="button"
                                        disabled={rsvping}
                                        onClick={() => setAskingDecline(true)}
                                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 flex items-center gap-1 ${myParticipant?.inviteStatus === "DECLINED" ? "bg-[var(--destructive)] text-white" : "bg-[var(--secondary)] text-[var(--text-secondary)]"}`}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                        Tolak Undangan
                                    </button>
                                ) : null}
                            </div>
                            {askingDecline && (
                                <div className="space-y-2 rounded-xl border border-[var(--border)] p-2.5">
                                    <DraftNotice
                                        compact
                                        visible={declineDraftRestored && declineNote.trim().length > 0}
                                        onDiscard={() => {
                                            discardDeclineDraft();
                                            setDeclineNote("");
                                        }}
                                    />
                                    <label className="form-label" htmlFor="decline-note">Alasan Penolakan * (dapat dibaca oleh penyelenggara)</label>
                                    <textarea
                                        id="decline-note"
                                        className="form-input min-h-[64px] resize-y"
                                        rows={3}
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
                                            className="btn flex-1 bg-[var(--destructive)] text-white hover:opacity-90"
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
                                    {canAccessWorkspace && p.inviteStatus === "DECLINED" && p.inviteNote && (
                                        <span className="block text-[11px] text-[var(--text-muted)] truncate" title={p.inviteNote}>Alasan: {p.inviteNote}</span>
                                    )}
                                </span>
                                <span className="flex gap-1 shrink-0 items-center">
                                    {!p.isExternal && <InviteResponseBadge status={p.inviteStatus ?? "PENDING"} />}
                                    {canMark ? (
                                    <span className="flex gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setMarks({ ...marks, [p.id]: "HADIR" })}
                                            className={`px-2 py-1 rounded-lg text-[11px] font-semibold min-h-9 ${marks[p.id] === "HADIR" || (!marks[p.id] && p.attendance === "HADIR") ? "bg-[var(--success)] text-white" : "bg-[var(--secondary)] text-[var(--text-secondary)]"}`}
                                        >
                                            Hadir
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMarks({ ...marks, [p.id]: "TIDAK_HADIR" })}
                                            className={`px-2 py-1 rounded-lg text-[11px] font-semibold min-h-9 ${marks[p.id] === "TIDAK_HADIR" || (!marks[p.id] && p.attendance === "TIDAK_HADIR") ? "bg-[var(--destructive)] text-white" : "bg-[var(--secondary)] text-[var(--text-secondary)]"}`}
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
                    <div className="space-y-2">
                        <DraftNotice
                            compact
                            visible={marksDraftRestored}
                            message="Pilihan kehadiran belum tersimpan dipulihkan."
                            onDiscard={() => {
                                discardMarksDraft();
                                setMarks({});
                            }}
                        />
                        <button type="button" onClick={handleSaveMarks} disabled={marking} className="btn btn-secondary w-full">
                            {marking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                            {marking ? "Menyimpan…" : `Simpan Kehadiran (${Object.keys(marks).length})`}
                        </button>
                    </div>
                )}

                <div className="flex gap-2">
                    {canMeetingSettings && (
                        <button type="button" onClick={() => setEditing(true)} disabled={actionLoading} className="btn btn-secondary flex-1" aria-label="Pengaturan meeting">
                            <Settings className="w-4 h-4" /> Pengaturan Meeting
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
                            className="btn flex-1 bg-[var(--destructive)] text-white hover:opacity-90"
                        >
                            <Trash2 className="w-4 h-4" /> Batalkan
                        </button>
                    )}
                </div>
                {askingCancel && (
                    <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                        <DraftNotice
                            compact
                            visible={cancelDraftRestored && cancelReason.trim().length > 0}
                            onDiscard={() => {
                                discardCancelDraft();
                                setCancelReason("");
                            }}
                        />
                        <label className="form-label" htmlFor="cancel-reason">Alasan Pembatalan *</label>
                        <textarea
                            id="cancel-reason"
                            className="form-input min-h-[64px] resize-y"
                            rows={3}
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder="Tuliskan alasan (minimal 5 karakter)"
                        />
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => { setAskingCancel(false); setCancelReason(""); }}
                                disabled={actionLoading}
                                className="btn btn-secondary flex-1"
                            >
                                Kembali
                            </button>
                            <button
                                type="button"
                                onClick={() => { void handleCancel(); }}
                                disabled={actionLoading || cancelReason.trim().length < 5}
                                className="btn flex-1 bg-[var(--destructive)] text-white hover:opacity-90"
                            >
                                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {actionLoading ? "Membatalkan…" : "Ya, Batalkan Meeting"}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {canAccessWorkspace && (
                <>
                    <div className="emp-surface p-4">
                        <MeetingMinutesSection appointmentId={item.id} readOnly={item.status === "CANCELLED" || (!isInvolved && !canManageAll)} refreshKey={syncKey} />
                    </div>

                    <div className="emp-surface p-4">
                        <MeetingTaskSummary
                            appointmentId={item.id}
                            participants={taskParticipants}
                            canCreateTask={canCreateMeetingTask}
                            myEmployeeId={myEmployeeId}
                            refreshKey={syncKey}
                        />
                    </div>
                </>
            )}

            {editing && (
                <AppointmentFormModal
                    initialDate={item.startAt.slice(0, 10)}
                    editing={item}
                    myEmployeeId={myEmployeeId}
                    myEmployeeName={myEmployeeName}
                    onClose={() => setEditing(false)}
                    onSaved={() => { setEditing(false); void load(); }}
                />
            )}
        </div>
    );
}
