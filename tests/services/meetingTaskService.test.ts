import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        appSetting: { findUnique: vi.fn() },
        employee: { findUnique: vi.fn(), findMany: vi.fn() },
        meetingAppointment: { findUnique: vi.fn(), update: vi.fn() },
        meetingAppointmentRevision: { count: vi.fn(), create: vi.fn() },
        meetingTask: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
        meetingTaskAssignee: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
        meetingTaskDeadlineHistory: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
        meetingTaskRevision: { count: vi.fn(), create: vi.fn() },
        meetingTaskExtensionRequest: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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
    extendTaskDeadline,
    getMeetingTaskMaxExtensions,
    invalidateMeetingTaskMaxExtensionsCache,
    isAssigneeOverdue,
    meetingTaskDueDateToDate,
    requestTaskExtension,
    updateMyTaskStatus,
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
    return {
        id: "appt-1",
        title: "Meeting",
        status: "SCHEDULED",
        startAt: new Date(),
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

describe("updateMyTaskStatus", () => {
    it("status tidak valid = 400", async () => {
        await expect(updateMyTaskStatus(empSession(), "task-1", "SELESAI_SEMUANYA" as never, actor)).rejects.toMatchObject({ statusCode: 400 });
    });
    it("bukan penerima = 403", async () => {
        mocked.meetingTaskAssignee.findUnique.mockResolvedValue(null);
        await expect(updateMyTaskStatus(empSession(), "task-1", "SELESAI", actor)).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe("extendTaskDeadline", () => {
    it("bukan pemberi/PIC = 403", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", isCancelled: false, assignerEmployeeId: "ID-002" } as never);
        await expect(extendTaskDeadline(empSession(), "task-1", { proposedDate: "2026-10-20", reason: "Butuh data tambahan" }, actor)).rejects.toMatchObject({ statusCode: 403 });
    });
    it("alasan pendek = 400 (oleh pemberi)", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", isCancelled: false, assignerEmployeeId: "ID-001" } as never);
        await expect(extendTaskDeadline(empSession(), "task-1", { proposedDate: "2026-10-20", reason: "ok" }, actor)).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe("cancelMeetingTask", () => {
    it("bukan pemberi/PIC = 403", async () => {
        mocked.meetingTask.findUnique.mockResolvedValue({ id: "task-1", isCancelled: false, assignerEmployeeId: "ID-002" } as never);
        await expect(cancelMeetingTask(empSession(), "task-1", "Alasan batal yang cukup panjang", actor)).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe("requestTaskExtension", () => {
    it("bukan penerima = 403", async () => {
        mocked.meetingTaskAssignee.findUnique.mockResolvedValue(null);
        await expect(requestTaskExtension(empSession(), "task-1", { proposedDate: "2026-10-20", reason: "Butuh waktu tambahan" }, actor)).rejects.toMatchObject({ statusCode: 403 });
    });
    it("duplikat pending = 409", async () => {
        mocked.meetingTaskAssignee.findUnique.mockResolvedValue({ task: { id: "task-1", isCancelled: false }, status: "ON_PROGRESS" } as never);
        mocked.meetingTaskExtensionRequest.findFirst.mockResolvedValue({ id: "req-1" } as never);
        await expect(requestTaskExtension(empSession(), "task-1", { proposedDate: "2026-10-20", reason: "Butuh waktu tambahan" }, actor)).rejects.toMatchObject({ statusCode: 409 });
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
