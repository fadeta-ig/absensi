import { describe, it, expect, vi, beforeEach } from "vitest";

const getMyMeetingTasksMock = vi.fn();
const getTasksAwaitingMyVerificationMock = vi.fn();
const getTasksForMeetingMock = vi.fn();
const findTaskMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
    prisma: { meetingTask: { findUnique: (...args: unknown[]) => findTaskMock(...args) } },
}));

vi.mock("@/lib/services/meetingTaskService", () => ({
    MeetingTaskError: class MeetingTaskError extends Error {
        statusCode: number;
        constructor(message: string, statusCode: number) {
            super(message);
            this.statusCode = statusCode;
        }
    },
    getTasksForMeeting: (...args: unknown[]) => getTasksForMeetingMock(...args),
    getMyMeetingTasks: (...args: unknown[]) => getMyMeetingTasksMock(...args),
    getTasksAwaitingMyVerification: (...args: unknown[]) => getTasksAwaitingMyVerificationMock(...args),
    getKinerjaPantau: vi.fn(),
    isPrivileged: async () => false,
}));

function dto(overrides: Record<string, unknown> = {}) {
    return {
        id: "task-1",
        appointmentId: "appt-1",
        sourceType: "APPOINTMENTS",
        sourceId: "appt-1",
        title: "Task",
        assigner: { employeeId: "ID-9", name: "Pemberi" },
        submissions: [],
        ...overrides,
    };
}

describe("workTaskService (My Task)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("memberi label sumber E-Meeting untuk APPOINTMENTS", async () => {
        const { getWorkTaskSourceLabel } = await import("@/lib/services/workTaskService");
        expect(getWorkTaskSourceLabel("APPOINTMENTS")).toBe("E-Meeting");
        expect(getWorkTaskSourceLabel(null)).toBe("Task");
    });

    it("daftar Tugas Saya mempertahankan penanda sumber dari adapter Appointments", async () => {
        getMyMeetingTasksMock.mockResolvedValue([dto(), dto({ id: "task-2", sourceType: null, sourceId: null })]);
        const { getMyWorkTasks } = await import("@/lib/services/workTaskService");
        const result = await getMyWorkTasks({ employeeId: "EMP-1" } as never, {});
        expect(result).toHaveLength(2);
        expect(result[0].sourceType).toBe("APPOINTMENTS");
        // Baris lama tanpa penanda sumber jatuh ke konteks appointment-nya.
        expect(result[1].sourceType).toBe("APPOINTMENTS");
        expect(result[1].sourceId).toBe("appt-1");
    });

    it("filter sumber mengecualikan task di luar sumber yang dipilih", async () => {
        getMyMeetingTasksMock.mockResolvedValue([dto()]);
        const { getMyWorkTasks } = await import("@/lib/services/workTaskService");
        const result = await getMyWorkTasks({ employeeId: "EMP-1" } as never, { sourceType: "GREEN_MEETING" });
        expect(result).toHaveLength(0);
    });

    it("daftar saya hanya memuat submission milik saya pada task multi-penerima", async () => {
        getMyMeetingTasksMock.mockResolvedValue([
            dto({ submissions: [{ employeeId: "EMP-1", id: "s1" }, { employeeId: "EMP-2", id: "s2" }] }),
        ]);
        const { getMyWorkTasks } = await import("@/lib/services/workTaskService");
        const result = await getMyWorkTasks({ employeeId: "EMP-1" } as never, {});
        expect(result[0].submissions.map((s: { id: string }) => s.id)).toEqual(["s1"]);
    });

    it("detail menolak employee yang bukan penerima maupun pemberi task", async () => {
        findTaskMock.mockResolvedValue({
            id: "task-1", appointmentId: "appt-1", sourceType: "APPOINTMENTS", sourceId: "appt-1",
            assignerEmployeeId: "ID-9", assignees: [{ employeeId: "EMP-2" }],
        });
        const { getWorkTaskById } = await import("@/lib/services/workTaskService");
        await expect(getWorkTaskById({ employeeId: "EMP-1" } as never, "task-1")).rejects.toMatchObject({ statusCode: 403 });
        expect(getTasksForMeetingMock).not.toHaveBeenCalled();
    });

    it("detail penerima hanya memuat submission miliknya", async () => {
        findTaskMock.mockResolvedValue({
            id: "task-1", appointmentId: "appt-1", sourceType: "APPOINTMENTS", sourceId: "appt-1",
            assignerEmployeeId: "ID-9", assignees: [{ employeeId: "EMP-1" }, { employeeId: "EMP-2" }],
        });
        getTasksForMeetingMock.mockResolvedValue([
            dto({ submissions: [{ employeeId: "EMP-1", id: "s1" }, { employeeId: "EMP-2", id: "s2" }] }),
        ]);
        const { getWorkTaskById } = await import("@/lib/services/workTaskService");
        const result = await getWorkTaskById({ employeeId: "EMP-1" } as never, "task-1");
        expect(result.submissions.map((s: { id: string }) => s.id)).toEqual(["s1"]);
    });
});
