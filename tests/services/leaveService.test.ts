import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    employeeFindUnique: vi.fn(),
    employeeUpdate: vi.fn(),
    leaveFindMany: vi.fn(),
    leaveFindFirst: vi.fn(),
    leaveFindUnique: vi.fn(),
    leaveCreate: vi.fn(),
    leaveUpdate: vi.fn(),
    leaveDeleteMany: vi.fn(),
    leaveCount: vi.fn(),
    countWorkingDaysForEmployee: vi.fn(),
    resolveShiftsForRange: vi.fn(),
    unlink: vi.fn(),
}));

vi.mock("fs/promises", () => ({
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    unlink: mocks.unlink,
}));

const prismaMock = vi.hoisted(() => {
    const client = {
        employee: {
            findUnique: mocks.employeeFindUnique,
            update: mocks.employeeUpdate,
        },
        leaveRequest: {
            findMany: mocks.leaveFindMany,
            findFirst: mocks.leaveFindFirst,
            findUnique: mocks.leaveFindUnique,
            create: mocks.leaveCreate,
            update: mocks.leaveUpdate,
            deleteMany: mocks.leaveDeleteMany,
            count: mocks.leaveCount,
        },
        $transaction: vi.fn(),
    };
    client.$transaction.mockImplementation(async (arg: unknown) => {
        if (typeof arg === "function") {
            return (arg as (tx: typeof client) => Promise<unknown>)(client);
        }
        return Promise.all(arg as Promise<unknown>[]);
    });
    return client;
});

vi.mock("@/lib/prisma", () => ({
    prisma: prismaMock,
}));

vi.mock("@/lib/services/shiftAssignmentService", () => ({
    countWorkingDaysForEmployee: mocks.countWorkingDaysForEmployee,
    resolveShiftsForRange: mocks.resolveShiftsForRange,
}));

import {
    calculateWorkingDays,
    createLeaveRequestsBatch,
    deleteLeaveRequest,
    getEmployeeLeaveBalance,
    getLeaveRequests,
    updateLeaveRequestsBulk,
    LeaveConflictError,
    LeaveQuotaError,
    LeaveValidationError,
} from "@/lib/services/leaveService";

describe("Leave Service - calculateWorkingDays", () => {
    it("should correctly calculate working days without off days", () => {
        // Monday to Friday
        const startDate = new Date("2024-01-01T00:00:00Z"); // Monday
        const endDate = new Date("2024-01-05T00:00:00Z"); // Friday
        
        // Default off days: Sunday (0)
        const offDays = new Set([0]);
        
        const workingDays = calculateWorkingDays(startDate, endDate, offDays);
        expect(workingDays).toBe(5); // Mon, Tue, Wed, Thu, Fri
    });

    it("should skip off days (e.g. Saturday and Sunday)", () => {
        // Friday to Tuesday (5 days total)
        const startDate = new Date("2024-01-05T00:00:00Z"); // Friday
        const endDate = new Date("2024-01-09T00:00:00Z"); // Tuesday
        
        // Off days: Saturday (6) and Sunday (0)
        const offDays = new Set([0, 6]);
        
        const workingDays = calculateWorkingDays(startDate, endDate, offDays);
        expect(workingDays).toBe(3); // Fri, Mon, Tue
    });

    it("should handle same day leave", () => {
        const startDate = new Date("2024-01-03T00:00:00Z"); // Wednesday
        const endDate = new Date("2024-01-03T00:00:00Z"); // Wednesday
        
        const offDays = new Set([0]);
        
        const workingDays = calculateWorkingDays(startDate, endDate, offDays);
        expect(workingDays).toBe(1);
    });

    it("should return 0 if the only day is an off day", () => {
        const startDate = new Date("2024-01-07T00:00:00Z"); // Sunday
        const endDate = new Date("2024-01-07T00:00:00Z"); // Sunday
        
        const offDays = new Set([0]);
        
        const workingDays = calculateWorkingDays(startDate, endDate, offDays);
        expect(workingDays).toBe(0);
    });
});

describe("Leave Service - authoritative balance, dual-reader mapper & batch discrete creation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("maps getLeaveRequests rows through dual-reader toLeaveRequest (YYYY-MM-DD + attachmentUrl)", async () => {
        mocks.leaveFindMany.mockResolvedValue([
            {
                id: "lr-1",
                employeeId: "EMP001",
                type: "sick",
                startDate: new Date("2026-11-12T00:00:00.000Z"),
                endDate: new Date("2026-11-12T00:00:00.000Z"),
                reason: "Demam",
                status: "pending",
                attachment: null,
                attachmentPath: "123e4567-e89b-12d3-a456-426614174000.pdf",
                attachmentMime: "application/pdf",
                attachmentSize: 1024,
                createdAt: new Date("2026-11-11T02:00:00.000Z"),
                employee: {
                    name: "Budi",
                    employeeId: "EMP001",
                    totalLeave: 15,
                    usedLeave: 3,
                },
            },
        ]);

        const rows = await getLeaveRequests("EMP001");
        expect(rows).toHaveLength(1);
        expect(rows[0].startDate).toBe("2026-11-12");
        expect(rows[0].endDate).toBe("2026-11-12");
        expect(rows[0].attachmentUrl).toBe("/api/leave/attachments/123e4567-e89b-12d3-a456-426614174000.pdf");
        expect(rows[0].employee.totalLeave).toBe(15);
    });

    it("computes authoritative getEmployeeLeaveBalance including pending annual working days", async () => {
        mocks.employeeFindUnique.mockResolvedValue({ totalLeave: 14, usedLeave: 4 });
        mocks.leaveFindMany.mockResolvedValue([
            {
                startDate: new Date("2026-11-12T00:00:00.000Z"),
                endDate: new Date("2026-11-13T00:00:00.000Z"),
            },
        ]);
        mocks.countWorkingDaysForEmployee.mockResolvedValue(2);

        const balance = await getEmployeeLeaveBalance("EMP001");
        expect(balance).toEqual({
            totalLeave: 14,
            usedLeave: 4,
            pendingAnnualDays: 2,
            remainingLeave: 10,
            availableAnnualLeave: 8,
        });
    });

    it("rejects createLeaveRequestsBatch when annual dates exceed availableAnnualLeave (remaining minus pending)", async () => {
        mocks.leaveFindFirst.mockResolvedValue(null);
        mocks.resolveShiftsForRange.mockResolvedValue([
            { date: "2026-11-13", shift: null },
            { date: "2026-11-14", shift: null },
        ]);
        mocks.countWorkingDaysForEmployee.mockResolvedValue(1);
        mocks.employeeFindUnique.mockResolvedValue({ totalLeave: 12, usedLeave: 10 });
        mocks.leaveFindMany.mockResolvedValue([
            {
                startDate: new Date("2026-11-12T00:00:00.000Z"),
                endDate: new Date("2026-11-12T00:00:00.000Z"),
            },
        ]);

        await expect(
            createLeaveRequestsBatch(
                {
                    employeeId: "EMP001",
                    type: "annual",
                    dates: ["2026-11-13", "2026-11-14"],
                    reason: "Liburan",
                    status: "pending",
                },
                { todayWib: "2026-11-11" }
            )
        ).rejects.toBeInstanceOf(LeaveQuotaError);

        // Pastikan pengecekan overlap & jadwal pada multi-tanggal hanya memanggil 1x findFirst dan 1x resolveShiftsForRange (bebas N+1)
        expect(mocks.leaveFindFirst).toHaveBeenCalledTimes(1);
        expect(mocks.resolveShiftsForRange).toHaveBeenCalledTimes(1);
    });

    it("reuses prefetchedLeaves in getEmployeeLeaveBalance without redundant DB queries", async () => {
        mocks.resolveShiftsForRange.mockResolvedValue([
            { date: "2026-11-12", shift: null },
            { date: "2026-11-13", shift: null },
        ]);

        const balance = await getEmployeeLeaveBalance("EMP001", [
            {
                id: "lr-1",
                employeeId: "EMP001",
                type: "annual",
                startDate: "2026-11-12",
                endDate: "2026-11-12",
                reason: "Cuti 1",
                status: "pending",
                createdAt: "2026-11-11T00:00:00.000Z",
                employee: { name: "Budi", employeeId: "EMP001", totalLeave: 12, usedLeave: 3 },
            },
            {
                id: "lr-2",
                employeeId: "EMP001",
                type: "annual",
                startDate: "2026-11-13",
                endDate: "2026-11-13",
                reason: "Cuti 2",
                status: "pending",
                createdAt: "2026-11-11T00:00:00.000Z",
                employee: { name: "Budi", employeeId: "EMP001", totalLeave: 12, usedLeave: 3 },
            },
        ]);

        expect(balance).toEqual({
            totalLeave: 12,
            usedLeave: 3,
            pendingAnnualDays: 2,
            remainingLeave: 9,
            availableAnnualLeave: 7,
        });
        expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
        expect(mocks.leaveFindMany).not.toHaveBeenCalled();
        expect(mocks.resolveShiftsForRange).toHaveBeenCalledTimes(1);
    });

    it("processes updateLeaveRequestsBulk and separates succeeded and failed items", async () => {
        mocks.leaveFindUnique
            .mockResolvedValueOnce({
                id: "lr-ok",
                employeeId: "EMP001",
                type: "sick",
                startDate: new Date("2026-11-12T00:00:00.000Z"),
                endDate: new Date("2026-11-12T00:00:00.000Z"),
                reason: "Sakit",
                status: "pending",
                createdAt: new Date("2026-11-11T00:00:00.000Z"),
                employee: { employeeId: "EMP001", totalLeave: 12, usedLeave: 12 },
            })
            .mockResolvedValueOnce({
                id: "lr-quota-fail",
                employeeId: "EMP001",
                type: "annual",
                startDate: new Date("2026-11-13T00:00:00.000Z"),
                endDate: new Date("2026-11-13T00:00:00.000Z"),
                reason: "Tahunan",
                status: "pending",
                createdAt: new Date("2026-11-11T00:00:00.000Z"),
                employee: { employeeId: "EMP001", totalLeave: 12, usedLeave: 12 },
            });
        mocks.countWorkingDaysForEmployee.mockResolvedValue(1);
        mocks.leaveUpdate.mockResolvedValue({
            id: "lr-ok",
            employeeId: "EMP001",
            type: "sick",
            startDate: new Date("2026-11-12T00:00:00.000Z"),
            endDate: new Date("2026-11-12T00:00:00.000Z"),
            reason: "Sakit",
            status: "approved",
            createdAt: new Date("2026-11-11T00:00:00.000Z"),
        });

        const outcome = await updateLeaveRequestsBulk(["lr-ok", "lr-quota-fail"], "approved");
        expect(outcome.succeededIds).toEqual(["lr-ok"]);
        expect(outcome.failed).toHaveLength(1);
        expect(outcome.failed[0].id).toBe("lr-quota-fail");
    });

    it("rejects createLeaveRequestsBatch on overlapping leave or scheduled off-day", async () => {
        mocks.leaveFindFirst.mockResolvedValueOnce({
            id: "existing-1",
            startDate: new Date("2026-11-12T00:00:00.000Z"),
            endDate: new Date("2026-11-12T00:00:00.000Z"),
            status: "pending",
        });

        await expect(
            createLeaveRequestsBatch(
                {
                    employeeId: "EMP001",
                    type: "sick",
                    dates: ["2026-11-12"],
                    reason: "Sakit",
                    status: "pending",
                },
                { todayWib: "2026-11-11" }
            )
        ).rejects.toBeInstanceOf(LeaveConflictError);

        mocks.leaveFindFirst.mockResolvedValueOnce(null);
        mocks.countWorkingDaysForEmployee.mockResolvedValueOnce(0);

        await expect(
            createLeaveRequestsBatch(
                {
                    employeeId: "EMP001",
                    type: "personal",
                    dates: ["2026-11-15"],
                    reason: "Keperluan pribadi",
                    status: "pending",
                },
                { todayWib: "2026-11-11" }
            )
        ).rejects.toBeInstanceOf(LeaveValidationError);
    });

    it("rejects createLeaveRequestsBatch on national holidays (kalender global)", async () => {
        mocks.leaveFindFirst.mockResolvedValue(null);
        mocks.resolveShiftsForRange.mockResolvedValue([
            { date: "2026-08-17", shift: null },
            { date: "2026-08-18", shift: null },
        ]);

        await expect(
            createLeaveRequestsBatch(
                {
                    employeeId: "EMP001",
                    type: "annual",
                    dates: ["2026-08-17", "2026-08-18"],
                    reason: "Liburan",
                    status: "pending",
                    anchorDate: "2026-08-17",
                },
                { todayWib: "2026-08-10" }
            )
        ).rejects.toThrow(/2026-08-17.*libur nasional\/cuti bersama/);
    });

    it("allows Bali regional days (not national holidays) in createLeaveRequestsBatch", async () => {
        mocks.leaveFindFirst.mockResolvedValue(null);
        // Single date -> countWorkingDaysForEmployee path.
        mocks.countWorkingDaysForEmployee.mockResolvedValue(1);
        mocks.employeeFindUnique.mockResolvedValue({ totalLeave: 12, usedLeave: 0 });
        mocks.leaveFindMany.mockResolvedValue([]);
        mocks.leaveCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
            id: "lr-bali",
            employeeId: "EMP001",
            type: "annual",
            startDate: new Date("2026-06-17T00:00:00.000Z"),
            endDate: new Date("2026-06-17T00:00:00.000Z"),
            reason: "Galungan di kampung",
            status: "pending",
            attachment: null,
            createdAt: new Date("2026-06-10T00:00:00.000Z"),
            ...args.data,
        }));

        const created = await createLeaveRequestsBatch(
            {
                employeeId: "EMP001",
                type: "annual",
                dates: ["2026-06-17"],
                reason: "Galungan di kampung",
                status: "pending",
                anchorDate: "2026-06-17",
            },
            { todayWib: "2026-06-10" }
        );

        expect(created).toHaveLength(1);
        expect(created[0].startDate).toBe("2026-06-17");
    });
});

describe("Leave Service - deleteLeaveRequest (hard delete & annual quota restoration)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.unlink.mockResolvedValue(undefined);
    });

    it("hard deletes an approved annual leave and restores effective working days to employee.usedLeave", async () => {
        mocks.leaveFindUnique.mockResolvedValue({
            id: "lr-ann-1",
            employeeId: "ID-24050016",
            type: "annual",
            startDate: new Date("2026-12-24T00:00:00.000Z"),
            endDate: new Date("2026-12-29T00:00:00.000Z"),
            reason: "Keperluan Keluarga",
            status: "approved",
            attachment: null,
            attachmentPath: null,
            attachmentMime: null,
            attachmentSize: null,
            createdAt: new Date("2026-11-02T00:01:27.000Z"),
            employee: { employeeId: "ID-24050016", totalLeave: 6, usedLeave: 4 },
        });
        mocks.countWorkingDaysForEmployee.mockResolvedValue(4);
        mocks.leaveDeleteMany.mockResolvedValue({ count: 1 });
        mocks.employeeFindUnique.mockResolvedValue({ totalLeave: 6, usedLeave: 4 });
        mocks.employeeUpdate.mockResolvedValue({ totalLeave: 6, usedLeave: 0 });

        const result = await deleteLeaveRequest("lr-ann-1");

        expect(result).toEqual({
            deleted: expect.objectContaining({
                id: "lr-ann-1",
                employeeId: "ID-24050016",
                type: "annual",
                status: "approved",
                startDate: "2026-12-24",
                endDate: "2026-12-29",
            }),
            restoredAnnualDays: 4,
            employeeQuota: {
                employeeId: "ID-24050016",
                totalLeave: 6,
                usedLeave: 0,
                remainingLeave: 6,
            },
        });
        expect(mocks.leaveDeleteMany).toHaveBeenCalledWith({
            where: { id: "lr-ann-1", status: "approved" },
        });
        expect(mocks.employeeUpdate).toHaveBeenCalledWith({
            where: { employeeId: "ID-24050016" },
            data: { usedLeave: { decrement: 4 } },
            select: { totalLeave: true, usedLeave: true },
        });
    });

    it("clamps restored days so employee.usedLeave never becomes negative", async () => {
        mocks.leaveFindUnique.mockResolvedValue({
            id: "lr-ann-clamp",
            employeeId: "EMP001",
            type: "annual",
            startDate: new Date("2026-12-24T00:00:00.000Z"),
            endDate: new Date("2026-12-29T00:00:00.000Z"),
            reason: "Cuti",
            status: "approved",
            attachment: null,
            attachmentPath: null,
            createdAt: new Date("2026-11-02T00:00:00.000Z"),
            employee: { employeeId: "EMP001", totalLeave: 12, usedLeave: 2 },
        });
        mocks.countWorkingDaysForEmployee.mockResolvedValue(4);
        mocks.leaveDeleteMany.mockResolvedValue({ count: 1 });
        mocks.employeeFindUnique.mockResolvedValue({ totalLeave: 12, usedLeave: 2 });
        mocks.employeeUpdate.mockResolvedValue({ totalLeave: 12, usedLeave: 0 });

        const result = await deleteLeaveRequest("lr-ann-clamp");

        expect(result?.restoredAnnualDays).toBe(2);
        expect(result?.employeeQuota).toEqual({
            employeeId: "EMP001",
            totalLeave: 12,
            usedLeave: 0,
            remainingLeave: 12,
        });
        expect(mocks.employeeUpdate).toHaveBeenCalledWith({
            where: { employeeId: "EMP001" },
            data: { usedLeave: { decrement: 2 } },
            select: { totalLeave: true, usedLeave: true },
        });
    });

    it("does not touch employee.usedLeave when deleting pending annual or approved non-annual leave", async () => {
        mocks.leaveFindUnique.mockResolvedValueOnce({
            id: "lr-sick-1",
            employeeId: "EMP001",
            type: "sick",
            startDate: new Date("2026-11-12T00:00:00.000Z"),
            endDate: new Date("2026-11-12T00:00:00.000Z"),
            reason: "Demam",
            status: "approved",
            attachment: null,
            attachmentPath: null,
            createdAt: new Date("2026-11-11T00:00:00.000Z"),
            employee: { employeeId: "EMP001", totalLeave: 12, usedLeave: 3 },
        });
        mocks.leaveDeleteMany.mockResolvedValueOnce({ count: 1 });

        const sickRes = await deleteLeaveRequest("lr-sick-1");
        expect(sickRes?.restoredAnnualDays).toBe(0);
        expect(sickRes?.employeeQuota.usedLeave).toBe(3);
        expect(mocks.employeeUpdate).not.toHaveBeenCalled();
        expect(mocks.countWorkingDaysForEmployee).not.toHaveBeenCalled();
    });

    it("prevents double quota restoration when concurrent request already deleted or changed status", async () => {
        mocks.leaveFindUnique
            .mockResolvedValueOnce({
                id: "lr-race-gone",
                employeeId: "EMP001",
                type: "annual",
                startDate: new Date("2026-12-24T00:00:00.000Z"),
                endDate: new Date("2026-12-24T00:00:00.000Z"),
                reason: "Cuti",
                status: "approved",
                attachment: null,
                attachmentPath: null,
                createdAt: new Date("2026-11-02T00:00:00.000Z"),
                employee: { employeeId: "EMP001", totalLeave: 12, usedLeave: 1 },
            })
            .mockResolvedValueOnce(null);
        mocks.countWorkingDaysForEmployee.mockResolvedValueOnce(1);
        mocks.leaveDeleteMany.mockResolvedValueOnce({ count: 0 });

        const goneResult = await deleteLeaveRequest("lr-race-gone");
        expect(goneResult).toBeNull();
        expect(mocks.employeeUpdate).not.toHaveBeenCalled();

        mocks.leaveFindUnique
            .mockResolvedValueOnce({
                id: "lr-race-changed",
                employeeId: "EMP001",
                type: "annual",
                startDate: new Date("2026-12-24T00:00:00.000Z"),
                endDate: new Date("2026-12-24T00:00:00.000Z"),
                reason: "Cuti",
                status: "pending",
                attachment: null,
                attachmentPath: null,
                createdAt: new Date("2026-11-02T00:00:00.000Z"),
                employee: { employeeId: "EMP001", totalLeave: 12, usedLeave: 1 },
            })
            .mockResolvedValueOnce({ id: "lr-race-changed" });
        mocks.leaveDeleteMany.mockResolvedValueOnce({ count: 0 });

        await expect(deleteLeaveRequest("lr-race-changed")).rejects.toBeInstanceOf(LeaveConflictError);
        expect(mocks.employeeUpdate).not.toHaveBeenCalled();
    });

    it("unlinks attachment file only when no remaining leave requests reference the same file", async () => {
        const sharedFile = "123e4567-e89b-12d3-a456-426614174000.pdf";
        mocks.leaveFindUnique.mockResolvedValue({
            id: "lr-att-1",
            employeeId: "EMP001",
            type: "sick",
            startDate: new Date("2026-11-12T00:00:00.000Z"),
            endDate: new Date("2026-11-12T00:00:00.000Z"),
            reason: "Sakit",
            status: "approved",
            attachment: null,
            attachmentPath: sharedFile,
            createdAt: new Date("2026-11-11T00:00:00.000Z"),
            employee: { employeeId: "EMP001", totalLeave: 12, usedLeave: 0 },
        });
        mocks.leaveDeleteMany.mockResolvedValue({ count: 1 });

        mocks.leaveCount.mockResolvedValueOnce(1);
        await deleteLeaveRequest("lr-att-1");
        expect(mocks.unlink).not.toHaveBeenCalled();

        mocks.leaveCount.mockResolvedValueOnce(0);
        await deleteLeaveRequest("lr-att-1");
        expect(mocks.unlink).toHaveBeenCalledTimes(1);
    });
});
