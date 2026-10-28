import { prisma } from "@/lib/prisma";
import { isWig002 } from "@/lib/services/appointmentService";
import { isMeetingMonitor } from "@/lib/services/appointmentService";
import type { SessionPayload } from "@/lib/auth";
import { MeetingTaskError, isReceiverStickyOverdue } from "@/lib/services/meetingTaskService";

export interface HistoryEvent {
    id: string;
    at: string;
    scope: "meeting" | "task";
    action: string;
    title: string;
    detail: string | null;
    actorName: string | null;
    reason: string | null;
    taskId: string | null;
}

export interface MeetingHistory {
    appointment: {
        id: string;
        title: string;
        agenda: string | null;
        status: string;
        lifecycle: string;
        startAt: string;
        endAt: string;
        isFullDay: boolean;
        roomName: string | null;
        meetingLink: string | null;
        requesterName: string | null;
        minutes: string | null;
    };
    summary: {
        participants: number;
        accepted: number;
        declined: number;
        present: number;
        tasks: number;
        tasksDone: number;
        tasksOverdue: number;
        extensions: number;
    };
    events: HistoryEvent[];
}

function fmtDateTime(d: Date): string {
    return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(d: Date): string {
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export async function getMeetingHistory(session: SessionPayload, appointmentId: string): Promise<MeetingHistory> {
    if (!session.employeeId && !isWig002(session)) {
        throw new MeetingTaskError("Hanya karyawan yang dapat melihat riwayat meeting.", 403);
    }

    const appt = await prisma.meetingAppointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            title: true,
            agenda: true,
            status: true,
            startAt: true,
            endAt: true,
            isFullDay: true,
            meetingLink: true,
            requesterEmployeeId: true,
            createdAt: true,
            minutes: true,
            requester: { select: { employeeId: true, name: true } },
            room: { select: { name: true } },
            participants: {
                select: {
                    id: true,
                    employeeId: true,
                    guestName: true,
                    isExternal: true,
                    attendance: true,
                    inviteStatus: true,
                    inviteRespondedAt: true,
                    inviteNote: true,
                    employee: { select: { employeeId: true, name: true } },
                },
            },
            revisions: {
                orderBy: { revisionNumber: "asc" },
                take: 200,
                select: { id: true, revisionNumber: true, changeReason: true, changedBy: true, previousData: true, createdAt: true },
            },
            tasks: {
                orderBy: { createdAt: "asc" },
                take: 100,
                select: {
                    id: true,
                    title: true,
                    createdAt: true,
                    isCancelled: true,
                    cancelReason: true,
                    cancelledAt: true,
                    assigner: { select: { employeeId: true, name: true } },
                    assignees: {
                        select: {
                            employeeId: true,
                            status: true,
                            completedAt: true,
                            updatedAt: true,
                            employee: { select: { employeeId: true, name: true } },
                        },
                    },
                    deadlineHistory: { orderBy: { sequence: "asc" }, select: { sequence: true, deadlineDate: true, reason: true, createdBy: true, createdAt: true } },
                    submissions: {
                        orderBy: { attemptNo: "asc" },
                        select: {
                            id: true,
                            employeeId: true,
                            note: true,
                            attemptNo: true,
                            verdict: true,
                            resubmitDueAt: true,
                            verifiedBy: true,
                            verifiedAt: true,
                            verifyNote: true,
                            createdAt: true,
                        },
                    },
                },
            },
        },
    });
    if (!appt) throw new MeetingTaskError("Jadwal meeting tidak ditemukan.", 404);

    const me = session.employeeId;
    const allowed =
        isWig002(session) ||
        (await isMeetingMonitor(session)) ||
        appt.requesterEmployeeId === me ||
        appt.participants.some((p) => p.employeeId !== null && p.employeeId === me);
    if (!allowed) throw new MeetingTaskError("Anda bukan peserta meeting ini.", 403);

    // Peta employeeId -> nama dari relasi yang sudah di-fetch (tanpa query tambahan)
    const nameOf = new Map<string, string>();
    if (appt.requester) nameOf.set(appt.requester.employeeId, appt.requester.name ?? appt.requester.employeeId);
    for (const p of appt.participants) {
        if (p.employeeId) nameOf.set(p.employeeId, p.employee?.name ?? p.employeeId);
    }
    for (const t of appt.tasks) {
        if (t.assigner) nameOf.set(t.assigner.employeeId, t.assigner.name ?? t.assigner.employeeId);
        for (const a of t.assignees) nameOf.set(a.employeeId, a.employee?.name ?? a.employeeId);
        for (const s of t.submissions) nameOf.set(s.employeeId, nameOf.get(s.employeeId) ?? s.employeeId);
    }
    // Username pelaku (changedBy/decidedBy) umumnya = employeeId akun karyawan
    const resolveActor = (username: string | null | undefined): string | null => {
        if (!username) return null;
        return nameOf.get(username) ?? username;
    };

    const events: HistoryEvent[] = [];
    const push = (e: Omit<HistoryEvent, "id"> & { id: string }) => events.push(e);

    push({
        id: `created-${appt.id}`,
        at: appt.createdAt.toISOString(),
        scope: "meeting",
        action: "created",
        title: "Meeting dibuat",
        detail: appt.requester ? `Penyelenggara: ${nameOf.get(appt.requester.employeeId) ?? appt.requester.employeeId}` : null,
        actorName: appt.requester ? (nameOf.get(appt.requester.employeeId) ?? null) : null,
        reason: null,
        taskId: null,
    });

    for (const rev of appt.revisions) {
        const prev = rev.previousData as Record<string, unknown> | null;
        if (prev && typeof prev === "object" && "minutes" in prev) {
            const isDeleted = prev.deleted === true;
            const isFirst = !isDeleted && (prev.minutes === null || prev.minutes === undefined);
            const action = isDeleted ? "minutes_deleted" : isFirst ? "minutes_created" : "minutes_updated";
            push({
                id: `rev-${rev.id}`,
                at: rev.createdAt.toISOString(),
                scope: "meeting",
                action,
                title: isDeleted ? "Notulensi dihapus" : isFirst ? "Notulensi ditulis" : "Notulensi diubah",
                detail: rev.changeReason,
                actorName: resolveActor(rev.changedBy),
                reason: rev.changeReason,
                taskId: null,
            });
            continue;
        }
        if (prev && typeof prev === "object" && (prev.kind === "completed_early" || rev.changeReason === "Meeting diselesaikan lebih awal.")) {
            push({
                id: `rev-${rev.id}`,
                at: rev.createdAt.toISOString(),
                scope: "meeting",
                action: "completed_early",
                title: "Meeting diselesaikan lebih awal",
                detail: null,
                actorName: resolveActor(rev.changedBy),
                reason: null,
                taskId: null,
            });
            continue;
        }
        // Reschedule selalu menyimpan meetingLink + kind di previousData; cancel menyimpan kind.
        // Fallback legacy: baris lama tanpa kind dibedakan via kehadiran kunci meetingLink.
        if ((prev && typeof prev === "object" && prev.kind === "cancelled") || (!prev || typeof prev !== "object" || !("meetingLink" in prev))) {
            push({
                id: `rev-${rev.id}`,
                at: rev.createdAt.toISOString(),
                scope: "meeting",
                action: "cancelled",
                title: "Meeting dibatalkan",
                detail: null,
                actorName: resolveActor(rev.changedBy),
                reason: rev.changeReason,
                taskId: null,
            });
            continue;
        }
        push({
            id: `rev-${rev.id}`,
            at: rev.createdAt.toISOString(),
            scope: "meeting",
            action: "rescheduled",
            title: "Jadwal/ruangan diubah",
            detail: null,
            actorName: resolveActor(rev.changedBy),
            reason: rev.changeReason,
            taskId: null,
        });
    }

    for (const p of appt.participants) {
        if (!p.inviteStatus || p.inviteStatus === "PENDING" || !p.inviteRespondedAt) continue;
        const who = p.isExternal ? (p.guestName ?? "Tamu") : (p.employeeId ? (nameOf.get(p.employeeId) ?? p.employeeId) : "Peserta");
        push({
            id: `rsvp-${p.id}-${p.inviteRespondedAt.toISOString()}`,
            at: p.inviteRespondedAt.toISOString(),
            scope: "meeting",
            action: p.inviteStatus === "ACCEPTED" ? "rsvp_accepted" : "rsvp_declined",
            title: p.inviteStatus === "ACCEPTED" ? "Undangan diterima" : "Undangan ditolak",
            detail: p.inviteStatus === "DECLINED" && p.inviteNote ? `Alasan: ${p.inviteNote}` : who,
            actorName: who,
            reason: p.inviteStatus === "DECLINED" ? (p.inviteNote ?? null) : null,
            taskId: null,
        });
    }

    const now = new Date();
    let tasksDone = 0;
    let tasksOverdue = 0;
    let extensions = 0;

    for (const t of appt.tasks) {
        const assignerName = t.assigner ? (nameOf.get(t.assigner.employeeId) ?? t.assigner.employeeId) : "—";
        const activeDeadline = t.deadlineHistory[t.deadlineHistory.length - 1]?.deadlineDate ?? null;
        const originalDue = t.deadlineHistory[0]?.deadlineDate ?? null;
        const allDone = !t.isCancelled && t.assignees.length > 0 && t.assignees.every((a) => a.status === "SELESAI");
        if (allDone) tasksDone++;
        const anyOverdue =
            !t.isCancelled &&
            t.assignees.some((a) => {
                if (a.status === "SELESAI" || a.status === "DIBATALKAN") return false;
                if (activeDeadline !== null && now.getTime() > activeDeadline.getTime()) return true;
                return isReceiverStickyOverdue(
                    t.submissions.filter((s) => s.employeeId === a.employeeId).map((s) => ({ createdAt: s.createdAt, attemptNo: s.attemptNo, verdict: s.verdict, resubmitDueAt: s.resubmitDueAt })),
                    originalDue,
                    now,
                    { status: a.status, completedAt: a.completedAt }
                );
            });
        if (anyOverdue) tasksOverdue++;
        extensions += Math.max(0, t.deadlineHistory.length - 1);

        push({
            id: `task-created-${t.id}`,
            at: t.createdAt.toISOString(),
            scope: "task",
            action: "task_created",
            title: `Task dibuat: ${t.title}`,
            detail: `${assignerName} → ${t.assignees.map((a) => nameOf.get(a.employeeId) ?? a.employeeId).join(", ")}${activeDeadline ? ` · Deadline ${fmtDate(activeDeadline)}` : ""}`,
            actorName: assignerName,
            reason: null,
            taskId: t.id,
        });

        for (const h of t.deadlineHistory) {
            if (h.sequence === 1) continue;
            push({
                id: `task-ext-${t.id}-${h.sequence}`,
                at: h.createdAt.toISOString(),
                scope: "task",
                action: "deadline_extended",
                title: `Deadline diperpanjang ke ${fmtDate(h.deadlineDate)}`,
                detail: `${t.title}${h.reason ? ` — ${h.reason}` : ""}`,
                actorName: resolveActor(h.createdBy),
                reason: h.reason ?? null,
                taskId: t.id,
            });
        }

        for (const s of t.submissions) {
            const who = nameOf.get(s.employeeId) ?? s.employeeId;
            push({
                id: `task-sub-${s.id}`,
                at: s.createdAt.toISOString(),
                scope: "task",
                action: "task_submitted",
                title: `Hasil dikumpulkan: ${t.title} (attempt ${s.attemptNo})`,
                detail: `${who}${s.note ? ` — ${s.note}` : ""}`,
                actorName: who,
                reason: null,
                taskId: t.id,
            });
            if (s.verdict === "DITERIMA" && s.verifiedAt) {
                push({
                    id: `task-verify-${s.id}`,
                    at: s.verifiedAt.toISOString(),
                    scope: "task",
                    action: "submission_approved",
                    title: `Disetujui: ${t.title}`,
                    detail: `${who}${s.verifyNote ? ` — ${s.verifyNote}` : ""}`,
                    actorName: resolveActor(s.verifiedBy),
                    reason: s.verifyNote ?? null,
                    taskId: t.id,
                });
            } else if (s.verdict === "DIREVISI" && s.verifiedAt) {
                push({
                    id: `task-rev-${s.id}`,
                    at: s.verifiedAt.toISOString(),
                    scope: "task",
                    action: "revision_requested",
                    title: `Revisi diminta: ${t.title} (attempt ${s.attemptNo})`,
                    detail: `${who} · tenggat revisi ${s.resubmitDueAt ? fmtDate(s.resubmitDueAt) : "-"}${s.verifyNote ? ` — ${s.verifyNote}` : ""}`,
                    actorName: resolveActor(s.verifiedBy),
                    reason: s.verifyNote ?? null,
                    taskId: t.id,
                });
            }
        }

        for (const a of t.assignees) {
            const who = nameOf.get(a.employeeId) ?? a.employeeId;
            const subs = t.submissions.filter((s) => s.employeeId === a.employeeId);
            const sticky = isReceiverStickyOverdue(
                subs.map((s) => ({ createdAt: s.createdAt, attemptNo: s.attemptNo, verdict: s.verdict, resubmitDueAt: s.resubmitDueAt })),
                originalDue,
                now,
                { status: a.status, completedAt: a.completedAt }
            );
            if (a.status === "SELESAI" && a.completedAt) {
                push({
                    id: `task-done-${t.id}-${a.employeeId}`,
                    at: a.completedAt.toISOString(),
                    scope: "task",
                    action: sticky ? "task_done_late" : "task_done",
                    title: sticky ? `Selesai (overdue): ${t.title}` : `Selesai: ${t.title}`,
                    detail: who,
                    actorName: who,
                    reason: null,
                    taskId: t.id,
                });
            } else if (a.status === "ON_PROGRESS") {
                push({
                    id: `task-progress-${t.id}-${a.employeeId}`,
                    at: a.updatedAt.toISOString(),
                    scope: "task",
                    action: "task_progress",
                    title: `Menunggu verifikasi: ${t.title}`,
                    detail: `${who} · terakhir diperbarui ${fmtDateTime(a.updatedAt)}`,
                    actorName: who,
                    reason: null,
                    taskId: t.id,
                });
            }
        }

        if (t.isCancelled) {
            push({
                id: `task-cancelled-${t.id}`,
                at: (t.cancelledAt ?? t.createdAt).toISOString(),
                scope: "task",
                action: "task_cancelled",
                title: `Task dibatalkan: ${t.title}`,
                detail: null,
                actorName: assignerName,
                reason: t.cancelReason ?? null,
                taskId: t.id,
            });
        }
    }

    events.sort((a, b) => a.at.localeCompare(b.at));

    const accepted = appt.participants.filter((p) => p.inviteStatus === "ACCEPTED").length;
    const declined = appt.participants.filter((p) => p.inviteStatus === "DECLINED").length;
    const present = appt.participants.filter((p) => p.attendance === "HADIR").length;
    const stored = appt.status;
    const lifecycle = stored !== "SCHEDULED" ? stored : now.getTime() >= appt.endAt.getTime() ? "COMPLETED" : now.getTime() >= appt.startAt.getTime() ? "IN_PROGRESS" : "SCHEDULED";

    return {
        appointment: {
            id: appt.id,
            title: appt.title,
            agenda: appt.agenda,
            status: stored,
            lifecycle,
            startAt: appt.startAt.toISOString(),
            endAt: appt.endAt.toISOString(),
            isFullDay: appt.isFullDay,
            roomName: appt.room?.name ?? null,
            meetingLink: appt.meetingLink,
            requesterName: appt.requester ? (nameOf.get(appt.requester.employeeId) ?? null) : null,
            minutes: appt.minutes,
        },
        summary: {
            participants: appt.participants.length,
            accepted,
            declined,
            present,
            tasks: appt.tasks.length,
            tasksDone,
            tasksOverdue,
            extensions,
        },
        events,
    };
}
