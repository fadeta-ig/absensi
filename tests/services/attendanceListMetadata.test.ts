import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    attendanceFindMany: vi.fn(),
    assignmentFindMany: vi.fn(),
    employeeFindMany: vi.fn(),
    shiftFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        attendanceRecord: { findMany: mocks.attendanceFindMany },
        shiftAssignment: { findMany: mocks.assignmentFindMany },
        employee: { findMany: mocks.employeeFindMany },
        workShift: { findMany: mocks.shiftFindMany },
    },
}));

import { getAttendanceRecords } from "@/lib/services/attendanceService";

describe("attendance list shift metadata", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.attendanceFindMany.mockImplementation(async (args: { omit?: object; where?: { clockInPhoto?: object; clockOutPhoto?: object } }) => {
            if (args.omit) {
                return [{
                    id: "attendance-night-open",
                    employeeId: "EMP001",
                    date: new Date("2026-09-28T00:00:00.000Z"),
                    clockIn: new Date("2026-09-28T16:00:00.000Z"),
                    clockOut: null,
                    clockInLocation: null,
                    clockOutLocation: null,
                    status: "present",
                    notes: null,
                    isOffDay: false,
                    offDayReason: null,
                }];
            }
            return [];
        });
        mocks.assignmentFindMany.mockResolvedValue([{
            employeeId: "EMP001",
            shiftId: "shift-night",
            effectiveFrom: new Date("2026-09-28T00:00:00.000Z"),
            effectiveTo: new Date("2026-10-05T00:00:00.000Z"),
        }]);
        mocks.employeeFindMany.mockResolvedValue([{ employeeId: "EMP001", shiftId: "shift-day" }]);
        mocks.shiftFindMany.mockResolvedValue([
            {
                id: "shift-day",
                name: "Shift Pagi",
                isDefault: true,
                days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                    dayOfWeek,
                    startTime: "07:00",
                    endTime: "15:00",
                    isOff: false,
                })),
            },
            {
                id: "shift-night",
                name: "Shift Malam Rotasi",
                isDefault: false,
                days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                    dayOfWeek,
                    startTime: "23:00",
                    endTime: "07:00",
                    isOff: false,
                })),
            },
        ]);
    });

    it("marks an open normal record overnight from its dated roster schedule without per-record queries", async () => {
        const records = await getAttendanceRecords("EMP001");

        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            id: "attendance-night-open",
            date: "2026-09-28",
            clockOut: null,
            isOffDay: false,
            shiftDate: "2026-09-28",
            shiftId: "shift-night",
            shiftName: "Shift Malam Rotasi",
            shiftStartTime: "23:00",
            shiftEndTime: "07:00",
            shiftSource: "assignment",
            isOvernight: true,
        });
        expect(mocks.assignmentFindMany).toHaveBeenCalledOnce();
        expect(mocks.employeeFindMany).toHaveBeenCalledOnce();
        expect(mocks.shiftFindMany).toHaveBeenCalledOnce();
    });
});
