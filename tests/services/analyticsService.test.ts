import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    employeeFindUnique: vi.fn(),
    attendanceFindMany: vi.fn(),
    attendanceGroupBy: vi.fn(),
    visitFindMany: vi.fn(),
    visitCount: vi.fn(),
    leaveFindMany: vi.fn(),
    payslipFindMany: vi.fn(),
    assetFindMany: vi.fn(),
    resolveShiftForDate: vi.fn(),
    countWorkingDaysForEmployee: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        employee: { findUnique: mocks.employeeFindUnique },
        attendanceRecord: {
            findMany: mocks.attendanceFindMany,
            groupBy: mocks.attendanceGroupBy,
        },
        visitReport: {
            findMany: mocks.visitFindMany,
            count: mocks.visitCount,
        },
        leaveRequest: { findMany: mocks.leaveFindMany },
        payslipRecord: { findMany: mocks.payslipFindMany },
        asset: { findMany: mocks.assetFindMany },
    },
}));

vi.mock("@/lib/services/shiftAssignmentService", () => ({
    resolveShiftForDate: mocks.resolveShiftForDate,
    countWorkingDaysForEmployee: mocks.countWorkingDaysForEmployee,
}));

vi.mock("@/lib/logger", () => ({
    default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { prisma } from "@/lib/prisma";
import { getEmployee360Data } from "@/lib/services/analyticsService";

describe("analyticsService employee 360 leave totals", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.employeeFindUnique.mockResolvedValue({
            id: "employee-row-1",
            employeeId: "EMP001",
            name: "Budi",
            gender: "male",
            employmentType: "PERMANENT",
            joinDate: new Date("2020-01-01T00:00:00.000Z"),
            employmentStartDate: null,
            employmentEndDate: null,
            probationEndDate: null,
            statusChangedAt: null,
            faceDescriptor: null,
            manager: null,
            locations: [],
            payrollComponents: [],
            departmentRel: null,
            divisionRel: null,
            positionRel: null,
            shiftId: "shift-current",
            totalLeave: 12,
        });
        mocks.attendanceFindMany.mockResolvedValue([]);
        mocks.attendanceGroupBy.mockResolvedValue([]);
        mocks.visitFindMany.mockResolvedValue([]);
        mocks.visitCount.mockResolvedValue(0);
        mocks.payslipFindMany.mockResolvedValue([]);
        mocks.assetFindMany.mockResolvedValue([]);
        mocks.leaveFindMany.mockImplementation(async (args: { where?: { status?: string } }) => (
            args.where?.status === "approved"
                ? [
                    { startDate: new Date("2026-10-05T00:00:00.000Z"), endDate: new Date("2026-10-06T00:00:00.000Z") },
                    { startDate: new Date("2026-10-12T00:00:00.000Z"), endDate: new Date("2026-10-12T00:00:00.000Z") },
                ]
                : []
        ));
        mocks.resolveShiftForDate.mockResolvedValue({
            shiftId: "shift-current",
            shiftName: "Shift Hari Ini",
            days: [],
            tolerance: { earlyCheckIn: 0, lateCheckIn: 0, earlyCheckOut: 0, lateCheckOut: 0 },
            source: "assignment",
        });
        // The first leave spans two working days; the second falls on an off-day
        // after a roster rotation and therefore contributes zero.
        mocks.countWorkingDaysForEmployee
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(0);
    });

    it("counts each approved leave against the roster effective on its own dates", async () => {
        const result = await getEmployee360Data("employee-row-1");

        expect(mocks.countWorkingDaysForEmployee).toHaveBeenNthCalledWith(
            1,
            prisma,
            "EMP001",
            "2026-10-05",
            "2026-10-06",
        );
        expect(mocks.countWorkingDaysForEmployee).toHaveBeenNthCalledWith(
            2,
            prisma,
            "EMP001",
            "2026-10-12",
            "2026-10-12",
        );
        expect(result?.stats.leaveUsed).toBe(2);
        expect(result?.stats.leaveRemaining).toBe(10);
        expect(result?.effectiveShift.name).toBe("Shift Hari Ini");
    });
});
