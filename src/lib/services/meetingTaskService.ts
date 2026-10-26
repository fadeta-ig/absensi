import { prisma } from "@/lib/prisma";
import { isValidCalendarDate, toWIBDateString, wibDateTimeToDate } from "@/lib/timezone";
import type { SessionPayload } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import logger from "@/lib/logger";
import { isWig002, resolveLifecycleStatus } from "@/lib/services/appointmentService";
import path from "node:path";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { extensionForMime, hasExpectedSignature } from "@/lib/fileMagic";
import { getUploadLimit } from "@/lib/services/appSettingsService";

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
/** Batas keras jumlah sekuens deadline task verifikasi (awal + 1 perpanjangan). */
export const MAX_DEADLINE_SEQUENCES = 2 as const;
/** Batas tiket deadline per penerima (tiket terkonsumsi saat idle melewati deadline). */
export const MAX_DEADLINE_TICKETS_PER_RECEIVER = 2 as const;
const SETTINGS_CACHE_TTL_MS = 60_000;

export type MeetingTaskAssigneeStatus = "OPEN" | "BELUM_DIKERJAKAN" | "ON_PROGRESS" | "SELESAI" | "DIBATALKAN";
export const ASSIGNEE_FINAL_STATUSES: MeetingTaskAssigneeStatus[] = ["SELESAI", "DIBATALKAN"];
/** Status yang dihitung "terbuka": nilai baru OPEN + warisan BELUM + ON_PROGRESS (menunggu verifikasi). */
export const ASSIGNEE_OPEN_STATUSES: MeetingTaskAssigneeStatus[] = ["OPEN", "BELUM_DIKERJAKAN", "ON_PROGRESS"];
export type MeetingTaskSubmissionVerdict = "PENDING" | "DIREVISI" | "DITERIMA";

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

export interface StickyOverdueSubmission {
    createdAt: Date;
    attemptNo: number;
    verdict: string;
    resubmitDueAt: Date | null;
}

/**
 * OVERDUE sticky per penerima (patokan SUBMIT, bukan verifikasi):
 * - tidak ada submission dengan createdAt <= tenggat awal dan now > tenggat awal → sticky.
 * - submit-ulang revisi lewat tenggat revisinya tanpa submit lebih baru → sticky.
 * Tanpa kolom baru: fully derived dari tabel submissions + deadlineHistory seq 1.
 */
export function isReceiverStickyOverdue(
    submissions: StickyOverdueSubmission[],
    originalDueAt: Date | null,
    now: Date = new Date(),
    doneInfo?: { status: string; completedAt: Date | null }
): boolean {
    if (originalDueAt) {
        const hasOnTimeSubmit = submissions.some((s) => s.createdAt.getTime() <= originalDueAt.getTime());
        if (!hasOnTimeSubmit) {
            // Data legacy tanpa submission: completedAt tepat waktu dianggap submit tepat waktu.
            const legacyOnTime =
                submissions.length === 0 &&
                doneInfo?.status === "SELESAI" &&
                doneInfo.completedAt &&
                doneInfo.completedAt.getTime() <= originalDueAt.getTime();
            if (!legacyOnTime && now.getTime() > originalDueAt.getTime()) return true;
        }
    }
    const revisi = submissions
        .filter((s) => s.verdict === "DIREVISI" && s.resubmitDueAt)
        .sort((a, b) => a.attemptNo - b.attemptNo);
    for (const rev of revisi) {
        const due = (rev.resubmitDueAt as Date).getTime();
        const resub = submissions.some((s) => s.attemptNo > rev.attemptNo && s.createdAt.getTime() <= due);
        if (!resub && now.getTime() > due) return true;
    }
    return false;
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
            endAt: true,
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
    return isWig002(session);
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
    submissions: {
        orderBy: { attemptNo: "asc" as const },
        include: {
            attachments: { select: { id: true, mimeType: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" as const } },
        },
    },
} satisfies Prisma.MeetingTaskInclude;

type TaskRow = Prisma.MeetingTaskGetPayload<{ include: typeof taskInclude }>;

export function toTaskDto(task: TaskRow, now: Date = new Date()) {
    const activeDeadline = task.deadlineHistory[task.deadlineHistory.length - 1] ?? null;
    const originalDeadline = task.deadlineHistory[0] ?? null;
    const originalDueAt = originalDeadline ? originalDeadline.deadlineDate : null;
    const assignees = task.assignees.map((a) => {
        const subs = task.submissions
            .filter((s) => s.employeeId === a.employeeId)
            .map((s) => ({ createdAt: s.createdAt, attemptNo: s.attemptNo, verdict: s.verdict, resubmitDueAt: s.resubmitDueAt }));
        const stickyOverdue = isReceiverStickyOverdue(subs, originalDueAt, now, { status: a.status, completedAt: a.completedAt });
        return {
            employeeId: a.employeeId,
            name: a.employee?.name ?? a.employeeId,
            status: a.status,
            completedAt: a.completedAt,
            isOverdue: activeDeadline ? isAssigneeOverdue(activeDeadline.deadlineDate, a.status, now) || stickyOverdue : stickyOverdue,
            stickyOverdue,
            deadlineTicketsUsed: a.deadlineTicketsUsed,
            deadlineTicketsLeft: Math.max(0, MAX_DEADLINE_SEQUENCES - a.deadlineTicketsUsed),
            submissionCount: subs.length,
        };
    });
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
        deadlineChancesMax: MAX_DEADLINE_SEQUENCES,
        submissions: task.submissions.map((s) => ({
            id: s.id,
            employeeId: s.employeeId,
            note: s.note,
            attemptNo: s.attemptNo,
            verdict: s.verdict,
            resubmitDueAt: s.resubmitDueAt,
            verifiedBy: s.verifiedBy,
            verifiedAt: s.verifiedAt,
            verifyNote: s.verifyNote,
            createdAt: s.createdAt,
            attachments: s.attachments,
        })),
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
    if (appt.status === "COMPLETED") throw new MeetingTaskError("Meeting sudah selesai. Task baru tidak dapat ditambahkan.", 409);
    if (appt.status === "CANCELLED") throw new MeetingTaskError("Meeting yang dibatalkan tidak dapat diberi task.", 409);
    const now = new Date();
    const lifecycle = resolveLifecycleStatus(appt.status, appt.startAt, appt.endAt, now);
    if (lifecycle === "SCHEDULED" && now.getTime() < appt.startAt.getTime()) {
        throw new MeetingTaskError("Task hanya dapat dibuat ketika meeting sedang berjalan atau sudah terlaksana.", 409);
    }
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
            // Task milik meeting yang dibatalkan disembunyikan: mutasinya sudah
            // dikunci (409) dan otomatis ikut batal saat meeting dibatalkan.
            task: { appointment: { status: { not: "CANCELLED" } } },
            ...(filters.status ? { status: filters.status as MeetingTaskAssigneeStatus } : {}),
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

// ─── Submit hasil kerja (penerima) ─────────────────────────────────
// Pengganti updateMyTaskStatus: penerima tidak lagi self-claim SELESAI.
// Alur baru: kumpulkan hasil + lampiran wajib → ON_PROGRESS (menunggu verifikasi).

export const TASK_SUBMISSION_MAX_FILES = 5 as const;
export const TASK_SUBMISSION_ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const TASK_SUBMISSION_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "task-submissions");

function assertNoTraversal(relativePath: string): string {
    if (relativePath.includes("..") || path.isAbsolute(relativePath)) {
        throw new MeetingTaskError("Path file tidak valid.", 400);
    }
    const resolved = path.resolve(TASK_SUBMISSION_STORAGE_ROOT, relativePath);
    if (!resolved.startsWith(TASK_SUBMISSION_STORAGE_ROOT + path.sep)) {
        throw new MeetingTaskError("Path file tidak valid.", 400);
    }
    return resolved;
}

export interface TaskWorkFile {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    size: number;
}

export interface SubmitTaskWorkInput {
    note?: string | null;
    files: TaskWorkFile[];
}

function validateWorkFile(file: TaskWorkFile, maxBytes: number): { extension: string; sha256: string } {
    const mime = (file.mimeType || "").toLowerCase();
    if (!(TASK_SUBMISSION_ALLOWED_MIME as readonly string[]).includes(mime)) {
        throw new MeetingTaskError("Format file tidak didukung. Gunakan JPG, PNG, WEBP, atau PDF.", 400);
    }
    if (!file.buffer || file.buffer.length === 0) throw new MeetingTaskError("File kosong atau rusak.", 400);
    if (file.buffer.length > maxBytes) {
        throw new MeetingTaskError(`Ukuran file melebihi batas ${(maxBytes / 1024 / 1024).toFixed(1)} MB.`, 400);
    }
    const extension = extensionForMime(mime);
    if (!extension || !hasExpectedSignature(mime, file.buffer)) {
        throw new MeetingTaskError("Isi file tidak sesuai dengan format yang dinyatakan.", 400);
    }
    return { extension, sha256: createHash("sha256").update(file.buffer).digest("hex") };
}

export async function submitTaskWork(
    session: SessionPayload,
    taskId: string,
    input: SubmitTaskWorkInput,
    actor: { userId?: string | null; username: string }
): Promise<MeetingTaskDto> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat mengumpulkan hasil task.", 403);
    if (!input.files || input.files.length === 0) throw new MeetingTaskError("Lampiran wajib minimal 1 file (dokumen atau foto).", 400);
    if (input.files.length > TASK_SUBMISSION_MAX_FILES) {
        throw new MeetingTaskError(`Maksimal ${TASK_SUBMISSION_MAX_FILES} file per pengumpulan.`, 400);
    }
    const note = input.note?.trim() || null;
    if (note && note.length > 2000) throw new MeetingTaskError("Catatan maksimal 2000 karakter.", 400);
    const task = await prisma.meetingTask.findUnique({
        where: { id: taskId },
        select: { id: true, isCancelled: true, assignerEmployeeId: true, appointmentId: true },
    });
    if (!task) throw new MeetingTaskError("Task meeting tidak ditemukan.", 404);
    if (task.isCancelled) throw new MeetingTaskError("Task sudah dibatalkan.", 409);
    await assertMeetingOpenForTaskMutation(task.appointmentId);
    const row = await prisma.meetingTaskAssignee.findUnique({
        where: { taskId_employeeId: { taskId, employeeId: session.employeeId } },
        select: { id: true, status: true },
    });
    if (!row) throw new MeetingTaskError("Task ini tidak ditugaskan kepada Anda.", 403);
    if (row.status !== "OPEN" && row.status !== "BELUM_DIKERJAKAN") {
        throw new MeetingTaskError("Hasil sudah dikumpulkan dan menunggu verifikasi.", 409);
    }
    const maxMb = await getUploadLimit("upload.taskSubmission.maxMb");
    const maxBytes = Math.floor(maxMb * 1024 * 1024);
    const prepared = input.files.map((f) => ({ ...validateWorkFile(f, maxBytes), buffer: f.buffer, mimeType: f.mimeType.toLowerCase() }));

    const created = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM meeting_tasks WHERE id = ${taskId} FOR UPDATE`;
        const attemptNo = (await tx.meetingTaskSubmission.count({ where: { taskId, employeeId: session.employeeId as string } })) + 1;
        const submission = await tx.meetingTaskSubmission.create({
            data: {
                taskId,
                employeeId: session.employeeId as string,
                note,
                attemptNo,
                verdict: "PENDING",
                attachments: {
                    create: prepared.map((p) => ({
                        filePath: `pending/${randomUUID()}${p.extension}`,
                        mimeType: p.mimeType,
                        size: p.buffer.length,
                        sha256: p.sha256,
                        uploadedByUserId: actor.userId ?? null,
                    })),
                },
            },
            include: { attachments: true },
        });
        await tx.meetingTaskAssignee.update({ where: { id: row.id }, data: { status: "ON_PROGRESS" } });
        const revCount = await tx.meetingTaskRevision.count({ where: { taskId } });
        await tx.meetingTaskRevision.create({
            data: { taskId, revisionNumber: revCount + 1, changeReason: `Submit hasil kerja (attempt ${attemptNo})`, changedBy: actor.username, previousData: {} },
        });
        return submission;
    });

    // Tulis file ke disk setelah baris DB ter-commit; gagal tulis = hapus baris yatim.
    const written: string[] = [];
    try {
        for (const [i, att] of created.attachments.entries()) {
            const rel = `${taskId}/${created.id}-${i}-${randomUUID()}${prepared[i].extension}`;
            const abs = assertNoTraversal(rel);
            await mkdir(path.dirname(abs), { recursive: true });
            await writeFile(abs, prepared[i].buffer, { flag: "wx" });
            written.push(rel);
            await prisma.meetingTaskAttachment.update({ where: { id: att.id }, data: { filePath: rel } });
        }
    } catch (err) {
        for (const rel of written) {
            try {
                await unlink(assertNoTraversal(rel));
            } catch {
                /* abaikan */
            }
        }
        await prisma.meetingTaskSubmission.delete({ where: { id: created.id } }).catch(() => undefined);
        await prisma.meetingTaskAssignee.update({ where: { id: row.id }, data: { status: "OPEN" } }).catch(() => undefined);
        throw new MeetingTaskError("Gagal menyimpan lampiran. Coba lagi.", 500);
    }
    await prisma.auditLog.create({
        data: {
            action: "SUBMIT_MEETING_TASK_WORK",
            entity: "MEETING_TASK",
            entityId: taskId,
            details: JSON.stringify({ employeeId: session.employeeId, submissionId: created.id, attemptNo: created.attemptNo, files: created.attachments.length }),
            actorType: "USER",
            actorUserId: actor.userId ?? null,
            actorIdentifier: actor.username,
        },
    }).catch((err) => logger.error("meetingTask audit SUBMIT gagal", { err }));
    const refreshed = await prisma.meetingTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    return toTaskDto(refreshed);
}

// ─── Verifikasi submission (pemberi/GA) ─────────────────────────────

export interface VerifySubmissionInput {
    decision: "TERIMA" | "REVISI";
    note?: string | null;
    resubmitDue?: string | null; // YYYY-MM-DD, wajib bila REVISI
}

export async function verifyTaskSubmission(
    session: SessionPayload,
    submissionId: string,
    input: VerifySubmissionInput,
    actor: { userId?: string | null; username: string }
): Promise<MeetingTaskDto> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat memverifikasi.", 403);
    const sub = await prisma.meetingTaskSubmission.findUnique({
        where: { id: submissionId },
        include: { task: { select: { id: true, isCancelled: true, assignerEmployeeId: true, appointmentId: true } } },
    });
    if (!sub) throw new MeetingTaskError("Pengumpulan tidak ditemukan.", 404);
    if (sub.verdict !== "PENDING") throw new MeetingTaskError("Pengumpulan sudah diputuskan.", 409);
    if (sub.task.isCancelled) throw new MeetingTaskError("Task sudah dibatalkan.", 409);
    await assertMeetingOpenForTaskMutation(sub.task.appointmentId);
    const privileged = await isPrivileged(session);
    if (sub.task.assignerEmployeeId !== session.employeeId && !privileged) {
        throw new MeetingTaskError("Hanya pemberi task atau GA yang dapat memverifikasi.", 403);
    }
    const note = input.note?.trim() || null;
    if (input.decision === "REVISI") {
        if (!note || note.length < 5) throw new MeetingTaskError("Alasan revisi minimal 5 karakter.", 400);
        if (!input.resubmitDue || !isValidCalendarDate(input.resubmitDue)) {
            throw new MeetingTaskError("Tenggat revisi wajib diisi (YYYY-MM-DD).", 400);
        }
        const resubmitDueAt = meetingTaskDueDateToDate(input.resubmitDue);
        if (resubmitDueAt.getTime() <= Date.now()) throw new MeetingTaskError("Tenggat revisi harus setelah waktu saat ini.", 400);
        await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM meeting_tasks WHERE id = ${sub.taskId} FOR UPDATE`;
            await tx.meetingTaskSubmission.update({
                where: { id: sub.id },
                data: { verdict: "DIREVISI", verifyNote: note, verifiedBy: actor.username, verifiedAt: new Date(), resubmitDueAt },
            });
            await tx.meetingTaskAssignee.updateMany({
                where: { taskId: sub.taskId, employeeId: sub.employeeId },
                data: { status: "OPEN" },
            });
            const revCount = await tx.meetingTaskRevision.count({ where: { taskId: sub.taskId } });
            await tx.meetingTaskRevision.create({
                data: { taskId: sub.taskId, revisionNumber: revCount + 1, changeReason: `Revisi diminta (attempt ${sub.attemptNo}): ${note}`, changedBy: actor.username, previousData: {} },
            });
        });
        await prisma.auditLog.create({
            data: { action: "REQUEST_MEETING_TASK_REVISION", entity: "MEETING_TASK", entityId: sub.taskId, details: JSON.stringify({ submissionId, resubmitDue: input.resubmitDue }), actorType: "USER", actorUserId: actor.userId ?? null, actorIdentifier: actor.username },
        }).catch((err) => logger.error("meetingTask audit REVISI gagal", { err }));
    } else {
        await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM meeting_tasks WHERE id = ${sub.taskId} FOR UPDATE`;
            await tx.meetingTaskSubmission.update({
                where: { id: sub.id },
                data: { verdict: "DITERIMA", verifyNote: note, verifiedBy: actor.username, verifiedAt: new Date() },
            });
            await tx.meetingTaskAssignee.updateMany({
                where: { taskId: sub.taskId, employeeId: sub.employeeId },
                data: { status: "SELESAI", completedAt: new Date() },
            });
            const revCount = await tx.meetingTaskRevision.count({ where: { taskId: sub.taskId } });
            await tx.meetingTaskRevision.create({
                data: { taskId: sub.taskId, revisionNumber: revCount + 1, changeReason: `Submission disetujui (attempt ${sub.attemptNo})`, changedBy: actor.username, previousData: {} },
            });
        });
        await prisma.auditLog.create({
            data: { action: "VERIFY_MEETING_TASK_APPROVED", entity: "MEETING_TASK", entityId: sub.taskId, details: JSON.stringify({ submissionId }), actorType: "USER", actorUserId: actor.userId ?? null, actorIdentifier: actor.username },
        }).catch((err) => logger.error("meetingTask audit VERIFY gagal", { err }));
    }
    const refreshed = await prisma.meetingTask.findUniqueOrThrow({ where: { id: sub.taskId }, include: taskInclude });
    return toTaskDto(refreshed);
}

// ─── Baca lampiran (pemberi/penerima/GA) ────────────────────────────

export async function getSubmissionAttachment(
    session: SessionPayload,
    attachmentId: string
): Promise<{ filePath: string; mimeType: string; size: number }> {
    const att = await prisma.meetingTaskAttachment.findUnique({
        where: { id: attachmentId },
        include: { submission: { select: { taskId: true, employeeId: true } } },
    });
    if (!att) throw new MeetingTaskError("Lampiran tidak ditemukan.", 404);
    const task = await prisma.meetingTask.findUnique({
        where: { id: att.submission.taskId },
        select: { id: true, assignerEmployeeId: true, appointmentId: true },
    });
    if (!task) throw new MeetingTaskError("Task tidak ditemukan.", 404);
    const appt = await getMeetingOrThrow(task.appointmentId);
    await assertCanAccessMeeting(session, appt);
    const privileged = await isPrivileged(session);
    const mine = session.employeeId === att.submission.employeeId;
    const giver = session.employeeId === task.assignerEmployeeId;
    if (!mine && !giver && !privileged) throw new MeetingTaskError("Anda tidak memiliki akses ke lampiran ini.", 403);
    return { filePath: assertNoTraversal(att.filePath), mimeType: att.mimeType, size: att.size };
}

// ─── Inbox verifikator (task saya yang menunggu verifikasi) ────────

export async function getTasksAwaitingMyVerification(session: SessionPayload): Promise<MeetingTaskDto[]> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat melihat antrean verifikasi.", 403);
    const tasks = await prisma.meetingTask.findMany({
        where: {
            assignerEmployeeId: session.employeeId,
            isCancelled: false,
            submissions: { some: { verdict: "PENDING" } },
        },
        include: taskInclude,
        orderBy: { createdAt: "desc" },
        take: 200,
    });
    const now = new Date();
    return tasks.map((t) => toTaskDto(t, now));
}

// ─── Perpanjangan (pemberi/GA) ────────────────────────────────────

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
    // Kesempatan deadline maks 2 sekuens (awal + 1 perpanjangan), apapun setting lama.
    if (current.sequence + 1 > MAX_DEADLINE_SEQUENCES) {
        throw new MeetingTaskError(`Kesempatan deadline maksimal ${MAX_DEADLINE_SEQUENCES} kali (awal + 1 perpanjangan).`, 409);
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
    // Tiket deadline per penerima: yang idle (tanpa submit sejak deadline sebelumnya)
    // mengonsumsi 1 tiket; yang sudah habis (2) menggagalkan seluruh perpanjangan.
    const prevDue = current.deadlineDate;
    const openAssignees = await tx.meetingTaskAssignee.findMany({
        where: { taskId, status: { in: ASSIGNEE_OPEN_STATUSES } },
        select: { id: true, employeeId: true, deadlineTicketsUsed: true },
    });
    if (openAssignees.length > 0) {
        const submittedSince = new Set(
            (
                await tx.meetingTaskSubmission.findMany({
                    where: { taskId, createdAt: { gt: prevDue } },
                    select: { employeeId: true },
                })
            ).map((s) => s.employeeId)
        );
        const idle = openAssignees.filter((a) => !submittedSince.has(a.employeeId));
        const exhausted = idle.filter((a) => a.deadlineTicketsUsed >= MAX_DEADLINE_TICKETS_PER_RECEIVER);
        if (exhausted.length > 0) {
            throw new MeetingTaskError(
                `Tiket deadline habis (maks ${MAX_DEADLINE_TICKETS_PER_RECEIVER}) untuk: ${exhausted.map((a) => a.employeeId).join(", ")}. Batalkan task mereka atau biarkan overdue.`,
                409
            );
        }
        if (idle.length > 0) {
            await tx.meetingTaskAssignee.updateMany({
                where: { taskId, id: { in: idle.map((a) => a.id) } },
                data: { deadlineTicketsUsed: { increment: 1 } },
            });
        }
    }
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
        select: { id: true, isCancelled: true, assignerEmployeeId: true, appointmentId: true },
    });
    if (!task) throw new MeetingTaskError("Task meeting tidak ditemukan.", 404);
    if (task.isCancelled) throw new MeetingTaskError("Task sudah dibatalkan.", 409);
    await assertMeetingOpenForTaskMutation(task.appointmentId);
    const privileged = await isPrivileged(session);
    if (task.assignerEmployeeId !== session.employeeId && !privileged) {
        throw new MeetingTaskError("Hanya pemberi task atau GA yang dapat memperpanjang deadline.", 403);
    }
    if (!input.reason || input.reason.trim().length < 5) throw new MeetingTaskError("Alasan perpanjangan minimal 5 karakter.", 400);

    await prisma.$transaction(async (tx) => {
        await applyExtensionTx(tx, taskId, input.proposedDate, input.reason, actor);
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
    }).catch((err) => {
        if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
            throw new MeetingTaskError("Data berubah bersamaan. Muat ulang halaman lalu coba lagi.", 409);
        }
        throw err;
    });
    const updated = await prisma.meetingTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    return toTaskDto(updated);
}

// ─── Batalkan (pemberi/GA) ────────────────────────────────────────

export async function cancelMeetingTask(
    session: SessionPayload,
    taskId: string,
    reason: string,
    actor: { userId?: string | null; username: string }
): Promise<MeetingTaskDto> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat membatalkan task.", 403);
    const task = await prisma.meetingTask.findUnique({ where: { id: taskId }, select: { id: true, isCancelled: true, assignerEmployeeId: true, appointmentId: true } });
    if (!task) throw new MeetingTaskError("Task meeting tidak ditemukan.", 404);
    if (task.isCancelled) throw new MeetingTaskError("Task sudah dibatalkan.", 409);
    await assertMeetingOpenForTaskMutation(task.appointmentId);
    const privileged = await isPrivileged(session);
    if (task.assignerEmployeeId !== session.employeeId && !privileged) {
        throw new MeetingTaskError("Hanya pemberi task atau GA yang dapat membatalkan.", 403);
    }
    if (!reason || reason.trim().length < 5) throw new MeetingTaskError("Alasan pembatalan minimal 5 karakter.", 400);
    await prisma.$transaction(async (tx) => {
        await tx.meetingTask.update({ where: { id: taskId }, data: { isCancelled: true, cancelReason: reason.trim(), cancelledAt: new Date() } });
        await tx.meetingTaskAssignee.updateMany({
            where: { taskId, status: { in: ASSIGNEE_OPEN_STATUSES } },
            data: { status: "DIBATALKAN" },
        });
        const revCount = await tx.meetingTaskRevision.count({ where: { taskId } });
        await tx.meetingTaskRevision.create({
            data: { taskId, revisionNumber: revCount + 1, changeReason: `Task dibatalkan: ${reason.trim()}`, changedBy: actor.username, previousData: {} },
        });
    }).catch((err) => {
        if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
            throw new MeetingTaskError("Data berubah bersamaan. Muat ulang halaman lalu coba lagi.", 409);
        }
        throw err;
    });
    await prisma.auditLog.create({
        data: { action: "CANCEL_MEETING_TASK", entity: "MEETING_TASK", entityId: taskId, details: JSON.stringify({ reason: reason.trim() }), actorType: "USER", actorUserId: actor.userId ?? null, actorIdentifier: actor.username },
    }).catch((err) => logger.error("meetingTask audit CANCEL gagal", { err }));
    const updated = await prisma.meetingTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    return toTaskDto(updated);
}

// ─── Edit konten (pemberi/GA: ralat, tambah info, ubah deadline/penerima) ─

export interface EditMeetingTaskInput {
    title?: string;
    detail?: string | null;
    dueDate?: string;
    addAssigneeIds?: string[];
    removeAssigneeIds?: string[];
}

export async function editMeetingTask(
    session: SessionPayload,
    taskId: string,
    input: EditMeetingTaskInput,
    actor: { userId?: string | null; username: string }
): Promise<MeetingTaskDto> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat mengubah task.", 403);
    const task = await prisma.meetingTask.findUnique({
        where: { id: taskId },
        select: { id: true, title: true, detail: true, isCancelled: true, assignerEmployeeId: true, appointmentId: true },
    });
    if (!task) throw new MeetingTaskError("Task meeting tidak ditemukan.", 404);
    if (task.isCancelled) throw new MeetingTaskError("Task sudah dibatalkan.", 409);
    await assertMeetingOpenForTaskMutation(task.appointmentId);
    const privileged = await isPrivileged(session);
    if (task.assignerEmployeeId !== session.employeeId && !privileged) {
        throw new MeetingTaskError("Hanya pemberi task atau GA yang dapat mengubah.", 403);
    }
    const patch: { title?: string; detail?: string | null } = {};
    if (input.title !== undefined) {
        const title = input.title.trim();
        if (!title) throw new MeetingTaskError("Judul task wajib diisi.", 400);
        patch.title = title.slice(0, 200);
    }
    if (input.detail !== undefined) patch.detail = input.detail?.trim().slice(0, 5000) || null;
    const addIds = [...new Set((input.addAssigneeIds ?? []).map((v) => v.trim()).filter(Boolean))];
    const removeIds = [...new Set((input.removeAssigneeIds ?? []).map((v) => v.trim()).filter(Boolean))];
    if (Object.keys(patch).length === 0 && !input.dueDate && addIds.length === 0 && removeIds.length === 0) {
        throw new MeetingTaskError("Tidak ada perubahan.", 400);
    }
    if (addIds.length > 0) {
        const appt = await getMeetingOrThrow(task.appointmentId);
        const memberIds = internalParticipantIds(appt);
        const outsiders = addIds.filter((id) => !memberIds.includes(id));
        if (outsiders.length > 0) throw new MeetingTaskError("Penerima task harus peserta meeting ini.", 422);
        await assertActiveEmployees(addIds);
    }
    let newDue: Date | null = null;
    if (input.dueDate) {
        if (!isValidCalendarDate(input.dueDate)) throw new MeetingTaskError("Tanggal deadline tidak valid. Gunakan format YYYY-MM-DD.", 400);
        newDue = meetingTaskDueDateToDate(input.dueDate);
    }

    await prisma.$transaction(async (tx) => {
        if (Object.keys(patch).length > 0) {
            await tx.meetingTask.update({ where: { id: taskId }, data: patch });
        }
        if (newDue) {
            const history = await tx.meetingTaskDeadlineHistory.findMany({ where: { taskId }, orderBy: { sequence: "desc" }, take: 1 });
            const current = history[0];
            if (current && newDue.getTime() !== current.deadlineDate.getTime()) {
                await applyExtensionTx(tx, taskId, input.dueDate as string, "Deadline diubah pemberi.", actor);
            }
        }
        if (addIds.length > 0) {
            await tx.meetingTaskAssignee.createMany({
                data: addIds.map((employeeId) => ({ taskId, employeeId, status: "OPEN" as const })),
                skipDuplicates: true,
            });
        }
        if (removeIds.length > 0) {
            const withSubs = await tx.meetingTaskSubmission.findMany({
                where: { taskId, employeeId: { in: removeIds } },
                select: { employeeId: true },
            });
            if (withSubs.length > 0) {
                throw new MeetingTaskError(
                    `Tidak dapat menghapus penerima yang sudah submit: ${[...new Set(withSubs.map((s) => s.employeeId))].join(", ")}. Batalkan task bila perlu.`,
                    422
                );
            }
            await tx.meetingTaskAssignee.deleteMany({ where: { taskId, employeeId: { in: removeIds } } });
        }
        const revCount = await tx.meetingTaskRevision.count({ where: { taskId } });
        await tx.meetingTaskRevision.create({
            data: {
                taskId,
                revisionNumber: revCount + 1,
                changeReason: `Task diubah pemberi: ${[
                    patch.title ? "judul" : "",
                    patch.detail !== undefined ? "rincian" : "",
                    newDue ? "deadline" : "",
                    addIds.length > 0 ? `tambah ${addIds.length} penerima` : "",
                    removeIds.length > 0 ? `hapus ${removeIds.length} penerima` : "",
                ]
                    .filter(Boolean)
                    .join(", ")}`,
                changedBy: actor.username,
                previousData: { title: task.title, detail: task.detail },
            },
        });
    });
    await prisma.auditLog.create({
        data: { action: "EDIT_MEETING_TASK", entity: "MEETING_TASK", entityId: taskId, details: JSON.stringify({ title: patch.title ?? task.title }), actorType: "USER", actorUserId: actor.userId ?? null, actorIdentifier: actor.username },
    }).catch((err) => logger.error("meetingTask audit EDIT gagal", { err }));
    const updated = await prisma.meetingTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    return toTaskDto(updated);
}

/** Info ringan task untuk push notifikasi (tanpa logika bisnis). */
export async function getTaskPushInfo(taskId: string): Promise<{ assignerEmployeeId: string; title: string; requestedByName: string | null } | null> {
    const task = await prisma.meetingTask.findUnique({ where: { id: taskId }, select: { assignerEmployeeId: true, title: true } });
    if (!task) return null;
    return { assignerEmployeeId: task.assignerEmployeeId, title: task.title, requestedByName: null };
}

/** Task dan notulensi dikunci begitu meeting selesai/dibatalkan (keputusan pemilik). */
async function assertMeetingOpenForTaskMutation(appointmentId: string): Promise<void> {
    const m = await prisma.meetingAppointment.findUnique({ where: { id: appointmentId }, select: { status: true } });
    if (!m) throw new MeetingTaskError("Jadwal meeting tidak ditemukan.", 404);
    if (m.status === "CANCELLED") throw new MeetingTaskError("Meeting telah dibatalkan. Task dan notulensi sudah ditutup.", 409);
    if (m.status === "COMPLETED") throw new MeetingTaskError("Meeting telah selesai. Task dan notulensi sudah ditutup.", 409);
}

// ─── Submit on complete (push sekali per penerima) ─────────────────

export interface UnsubmittedTask {
    taskId: string;
    title: string;
    activeDeadlineDate: string;
    employeeIds: string[];
}

/** Task open yang belum pernah di-submit (kind SUBMITTED) untuk daftar meeting. */
export async function getUnsubmittedOpenTasks(appointmentIds: string[]): Promise<UnsubmittedTask[]> {
    if (appointmentIds.length === 0) return [];
    const tasks = await prisma.meetingTask.findMany({
        where: { appointmentId: { in: appointmentIds }, isCancelled: false },
        select: {
            id: true,
            title: true,
            deadlineHistory: { orderBy: { sequence: "desc" }, take: 1, select: { deadlineDate: true } },
            assignees: {
                where: { status: { in: ASSIGNEE_OPEN_STATUSES } },
                select: { employeeId: true },
            },
            reminderLogs: { where: { kind: "SUBMITTED" }, select: { employeeId: true } },
        },
    });
    const result: UnsubmittedTask[] = [];
    for (const t of tasks) {
        const submitted = new Set(t.reminderLogs.map((l) => l.employeeId));
        const pending = t.assignees.map((a) => a.employeeId).filter((id) => !submitted.has(id));
        if (pending.length === 0) continue;
        const due = t.deadlineHistory[0]?.deadlineDate;
        result.push({
            taskId: t.id,
            title: t.title,
            activeDeadlineDate: due ? toWIBDateString(due) : "-",
            employeeIds: pending,
        });
    }
    return result;
}

/** Tandai SUBMITTED (insert dulu, P2002 = sudah disubmit cron paralel) lalu kembalikan yang berhasil diklaim. */
export async function claimSubmittedTasks(items: UnsubmittedTask[]): Promise<UnsubmittedTask[]> {
    const claimed: UnsubmittedTask[] = [];
    for (const item of items) {
        const okIds: string[] = [];
        for (const employeeId of item.employeeIds) {
            try {
                await prisma.meetingTaskReminderLog.create({ data: { taskId: item.taskId, employeeId, kind: "SUBMITTED" } });
                okIds.push(employeeId);
            } catch {
                // P2002: sudah disubmit
            }
        }
        if (okIds.length > 0) claimed.push({ ...item, employeeIds: okIds });
    }
    return claimed;
}

// ─── Notulensi ────────────────────────────────────────────────────

async function readNotulisEmployeeId(appt: { id: string; notulisEmployeeId?: string | null }): Promise<string | null> {
    if ("notulisEmployeeId" in appt && appt.notulisEmployeeId !== undefined) {
        return appt.notulisEmployeeId ?? null;
    }
    if (typeof prisma.$queryRaw === "function") {
        try {
            const rows = (await prisma.$queryRaw`SELECT notulis_employee_id AS notulisEmployeeId FROM meeting_appointments WHERE id = ${appt.id} LIMIT 1`) as Array<{
                notulisEmployeeId: string | null;
            }>;
            if (Array.isArray(rows) && rows.length > 0) {
                return rows[0].notulisEmployeeId ?? null;
            }
        } catch {
            return null;
        }
    }
    return null;
}

async function assertCanWriteMinutes(
    session: SessionPayload,
    appt: {
        id: string;
        status: string;
        startAt: Date;
        endAt: Date;
        requesterEmployeeId: string | null;
        notulisEmployeeId?: string | null;
        participants: Array<{ employeeId: string | null }>;
    },
    now: Date
): Promise<{ notulisEmployeeId: string | null; isMeetingFinished: boolean }> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat mengelola notulensi.", 403);
    if (appt.status === "CANCELLED") {
        throw new MeetingTaskError("Meeting telah dibatalkan. Notulensi sudah ditutup.", 409);
    }
    if (appt.status === "COMPLETED") {
        throw new MeetingTaskError("Meeting telah selesai. Notulensi sudah ditutup.", 409);
    }
    await assertCanAccessMeeting(session, appt);
    const lifecycle = resolveLifecycleStatus(appt.status, appt.startAt, appt.endAt, now);
    if (lifecycle === "SCHEDULED" && now.getTime() < appt.startAt.getTime()) {
        throw new MeetingTaskError("Notulensi belum dibuka. Notulensi hanya dapat diisi setelah jam meeting dimulai.", 409);
    }
    const notulisEmployeeId = await readNotulisEmployeeId(appt);
    const privileged = await isPrivileged(session);
    const isOrganizer = Boolean(session.employeeId && appt.requesterEmployeeId === session.employeeId) || privileged;
    if (notulisEmployeeId && session.employeeId !== notulisEmployeeId && !isOrganizer) {
        throw new MeetingTaskError("Penyelenggara telah menunjuk petugas notulensi khusus untuk meeting ini.", 403);
    }
    const isMeetingFinished = appt.status === "COMPLETED" || lifecycle === "COMPLETED";
    return { notulisEmployeeId, isMeetingFinished };
}

export async function getMeetingMinutes(session: SessionPayload, appointmentId: string) {
    if (!session.employeeId && !(await isPrivileged(session))) {
        throw new MeetingTaskError("Hanya karyawan yang dapat mengakses notulensi.", 403);
    }
    const appt = await prisma.meetingAppointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            status: true,
            startAt: true,
            endAt: true,
            minutes: true,
            minutesUpdatedBy: true,
            minutesUpdatedAt: true,
            notulisEmployeeId: true,
            requesterEmployeeId: true,
            participants: { select: { employeeId: true, employee: { select: { name: true } } } },
        },
    });
    if (!appt) throw new MeetingTaskError("Jadwal meeting tidak ditemukan.", 404);
    const privileged = await isPrivileged(session);
    const allowed =
        privileged ||
        appt.requesterEmployeeId === session.employeeId ||
        appt.participants.some((p) => p.employeeId === session.employeeId);
    if (!allowed) throw new MeetingTaskError("Anda bukan peserta meeting ini.", 403);

    const notulisEmployeeId = await readNotulisEmployeeId(appt);
    const memberIds = internalParticipantIds(appt);
    const lookupIds = [...new Set([...memberIds, ...(appt.minutesUpdatedBy ? [appt.minutesUpdatedBy] : []), ...(notulisEmployeeId ? [notulisEmployeeId] : [])])];
    const empRows =
        lookupIds.length > 0
            ? ((await prisma.employee.findMany({
                  where: { employeeId: { in: lookupIds } },
                  select: { employeeId: true, name: true },
              })) ?? [])
            : [];
    const nameMap = new Map<string, string>();
    for (const p of appt.participants) {
        if (p.employeeId && p.employee?.name) nameMap.set(p.employeeId, p.employee.name);
    }
    for (const r of empRows) {
        nameMap.set(r.employeeId, r.name);
    }

    const now = new Date();
    const lifecycle = resolveLifecycleStatus(appt.status, appt.startAt, appt.endAt, now);
    const isOrganizer = Boolean(session.employeeId && appt.requesterEmployeeId === session.employeeId) || privileged;
    const isStarted = lifecycle !== "SCHEDULED" || now.getTime() >= appt.startAt.getTime();
    const isMeetingFinished = appt.status === "COMPLETED" || lifecycle === "COMPLETED";
    const canConfigureNotulis = isOrganizer && appt.status !== "CANCELLED" && isStarted && !isMeetingFinished;
    const canWriteMinutes =
        Boolean(session.employeeId) &&
        appt.status !== "CANCELLED" &&
        appt.status !== "COMPLETED" &&
        isStarted &&
        (notulisEmployeeId ? session.employeeId === notulisEmployeeId || isOrganizer : true);

    return {
        id: appt.id,
        status: appt.status,
        lifecycle,
        startAt: appt.startAt,
        endAt: appt.endAt,
        requesterEmployeeId: appt.requesterEmployeeId,
        notulisEmployeeId,
        notulisName: notulisEmployeeId ? (nameMap.get(notulisEmployeeId) ?? notulisEmployeeId) : null,
        minutes: appt.minutes,
        minutesUpdatedBy: appt.minutesUpdatedBy,
        minutesUpdatedByName: appt.minutesUpdatedBy ? (nameMap.get(appt.minutesUpdatedBy) ?? appt.minutesUpdatedBy) : null,
        minutesUpdatedAt: appt.minutesUpdatedAt,
        myEmployeeId: session.employeeId ?? null,
        isOrganizer,
        canConfigureNotulis,
        canWriteMinutes,
        requiresChangeReason: false,
        eligibleMembers: memberIds.map((empId) => ({
            employeeId: empId,
            name: nameMap.get(empId) ?? empId,
            isOrganizer: empId === appt.requesterEmployeeId,
        })),
    };
}

export async function setMeetingNotulis(
    session: SessionPayload,
    appointmentId: string,
    notulisEmployeeId: string | null,
    actor: { userId?: string | null; username: string }
) {
    if (!session.employeeId && !(await isPrivileged(session))) {
        throw new MeetingTaskError("Hanya penyelenggara yang dapat mengatur petugas notulensi.", 403);
    }
    const appt = await prisma.meetingAppointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            status: true,
            startAt: true,
            endAt: true,
            requesterEmployeeId: true,
            participants: { select: { employeeId: true } },
        },
    });
    if (!appt) throw new MeetingTaskError("Jadwal meeting tidak ditemukan.", 404);
    const privileged = await isPrivileged(session);
    const isOrganizer = Boolean(session.employeeId && appt.requesterEmployeeId === session.employeeId) || privileged;
    if (!isOrganizer) {
        throw new MeetingTaskError("Hanya penyelenggara meeting yang dapat mengatur petugas notulensi.", 403);
    }
    if (appt.status === "CANCELLED") {
        throw new MeetingTaskError("Meeting telah dibatalkan.", 409);
    }
    const now = new Date();
    const lifecycle = resolveLifecycleStatus(appt.status, appt.startAt, appt.endAt, now);
    if (lifecycle === "SCHEDULED" && now.getTime() < appt.startAt.getTime()) {
        throw new MeetingTaskError("Pengaturan petugas notulensi baru dapat dilakukan saat meeting dimulai.", 409);
    }
    if (appt.status === "COMPLETED" || lifecycle === "COMPLETED") {
        throw new MeetingTaskError("Meeting sudah selesai. Petugas notulensi tidak dapat diubah.", 409);
    }

    const nextNotulisId = notulisEmployeeId?.trim() || null;
    if (nextNotulisId) {
        const members = internalParticipantIds(appt);
        if (!members.includes(nextNotulisId)) {
            throw new MeetingTaskError("Petugas notulensi harus peserta internal meeting ini.", 422);
        }
    }

    await prisma.meetingAppointment.update({
        where: { id: appointmentId },
        data: { notulisEmployeeId: nextNotulisId },
    });

    await prisma.auditLog
        .create({
            data: {
                action: "SET_MEETING_NOTULIS",
                entity: "APPOINTMENT",
                entityId: appointmentId,
                details: JSON.stringify({ notulisEmployeeId: nextNotulisId }),
                actorType: "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.username,
            },
        })
        .catch((err) => logger.error("meetingTask audit SET_MEETING_NOTULIS gagal", { err }));

    return getMeetingMinutes(session, appointmentId);
}

export async function updateMeetingMinutes(
    session: SessionPayload,
    appointmentId: string,
    input: { minutes: string; changeReason?: string },
    actor: { userId?: string | null; username: string }
) {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat menulis notulensi.", 403);
    const appt = await prisma.meetingAppointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            title: true,
            status: true,
            startAt: true,
            endAt: true,
            minutes: true,
            notulisEmployeeId: true,
            requesterEmployeeId: true,
            participants: { select: { employeeId: true } },
        },
    });
    if (!appt) throw new MeetingTaskError("Jadwal meeting tidak ditemukan.", 404);
    const now = new Date();
    const { isMeetingFinished } = await assertCanWriteMinutes(session, appt, now);

    const minutes = input.minutes.trim();
    if (!minutes) throw new MeetingTaskError("Isi notulensi wajib diisi.", 400);
    if (minutes.length > 20000) throw new MeetingTaskError("Notulensi maksimal 20000 karakter.", 400);

    const rawReason = input.changeReason?.trim() ?? "";
    if (isMeetingFinished) {
        if (rawReason.length < 5) {
            throw new MeetingTaskError("Meeting telah selesai. Alasan perubahan notulensi wajib diisi (minimal 5 karakter) untuk audit.", 400);
        }
    } else if (rawReason.length > 0 && rawReason.length < 5) {
        throw new MeetingTaskError("Alasan perubahan minimal 5 karakter.", 400);
    }

    const effectiveReason = rawReason || (appt.minutes ? "Pembaruan notulensi saat meeting berlangsung." : "Penulisan notulensi saat meeting berlangsung.");

    await prisma.$transaction(async (tx) => {
        await tx.meetingAppointment.update({
            where: { id: appointmentId },
            data: { minutes, minutesUpdatedBy: session.employeeId, minutesUpdatedAt: now },
            select: { id: true, minutes: true, minutesUpdatedBy: true, minutesUpdatedAt: true },
        });
        if (isMeetingFinished || rawReason.length >= 5 || appt.minutes === null) {
            const revCount = await tx.meetingAppointmentRevision.count({ where: { appointmentId } });
            await tx.meetingAppointmentRevision.create({
                data: {
                    appointmentId,
                    revisionNumber: revCount + 1,
                    changeReason: effectiveReason,
                    changedBy: actor.username,
                    previousData: { minutes: appt.minutes },
                },
            });
        }
    }).catch((err) => {
        if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
            throw new MeetingTaskError("Data berubah bersamaan. Muat ulang halaman lalu coba lagi.", 409);
        }
        throw err;
    });
    await prisma.auditLog
        .create({
            data: {
                action: "UPDATE_MEETING_MINUTES",
                entity: "APPOINTMENT",
                entityId: appointmentId,
                details: JSON.stringify({ changeReason: effectiveReason, postCompletionAudit: isMeetingFinished }),
                actorType: "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.username,
            },
        })
        .catch((err) => logger.error("meetingTask audit MINUTES gagal", { err }));
    return getMeetingMinutes(session, appointmentId);
}

export async function deleteMeetingMinutes(
    session: SessionPayload,
    appointmentId: string,
    input: { changeReason?: string },
    actor: { userId?: string | null; username: string }
) {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat menghapus notulensi.", 403);
    const appt = await prisma.meetingAppointment.findUnique({
        where: { id: appointmentId },
        select: {
            id: true,
            title: true,
            status: true,
            startAt: true,
            endAt: true,
            minutes: true,
            notulisEmployeeId: true,
            requesterEmployeeId: true,
            participants: { select: { employeeId: true } },
        },
    });
    if (!appt) throw new MeetingTaskError("Jadwal meeting tidak ditemukan.", 404);
    const now = new Date();
    const { isMeetingFinished } = await assertCanWriteMinutes(session, appt, now);

    if (!appt.minutes) {
        throw new MeetingTaskError("Belum ada notulensi untuk dihapus.", 400);
    }

    const rawReason = input.changeReason?.trim() ?? "";
    if (isMeetingFinished) {
        if (rawReason.length < 5) {
            throw new MeetingTaskError("Meeting telah selesai. Alasan penghapusan notulensi wajib diisi (minimal 5 karakter) untuk audit.", 400);
        }
    } else if (rawReason.length > 0 && rawReason.length < 5) {
        throw new MeetingTaskError("Alasan perubahan minimal 5 karakter.", 400);
    }

    const effectiveReason = rawReason || "Penghapusan notulensi saat meeting berlangsung.";

    await prisma.$transaction(async (tx) => {
        await tx.meetingAppointment.update({
            where: { id: appointmentId },
            data: { minutes: null, minutesUpdatedBy: null, minutesUpdatedAt: null },
            select: { id: true, minutes: true, minutesUpdatedBy: true, minutesUpdatedAt: true },
        });
        const revCount = await tx.meetingAppointmentRevision.count({ where: { appointmentId } });
        await tx.meetingAppointmentRevision.create({
            data: {
                appointmentId,
                revisionNumber: revCount + 1,
                changeReason: effectiveReason,
                changedBy: actor.username,
                previousData: { minutes: appt.minutes, deleted: true },
            },
        });
    }).catch((err) => {
        if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
            throw new MeetingTaskError("Data berubah bersamaan. Muat ulang halaman lalu coba lagi.", 409);
        }
        throw err;
    });

    await prisma.auditLog
        .create({
            data: {
                action: "DELETE_MEETING_MINUTES",
                entity: "APPOINTMENT",
                entityId: appointmentId,
                details: JSON.stringify({ changeReason: effectiveReason, postCompletionAudit: isMeetingFinished }),
                actorType: "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.username,
            },
        })
        .catch((err) => logger.error("meetingTask audit DELETE_MEETING_MINUTES gagal", { err }));

    return getMeetingMinutes(session, appointmentId);
}
