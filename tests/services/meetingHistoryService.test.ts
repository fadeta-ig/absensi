import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        meetingAppointment: { findUnique: vi.fn() },
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        JWT_SECRET: "test-jwt-secret-at-least-sixteen",
        PII_ENCRYPTION_KEY: "test-pii-key-that-is-stable-and-long-enough",
    },
}));

import { prisma } from "@/lib/prisma";
import { getMeetingHistory } from "@/lib/services/meetingHistoryService";

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

function meetingRow(over: Record<string, unknown> = {}) {
    return {
        id: "appt-1",
        title: "Meeting",
        agenda: null,
        status: "SCHEDULED",
        startAt: new Date("2026-10-20T03:00:00Z"),
        endAt: new Date("2026-10-20T04:00:00Z"),
        isFullDay: false,
        meetingLink: null,
        requesterEmployeeId: "ID-001",
        createdAt: new Date("2026-10-19T00:00:00Z"),
        minutes: null,
        requester: { employeeId: "ID-001", name: "Pegawai Satu" },
        room: { name: "Ruang A" },
        participants: [
            {
                employeeId: "ID-001",
                guestName: null,
                isExternal: false,
                attendance: "BELUM",
                inviteStatus: "ACCEPTED",
                inviteRespondedAt: new Date("2026-10-19T01:00:00Z"),
                inviteNote: null,
                employee: { employeeId: "ID-001", name: "Pegawai Satu" },
            },
        ],
        revisions: [],
        tasks: [],
        ...over,
    };
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe("getMeetingHistory akses", () => {
    it("tanpa employeeId ditolak 403", async () => {
        await expect(getMeetingHistory(empSession({ employeeId: null }), "appt-1")).rejects.toMatchObject({ statusCode: 403 });
    });
    it("meeting tidak ada = 404", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue(null);
        await expect(getMeetingHistory(empSession(), "nope")).rejects.toMatchObject({ statusCode: 404 });
    });
    it("bukan peserta ditolak 403", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow({
            requesterEmployeeId: "ID-009",
            participants: [],
        }) as never);
        await expect(getMeetingHistory(empSession(), "appt-1")).rejects.toMatchObject({ statusCode: 403 });
    });
});

describe("getMeetingHistory event", () => {
    it("membangun ringkasan + event terurut kronologis", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow({
            revisions: [
                {
                    id: "r1",
                    revisionNumber: 1,
                    changeReason: "Task dibuat.",
                    changedBy: "ID-001",
                    previousData: {},
                    createdAt: new Date("2026-10-19T02:00:00Z"),
                },
            ],
            tasks: [
                {
                    id: "t1",
                    title: "Kirim data",
                    createdAt: new Date("2026-10-19T03:00:00Z"),
                    isCancelled: false,
                    cancelReason: null,
                    cancelledAt: null,
                    assigner: { employeeId: "ID-001", name: "Pegawai Satu" },
                    assignees: [
                        {
                            employeeId: "ID-001",
                            status: "SELESAI",
                            completedAt: new Date("2026-10-19T05:00:00Z"),
                            updatedAt: new Date("2026-10-19T05:00:00Z"),
                            employee: { employeeId: "ID-001", name: "Pegawai Satu" },
                        },
                    ],
                    deadlineHistory: [
                        { sequence: 1, deadlineDate: new Date("2026-10-20T16:59:00Z"), reason: null, createdBy: "ID-001", createdAt: new Date("2026-10-19T03:00:00Z") },
                        { sequence: 2, deadlineDate: new Date("2026-10-21T16:59:00Z"), reason: "Butuh data", createdBy: "ID-001", createdAt: new Date("2026-10-19T04:00:00Z") },
                    ],
                    extensionRequests: [],
                },
            ],
        }) as never);
        const out = await getMeetingHistory(empSession(), "appt-1");
        expect(out.summary.tasks).toBe(1);
        expect(out.summary.tasksDone).toBe(1);
        expect(out.summary.extensions).toBe(1);
        const actions = out.events.map((e) => e.action);
        expect(actions).toContain("created");
        expect(actions).toContain("task_created");
        expect(actions).toContain("deadline_extended");
        expect(actions).toContain("task_done");
        expect(actions).toContain("rsvp_accepted");
        const times = out.events.map((e) => e.at);
        expect([...times].sort()).toEqual(times);
    });
    it("revisi tanpa meetingLink dibaca sebagai pembatalan", async () => {
        mocked.meetingAppointment.findUnique.mockResolvedValue(meetingRow({
            status: "CANCELLED",
            revisions: [
                {
                    id: "r9",
                    revisionNumber: 1,
                    changeReason: "Jadwal bentrok audit",
                    changedBy: "ID-001",
                    previousData: { status: "SCHEDULED", roomId: "r1", startAt: "x", endAt: "y" },
                    createdAt: new Date("2026-10-19T02:00:00Z"),
                },
            ],
        }) as never);
        const out = await getMeetingHistory(empSession(), "appt-1");
        expect(out.events.map((e) => e.action)).toContain("cancelled");
    });
});
