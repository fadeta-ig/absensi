import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    isOvernightSchedule,
    getNormalizedShiftWindows,
    formatMinutes,
    resolveAttendanceTargetForEmployee,
    ScheduleDay,
    ShiftTolerance,
} from "@/lib/services/attendanceShiftHelper";
import * as attendanceService from "@/lib/services/attendanceService";

describe("24-Hour 3-Shift Logic & Overnight Calculations", () => {
    describe("isOvernightSchedule", () => {
        it("should return false for normal daytime shifts", () => {
            expect(isOvernightSchedule("07:00", "15:00")).toBe(false); // Shift 1 (Pagi)
            expect(isOvernightSchedule("15:00", "23:00")).toBe(false); // Shift 2 (Siang)
            expect(isOvernightSchedule("08:00", "17:00")).toBe(false); // Normal Office
        });

        it("should return true for shifts spanning across midnight (Cross-Day)", () => {
            expect(isOvernightSchedule("23:00", "07:00")).toBe(true); // Shift 3 (Malam)
            expect(isOvernightSchedule("22:00", "06:00")).toBe(true); // Alternative Night Shift
            expect(isOvernightSchedule("20:00", "04:00")).toBe(true);
        });
    });

    describe("getNormalizedShiftWindows", () => {
        it("should calculate correct minute windows for Shift 1: Pagi (07:00 – 15:00)", () => {
            const schedule: ScheduleDay = {
                dayOfWeek: 1,
                startTime: "07:00",
                endTime: "15:00",
                isOff: false,
            };
            const tolerance: ShiftTolerance = {
                earlyCheckIn: 30,
                lateCheckIn: 15,
                earlyCheckOut: 0,
                lateCheckOut: 60,
            };

            const windows = getNormalizedShiftWindows(schedule, tolerance);

            expect(windows.isOvernight).toBe(false);
            expect(windows.startMinutes).toBe(7 * 60); // 420
            expect(windows.endMinutes).toBe(15 * 60); // 900
            expect(windows.earliestInMinutes).toBe(420 - 30); // 390 (06:30)
            expect(windows.lateDeadlineMinutes).toBe(420 + 15); // 435 (07:15)
            expect(windows.earliestOutMinutes).toBe(900 - 0); // 900 (15:00)
            expect(windows.latestOutMinutes).toBe(900 + 60); // 960 (16:00)
        });

        it("should apply +1440 minute offset for Shift 3: Malam (23:00 – 07:00)", () => {
            const schedule: ScheduleDay = {
                dayOfWeek: 1,
                startTime: "23:00",
                endTime: "07:00",
                isOff: false,
            };
            const tolerance: ShiftTolerance = {
                earlyCheckIn: 30,
                lateCheckIn: 15,
                earlyCheckOut: 0,
                lateCheckOut: 60,
            };

            const windows = getNormalizedShiftWindows(schedule, tolerance);

            expect(windows.isOvernight).toBe(true);
            expect(windows.startMinutes).toBe(23 * 60); // 1380
            expect(windows.endMinutes).toBe((7 + 24) * 60); // 1860 (07:00 H+1)
            expect(windows.earliestInMinutes).toBe(1380 - 30); // 1350 (22:30)
            expect(windows.lateDeadlineMinutes).toBe(1380 + 15); // 1395 (23:15)
            expect(windows.earliestOutMinutes).toBe(1860 - 0); // 1860 (07:00 H+1)
            expect(windows.latestOutMinutes).toBe(1860 + 60); // 1920 (08:00 H+1)
        });
    });

    describe("formatMinutes", () => {
        it("should format standard minutes correctly", () => {
            expect(formatMinutes(420)).toBe("07:00");
            expect(formatMinutes(900)).toBe("15:00");
            expect(formatMinutes(1380)).toBe("23:00");
        });

        it("should wrap minutes greater than 24 hours (1440) gracefully", () => {
            expect(formatMinutes(1860)).toBe("07:00"); // 1860 % 1440 = 420
            expect(formatMinutes(1920)).toBe("08:00"); // 1920 % 1440 = 480
        });
    });

    describe("resolveAttendanceTargetForEmployee", () => {
        beforeEach(() => {
            vi.restoreAllMocks();
        });

        const nightShiftDays: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => ({
            dayOfWeek: i,
            startTime: "23:00",
            endTime: "07:00",
            isOff: i === 0, // Sunday off
        }));

        it("should resolve as CLOCK_OUT for yesterday's overnight shift when clocking out in morning", async () => {
            // Mock open record from yesterday
            const mockYesterdayRecord = {
                id: "rec-yesterday-1",
                employeeId: "EMP001",
                date: "2026-09-17",
                clockIn: "2026-09-17T16:00:00.000Z", // 23:00 WIB
                clockOut: null,
                status: "present" as const,
                notes: null,
                isOffDay: false,
            };

            vi.spyOn(attendanceService, "getAttendanceByDate").mockImplementation(async (empId, date) => {
                if (date === "2026-09-17") return mockYesterdayRecord as any;
                return undefined;
            });

            // Now: 2026-09-18 at 07:05 WIB (00:05 UTC)
            const now = new Date("2026-09-18T00:05:00.000Z");

            const result = await resolveAttendanceTargetForEmployee("EMP001", now, nightShiftDays);

            expect(result.mode).toBe("CLOCK_OUT");
            expect(result.shiftDate).toBe("2026-09-17"); // Tied to yesterday!
            expect(result.isOvernight).toBe(true);
            if (result.mode === "CLOCK_OUT") {
                expect(result.existingRecord.id).toBe("rec-yesterday-1");
                // Relative minutes on day H+1 at 07:05: (7 + 24) * 60 + 5 = 1865
                expect(result.relativeClockMinutes).toBe(1865);
            }
        });

        it("should resolve as CLOCK_IN when starting shift 3 at night", async () => {
            vi.spyOn(attendanceService, "getAttendanceByDate").mockResolvedValue(undefined);

            // Now: 2026-09-18 at 22:50 WIB (15:50 UTC)
            const now = new Date("2026-09-18T15:50:00.000Z");

            const result = await resolveAttendanceTargetForEmployee("EMP001", now, nightShiftDays);

            expect(result.mode).toBe("CLOCK_IN");
            expect(result.shiftDate).toBe("2026-09-18");
            expect(result.isOvernight).toBe(true);
            // 22 * 60 + 50 = 1370
            expect(result.relativeClockMinutes).toBe(1370);
        });

        it("should resolve as ALREADY_COMPLETED if today already has both clock-in and clock-out", async () => {
            const mockTodayRecord = {
                id: "rec-today-1",
                employeeId: "EMP001",
                date: "2026-09-18",
                clockIn: "2026-09-18T00:00:00.000Z",
                clockOut: "2026-09-18T08:00:00.000Z",
                status: "present" as const,
                notes: null,
                isOffDay: false,
            };

            vi.spyOn(attendanceService, "getAttendanceByDate").mockImplementation(async (empId, date) => {
                if (date === "2026-09-18") return mockTodayRecord as any;
                return undefined;
            });

            const now = new Date("2026-09-18T10:00:00.000Z");
            const result = await resolveAttendanceTargetForEmployee("EMP001", now, nightShiftDays);

            expect(result.mode).toBe("ALREADY_COMPLETED");
            expect(result.shiftDate).toBe("2026-09-18");
        });
    });
});
