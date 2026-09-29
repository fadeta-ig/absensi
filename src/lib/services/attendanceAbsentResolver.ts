import { addCalendarDays, getWIBDayOfWeek, getWIBHoursMinutes, isValidCalendarDate, toUTCDateKey, toWIBDateString } from "@/lib/timezone";
import type {
    AbsentEmployee,
    AbsentStatusType,
    Employee,
    AttendanceRecord,
    LeaveRecordLite,
    WorkShiftInfo,
} from "@/app/dashboard/attendance/types";

export interface HolidayItem {
    date: string;
    name: string;
}

type AbsentAttendanceRecord = Pick<AttendanceRecord, "employeeId" | "date"> & {
    clockIn?: string | null;
    clockOut?: string | null;
};

export interface ResolveAbsentParams {
    targetDate: string;
    employees: Employee[];
    records: AbsentAttendanceRecord[];
    leaves: LeaveRecordLite[];
    shifts?: WorkShiftInfo[];
    holidays?: HolidayItem[];
    /** Optional request-time instant. Defaults to the current instant for existing callers. */
    now?: Date;
    /** Effective shiftId per employee for targetDate (roster). Falls back to employee.shiftId. */
    targetDateShiftOverrides?: Record<string, string | null>;
    /** Effective shiftId per employee for H-1. Used only to evaluate an open overnight shift. */
    previousDateShiftOverrides?: Record<string, string | null>;
}

function effectiveShift(
    employee: Employee,
    shifts: WorkShiftInfo[],
    shiftOverrides?: Record<string, string | null>,
): WorkShiftInfo | null {
    const hasOverride = shiftOverrides
        ? Object.prototype.hasOwnProperty.call(shiftOverrides, employee.employeeId)
        : false;
    const overrideId = hasOverride ? shiftOverrides?.[employee.employeeId] : employee.shiftId;
    return (overrideId ? shifts.find((shift) => shift.id === overrideId) : null) ??
        shifts.find((shift) => shift.isDefault) ??
        null;
}

const LEAVE_TYPE_MAP: Record<string, string> = {
    annual: "Cuti Tahunan",
    sick: "Izin Sakit",
    personal: "Izin Pribadi",
    maternity: "Cuti Melahirkan",
};

function normalizeWibDate(value: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : toWIBDateString(parsed);
}

function leaveForDate(employeeId: string, targetDate: string, leaves: LeaveRecordLite[], wantedStatus: string): LeaveRecordLite | undefined {
    return leaves.find((leave) => {
        if (leave.employeeId !== employeeId || leave.status.toLowerCase() !== wantedStatus) return false;
        const startDate = normalizeWibDate(leave.startDate);
        const endDate = normalizeWibDate(leave.endDate);
        return targetDate >= startDate && targetDate <= endDate;
    });
}

function approvedLeaveForDate(employeeId: string, targetDate: string, leaves: LeaveRecordLite[]): LeaveRecordLite | undefined {
    return leaveForDate(employeeId, targetDate, leaves, "approved");
}

function pendingLeaveForDate(employeeId: string, targetDate: string, leaves: LeaveRecordLite[]): LeaveRecordLite | undefined {
    return leaveForDate(employeeId, targetDate, leaves, "pending");
}

function hasActiveOvernightShift(
    employee: Employee,
    targetDate: string,
    records: ResolveAbsentParams["records"],
    shifts: WorkShiftInfo[],
    now: Date,
    previousDateShiftOverrides?: Record<string, string | null>,
): boolean {
    if (normalizeWibDate(toWIBDateString(now)) !== targetDate) return false;

    const previousDate = addCalendarDays(targetDate, -1);
    const previousRecord = records.find((record) =>
        record.employeeId === employee.employeeId &&
        normalizeWibDate(record.date) === previousDate &&
        Boolean(record.clockIn) &&
        !record.clockOut
    );
    if (!previousRecord) return false;

    const employeeShift = effectiveShift(employee, shifts, previousDateShiftOverrides);
    const previousDayOfWeek = getWIBDayOfWeek(toUTCDateKey(previousDate));
    const scheduleDay = employeeShift?.days.find((day) => day.dayOfWeek === previousDayOfWeek);
    if (!scheduleDay || scheduleDay.isOff) return false;

    const [startHour, startMinute] = scheduleDay.startTime.split(":").map(Number);
    const [endHour, endMinute] = scheduleDay.endTime.split(":").map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    if (endMinutes >= startMinutes) return false;

    const { hours, minutes } = getWIBHoursMinutes(now);
    const currentRelativeMinutes = (hours + 24) * 60 + minutes;
    return currentRelativeMinutes <= endMinutes + 24 * 60;
}

function hasShiftStartedForCurrentDate(
    employee: Employee,
    targetDate: string,
    shifts: WorkShiftInfo[],
    now: Date,
    shiftOverrides?: Record<string, string | null>,
): boolean {
    if (toWIBDateString(now) !== targetDate) return true;
    const employeeShift = effectiveShift(employee, shifts, shiftOverrides);
    const schedule = employeeShift?.days.find((day) => day.dayOfWeek === getWIBDayOfWeek(toUTCDateKey(targetDate)));
    if (!schedule || schedule.isOff) return true;
    const [startHour, startMinute] = schedule.startTime.split(":").map(Number);
    const { hours, minutes } = getWIBHoursMinutes(now);
    const earliestStart = startHour * 60 + startMinute - (employeeShift?.earlyCheckIn ?? 0);
    return hours * 60 + minutes >= earliestStart;
}

/**
 * Resolves absent employee list with precise categorization:
 * 1. on_leave: Has approved leave for targetDate.
 * 2. pending_leave: Has a pending (not yet approved) leave request for targetDate.
 *    These employees HAVE news, so they are never nagged as alpa.
 * 3. off_day: Day off per employee's assigned or default shift schedule, or official national holiday.
 * 4. unpresent: Scheduled to work but has not clocked in (True Alpa/Belum Hadir).
 */
export function resolveAbsentEmployees({
    targetDate,
    employees,
    records,
    leaves,
    shifts = [],
    holidays = [],
    now = new Date(),
    targetDateShiftOverrides,
    previousDateShiftOverrides,
}: ResolveAbsentParams): AbsentEmployee[] {
    const authoritativeTargetDate = normalizeWibDate(targetDate);
    if (!isValidCalendarDate(authoritativeTargetDate)) return [];
    const recordsOnDate = records.filter((r) => normalizeWibDate(r.date) === authoritativeTargetDate);
    const attendedIds = new Set(recordsOnDate.map((r) => r.employeeId));
    const activeEmployees = employees.filter((e) => e.isActive !== false);

    // Resolve Day of Week in WIB (0=Sun .. 6=Sat) safely
    const targetDayOfWeek = getWIBDayOfWeek(toUTCDateKey(authoritativeTargetDate));

    // Check national holiday
    const holidayMatch = holidays.find((h) => normalizeWibDate(h.date) === authoritativeTargetDate);

    return activeEmployees
        .filter((e) => {
            if (attendedIds.has(e.employeeId)) return false;
            // Approved leave remains authoritative even when an overnight record
            // from H-1 is still open.
            if (approvedLeaveForDate(e.employeeId, authoritativeTargetDate, leaves)) return true;
            if (pendingLeaveForDate(e.employeeId, authoritativeTargetDate, leaves)) return true;
            if (holidayMatch) return true;
            if (hasActiveOvernightShift(e, authoritativeTargetDate, records, shifts, now, previousDateShiftOverrides)) return false;
            return hasShiftStartedForCurrentDate(e, authoritativeTargetDate, shifts, now, targetDateShiftOverrides);
        })
        .map((emp) => {
            // 1. Check approved leave
            const activeLeave = approvedLeaveForDate(emp.employeeId, authoritativeTargetDate, leaves);
            // 2. Check pending leave (has news, waiting HR approval)
            const pendingLeave = !activeLeave
                ? pendingLeaveForDate(emp.employeeId, authoritativeTargetDate, leaves)
                : undefined;

            let statusType: AbsentStatusType = "unpresent";
            let statusLabel = "Belum Hadir";
            let notes: string | null = null;

            if (activeLeave) {
                statusType = "on_leave";
                statusLabel = LEAVE_TYPE_MAP[activeLeave.type] || `Cuti (${activeLeave.type})`;
                notes = activeLeave.reason || null;
            } else if (pendingLeave) {
                statusType = "pending_leave";
                statusLabel = "Menunggu Persetujuan";
                const leaveLabel = LEAVE_TYPE_MAP[pendingLeave.type] || `Cuti (${pendingLeave.type})`;
                notes = `Pengajuan ${leaveLabel} menunggu persetujuan HR${pendingLeave.reason ? `: ${pendingLeave.reason}` : ""}`;
            } else {
                // 2. Resolve shift (roster override, assigned, or default fallback)
                const empShift = effectiveShift(emp, shifts, targetDateShiftOverrides);

                const scheduleDay = empShift?.days.find((sd) => sd.dayOfWeek === targetDayOfWeek) ?? null;
                const isShiftOff = scheduleDay ? scheduleDay.isOff : targetDayOfWeek === 0;

                if (holidayMatch) {
                    statusType = "off_day";
                    statusLabel = `Libur Nasional (${holidayMatch.name})`;
                    notes = `Hari Libur Nasional: ${holidayMatch.name}`;
                } else if (isShiftOff) {
                    statusType = "off_day";
                    statusLabel = "Libur Shift";
                    notes = scheduleDay
                        ? `Jadwal Libur Shift: ${empShift?.name || "Reguler"}`
                        : "Hari Libur Rutin Mingguan";
                } else {
                    statusType = "unpresent";
                    statusLabel = "Belum Hadir";
                    notes = scheduleDay ? `Shift: ${scheduleDay.startTime} - ${scheduleDay.endTime}` : null;
                }
            }

            return {
                employeeId: emp.employeeId,
                name: emp.name,
                department: emp.department || "-",
                division: emp.division || "-",
                position: emp.position || "-",
                phone: emp.phone || null,
                email: emp.email || null,
                statusType,
                statusLabel,
                notes,
            };
        });
}
