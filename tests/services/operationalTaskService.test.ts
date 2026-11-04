import { describe, it, expect, vi, beforeEach } from "vitest";

const employeeFindManyMock = vi.fn();
const taskFindUniqueMock = vi.fn();
const taskFindUniqueOrThrowMock = vi.fn();
const assigneeFindUniqueMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
    prisma: {
        employee: { findMany: (...args: unknown[]) => employeeFindManyMock(...args) },
        meetingTask: {
            findUnique: (...args: unknown[]) => taskFindUniqueMock(...args),
            findUniqueOrThrow: (...args: unknown[]) => taskFindUniqueOrThrowMock(...args),
        },
        meetingTaskAssignee: { findUnique: (...args: unknown[]) => assigneeFindUniqueMock(...args) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
        $transaction: (...args: unknown[]) => transactionMock(...args),
    },
}));

vi.mock("@/lib/services/meetingTaskService", () => ({
    MeetingTaskError: class MeetingTaskError extends Error {
        statusCode: number;
        constructor(message: string, statusCode = 400) {
            super(message);
            this.statusCode = statusCode;
        }
    },
    meetingTaskDueDateTimeToDate: (d: string, t: string) => new Date(`${d}T${t}:00.000Z`),
    taskInclude: {},
    toTaskDto: (task: { id: string }) => ({ ...task, dto: true }),
}));

const session = { employeeId: "EMP-A", userId: "user-a", username: "a" } as never;
const actor = { userId: "user-a", username: "a" };

describe("operationalTaskService (Tambah Task)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("direktori penerima hanya karyawan aktif dengan field minimal", async () => {
        employeeFindManyMock.mockResolvedValue([
            { employeeId: "EMP-B", name: "B", departmentRel: { name: "QA" }, divisionRel: { name: "Ops" }, positionRel: { name: "Staff" } },
        ]);
        const { listOperationalTaskRecipients } = await import("@/lib/services/operationalTaskService");
        const result = await listOperationalTaskRecipients(session);
        expect(employeeFindManyMock).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
        expect(result).toEqual([{ employeeId: "EMP-B", name: "B", department: "QA", division: "Ops", position: "Staff" }]);
    });

    it("buat task: pemberi otomatis dari sesi dan penerima mulai MENUNGGU_PERSETUJUAN", async () => {
        employeeFindManyMock.mockResolvedValue([
            { employeeId: "EMP-A", isActive: true },
            { employeeId: "EMP-B", isActive: true },
        ]);
        let createdData: Record<string, unknown> | null = null;
        transactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<string>) => cb({
            meetingTask: {
                create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => { createdData = args.data; return { id: "task-1" }; }),
                update: vi.fn().mockResolvedValue({}),
            },
            auditLog: { create: vi.fn().mockResolvedValue({}) },
        }));
        taskFindUniqueOrThrowMock.mockResolvedValue({ id: "task-1" });
        const { createOperationalTask } = await import("@/lib/services/operationalTaskService");
        const result = await createOperationalTask(session, {
            title: "Periksa stok", detail: null, assigneeEmployeeIds: ["EMP-B", "EMP-B"], dueDate: "2026-11-10", dueTime: "17:00",
        }, actor);
        expect(result.id).toBe("task-1");
        expect(createdData).toMatchObject({
            appointmentId: null,
            sourceType: "OPERASIONAL",
            assignerEmployeeId: "EMP-A",
            assignees: { create: [{ employeeId: "EMP-B", status: "MENUNGGU_PERSETUJUAN" }] },
        });
    });

    it("buat task menolak penerima diri sendiri dan penerima non-aktif", async () => {
        employeeFindManyMock.mockResolvedValue([{ employeeId: "EMP-A", isActive: true }]);
        const { createOperationalTask } = await import("@/lib/services/operationalTaskService");
        await expect(createOperationalTask(session, {
            title: "X", assigneeEmployeeIds: ["EMP-A"], dueDate: "2026-11-10", dueTime: "17:00",
        }, actor)).rejects.toMatchObject({ statusCode: 422 });
        await expect(createOperationalTask(session, {
            title: "X", assigneeEmployeeIds: ["EMP-X"], dueDate: "2026-11-10", dueTime: "17:00",
        }, actor)).rejects.toMatchObject({ statusCode: 422 });
        expect(transactionMock).not.toHaveBeenCalled();
    });

    it("persetujuan TERIMA membuka task menjadi OPEN", async () => {
        taskFindUniqueMock.mockResolvedValue({ id: "task-1", isCancelled: false, sourceType: "OPERASIONAL" });
        assigneeFindUniqueMock.mockResolvedValue({ id: "asg-1", status: "MENUNGGU_PERSETUJUAN" });
        const updateMock = vi.fn().mockResolvedValue({});
        transactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => cb({
            meetingTaskAssignee: { update: updateMock },
            meetingTaskRevision: { count: vi.fn().mockResolvedValue(1), create: vi.fn().mockResolvedValue({}) },
        }));
        taskFindUniqueOrThrowMock.mockResolvedValue({ id: "task-1" });
        const { respondToOperationalTask } = await import("@/lib/services/operationalTaskService");
        await respondToOperationalTask(session, "task-1", { decision: "TERIMA" }, actor);
        expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ status: "OPEN", rejectionReason: null }),
        }));
    });

    it("penolakan wajib alasan dan menutup task per penerima sebagai DITOLAK", async () => {
        taskFindUniqueMock.mockResolvedValue({ id: "task-1", isCancelled: false, sourceType: "OPERASIONAL" });
        assigneeFindUniqueMock.mockResolvedValue({ id: "asg-1", status: "MENUNGGU_PERSETUJUAN" });
        const { respondToOperationalTask } = await import("@/lib/services/operationalTaskService");
        await expect(respondToOperationalTask(session, "task-1", { decision: "TOLAK", reason: "no" }, actor))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    it("persetujuan ditolak untuk task sumber meeting", async () => {
        taskFindUniqueMock.mockResolvedValue({ id: "task-1", isCancelled: false, sourceType: "APPOINTMENTS" });
        const { respondToOperationalTask } = await import("@/lib/services/operationalTaskService");
        await expect(respondToOperationalTask(session, "task-1", { decision: "TERIMA" }, actor))
            .rejects.toMatchObject({ statusCode: 409 });
    });
});
