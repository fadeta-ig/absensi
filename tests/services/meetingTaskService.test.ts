import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn() },
        employee: { findUnique: vi.fn(), findMany: vi.fn() },
        meetingAppointment: { findUnique: vi.fn(), update: vi.fn() },
        meetingAppointmentRevision: { count: vi.fn(), create: vi.fn() },
        meetingTask: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
        meetingTaskReminderLog: { create: vi.fn() },
        meetingTaskAssignee: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
        meetingTaskDeadlineHistory: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
        meetingTaskRevision: { count: vi.fn(), create: vi.fn() },
        meetingTaskSubmission: { count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
        meetingTaskAttachment: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
        auditLog: { create: vi.fn() },
        $transaction: vi.fn(),
        $queryRaw: vi.fn(),
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

import { prisma } from "@/lib/prisma";
import {
    MeetingTaskError,
    cancelMeetingTask,
    createMeetingTask,
    editMeetingTask,
    extendTaskDeadline,
    getMeetingTaskMaxExtensions,
    invalidateMeetingTaskMaxExtensionsCache,
    isAssigneeOverdue,
    isReceiverStickyOverdue,
    meetingTaskDueDateToDate,
    submitTaskWork,
    updateMeetingMinutes,
    verifyTaskSubmission,
} from "@/lib/services/meetingTaskService";
import { toWIBDateString } from "@/lib/timezone";

const mocked = vi.mocked(prisma, true);

function empSession(over: Record<string, unknown> = {}) {
    return {
        userId: "u-1",
        username: "ID-001",
        name: "Pegawai",
        primaryRole: "EMPLOYEE_USER",
        roles: ["EMPLOYEE_USER"],
        permissions: ["employee.self"],
        employeeId: "ID-001",
        ...over,
    } as never;
}

const actor = { userId: "u-1", username: "ID-001" };

function meetingRow() {
    const now = Date.now();
    return {
        id: "appt-1",
        title: "Meeting",
        status: "SCHEDULED",
        startAt: new Date(now - 60_000),
        endAt: new Date(now + 60_000),
        requesterEmployeeId: "ID-001",
        participants: [{ employeeId: "ID-001" }, { employeeId: "ID-002" }],
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    invalidateMeetingTaskMaxExtensionsCache();
    mocked.appSetting.findUnique.mockResolvedValue(null);
    mocked.auditLog.create.mockResolvedValue({} as never);
});

describe("meetingTaskDueDateToDate", () => {
    it("deadline dimaknai akhir hari WIB pada tanggal yang sama", () => {
        const due = meetingTaskDueDateToDate("2026-10-12");
        expect(toWIBDateString(due)).toBe("2026-10-12");
        expect(due.getTime()).toBeGreaterThan(new Date("2026-10-12T00:00:00+07:00").getTime());
    });
});

describe("isAssigneeOverdue", () => {
    it("lewat deadline + belum selesai = overdue", () => {
        expect(isAssigneeOverdue(new Date("2026-10-12T23:59:00+07:00"), "ON_PROGRESS", new Date("2026-10-13T00:00:01+07:00"))).toBe(true);
    });
    it("SELESAI/DIBATALKAN tidak pernah overdue", () => {
        const past = new Date("2020-01-01T00:00:00+07:00");
        const now = new Date("2026-10-13T00:00:00+07:00");
        expect(isAssigneeOverdue(past, "SELESAI", now)).toBe(false);
        expect(isAssigneeOverdue(past, "DIBATALKAN", now)).toBe(false);
    });
    it("belum lewat deadline = tidak overdue", () => {
        expect(isAssigneeOverdue(new Date("2026-10-20T23:59:00+07:00"), "BELUM_DIKERJAKAN", new Date("2026-10-13T00:00:00+07:00"))).toBe(false);
    });
});

describe("createMeetingTask", () => {
    it("tanpa employeeId ditolak 403", async () => {
        await expect(createMeetingTask(empSession({ employeeId: null }), "appt-1", { title: "T", assigneeEmployeeIds: ["ID-002"], dueDate: "2026-10-12" }, actor)).rejects.toMatchObject({ statusCode: 403 });
    });
    it("meeting tidak ada = 404", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue(null);
        await expect(createMeetingTask(empSession(), "nope", { title: "T", assigneeEmployeeIds: ["ID-002"], dueDate: "2026-10-12" }, actor)).rejects.toMatchObject({ statusCode: 404 });
    });
    it("meeting dibatalkan = 409", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue({ ...meetingRow(), status: "CANCELLED" } as never);
        await expect(createMeetingTask(empSession(), "appt-1", { title: "T", assigneeEmployeeIds: ["ID-002"], dueDate: "2026-10-12" }, actor)).rejects.toMatchObject({ statusCode: 409 });
    });
    it("meeting belum mulai (SCHEDULED future) = 409", async () => {
        const now = Date.now();
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            ...meetingRow(),
            status: "SCHEDULED",
            startAt: new Date(now + 60 * 60 * 1000),
            endAt: new Date(now + 2 * 60 * 60 * 1000),
        } as never);
        await expect(createMeetingTask(empSession(), "appt-1", { title: "T", assigneeEmployeeIds: ["ID-002"], dueDate: "2026-10-12" }, actor)).rejects.toMatchObject({
            statusCode: 409,
            message: "Task hanya dapat dibuat ketika meeting sedang berjalan atau sudah terlaksana.",
        });
    });
    it("meeting sedang berjalan (IN_PROGRESS) lolos validasi status", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow() as never);
        await expect(createMeetingTask(empSession(), "appt-1", { title: "T", assigneeEmployeeIds: [], dueDate: "2026-10-12" }, actor)).rejects.toMatchObject({ statusCode: 400 });
    });
    it("meeting sudah selesai (COMPLETED) = 409 read-only", async () => {
        const now = Date.now();
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            ...meetingRow(),
            status: "COMPLETED",
            startAt: new Date(now - 2 * 60 * 60 * 1000),
            endAt: new Date(now - 60 * 60 * 1000),
        } as never);
        await expect(createMeetingTask(empSession(), "appt-1", { title: "T", assigneeEmployeeIds: ["ID-002"], dueDate: "2026-10-12" }, actor)).rejects.toMatchObject({ statusCode: 409 });
        await expect(createMeetingTask(empSession(), "appt-1", { title: "T", assigneeEmployeeIds: ["ID-002"], dueDate: "2026-10-12" }, actor)).rejects.toThrow(
            "Meeting sudah selesai. Task baru tidak dapat ditambahkan."
        );
    });
    it("update notulensi sebelum jam mulai (SCHEDULED) = 409", async () => {
        const now = Date.now();
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            ...meetingRow(),
            status: "SCHEDULED",
            startAt: new Date(now + 60_000),
            endAt: new Date(now + 120_000),
            minutes: null,
        } as never);
        await expect(updateMeetingMinutes(empSession(), "appt-1", { minutes: "baru" }, actor)).rejects.toMatchObject({
            statusCode: 409,
        });
    });
    it("update notulensi saat sedang berjalan (IN_PROGRESS) berhasil tanpa alasan perubahan", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue({ ...meetingRow(), status: "SCHEDULED", minutes: null } as never);
        mocked.employee.findMany.mockResolvedValue([] as never);
        const tx = {
            meetingAppointment: {
                update: vi.fn().mockResolvedValue({ id: "appt-1", minutes: "Catatan rapat", minutesUpdatedBy: "ID-001", minutesUpdatedAt: new Date() }),
            },
            meetingAppointmentRevision: {
                count: vi.fn().mockResolvedValue(0),
                create: vi.fn().mockResolvedValue({}),
            },
        };
        mocked.$transaction.mockImplementation(async (cb: (t: never) => Promise<unknown>) => cb(tx as never));
        const res = await updateMeetingMinutes(empSession({ employeeId: "ID-002" }), "appt-1", { minutes: "Catatan rapat" }, { userId: "u-2", username: "ID-002" });
        expect(res).toBeDefined();
        expect(tx.meetingAppointment.update).toHaveBeenCalled();
    });
    it("update notulensi bila notulis sudah ditunjuk menolak peserta lain = 403", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue({
            ...meetingRow(),
            status: "SCHEDULED",
            notulisEmployeeId: "ID-002",
            minutes: null,
        } as never);
        await expect(
            updateMeetingMinutes(
                empSession({ employeeId: "ID-003" }),
                "appt-1",
                { minutes: "Coba isi" },
                { userId: "u-3", username: "ID-003" }
            )
        ).rejects.toMatchObject({ statusCode: 403 });
    });
    it("update notulensi di meeting COMPLETED = 409 (notulensi ditutup)", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue({ ...meetingRow(), status: "COMPLETED", minutes: "lama" } as never);
        await expect(
            updateMeetingMinutes(empSession(), "appt-1", { minutes: "baru", changeReason: "Koreksi isi notulensi pasca rapat" }, actor)
        ).rejects.toMatchObject({
            statusCode: 409,
        });
    });
    it("update notulensi di meeting CANCELLED = 409", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue({ ...meetingRow(), status: "CANCELLED", minutes: "lama" } as never);
        await expect(updateMeetingMinutes(empSession(), "appt-1", { minutes: "baru", changeReason: "Koreksi isi notulensi" }, actor)).rejects.toMatchObject({
            statusCode: 409,
        });
    });
    it("bukan peserta = 403", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue({ ...meetingRow(), requesterEmployeeId: "ID-009", participants: [{ employeeId: "ID-009" }] } as never);
        await expect(createMeetingTask(empSession(), "appt-1", { title: "T", assigneeEmployeeIds: ["ID-009"], dueDate: "2026-10-12" }, actor)).rejects.toMatchObject({ statusCode: 403 });
    });
    it("tanpa penerima = 400", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow() as never);
        await expect(createMeetingTask(empSession(), "appt-1", { title: "T", assigneeEmployeeIds: [], dueDate: "2026-10-12" }, actor)).rejects.toMatchObject({ statusCode: 400 });
    });
    it("penerima di luar peserta = 422", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow() as never);
        await expect(createMeetingTask(empSession(), "appt-1", { title: "T", assigneeEmployeeIds: ["ID-999"], dueDate: "2026-10-12" }, actor)).rejects.toMatchObject({ statusCode: 422 });
    });
    it("tanggal tidak valid = 400", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow() as never);
        mocked.employee.findMany.mockResolvedValue([{ employeeId: "ID-002", isActive: true }] as never);
        await expect(createMeetingTask(empSession(), "appt-1", { title: "T", assigneeEmployeeIds: ["ID-002"], dueDate: "2026-13-99" }, actor)).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe("submitTaskWork", () => {
    const file = () => ({ buffer: Buffer.from("%PDF-1.4 test"), originalName: "bukti.pdf", mimeType: "application/pdf", size: 12 });
    it("tanpa file = 400", async () => {
        await expect(submitTaskWork(empSession(), "task-1", { note: null, files: [] }, actor)).rejects.toMatchObject({ statusCode: 400 });
    });
    it("lebih dari 5 file = 400", async () => {
        await expect(submitTaskWork(empSession(), "task-1", { note: null, files: [file(), file(), file(), file(), file(), file()] }, actor)).rejects.toMatchObject({ statusCode: 400 });
    });
    it("tipe tak didukung = 400", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", isCancelled: false, assignerEmployeeId: "ID-009", appointmentId: "appt-1" } as never);
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow() as never);
        mocked.meetingTaskAssignee.findUnique.mockResolvedValue({ id: "a-1", status: "OPEN" } as never);
        await expect(
            submitTaskWork(empSession(), "task-1", { note: null, files: [{ ...file(), mimeType: "application/zip", originalName: "a.zip" }] }, actor)
        ).rejects.toMatchObject({ statusCode: 400 });
    });
    it("bukan penerima submit = 403", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", isCancelled: false, assignerEmployeeId: "ID-009", appointmentId: "appt-1" } as never);
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow() as never);
        mocked.meetingTaskAssignee.findUnique.mockResolvedValue(null);
        await expect(submitTaskWork(empSession(), "task-1", { note: null, files: [file()] }, actor)).rejects.toMatchObject({ statusCode: 403 });
    });
    it("sudah menunggu verifikasi (ON_PROGRESS) = 409", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", isCancelled: false, assignerEmployeeId: "ID-009", appointmentId: "appt-1" } as never);
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow() as never);
        mocked.meetingTaskAssignee.findUnique.mockResolvedValue({ id: "a-1", status: "ON_PROGRESS" } as never);
        await expect(submitTaskWork(empSession(), "task-1", { note: null, files: [file()] }, actor)).rejects.toMatchObject({ statusCode: 409 });
    });
});

describe("extendTaskDeadline", () => {
    it("bukan pemberi/GA = 403", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", isCancelled: false, assignerEmployeeId: "ID-002", appointmentId: "appt-1" } as never);
        mocked.meetingAppointment.findUnique.mockResolvedValue({ id: "appt-1", status: "SCHEDULED" } as never);
        await expect(extendTaskDeadline(empSession(), "task-1", { proposedDate: "2026-10-20", reason: "Butuh data tambahan" }, actor)).rejects.toMatchObject({ statusCode: 403 });
    });
    it("alasan pendek = 400 (oleh pemberi)", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", isCancelled: false, assignerEmployeeId: "ID-001", appointmentId: "appt-1" } as never);
        mocked.meetingAppointment.findUnique.mockResolvedValue({ id: "appt-1", status: "SCHEDULED" } as never);
        await expect(extendTaskDeadline(empSession(), "task-1", { proposedDate: "2026-10-20", reason: "ok" }, actor)).rejects.toMatchObject({ statusCode: 400 });
    });
    it("semua penerima SELESAI = 409 terkunci", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", isCancelled: false, assignerEmployeeId: "ID-001", appointmentId: "appt-1", assignees: [{ status: "SELESAI" }] } as never);
        mocked.meetingAppointment.findUnique.mockResolvedValue({ id: "appt-1", status: "SCHEDULED" } as never);
        await expect(extendTaskDeadline(empSession(), "task-1", { proposedDate: "2026-10-20", reason: "Butuh data tambahan" }, actor)).rejects.toMatchObject({ statusCode: 409 });
    });
});

describe("cancelMeetingTask", () => {
    it("bukan pemberi/GA = 403", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", isCancelled: false, assignerEmployeeId: "ID-002", appointmentId: "appt-1" } as never);
        mocked.meetingAppointment.findUnique.mockResolvedValue({ id: "appt-1", status: "SCHEDULED" } as never);
        await expect(cancelMeetingTask(empSession(), "task-1", "Alasan batal yang cukup panjang", actor)).rejects.toMatchObject({ statusCode: 403 });
    });
    it("semua penerima SELESAI = 409 terkunci", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", isCancelled: false, assignerEmployeeId: "ID-001", appointmentId: "appt-1", assignees: [{ status: "SELESAI" }] } as never);
        mocked.meetingAppointment.findUnique.mockResolvedValue({ id: "appt-1", status: "SCHEDULED" } as never);
        await expect(cancelMeetingTask(empSession(), "task-1", "Alasan batal yang cukup panjang", actor)).rejects.toMatchObject({ statusCode: 409 });
    });
});

describe("verifyTaskSubmission", () => {
    it("bukan pemberi/GA = 403", async () => {
        mocked.meetingTaskSubmission.findUnique.mockResolvedValue({
            id: "sub-1",
            verdict: "PENDING",
            task: { id: "task-1", isCancelled: false, assignerEmployeeId: "ID-009", appointmentId: "appt-1" },
        } as never);
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow() as never);
        await expect(verifyTaskSubmission(empSession(), "sub-1", { decision: "TERIMA" }, actor)).rejects.toMatchObject({ statusCode: 403 });
    });
    it("sudah diputuskan = 409", async () => {
        mocked.meetingTaskSubmission.findUnique.mockResolvedValue({
            id: "sub-1",
            verdict: "DITERIMA",
            task: { id: "task-1", isCancelled: false, assignerEmployeeId: "ID-001", appointmentId: "appt-1" },
        } as never);
        await expect(verifyTaskSubmission(empSession(), "sub-1", { decision: "TERIMA" }, actor)).rejects.toMatchObject({ statusCode: 409 });
    });
    it("REVISI tanpa alasan/tenggat = 400", async () => {
        mocked.meetingTaskSubmission.findUnique.mockResolvedValue({
            id: "sub-1",
            verdict: "PENDING",
            task: { id: "task-1", isCancelled: false, assignerEmployeeId: "ID-001", appointmentId: "appt-1" },
        } as never);
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow() as never);
        await expect(verifyTaskSubmission(empSession(), "sub-1", { decision: "REVISI" }, actor)).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe("editMeetingTask", () => {
    it("bukan pemberi/GA = 403", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", title: "T", detail: null, isCancelled: false, assignerEmployeeId: "ID-002", appointmentId: "appt-1" } as never);
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow() as never);
        await expect(editMeetingTask(empSession(), "task-1", { title: "Baru" }, actor)).rejects.toMatchObject({ statusCode: 403 });
    });
    it("tanpa perubahan = 400", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", title: "T", detail: null, isCancelled: false, assignerEmployeeId: "ID-001", appointmentId: "appt-1" } as never);
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow() as never);
        await expect(editMeetingTask(empSession(), "task-1", {}, actor)).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe("isReceiverStickyOverdue", () => {
    const due = new Date("2026-10-25T16:59:00Z");
    it("tanpa submit melewati deadline awal = sticky", () => {
        expect(isReceiverStickyOverdue([], due, new Date("2026-10-26T00:00:00Z"))).toBe(true);
    });
    it("submit tepat waktu = tidak sticky walau verifikasi telat", () => {
        const subs = [{ createdAt: new Date("2026-10-24T00:00:00Z"), attemptNo: 1, verdict: "PENDING", resubmitDueAt: null }];
        expect(isReceiverStickyOverdue(subs, due, new Date("2026-11-01T00:00:00Z"))).toBe(false);
    });
    it("submit-ulang revisi lewat tenggat revisi = sticky", () => {
        const subs = [
            { createdAt: new Date("2026-10-24T00:00:00Z"), attemptNo: 1, verdict: "DIREVISI", resubmitDueAt: new Date("2026-10-27T16:59:00Z") },
        ];
        expect(isReceiverStickyOverdue(subs, due, new Date("2026-10-28T00:00:00Z"))).toBe(true);
        const resub = [...subs, { createdAt: new Date("2026-10-26T00:00:00Z"), attemptNo: 2, verdict: "PENDING", resubmitDueAt: null }];
        expect(isReceiverStickyOverdue(resub, due, new Date("2026-10-28T00:00:00Z"))).toBe(false);
    });
});

describe("getMeetingTaskMaxExtensions", () => {
    it("default 3 bila setting kosong", async () => {
        await expect(getMeetingTaskMaxExtensions()).resolves.toBe(3);
    });
    it("membaca AppSetting bila ada", async () => {
        mocked.appSetting.findUnique.mockResolvedValue({ value: "5" } as never);
        await expect(getMeetingTaskMaxExtensions()).resolves.toBe(5);
    });
    it("MeetingTaskError membawa statusCode", () => {
        expect(new MeetingTaskError("x", 422).statusCode).toBe(422);
    });
});

describe("submit on complete", () => {
    it("melewati penerima yang sudah SUBMITTED", async () => {
        const { getUnsubmittedOpenTasks } = await import("@/lib/services/meetingTaskService");
        mocked.meetingTask.findMany.mockResolvedValue([
            {
                id: "t1",
                title: "Tugas",
                deadlineHistory: [{ deadlineDate: new Date("2026-10-12T16:59:00Z") }],
                assignees: [{ employeeId: "ID-001" }, { employeeId: "ID-002" }],
                reminderLogs: [{ employeeId: "ID-001" }],
            },
        ] as never);
        const out = await getUnsubmittedOpenTasks(["appt-1"]);
        expect(out).toHaveLength(1);
        expect(out[0].employeeIds).toEqual(["ID-002"]);
        expect(out[0].activeDeadlineDate).toBe("2026-10-12");
    });
    it("claim melewati P2002 (cron paralel)", async () => {
        const { claimSubmittedTasks } = await import("@/lib/services/meetingTaskService");
        mocked.meetingTaskReminderLog.create
            .mockResolvedValueOnce({} as never)
            .mockRejectedValueOnce({ code: "P2002" });
        const out = await claimSubmittedTasks([{ taskId: "t1", title: "T", activeDeadlineDate: "2026-10-12", employeeIds: ["ID-001", "ID-002"] }]);
        expect(out).toHaveLength(1);
        expect(out[0].employeeIds).toEqual(["ID-001"]);
    });
    it("daftar kosong tanpa query berat", async () => {
        const { getUnsubmittedOpenTasks } = await import("@/lib/services/meetingTaskService");
        await expect(getUnsubmittedOpenTasks([])).resolves.toEqual([]);
        expect(mocked.meetingTask.findMany).not.toHaveBeenCalled();
    });
});
