/**
 * Adapter sumber OPERASIONAL untuk modul Tugas Saya (submodul Tambah Task).
 *
 * Task Operasional lahir di luar meeting: pemberi tugas otomatis karyawan
 * yang login, penerima dipilih dari seluruh karyawan AKTIF master HR, dan
 * setiap penerima wajib melewati gate persetujuan (acc) sebelum dapat
 * mengumpulkan hasil. Penyimpanan memakai tabel meeting_task* yang sama
 * dengan adapter Appointments (appointmentId NULL, sourceType OPERASIONAL);
 * mesin submit/verifikasi/deadline tetap di meetingTaskService yang
 * membedakan perlakuan jendela berdasarkan sourceType.
 */
import { prisma } from "@/lib/prisma";
import { isValidCalendarDate } from "@/lib/timezone";
import type { SessionPayload } from "@/lib/auth";
import logger from "@/lib/logger";
import {
    MeetingTaskError,
    meetingTaskDueDateTimeToDate,
    taskInclude,
    toTaskDto,
    type MeetingTaskDto,
} from "@/lib/services/meetingTaskService";

export const OPERATIONAL_TASK_SOURCE = "OPERASIONAL" as const;

export interface OperationalTaskRecipient {
    employeeId: string;
    name: string;
    department: string;
    division: string;
    position: string;
}

/** Direktori penerima: seluruh karyawan AKTIF dari master karyawan HR. */
export async function listOperationalTaskRecipients(session: SessionPayload): Promise<OperationalTaskRecipient[]> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat melihat daftar penerima task.", 403);
    const rows = await prisma.employee.findMany({
        where: { isActive: true },
        select: {
            employeeId: true,
            name: true,
            departmentRel: { select: { name: true } },
            divisionRel: { select: { name: true } },
            positionRel: { select: { name: true } },
        },
        orderBy: { name: "asc" },
    });
    return rows.map((r) => ({
        employeeId: r.employeeId,
        name: r.name,
        department: r.departmentRel?.name ?? "-",
        division: r.divisionRel?.name ?? "-",
        position: r.positionRel?.name ?? "-",
    }));
}

async function assertActiveEmployees(employeeIds: string[]): Promise<void> {
    const rows = await prisma.employee.findMany({
        where: { employeeId: { in: employeeIds } },
        select: { employeeId: true, isActive: true },
    });
    const active = new Set(rows.filter((r) => r.isActive).map((r) => r.employeeId));
    const missing = employeeIds.filter((id) => !active.has(id));
    if (missing.length > 0) throw new MeetingTaskError("Penerima task harus karyawan yang aktif.", 422);
}

export interface CreateOperationalTaskInput {
    title: string;
    detail?: string | null;
    assigneeEmployeeIds: string[];
    dueDate: string; // YYYY-MM-DD
    dueTime: string; // HH:mm WIB, wajib saat buat task
}

/**
 * Buat task Operasional. Pemberi tugas (verifikator) otomatis karyawan yang
 * login; penerima mulai dari status MENUNGGU_PERSETUJUAN.
 */
export async function createOperationalTask(
    session: SessionPayload,
    input: CreateOperationalTaskInput,
    actor: { userId?: string | null; username: string }
): Promise<MeetingTaskDto> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat membuat task operasional.", 403);
    const giverId = session.employeeId;

    const assigneeIds = [...new Set(input.assigneeEmployeeIds.map((v) => v.trim()).filter(Boolean))];
    if (assigneeIds.length === 0) throw new MeetingTaskError("Pilih minimal satu penerima task.", 400);
    if (assigneeIds.length > 20) throw new MeetingTaskError("Penerima task maksimal 20 orang.", 400);
    if (assigneeIds.includes(giverId)) {
        throw new MeetingTaskError("Anda tidak dapat memberi task operasional kepada diri sendiri.", 422);
    }
    await assertActiveEmployees([giverId, ...assigneeIds]);
    if (!isValidCalendarDate(input.dueDate)) throw new MeetingTaskError("Tanggal deadline tidak valid. Gunakan format YYYY-MM-DD.", 400);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dueTime ?? "")) throw new MeetingTaskError("Jam deadline wajib diisi dengan format HH:mm (00:00–23:59).", 400);
    const title = input.title.trim();
    if (!title) throw new MeetingTaskError("Judul task wajib diisi.", 400);
    const dueAt = meetingTaskDueDateTimeToDate(input.dueDate, input.dueTime);

    const taskId = await prisma.$transaction(async (tx) => {
        const task = await tx.meetingTask.create({
            data: {
                appointmentId: null,
                sourceType: OPERATIONAL_TASK_SOURCE,
                sourceId: null,
                title: title.slice(0, 200),
                detail: input.detail?.trim().slice(0, 5000) || null,
                assignerEmployeeId: giverId,
                createdByUserId: actor.userId ?? null,
                assignees: {
                    create: assigneeIds.map((employeeId) => ({ employeeId, status: "MENUNGGU_PERSETUJUAN" as const })),
                },
                deadlineHistory: { create: { sequence: 1, deadlineDate: dueAt, createdBy: actor.username } },
                revisions: { create: { revisionNumber: 1, changeReason: "Task operasional dibuat.", changedBy: actor.username, previousData: {} } },
            },
            select: { id: true },
        });
        // Konteks sumber task Operasional adalah task itu sendiri.
        await tx.meetingTask.update({ where: { id: task.id }, data: { sourceId: task.id } });
        await tx.auditLog.create({
            data: {
                action: "CREATE_OPERATIONAL_TASK",
                entity: "MEETING_TASK",
                entityId: task.id,
                details: JSON.stringify({ title: title.slice(0, 200), assignerEmployeeId: giverId, assignees: assigneeIds, dueDate: input.dueDate, dueTime: input.dueTime }),
                actorType: "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.username,
            },
        }).catch((err) => logger.error("operationalTask audit CREATE gagal", { err }));
        return task.id;
    });
    const created = await prisma.meetingTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    return toTaskDto(created);
}

export interface RespondOperationalTaskInput {
    decision: "TERIMA" | "TOLAK";
    reason?: string | null;
}

/** Gate persetujuan penerima: TERIMA membuka task (OPEN), TOLAK menutupnya per penerima. */
export async function respondToOperationalTask(
    session: SessionPayload,
    taskId: string,
    input: RespondOperationalTaskInput,
    actor: { userId?: string | null; username: string }
): Promise<MeetingTaskDto> {
    if (!session.employeeId) throw new MeetingTaskError("Hanya karyawan yang dapat merespons task.", 403);
    const task = await prisma.meetingTask.findUnique({
        where: { id: taskId },
        select: { id: true, isCancelled: true, sourceType: true },
    });
    if (!task) throw new MeetingTaskError("Task tidak ditemukan.", 404);
    if (task.sourceType !== OPERATIONAL_TASK_SOURCE) {
        throw new MeetingTaskError("Persetujuan penerima hanya berlaku untuk task operasional.", 409);
    }
    if (task.isCancelled) throw new MeetingTaskError("Task sudah dibatalkan.", 409);
    const row = await prisma.meetingTaskAssignee.findUnique({
        where: { taskId_employeeId: { taskId, employeeId: session.employeeId } },
        select: { id: true, status: true },
    });
    if (!row) throw new MeetingTaskError("Task ini tidak ditugaskan kepada Anda.", 403);
    if (row.status !== "MENUNGGU_PERSETUJUAN") {
        throw new MeetingTaskError("Task ini sudah Anda respons atau tidak lagi menunggu persetujuan.", 409);
    }
    const reason = input.reason?.trim() || null;
    if (input.decision === "TOLAK" && (!reason || reason.length < 5)) {
        throw new MeetingTaskError("Alasan penolakan minimal 5 karakter.", 400);
    }
    await prisma.$transaction(async (tx) => {
        await tx.meetingTaskAssignee.update({
            where: { id: row.id },
            data: input.decision === "TERIMA"
                ? { status: "OPEN", acceptanceRespondedAt: new Date(), rejectionReason: null }
                : { status: "DITOLAK", acceptanceRespondedAt: new Date(), rejectionReason: reason },
        });
        const revCount = await tx.meetingTaskRevision.count({ where: { taskId } });
        await tx.meetingTaskRevision.create({
            data: {
                taskId,
                revisionNumber: revCount + 1,
                changeReason: input.decision === "TERIMA" ? "Penerima menyetujui task." : `Penerima menolak task: ${reason}`,
                changedBy: actor.username,
                previousData: {},
            },
        });
    });
    await prisma.auditLog.create({
        data: {
            action: input.decision === "TERIMA" ? "ACCEPT_OPERATIONAL_TASK" : "REJECT_OPERATIONAL_TASK",
            entity: "MEETING_TASK",
            entityId: taskId,
            details: JSON.stringify({ employeeId: session.employeeId, reason }),
            actorType: "USER",
            actorUserId: actor.userId ?? null,
            actorIdentifier: actor.username,
        },
    }).catch((err) => logger.error("operationalTask audit RESPOND gagal", { err }));
    const refreshed = await prisma.meetingTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
    return toTaskDto(refreshed);
}

/** DTO satu task Operasional (dipakai lapisan generik Tugas Saya). */
export async function getOperationalTaskDtoById(taskId: string): Promise<MeetingTaskDto | null> {
    const task = await prisma.meetingTask.findUnique({ where: { id: taskId }, include: taskInclude });
    return task ? toTaskDto(task) : null;
}
