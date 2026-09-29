export interface Employee {
    id: string;
    employeeId: string;
    name: string;
    department: string;
    division?: string | null;
    position?: string | null;
    phone?: string | null;
    email?: string | null;
    isActive?: boolean;
    shiftId?: string | null;
}

export interface AttendanceLocationInfo {
    lat: number;
    lng: number;
    accuracy?: number;
    clientIp?: string;
    isOfficeWifi?: boolean;
    networkName?: string;
}

export interface AttendanceRecord {
    id: string;
    employeeId: string;
    date: string;
    clockIn?: string;
    clockOut?: string;
    clockInLocation?: AttendanceLocationInfo | null;
    clockOutLocation?: AttendanceLocationInfo | null;
    clockInPhoto?: string | null;
    clockOutPhoto?: string | null;
    hasClockInPhoto?: boolean;
    hasClockOutPhoto?: boolean;
    status: string;
    isOffDay?: boolean;
    offDayReason?: string | null;
    shiftDate?: string;
    shiftId?: string | null;
    shiftName?: string | null;
    shiftStartTime?: string | null;
    shiftEndTime?: string | null;
    shiftSource?: "assignment" | "fallback" | "default" | "none";
    isOvernight?: boolean;
}

const WIB_TIMEZONE = "Asia/Jakarta";

/** Format an attendance timestamp or HH:mm value with an explicit WIB suffix. */
export function formatWibTime(value?: string | null): string {
    if (!value) return "--:--";

    const clockMatch = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (clockMatch) {
        return `${clockMatch[1].padStart(2, "0")}:${clockMatch[2]} WIB`;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return `${value} WIB`;

    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: WIB_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === "hour")?.value ?? "--";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "--";
    return `${hour}:${minute} WIB`;
}

/** Format an audit timestamp in WIB, including its date and explicit zone. */
export function formatWibDateTime(value?: string | null): string {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return `${value} WIB`;

    return `${new Intl.DateTimeFormat("id-ID", {
        timeZone: WIB_TIMEZONE,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(date)} WIB`;
}

function toClockMinutes(value?: string | null): number | null {
    if (!value) return null;

    const clockMatch = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (clockMatch) {
        const hours = Number(clockMatch[1]);
        const minutes = Number(clockMatch[2]);
        return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60
            ? hours * 60 + minutes
            : null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: WIB_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const hours = Number(parts.find((part) => part.type === "hour")?.value);
    const minutes = Number(parts.find((part) => part.type === "minute")?.value);
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

/** Calculate a displayed attendance duration, including a cross-midnight shift. */
export function calculateAttendanceDuration(
    clockIn?: string | null,
    clockOut?: string | null,
): string | null {
    if (!clockIn || !clockOut) return null;

    const inDate = new Date(clockIn);
    const outDate = new Date(clockOut);
    let durationMinutes: number | null = null;

    if (!Number.isNaN(inDate.getTime()) && !Number.isNaN(outDate.getTime())) {
        durationMinutes = Math.round((outDate.getTime() - inDate.getTime()) / (1000 * 60));
        // Real timestamps already contain their date. A non-positive value is
        // historical anomalous data, not an overnight duration to normalize.
        if (durationMinutes <= 0) return null;
    } else {
        const inMinutes = toClockMinutes(clockIn);
        const outMinutes = toClockMinutes(clockOut);
        if (inMinutes !== null && outMinutes !== null) {
            durationMinutes = outMinutes - inMinutes;
            if (durationMinutes <= 0) durationMinutes += 24 * 60;
        }
    }

    if (durationMinutes === null || durationMinutes <= 0) return null;
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return `${hours} jam${minutes > 0 ? ` ${minutes} menit` : ""}`;
}

export function isOvernightShift(startTime: string, endTime: string): boolean {
    const start = toClockMinutes(startTime);
    const end = toClockMinutes(endTime);
    return start !== null && end !== null && end < start;
}

export interface AttendanceShiftDisplay {
    name: string;
    startTime: string;
    endTime: string;
    shiftDate: string;
    isOvernight: boolean;
}

function shiftCalendarDate(date: string, days: number): string {
    const [year, month, day] = date.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export function getWibDatePresets(today: string): {
    today: string;
    yesterday: string;
    thisWeek: { start: string; end: string };
    thisMonth: { start: string; end: string };
} {
    const [year, month, day] = today.split("-").map(Number);
    const todayDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dayOfWeek = todayDate.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEndDate = new Date(Date.UTC(year, month, 0, 12, 0, 0));
    const monthEnd = `${monthEndDate.getUTCFullYear()}-${String(monthEndDate.getUTCMonth() + 1).padStart(2, "0")}-${String(monthEndDate.getUTCDate()).padStart(2, "0")}`;

    return {
        today,
        yesterday: shiftCalendarDate(today, -1),
        thisWeek: {
            start: shiftCalendarDate(today, mondayOffset),
            end: shiftCalendarDate(today, mondayOffset + 6),
        },
        thisMonth: { start: monthStart, end: monthEnd },
    };
}

export interface MasterData {
    id: string;
    name: string;
    divisionId?: string;
    division?: { name: string };
}

export interface AttendanceCorrection {
    id: string;
    employeeId: string;
    targetDate: string;
    proposedClockIn: string | null;
    proposedClockOut: string | null;
    reason: string;
    attachmentUrl: string | null;
    status: "PENDING" | "APPROVED" | "REJECTED";
    assignedManagerId: string | null;
    createdAt: string;
    employee?: { name: string; employeeId: string };
}

export type AbsentStatusType = "unpresent" | "on_leave" | "off_day" | "pending_leave";

export interface AbsentEmployee {
    employeeId: string;
    name: string;
    department: string;
    division: string;
    position: string;
    phone: string | null;
    email: string | null;
    statusType: AbsentStatusType;
    statusLabel: string;
    notes?: string | null;
}

export interface LeaveRecordLite {
    id: string;
    employeeId: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
}

export interface WorkShiftDayInfo {
    id?: string;
    shiftId?: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isOff: boolean;
}

export interface WorkShiftInfo {
    id: string;
    name: string;
    isDefault: boolean;
    earlyCheckIn?: number;
    lateCheckIn?: number;
    earlyCheckOut?: number;
    lateCheckOut?: number;
    days: WorkShiftDayInfo[];
}

