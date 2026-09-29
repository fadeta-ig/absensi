import {
    addCalendarDays,
    getWIBDayOfWeek,
    getWIBHoursMinutes,
    toUTCDateKey,
    toWIBDateString,
} from "@/lib/timezone";
import { AttendanceRecord } from "@/types";

export interface ScheduleDay {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isOff: boolean;
}

export interface ShiftTolerance {
    earlyCheckIn?: number | null;
    lateCheckIn?: number | null;
    earlyCheckOut?: number | null;
    lateCheckOut?: number | null;
}

export interface NormalizedShiftWindows {
    startMinutes: number;
    endMinutes: number;
    isOvernight: boolean;
    earliestInMinutes: number;
    lateDeadlineMinutes: number;
    earliestOutMinutes: number;
    latestOutMinutes: number;
}

export interface AttendanceActionTargetBase {
    shiftDate: string;
    scheduleDay: ScheduleDay | null;
    isOvernight: boolean;
    relativeClockMinutes: number;
}

export type AttendanceActionTarget =
    | ({
          mode: "CLOCK_OUT";
          existingRecord: AttendanceRecord;
      } & AttendanceActionTargetBase)
    | ({
          mode: "ALREADY_COMPLETED";
          existingRecord: AttendanceRecord;
      } & AttendanceActionTargetBase)
    | ({
          mode: "CLOCK_IN";
          existingRecord: null;
      } & AttendanceActionTargetBase);

export interface AttendanceTargetRecords {
    yesterday?: AttendanceRecord;
    today?: AttendanceRecord;
}

export interface ShiftWindowSource {
    days: ScheduleDay[];
    tolerance?: ShiftTolerance;
}


/** Format total minutes (supports offset > 1440) → "HH:mm" */
export function formatMinutes(totalMinutes: number): string {
    const normalized = totalMinutes % (24 * 60);
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Check if shift spans across midnight (e.g. 23:00 - 07:00) */
export function isOvernightSchedule(startTime: string, endTime: string): boolean {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    return eh * 60 + em < sh * 60 + sm;
}

/**
 * Calculates normalized minutes for shift start, end, and tolerance windows.
 * For overnight shifts, end time and exit tolerances receive +1440 minute offset.
 */
export function getNormalizedShiftWindows(
    schedule: ScheduleDay,
    tolerance?: ShiftTolerance
): NormalizedShiftWindows {
    const [sh, sm] = schedule.startTime.split(":").map(Number);
    const [eh, em] = schedule.endTime.split(":").map(Number);

    const startMinutes = sh * 60 + sm;
    let endMinutes = eh * 60 + em;
    const isOvernight = endMinutes < startMinutes;

    if (isOvernight) {
        endMinutes += 24 * 60; // Offset by 24 hours
    }

    const earlyIn = tolerance?.earlyCheckIn ?? 0;
    const lateIn = tolerance?.lateCheckIn ?? 0;
    const earlyOut = tolerance?.earlyCheckOut ?? 0;
    const lateOut = tolerance?.lateCheckOut ?? 0;

    return {
        startMinutes,
        endMinutes,
        isOvernight,
        earliestInMinutes: startMinutes - earlyIn,
        lateDeadlineMinutes: startMinutes + lateIn,
        earliestOutMinutes: endMinutes - earlyOut,
        latestOutMinutes: lateOut > 0 ? endMinutes + lateOut : Infinity,
    };
}

/**
 * Resolves whether the current request is a Clock-Out for an ongoing overnight shift
 * (started yesterday), a Clock-Out for today, or a new Clock-In.
 */
export function resolveAttendanceTargetFromRecords(
    now: Date = new Date(),
    shiftDays: ScheduleDay[] = [],
    tolerance?: ShiftTolerance,
    records: AttendanceTargetRecords = {},
    yesterdayShift?: ShiftWindowSource,
): AttendanceActionTarget {
    const todayStr = toWIBDateString(now);
    const yesterdayStr = addCalendarDays(todayStr, -1);

    const { hours: nowH, minutes: nowM } = getWIBHoursMinutes(now);
    const currentClockMinutes = nowH * 60 + nowM;
    const todayDay = getWIBDayOfWeek(now);
    const todaySchedule = shiftDays.find((d) => d.dayOfWeek === todayDay) ?? null;
    const isTodayOvernight = Boolean(
        todaySchedule &&
        !todaySchedule.isOff &&
        isOvernightSchedule(todaySchedule.startTime, todaySchedule.endTime)
    );
    const hasTodayClockInWindowStarted = Boolean(
        todaySchedule &&
        !todaySchedule.isOff &&
        currentClockMinutes >= getNormalizedShiftWindows(todaySchedule, tolerance).earliestInMinutes
    );

    const todayRecord = records.today;
    if (todayRecord) {
        if (todayRecord.clockOut) {
            return {
                mode: "ALREADY_COMPLETED",
                existingRecord: todayRecord,
                shiftDate: todayStr,
                scheduleDay: todaySchedule,
                isOvernight: isTodayOvernight,
                relativeClockMinutes: currentClockMinutes,
            };
        }

        return {
            mode: "CLOCK_OUT",
            existingRecord: todayRecord,
            shiftDate: todayStr,
            scheduleDay: todaySchedule,
            isOvernight: isTodayOvernight,
            relativeClockMinutes: currentClockMinutes,
        };
    }

    // Only H-1 is eligible. Historical open records must remain untouched.
    // Yesterday's schedule comes from yesterday's shift (rotation-aware).
    const yesterdayDays = yesterdayShift?.days ?? shiftDays;
    const yesterdayRecord = records.yesterday;
    const yesterdayDay = toUTCDateKey(yesterdayStr).getUTCDay();
    const yesterdaySchedule = yesterdayDays.find((d) => d.dayOfWeek === yesterdayDay) ?? null;
    if (yesterdayRecord && !yesterdayRecord.clockOut) {
        const isYesterdayOvernight =
            yesterdaySchedule && !yesterdaySchedule.isOff
                ? isOvernightSchedule(yesterdaySchedule.startTime, yesterdaySchedule.endTime)
                : isEveningWIBClockIn(yesterdayRecord.clockIn);

        if (isYesterdayOvernight && !hasTodayClockInWindowStarted) {
            return {
                mode: "CLOCK_OUT",
                existingRecord: yesterdayRecord,
                shiftDate: yesterdayStr,
                scheduleDay: yesterdaySchedule,
                isOvernight: true,
                relativeClockMinutes: (nowH + 24) * 60 + nowM, // +24h offset for day H+1
            };
        }
    }

    // A clock-in shortly after midnight still belongs to yesterday's overnight shift.
    if (yesterdaySchedule && !yesterdaySchedule.isOff && isOvernightSchedule(yesterdaySchedule.startTime, yesterdaySchedule.endTime)) {
        const windows = getNormalizedShiftWindows(yesterdaySchedule, tolerance);
        const relativeMinutes = (nowH + 24) * 60 + nowM;
        if (relativeMinutes <= windows.endMinutes) {
            return {
                mode: "CLOCK_IN",
                existingRecord: null,
                shiftDate: yesterdayStr,
                scheduleDay: yesterdaySchedule,
                isOvernight: true,
                relativeClockMinutes: relativeMinutes,
            };
        }
    }

    return {
        mode: "CLOCK_IN",
        existingRecord: null,
        shiftDate: todayStr,
        scheduleDay: todaySchedule,
        isOvernight: isTodayOvernight,
        relativeClockMinutes: currentClockMinutes,
    };
}

export async function resolveAttendanceTargetForEmployee(
    employeeId: string,
    now: Date = new Date(),
    shiftDays: ScheduleDay[] = [],
    tolerance?: ShiftTolerance,
    yesterdayShift?: ShiftWindowSource,
): Promise<AttendanceActionTarget> {
    const { getAttendanceByDate } = await import("./attendanceService");
    const todayStr = toWIBDateString(now);
    const yesterdayStr = addCalendarDays(todayStr, -1);
    const [yesterday, today] = await Promise.all([
        getAttendanceByDate(employeeId, yesterdayStr),
        getAttendanceByDate(employeeId, todayStr),
    ]);

    return resolveAttendanceTargetFromRecords(now, shiftDays, tolerance, { yesterday, today }, yesterdayShift);
}

function isEveningWIBClockIn(clockIn: AttendanceRecord["clockIn"]): boolean {
    if (!clockIn) return false;

    const clockInDate = new Date(clockIn);
    if (Number.isNaN(clockInDate.getTime())) return false;

    return getWIBHoursMinutes(clockInDate).hours >= 18;
}
