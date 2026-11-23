import { describe, expect, it } from "vitest";
import {
    CANONICAL_SMART_SHIFTS,
    SMART_SHIFT_FIELD_TOLERANCE,
    inferSmartShiftFromClockIn,
    mapToThreeSmartShifts,
    resolveSmartAttendanceTarget,
    resolveSmartShiftOptionsForMoment,
} from "@/lib/services/smartShiftResolver";
import { resolveAbsentEmployees } from "@/lib/services/attendanceAbsentResolver";
import type { AttendanceRecord } from "@/types";

function makeRecord(overrides: Partial<AttendanceRecord>): AttendanceRecord {
    return {
        id: "rec-1",
        employeeId: "ID-26100110",
        date: "2026-11-23",
        clockIn: "2026-11-23T06:50:00.000+07:00",
        clockOut: null,
        clockInLocation: null,
        clockOutLocation: null,
        clockInPhoto: null,
        clockOutPhoto: null,
        status: "present",
        notes: null,
        isOffDay: false,
        offDayReason: null,
        ...overrides,
    };
}

describe("Smart 3-Shift Resolver & Camera Button Locking", () => {
    const threeShifts = mapToThreeSmartShifts();

    it("enforces field tolerance constants (120 / 0 / 0 / 120) and 8h weekday / 5h Saturday schedules", () => {
        expect(SMART_SHIFT_FIELD_TOLERANCE).toEqual({
            earlyCheckIn: 120,
            lateCheckIn: 0,
            earlyCheckOut: 0,
            lateCheckOut: 120,
        });
        expect(CANONICAL_SMART_SHIFTS).toHaveLength(3);

        // Monday (dayOfWeek = 1): 8-hour shifts
        expect(threeShifts[0].days[1]).toEqual({ dayOfWeek: 1, startTime: "07:00", endTime: "15:00", isOff: false });
        expect(threeShifts[1].days[1]).toEqual({ dayOfWeek: 1, startTime: "15:00", endTime: "23:00", isOff: false });
        expect(threeShifts[2].days[1]).toEqual({ dayOfWeek: 1, startTime: "23:00", endTime: "07:00", isOff: false });

        // Saturday (dayOfWeek = 6): 5-hour shifts
        expect(threeShifts[0].days[6]).toEqual({ dayOfWeek: 6, startTime: "07:00", endTime: "12:00", isOff: false });
        expect(threeShifts[1].days[6]).toEqual({ dayOfWeek: 6, startTime: "12:00", endTime: "17:00", isOff: false });
        expect(threeShifts[2].days[6]).toEqual({ dayOfWeek: 6, startTime: "17:00", endTime: "22:00", isOff: false });

        // Sunday (dayOfWeek = 0): off day
        expect(threeShifts[0].days[0].isOff).toBe(true);
        expect(threeShifts[1].days[0].isOff).toBe(true);
        expect(threeShifts[2].days[0].isOff).toBe(true);
    });

    it("unlocks only Shift 1 on Monday morning (05:00–12:59 WIB) and locks Shift 2 & Shift 3", () => {
        // Monday 2026-11-23 06:45 WIB
        const res = resolveSmartShiftOptionsForMoment(new Date("2026-11-23T06:45:00+07:00"), threeShifts);
        expect(res.shiftDate).toBe("2026-11-23");
        expect(res.isOffDay).toBe(false);
        expect(res.activeShift?.shiftNumber).toBe(1);
        expect(res.options.map((o) => o.isAvailable)).toEqual([true, false, false]);
    });

    it("unlocks only Shift 2 on Monday afternoon (13:00–20:59 WIB) and locks Shift 1 & Shift 3", () => {
        // Monday 2026-11-23 14:50 WIB
        const res = resolveSmartShiftOptionsForMoment(new Date("2026-11-23T14:50:00+07:00"), threeShifts);
        expect(res.shiftDate).toBe("2026-11-23");
        expect(res.activeShift?.shiftNumber).toBe(2);
        expect(res.options.map((o) => o.isAvailable)).toEqual([false, true, false]);
        expect(res.options[0].lockedReason).toContain("berakhir");
        expect(res.options[2].lockedReason).toContain("21:00");
    });

    it("unlocks only Shift 3 on Monday night (21:00–23:59 WIB) and attributes 00:15 WIB Tuesday to Monday Shift 3", () => {
        // Monday 2026-11-23 22:30 WIB
        const nightRes = resolveSmartShiftOptionsForMoment(new Date("2026-11-23T22:30:00+07:00"), threeShifts);
        expect(nightRes.shiftDate).toBe("2026-11-23");
        expect(nightRes.activeShift?.shiftNumber).toBe(3);
        expect(nightRes.isOvernight).toBe(true);
        expect(nightRes.options.map((o) => o.isAvailable)).toEqual([false, false, true]);

        // Tuesday 2026-11-24 00:15 WIB (late clock-in for Monday's Shift 3)
        const afterMidnightRes = resolveSmartShiftOptionsForMoment(new Date("2026-11-24T00:15:00+07:00"), threeShifts);
        expect(afterMidnightRes.shiftDate).toBe("2026-11-23");
        expect(afterMidnightRes.activeShift?.shiftNumber).toBe(3);
        expect(afterMidnightRes.isOvernight).toBe(true);
        expect(afterMidnightRes.options.map((o) => o.isAvailable)).toEqual([false, false, true]);
    });

    it("applies Saturday 5-hour windows (Shift 1: 05:00–09:59, Shift 2: 10:00–14:59, Shift 3: 15:00–22:00)", () => {
        // Saturday 2026-11-28 11:30 WIB -> Shift 2 (12:00 - 17:00)
        const satSiang = resolveSmartShiftOptionsForMoment(new Date("2026-11-28T11:30:00+07:00"), threeShifts);
        expect(satSiang.activeShift?.shiftNumber).toBe(2);
        expect(satSiang.activeScheduleDay?.startTime).toBe("12:00");
        expect(satSiang.activeScheduleDay?.endTime).toBe("17:00");
        expect(satSiang.options.map((o) => o.isAvailable)).toEqual([false, true, false]);

        // Saturday 2026-11-28 16:45 WIB -> Shift 3 (17:00 - 22:00, not overnight)
        const satMalam = resolveSmartShiftOptionsForMoment(new Date("2026-11-28T16:45:00+07:00"), threeShifts);
        expect(satMalam.activeShift?.shiftNumber).toBe(3);
        expect(satMalam.activeScheduleDay?.startTime).toBe("17:00");
        expect(satMalam.activeScheduleDay?.endTime).toBe("22:00");
        expect(satMalam.isOvernight).toBe(false);
        expect(satMalam.options.map((o) => o.isAvailable)).toEqual([false, false, true]);
    });

    it("prioritizes CLOCK_OUT for an open H-1 Shift 3 overnight record during morning hours (07:05 WIB)", () => {
        const yesterdayRecord = makeRecord({
            date: "2026-11-23",
            clockIn: "2026-11-23T22:55:00.000+07:00",
            clockOut: null,
        });
        // Tuesday 2026-11-24 07:05 WIB
        const resolved = resolveSmartAttendanceTarget(
            new Date("2026-11-24T07:05:00+07:00"),
            threeShifts,
            { yesterday: yesterdayRecord }
        );
        expect(resolved.target.mode).toBe("CLOCK_OUT");
        expect(resolved.target.shiftDate).toBe("2026-11-23");
        expect(resolved.activeShift?.shiftNumber).toBe(3);
        expect(resolved.target.isOvernight).toBe(true);
    });

    it("infers Shift 1, 2, or 3 and evaluates zero-minute late tolerance accurately from clockIn", () => {
        // Shift 2 on-time at 14:48 WIB (startTime 15:00) -> present
        const s2Present = inferSmartShiftFromClockIn("2026-11-23", "2026-11-23T14:48:00+07:00", threeShifts);
        expect(s2Present?.shift.shiftNumber).toBe(2);
        expect(s2Present?.computedStatus).toBe("present");

        // Shift 2 late by 1 minute at 15:01 WIB (lateCheckIn: 0) -> late
        const s2Late = inferSmartShiftFromClockIn("2026-11-23", "2026-11-23T15:01:00+07:00", threeShifts);
        expect(s2Late?.shift.shiftNumber).toBe(2);
        expect(s2Late?.computedStatus).toBe("late");

        // Shift 3 after midnight H+1 at 00:05 WIB -> Shift 3, late
        const s3Late = inferSmartShiftFromClockIn("2026-11-23", "2026-11-24T00:05:00+07:00", threeShifts);
        expect(s3Late?.shift.shiftNumber).toBe(3);
        expect(s3Late?.isOvernight).toBe(true);
        expect(s3Late?.computedStatus).toBe("late");
    });

    it("does not mark Smart 3-Shift employees as Belum Hadir (Alpa) on today's date until Shift 3 start time arrives", () => {
        const employees = [
            {
                id: "1",
                employeeId: "ID-26100110",
                name: "Bagus Dwi Danarko",
                department: "IT",
                division: "Tech",
                position: "Network Engineer",
                isActive: true,
                shiftId: "op-shift",
            },
            {
                id: "2",
                employeeId: "EMP-REG",
                name: "Regular Employee",
                department: "IT",
                division: "Tech",
                position: "Staff",
                isActive: true,
                shiftId: "op-shift",
            },
        ];
        const shifts = [
            {
                id: "op-shift",
                name: "Operational",
                isDefault: true,
                earlyCheckIn: 0,
                days: Array.from({ length: 7 }, (_, i) => ({
                    dayOfWeek: i,
                    startTime: "08:00",
                    endTime: "16:00",
                    isOff: i === 0,
                })),
            },
        ];

        // At 10:00 WIB on Monday 2026-11-23:
        // Regular employee is marked "Belum Hadir", but Smart 3-Shift employee is NOT marked absent yet (could be Shift 2 or Shift 3)
        const morningAbsent = resolveAbsentEmployees({
            targetDate: "2026-11-23",
            employees,
            records: [],
            leaves: [],
            shifts,
            now: new Date("2026-11-23T10:00:00+07:00"),
            smartShiftEmployeeIds: ["ID-26100110"],
        });
        expect(morningAbsent.map((e) => e.employeeId)).toEqual(["EMP-REG"]);

        // At 23:05 WIB on Monday 2026-11-23 (after Shift 3 starts):
        // Both are marked "Belum Hadir" if still no clock-in
        const nightAbsent = resolveAbsentEmployees({
            targetDate: "2026-11-23",
            employees,
            records: [],
            leaves: [],
            shifts,
            now: new Date("2026-11-23T23:05:00+07:00"),
            smartShiftEmployeeIds: ["ID-26100110"],
        });
        expect(nightAbsent.map((e) => e.employeeId)).toEqual(["ID-26100110", "EMP-REG"]);
    });

    it("dynamically follows custom schedule and tolerance edits made in Pengaturan Jam Kerja (WorkShift DB)", () => {
        // Suppose HR edits Shift 1 in Pengaturan Jam Kerja to start at 06:00 - 14:00 with earlyCheckIn = 60, lateCheckIn = 10
        // and edits Shift 2 to 14:00 - 22:00 with earlyCheckIn = 60, lateCheckIn = 0
        const customDbShifts = [
            {
                id: "db-shift-1",
                name: "Shift 1 — Pagi Custom",
                earlyCheckIn: 60,
                lateCheckIn: 10,
                earlyCheckOut: 0,
                lateCheckOut: 120,
                days: Array.from({ length: 7 }, (_, i) => ({
                    dayOfWeek: i,
                    startTime: "06:00",
                    endTime: "14:00",
                    isOff: i === 0,
                })),
            },
            {
                id: "db-shift-2",
                name: "Shift 2 — Siang Custom",
                earlyCheckIn: 60,
                lateCheckIn: 0,
                earlyCheckOut: 0,
                lateCheckOut: 120,
                days: Array.from({ length: 7 }, (_, i) => ({
                    dayOfWeek: i,
                    startTime: "14:00",
                    endTime: "22:00",
                    isOff: i === 0,
                })),
            },
        ];

        const dynamicThree = mapToThreeSmartShifts(customDbShifts);
        expect(dynamicThree[0].days[1].startTime).toBe("06:00");
        expect(dynamicThree[0].tolerance.lateCheckIn).toBe(10);
        expect(dynamicThree[1].days[1].startTime).toBe("14:00");

        // At 13:15 WIB on Monday: since Shift 2 starts at 14:00 with earlyCheckIn = 60 (opens at 13:00),
        // Shift 2 is now active at 13:15 WIB!
        const moment1315 = resolveSmartShiftOptionsForMoment(
            new Date("2026-11-23T13:15:00+07:00"),
            dynamicThree
        );
        expect(moment1315.activeShift?.shiftNumber).toBe(2);
        expect(moment1315.options[1].startTime).toBe("14:00");
        expect(moment1315.options[1].isAvailable).toBe(true);

        // Clock-in at 06:08 WIB on Shift 1 (with custom lateCheckIn = 10 min) -> present!
        const inferred0608 = inferSmartShiftFromClockIn(
            "2026-11-23",
            "2026-11-23T06:08:00+07:00",
            dynamicThree
        );
        expect(inferred0608?.shift.shiftNumber).toBe(1);
        expect(inferred0608?.computedStatus).toBe("present");
    });
});
