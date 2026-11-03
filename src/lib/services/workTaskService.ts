/**
 * Modul My Task — lapisan generik di atas task yang lahir dari modul sumber.
 *
 * Tahap pertama hanya mendukung sumber APPOINTMENTS (E-Meeting). Penyimpanan
 * tetap memakai tabel meeting_task* yang sudah ada (lihat
 * .knowledge/concepts/my-task/FINAL-CONCEPT.md): baris data tidak berpindah,
 * hanya ditambah penanda sumber. Aturan sumber (kapan task boleh dibuat,
 * siapa pesertanya, dampak meeting dibatalkan) tetap ditegakkan oleh
 * meetingTaskService sebagai adapter Appointments; modul ini menyediakan
 * akses lintas-sumber untuk daftar, detail, dan monitoring My Task.
 */
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";
import {
    MeetingTaskError,
    getTasksForMeeting,
    getMyMeetingTasks,
    getTasksAwaitingMyVerification,
    getKinerjaPantau,
    isPrivileged,
    type MeetingTaskDto,
} from "@/lib/services/meetingTaskService";

export { MeetingTaskError as WorkTaskError };
export type WorkTaskDto = MeetingTaskDto & { sourceType: string; sourceId: string };

export const WORK_TASK_SOURCE_APPOINTMENTS = "APPOINTMENTS" as const;

/** Label sumber untuk UI. Sumber baru ditambahkan di sini lewat adapternya. */
export const WORK_TASK_SOURCE_LABELS: Record<string, string> = {
    APPOINTMENTS: "E-Meeting",
};

export function getWorkTaskSourceLabel(sourceType: string | null | undefined): string {
    return WORK_TASK_SOURCE_LABELS[sourceType ?? ""] ?? "Task";
}

function withSource(dto: MeetingTaskDto, viewerEmployeeId?: string | null): WorkTaskDto {
    // Definisi Tugas Saya: yang tampil adalah milik employee yang login.
    // Pada task multi-penerima, penerima hanya melihat submission miliknya;
    // pemberi tugas (untuk verifikasi) dan WIG002 melihat seluruhnya.
    const seesAllSubmissions = !viewerEmployeeId || dto.assigner.employeeId === viewerEmployeeId;
    return {
        ...dto,
        submissions: seesAllSubmissions ? dto.submissions : dto.submissions.filter((s) => s.employeeId === viewerEmployeeId),
        sourceType: dto.sourceType ?? WORK_TASK_SOURCE_APPOINTMENTS,
        sourceId: dto.sourceId ?? dto.appointmentId,
    };
}

/** Daftar task yang ditugaskan kepada karyawan yang login (semua sumber). */
export async function getMyWorkTasks(
    session: SessionPayload,
    filters: { status?: string; overdue?: boolean; sourceType?: string }
): Promise<WorkTaskDto[]> {
    const tasks = await getMyMeetingTasks(session, filters);
    return tasks
        .map((t) => withSource(t, session.employeeId))
        .filter((t) => !filters.sourceType || t.sourceType === filters.sourceType);
}

/** Daftar task yang menunggu verifikasi karyawan yang login sebagai pemberi. */
export async function getWorkTasksAwaitingMyVerification(session: SessionPayload): Promise<WorkTaskDto[]> {
    const tasks = await getTasksAwaitingMyVerification(session);
    return tasks.map((t) => withSource(t, session.employeeId));
}

/**
 * Detail satu task untuk halaman ruang kerja Tugas Saya.
 *
 * Definisi Tugas Saya ditegakkan di sini: detail hanya boleh dibuka oleh
 * penerima task tersebut, pemberi task (untuk verifikasi/kelola), atau
 * WIG002. Peserta meeting yang bukan penerima task ini ditolak — data
 * tugas employee lain tidak boleh tercampur ke ruang kerja orang lain.
 */
export async function getWorkTaskById(session: SessionPayload, taskId: string): Promise<WorkTaskDto> {
    const row = await prisma.meetingTask.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            appointmentId: true,
            sourceType: true,
            sourceId: true,
            assignerEmployeeId: true,
            assignees: { select: { employeeId: true } },
        },
    });
    if (!row) throw new MeetingTaskError("Task tidak ditemukan.", 404);

    const sourceType = row.sourceType ?? WORK_TASK_SOURCE_APPOINTMENTS;
    if (sourceType !== WORK_TASK_SOURCE_APPOINTMENTS) {
        throw new MeetingTaskError("Sumber task ini belum didukung.", 400);
    }
    const isAssigner = Boolean(session.employeeId) && row.assignerEmployeeId === session.employeeId;
    const isAssignee = Boolean(session.employeeId) && row.assignees.some((a) => a.employeeId === session.employeeId);
    if (!isAssigner && !isAssignee && !(await isPrivileged(session))) {
        throw new MeetingTaskError("Tugas ini bukan milik Anda.", 403);
    }
    const tasks = await getTasksForMeeting(session, row.appointmentId);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) throw new MeetingTaskError("Task tidak ditemukan.", 404);
    // Penerima multi-penerima hanya melihat submission miliknya sendiri,
    // kecuali ia juga pemberi tugas atau WIG002.
    const viewer = isAssigner || (await isPrivileged(session)) ? null : session.employeeId;
    return withSource(task, viewer);
}

/** Pantau Tugas: agregasi monitoring per sumber (tahap ini Appointments). */
export async function getWorkTaskMonitoring(
    session: SessionPayload,
    filters: { from?: string; to?: string; sourceType?: string }
) {
    if (filters.sourceType && filters.sourceType !== WORK_TASK_SOURCE_APPOINTMENTS) {
        return { data: [], tunggakanLalu: [], period: { from: filters.from ?? "", to: filters.to ?? "" } };
    }
    return getKinerjaPantau(session, filters);
}
