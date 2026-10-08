import { prisma } from "@/lib/prisma";
import { isValidCalendarDate, toWIBDateString, wibDateTimeToDate } from "@/lib/timezone";
import { PERMISSIONS } from "@/lib/permissions";
import type { SessionPayload } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import logger from "@/lib/logger";
import { isAppointmentPic, isWig002 } from "@/lib/services/appointmentService";

type TxClient = Prisma.TransactionClient;

// ─── Error ────────────────────────────────────────────────────────

export class MeetingTaskError extends Error {
    constructor(message: string, public statusCode: number = 400) {
        super(message);
        this.name = "MeetingTaskError";
    }
}

// ─── Konstanta ────────────────────────────────────────────────────

export const MEETING_TASK_MAX_EXTENSIONS_KEY = "meeting.task.maxExtensions" as const;
export const DEFAULT_MEETING_TASK_MAX_EXTENSIONS = 3 as const;
export const MEETING_TASK_REMINDER_OFFSETS = [1440, 180, 60] as const;
const SETTINGS_CACHE_TTL_MS = 60_000;

export type MeetingTaskAssigneeStatus = "BELUM_DIKERJAKAN" | "ON_PROGRESS" | "SELESAI" | "DIBATALKAN";
export const ASSIGNEE_FINAL_STATUSES: MeetingTaskAssigneeStatus[] = ["SELESAI", "DIBATALKAN"];

let maxExtensionsCache: { value: number; expiresAt: number } | null = null;

export function invalidateMeetingTaskMaxExtensionsCache(): void {
    maxExtensionsCache = null;
}

export async function getMeetingTaskMaxExtensions(): Promise<number> {
    if (maxExtensionsCache && Date.now() <= maxExtensionsCache.expiresAt) return maxExtensionsCache.value;
    try {
        const row = await prisma.appSetting.findUnique({ where: { key: MEETING_TASK_MAX_EXTENSIONS_KEY } });
        const parsed = row?.value ? Number.parseInt(row.value, 10) : NaN;
        const value = Number.isFinite(parsed) && parsed >= 0 && parsed <= 10 ? parsed : DEFAULT_MEETING_TASK_MAX_EXTENSIONS;
        maxExtensionsCache = { value, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
        return value;
    } catch {
        return DEFAULT_MEETING_TASK_MAX_EXTENSIONS;
    }
}

/** Deadline YYYY-MM-DD dimaknai sebagai akhir hari WIB (23:59) agar "deadline 12/10" berarti sampai 12/10 malam. */
export function meetingTaskDueDateToDate(dueDate: string): Date {
    return wibDateTimeToDate(dueDate, "23:59");
}

export function isAssigneeOverdue(dueAt: Date, status: string, now: Date = new Date()): boolean {
    if (status === "SELESAI" || status === "DIBATALKAN") return false;
    return now.getTime() > dueAt.getTime();
}

// ─── Akses ────────────────────────────────────────────────────────

async function getMeetingOrThrow(appointmentId: string) {
    const appt = await prisma.meetingAppointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            title: true,
            status: true,
            startAt: true,
            requesterEmployeeId: true,
            participants: { select: { employeeId: true } },
        },
    });
    if (!appt) throw new MeetingTaskError("Jadwal meeting tidak ditemukan.", 404);
    return appt;
}

function internalParticipantIds(appt: { requesterEmployeeId: string | null; participants: Array<{ employeeId: string | null }> }): string[] {
    const ids = new Set<string>();
    if (appt.requesterEmployeeId) ids.add(appt.requesterEmployeeId);
    for (const p of appt.participants) if (p.employeeId) ids.add(p.employeeId);
    return [...ids];
}

export async function isPrivileged(session: SessionPayload): Promise<boolean> {
    if (isWig002(session) || session.permissions.includes(PERMISSIONS.HR_MANAGE)) return true;
    return isAppointmentPic(session).catch(() => false);
}

async function assertCanAccessMeeting(session: SessionPayload, appt: { requesterEmployeeId: string | null; participants: Array<{ employeeId: string | null }> }): Promise<void> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat mengakses task meeting.", 403);
    if (await isPrivileged(session)) return;
    if (!internalParticipantIds(appt).includes(session.employeeId)) {
        throw new MeetingTaskError("Anda bukan peserta meeting ini.", 403);
    }
}

async function assertActiveEmployees(employeeIds: string[]): Promise<void> {
    const rows = await prisma.employee.findMany({
        where: { employeeId: { in: employeeIds } },
        select: { employeeId: true, isActive: true },
    });
    const active = new Set(rows.filter((r) => r.isActive).map((r) => r.employeeId));
    const missing = employeeIds.filter((id) => !active.has(id));
    if (missing.length > 0) throw new MeetingTaskError("Penerima task harus karyawan internal yang aktif.", 422);
}

// ─── DTO ──────────────────────────────────────────────────────────

const taskInclude = {
    assigner: { select: { employeeId: true, name: true } },
    appointment: { select: { id: true, title: true, startAt: true, status: true, room: { select: { name: true } } } },
    assignees: { include: { employee: { select: { employeeId: true, name: true } } }, orderBy: { createdAt: "asc" as const } },
    deadlineHistory: { orderBy: { sequence: "asc" as const } },
} satisfies Prisma.MeetingTaskInclude;

type TaskRow = Prisma.MeetingTaskGetPayload<{ include: typeof taskInclude }>;

export function toTaskDto(task: TaskRow, now: Date = new Date()) {
    const activeDeadline = task.deadlineHistory[task.deadlineHistory.length - 1] ?? null;
    const assignees = task.assignees.map((a) => ({
        employeeId: a.employeeId,
        name: a.employee?.name ?? a.employeeId,
        status: a.status,
        completedAt: a.completedAt,
        isOverdue: activeDeadline ? isAssigneeOverdue(activeDeadline.deadlineDate, a.status, now) : false,
    }));
    const open = assignees.filter((a) => !ASSIGNEE_FINAL_STATUSES.includes(a.status as MeetingTaskAssigneeStatus));
    return {
        id: task.id,
        appointmentId: task.appointmentId,
        title: task.title,
        detail: task.detail,
        isCancelled: task.isCancelled,
        cancelReason: task.cancelReason,
        createdAt: task.createdAt,
        assigner: task.assigner,
        appointment: task.appointment,
        activeDeadline: activeDeadline
            ? { date: toWIBDateString(activeDeadline.deadlineDate), deadlineAt: activeDeadline.deadlineDate, sequence: activeDeadline.sequence }
            : null,
        extensionsCount: Math.max(0, task.deadlineHistory.length - 1),
        assignees,
        allDone: !task.isCancelled && assignees.length > 0 && open.length === 0 && assignees.every((a) => a.status === "SELESAI"),
        anyOverdue: !task.isCancelled && assignees.some((a) => a.isOverdue),
        openCount: open.length,
    };
}

export type MeetingTaskDto = ReturnType<typeof toTaskDto>;

// ─── Buat task ────────────────────────────────────────────────────

export interface CreateMeetingTaskInput {
    title: string;
    detail?: string | null;
    assigneeEmployeeIds: string[];
    dueDate: string; // YYYY-MM-DD
}

export async function createMeetingTask(
    session: SessionPayload,
    appointmentId: string,
    input: CreateMeetingTaskInput,
    actor: { userId?: string | null; username: string }
): Promise<MeetingTaskDto> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat membuat task meeting.", 403);
    const appt = await getMeetingOrThrow(appointmentId);
    if (appt.status === "CANCELLED") throw new MeetingTaskError("Meeting yang dibatalkan tidak dapat diberi task.", 409);
    await assertCanAccessMeeting(session, appt);

    const assigneeIds = [...new Set(input.assigneeEmployeeIds.map((v) => v.trim()).filter(Boolean))];
    if (assigneeIds.length === 0) throw new MeetingTaskError("Pilih minimal satu penerima task.", 400);
    if (assigneeIds.length > 20) throw new MeetingTaskError("Penerima task maksimal 20 orang.", 400);
    const memberIds = internalParticipantIds(appt);
    const outsiders = assigneeIds.filter((id) => !memberIds.includes(id));
    if (outsiders.length > 0) throw new MeetingTaskError("Penerima task harus peserta meeting ini.", 422);
    await assertActiveEmployees(assigneeIds);
    if (!isValidCalendarDate(input.dueDate)) throw new MeetingTaskError("Tanggal deadline tidak valid. Gunakan format YYYY-MM-DD.", 400);
    const title = input.title.trim();
    if (!title) throw new MeetingTaskError("Judul task wajib diisi.", 400);
    const dueAt = meetingTaskDueDateToDate(input.dueDate);

    const created = await prisma.$transaction(async (tx) => {
        const task = await tx.meetingTask.create({
            data: {
                appointmentId,
                title: title.slice(0, 200),
                detail: input.detail?.trim().slice(0, 5000) || null,
                assignerEmployeeId: session.employeeId as string,
                createdByUserId: actor.userId ?? null,
                assignees: { create: assigneeIds.map((employeeId) => ({ employeeId })) },
                deadlineHistory: { create: { sequence: 1, deadlineDate: dueAt, createdBy: actor.username } },
                revisions: { create: { revisionNumber: 1, changeReason: "Task dibuat.", changedBy: actor.username, previousData: {} } },
            },
            include: taskInclude,
        });
        await tx.auditLog.create({
            data: {
                action: "CREATE_MEETING_TASK",
                entity: "MEETING_TASK",
                entityId: task.id,
                details: JSON.stringify({ appointmentId, title: task.title, assignees: assigneeIds, dueDate: input.dueDate }),
                actorType: "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.username,
            },
        }).catch((err) => logger.error("meetingTask audit CREATE gagal", { err }));
        return task;
    });
    return toTaskDto(created);
}

// ─── Baca ─────────────────────────────────────────────────────────

export async function getTasksForMeeting(session: SessionPayload, appointmentId: string): Promise<MeetingTaskDto[]> {
    const appt = await getMeetingOrThrow(appointmentId);
    await assertCanAccessMeeting(session, appt);
    const tasks = await prisma.meetingTask.findMany({
        where: { appointmentId },
        orderBy: { createdAt: "asc" },
        include: taskInclude,
    });
    const now = new Date();
    return tasks.map((t) => toTaskDto(t, now));
}

export async function getMyMeetingTasks(
    session: SessionPayload,
    filters: { status?: string; overdue?: boolean }
): Promise<MeetingTaskDto[]> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat melihat task meeting.", 403);
    const rows = await prisma.meetingTaskAssignee.findMany({
        where: {
            employeeId: session.employeeId,
            ...(filters.status ? { status: filters.status as MeetingTaskAssigneeStatus } : {}),
            task: { isCancelled: false },
        },
        include: { task: { include: taskInclude } },
        orderBy: { createdAt: "desc" },
        take: 200,
    });
    const now = new Date();
    let dtos = rows.map((r) => toTaskDto(r.task, now));
    if (filters.overdue) dtos = dtos.filter((d) => d.assignees.some((a) => a.employeeId === session.employeeId && a.isOverdue));
    return dtos;
}

// ─── Update status (penerima) ─────────────────────────────────────

const ALLOWED_SELF_STATUS: MeetingTaskAssigneeStatus[] = ["BELUM_DIKERJAKAN", "ON_PROGRESS", "SELESAI"];

export async function updateMyTaskStatus(
    session: SessionPayload,
    taskId: string,
    status: MeetingTaskAssigneeStatus,
    actor: { userId?: string | null; username: string }
): Promise<MeetingTaskDto> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat mengubah status task.", 403);
    if (!ALLOWED_SELF_STATUS.includes(status)) throw new MeetingTaskError("Status tidak valid.", 400);
    const row = await prisma.meetingTaskAssignee.findUnique({
        where: { taskId_employeeId: { taskId, employeeId: session.employeeId } },
        include: { task: { select: { id: true, isCancelled: true } } },
    });
    if (!row) throw new MeetingTaskError("Task ini tidak ditugaskan kepada Anda.", 403);
    if (row.task.isCancelled) throw new MeetingTaskError("Task sudah dibatalkan.", 409);
    await prisma.meetingTaskAssignee.update({
        where: { id: row.id },
        data: { status, completedAt: status === "SELESAI" ? new Date() : null },
    });
    await prisma.auditLog.create({
        data: {
            action: "UPDATE_MEETING_TASK_STATUS",
            entity: "MEETING_TASK",
            entityId: taskId,
            details: JSON.stringify({ employeeId: session.employeeId, status }),
            actorType: "USER",
            actorUserId: actor.userId ?? null,
            actorIdentifier: actor.username,
        },
    }).catch((err) => logger.error("meetingTask audit STATUS gagal", { err }));
    const task = await prisma.meetingTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    return toTaskDto(task);
}

// ─── Perpanjangan (pemberi/PIC) ───────────────────────────────────

async function applyExtensionTx(
    tx: TxClient,
    taskId: string,
    proposedDate: string,
    reason: string,
    actor: { userId?: string | null; username: string }
) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM meeting_tasks WHERE id = ${taskId} FOR UPDATE`;
    if (locked.length === 0) throw new MeetingTaskError("Task meeting tidak ditemukan.", 404);
    const history = await tx.meetingTaskDeadlineHistory.findMany({ where: { taskId }, orderBy: { sequence: "desc" }, take: 1 });
    const current = history[0];
    if (!current) throw new MeetingTaskError("Riwayat deadline task tidak ditemukan.", 500);
    const max = await getMeetingTaskMaxExtensions();
    if (history.length >= 1) {
        const count = await tx.meetingTaskDeadlineHistory.count({ where: { taskId } });
        if (count - 1 >= max) throw new MeetingTaskError(`Kuota perpanjangan habis (maksimal ${max} kali).`, 409);
    }
    if (!isValidCalendarDate(proposedDate)) throw new MeetingTaskError("Tanggal perpanjangan tidak valid. Gunakan format YYYY-MM-DD.", 400);
    const nextDue = meetingTaskDueDateToDate(proposedDate);
    if (nextDue.getTime() <= current.deadlineDate.getTime()) {
        throw new MeetingTaskError("Tanggal baru harus setelah deadline aktif.", 400);
    }
    const seq = current.sequence + 1;
    await tx.meetingTaskDeadlineHistory.create({
        data: { taskId, sequence: seq, deadlineDate: nextDue, reason: reason.trim(), createdBy: actor.username },
    });
    const revCount = await tx.meetingTaskRevision.count({ where: { taskId } });
    await tx.meetingTaskRevision.create({
        data: {
            taskId,
            revisionNumber: revCount + 1,
            changeReason: `Deadline diperpanjang ke ${proposedDate}: ${reason.trim()}`,
            changedBy: actor.username,
            previousData: { deadlineDate: current.deadlineDate.toISOString(), sequence: current.sequence },
        },
    });
    return { sequence: seq, deadlineDate: nextDue };
}

export async function extendTaskDeadline(
    session: SessionPayload,
    taskId: string,
    input: { proposedDate: string; reason: string },
    actor: { userId?: string | null; username: string }
): Promise<MeetingTaskDto> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat memperpanjang deadline.", 403);
    const task = await prisma.meetingTask.findUnique({
        where: { id: taskId },
        select: { id: true, isCancelled: true, assignerEmployeeId: true },
    });
    if (!task) throw new MeetingTaskError("Task meeting tidak ditemukan.", 404);
    if (task.isCancelled) throw new MeetingTaskError("Task sudah dibatalkan.", 409);
    const privileged = await isPrivileged(session);
    if (task.assignerEmployeeId !== session.employeeId && !privileged) {
        throw new MeetingTaskError("Hanya pemberi task atau PIC yang dapat memperpanjang deadline.", 403);
    }
    if (!input.reason || input.reason.trim().length < 5) throw new MeetingTaskError("Alasan perpanjangan minimal 5 karakter.", 400);

    await prisma.$transaction(async (tx) => {
        await applyExtensionTx(tx, taskId, input.proposedDate, input.reason, actor);
        await tx.meetingTaskExtensionRequest.updateMany({
            where: { taskId, status: "PENDING" },
            data: { status: "REJECTED", decidedBy: actor.username, decidedAt: new Date() },
        });
        await tx.auditLog.create({
            data: {
                action: "EXTEND_MEETING_TASK_DEADLINE",
                entity: "MEETING_TASK",
                entityId: taskId,
                details: JSON.stringify({ proposedDate: input.proposedDate, reason: input.reason.trim() }),
                actorType: "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.username,
            },
        }).catch((err) => logger.error("meetingTask audit EXTEND gagal", { err }));
    });
    const updated = await prisma.meetingTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    return toTaskDto(updated);
}

// ─── Batalkan (pemberi/PIC) ───────────────────────────────────────

export async function cancelMeetingTask(
    session: SessionPayload,
    taskId: string,
    reason: string,
    actor: { userId?: string | null; username: string }
): Promise<MeetingTaskDto> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat membatalkan task.", 403);
    const task = await prisma.meetingTask.findUnique({ where: { id: taskId }, select: { id: true, isCancelled: true, assignerEmployeeId: true } });
    if (!task) throw new MeetingTaskError("Task meeting tidak ditemukan.", 404);
    if (task.isCancelled) throw new MeetingTaskError("Task sudah dibatalkan.", 409);
    const privileged = await isPrivileged(session);
    if (task.assignerEmployeeId !== session.employeeId && !privileged) {
        throw new MeetingTaskError("Hanya pemberi task atau PIC yang dapat membatalkan.", 403);
    }
    if (!reason || reason.trim().length < 5) throw new MeetingTaskError("Alasan pembatalan minimal 5 karakter.", 400);
    await prisma.$transaction(async (tx) => {
        await tx.meetingTask.update({ where: { id: taskId }, data: { isCancelled: true, cancelReason: reason.trim(), cancelledAt: new Date() } });
        await tx.meetingTaskAssignee.updateMany({
            where: { taskId, status: { in: ["BELUM_DIKERJAKAN", "ON_PROGRESS"] } },
            data: { status: "DIBATALKAN" },
        });
        const revCount = await tx.meetingTaskRevision.count({ where: { taskId } });
        await tx.meetingTaskRevision.create({
            data: { taskId, revisionNumber: revCount + 1, changeReason: `Task dibatalkan: ${reason.trim()}`, changedBy: actor.username, previousData: {} },
        });
    });
    await prisma.auditLog.create({
        data: { action: "CANCEL_MEETING_TASK", entity: "MEETING_TASK", entityId: taskId, details: JSON.stringify({ reason: reason.trim() }), actorType: "USER", actorUserId: actor.userId ?? null, actorIdentifier: actor.username },
    }).catch((err) => logger.error("meetingTask audit CANCEL gagal", { err }));
    const updated = await prisma.meetingTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    return toTaskDto(updated);
}

// ─── Minta perpanjangan (penerima) ────────────────────────────────

export async function requestTaskExtension(
    session: SessionPayload,
    taskId: string,
    input: { proposedDate: string; reason: string },
    actor: { userId?: string | null; username: string }
) {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat meminta perpanjangan.", 403);
    const row = await prisma.meetingTaskAssignee.findUnique({
        where: { taskId_employeeId: { taskId, employeeId: session.employeeId } },
        include: { task: { select: { id: true, isCancelled: true } } },
    });
    if (!row) throw new MeetingTaskError("Task ini tidak ditugaskan kepada Anda.", 403);
    if (row.task.isCancelled) throw new MeetingTaskError("Task sudah dibatalkan.", 409);
    if (row.status === "SELESAI") throw new MeetingTaskError("Task sudah selesai, tidak perlu perpanjangan.", 409);
    if (!isValidCalendarDate(input.proposedDate)) throw new MeetingTaskError("Tanggal usulan tidak valid. Gunakan format YYYY-MM-DD.", 400);
    if (!input.reason || input.reason.trim().length < 5) throw new MeetingTaskError("Alasan perpanjangan minimal 5 karakter.", 400);
    const existing = await prisma.meetingTaskExtensionRequest.findFirst({ where: { taskId, requestedByEmployeeId: session.employeeId, status: "PENDING" } });
    if (existing) throw new MeetingTaskError("Pengajuan perpanjangan Anda masih menunggu keputusan.", 409);
    const created = await prisma.meetingTaskExtensionRequest.create({
        data: {
            taskId,
            requestedByEmployeeId: session.employeeId,
            proposedDate: meetingTaskDueDateToDate(input.proposedDate),
            reason: input.reason.trim(),
        },
        include: { requestedBy: { select: { employeeId: true, name: true } } },
    });
    await prisma.auditLog.create({
        data: { action: "REQUEST_MEETING_TASK_EXTENSION", entity: "MEETING_TASK", entityId: taskId, details: JSON.stringify({ proposedDate: input.proposedDate }), actorType: "USER", actorUserId: actor.userId ?? null, actorIdentifier: actor.username },
    }).catch((err) => logger.error("meetingTask audit REQUEST_EXT gagal", { err }));
    return created;
}

export async function decideTaskExtension(
    session: SessionPayload,
    requestId: string,
    decision: "APPROVED" | "REJECTED",
    actor: { userId?: string | null; username: string }
): Promise<MeetingTaskDto> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat memutuskan pengajuan.", 403);
    const req = await prisma.meetingTaskExtensionRequest.findUnique({
        where: { id: requestId },
        include: { task: { select: { id: true, isCancelled: true, assignerEmployeeId: true, appointmentId: true } } },
    });
    if (!req) throw new MeetingTaskError("Pengajuan perpanjangan tidak ditemukan.", 404);
    if (req.status !== "PENDING") throw new MeetingTaskError("Pengajuan sudah diputuskan.", 409);
    if (req.task.isCancelled) throw new MeetingTaskError("Task sudah dibatalkan.", 409);
    const privileged = await isPrivileged(session);
    if (req.task.assignerEmployeeId !== session.employeeId && !privileged) {
        throw new MeetingTaskError("Hanya pemberi task atau PIC yang dapat memutuskan.", 403);
    }
    if (decision === "REJECTED") {
        await prisma.meetingTaskExtensionRequest.update({ where: { id: requestId }, data: { status: "REJECTED", decidedBy: actor.username, decidedAt: new Date() } });
    } else {
        const proposedDate = toWIBDateString(req.proposedDate);
        await prisma.$transaction(async (tx) => {
            await applyExtensionTx(tx, req.taskId, proposedDate, req.reason, actor);
            await tx.meetingTaskExtensionRequest.update({ where: { id: requestId }, data: { status: "APPROVED", decidedBy: actor.username, decidedAt: new Date() } });
            await tx.meetingTaskExtensionRequest.updateMany({
                where: { taskId: req.taskId, status: "PENDING", id: { not: requestId } },
                data: { status: "REJECTED", decidedBy: actor.username, decidedAt: new Date() },
            });
        });
    }
    await prisma.auditLog.create({
        data: { action: `DECIDE_MEETING_TASK_EXTENSION_${decision}`, entity: "MEETING_TASK", entityId: req.taskId, details: JSON.stringify({ requestId, decision }), actorType: "USER", actorUserId: actor.userId ?? null, actorIdentifier: actor.username },
    }).catch((err) => logger.error("meetingTask audit DECIDE_EXT gagal", { err }));
    const updated = await prisma.meetingTask.findUniqueOrThrow({ where: { id: req.taskId }, include: taskInclude });
    return toTaskDto(updated);
}

export async function getPendingExtensionRequests(session: SessionPayload, taskId: string) {
    const task = await prisma.meetingTask.findUnique({ where: { id: taskId }, select: { id: true, assignerEmployeeId: true } });
    if (!task) throw new MeetingTaskError("Task meeting tidak ditemukan.", 404);
    const privileged = await isPrivileged(session);
    const mineAsAssignee = await prisma.meetingTaskAssignee.findUnique({
        where: { taskId_employeeId: { taskId, employeeId: session.employeeId ?? "" } },
    });
    if (task.assignerEmployeeId !== session.employeeId && !privileged && !mineAsAssignee) {
        throw new MeetingTaskError("Anda tidak memiliki akses ke task ini.", 403);
    }
    return prisma.meetingTaskExtensionRequest.findMany({
        where: { taskId },
        orderBy: { createdAt: "desc" },
        include: { requestedBy: { select: { employeeId: true, name: true } } },
    });
}

// ─── Notulensi ────────────────────────────────────────────────────

export async function updateMeetingMinutes(
    session: SessionPayload,
    appointmentId: string,
    input: { minutes: string; changeReason: string },
    actor: { userId?: string | null; username: string }
) {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat menulis notulensi.", 403);
    const appt = await prisma.meetingAppointment.findUnique({
        where: { id: appointmentId },
        select: { id: true, title: true, status: true, minutes: true, requesterEmployeeId: true, participants: { select: { employeeId: true } } },
    });
    if (!appt) throw new MeetingTaskError("Jadwal meeting tidak ditemukan.", 404);
    if (appt.status === "CANCELLED") throw new MeetingTaskError("Meeting yang dibatalkan tidak dapat dinotulensi.", 409);
    await assertCanAccessMeeting(session, appt);
    const minutes = input.minutes.trim();
    if (!minutes) throw new MeetingTaskError("Isi notulensi wajib diisi.", 400);
    if (minutes.length > 20000) throw new MeetingTaskError("Notulensi maksimal 20000 karakter.", 400);
    if (!input.changeReason || input.changeReason.trim().length < 5) throw new MeetingTaskError("Alasan perubahan minimal 5 karakter.", 400);
    const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.meetingAppointment.update({
            where: { id: appointmentId },
            data: { minutes, minutesUpdatedBy: session.employeeId, minutesUpdatedAt: new Date() },
            select: { id: true, minutes: true, minutesUpdatedBy: true, minutesUpdatedAt: true },
        });
        const revCount = await tx.meetingAppointmentRevision.count({ where: { appointmentId } });
        await tx.meetingAppointmentRevision.create({
            data: {
                appointmentId,
                revisionNumber: revCount + 1,
                changeReason: input.changeReason.trim(),
                changedBy: actor.username,
                previousData: { minutes: appt.minutes },
            },
        });
        return updated;
    });
    await prisma.auditLog.create({
        data: { action: "UPDATE_MEETING_MINUTES", entity: "APPOINTMENT", entityId: appointmentId, details: JSON.stringify({ changeReason: input.changeReason.trim() }), actorType: "USER", actorUserId: actor.userId ?? null, actorIdentifier: actor.username },
    }).catch((err) => logger.error("meetingTask audit MINUTES gagal", { err }));
    return result;
}
