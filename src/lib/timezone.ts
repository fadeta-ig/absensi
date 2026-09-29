/**
 * WIB (Asia/Jakarta) Timezone Helpers
 *
 * Semua logika tanggal/waktu di sistem ini HARUS menggunakan WIB,
 * karena perusahaan beroperasi di Indonesia Barat.
 * Menggunakan Intl.DateTimeFormat — zero external dependency.
 */

export const WIB_TIMEZONE = "Asia/Jakarta";
export const WIB_UTC_OFFSET = "+07:00";
const WIB_OFFSET_MILLISECONDS = 7 * 60 * 60 * 1000;

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/;

const wibDateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

const wibTimeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: WIB_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

function requireValidCalendarDate(value: string): void {
    if (!isValidCalendarDate(value)) {
        throw new RangeError(`Invalid calendar date: ${value}`);
    }
}

/** Validate a calendar date in strict YYYY-MM-DD form. */
export function isValidCalendarDate(value: string): boolean {
    if (!CALENDAR_DATE_PATTERN.test(value)) return false;

    const [year, month, day] = value.split("-").map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;

    const isLeapYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
    const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= daysInMonth[month - 1];
}

/** Convert a YYYY-MM-DD business date to its historical UTC-midnight storage key. */
export function toUTCDateKey(value: string): Date {
    requireValidCalendarDate(value);
    return new Date(`${value}T00:00:00.000Z`);
}

/** Add whole calendar days to a YYYY-MM-DD value without using the host timezone. */
export function addCalendarDays(value: string, days: number): string {
    requireValidCalendarDate(value);
    if (!Number.isSafeInteger(days)) {
        throw new RangeError(`Calendar day offset must be a safe integer: ${days}`);
    }

    const result = toUTCDateKey(value);
    result.setUTCDate(result.getUTCDate() + days);
    const resultString = result.toISOString().slice(0, 10);

    if (!isValidCalendarDate(resultString)) {
        throw new RangeError(`Calendar day result is outside YYYY-MM-DD range: ${resultString}`);
    }

    return resultString;
}

/** Convert a WIB wall-clock date/time to its UTC instant using an explicit +07:00 offset. */
export function wibDateTimeToDate(date: string, time = "00:00:00"): Date {
    requireValidCalendarDate(date);
    if (!CLOCK_TIME_PATTERN.test(time)) {
        throw new RangeError(`Invalid clock time: ${time}`);
    }

    return new Date(`${date}T${time}${WIB_UTC_OFFSET}`);
}

/** Format an instant with Asia/Jakarta fixed as the timezone. */
export function formatWIBDateTime(
    date: Date,
    options: Intl.DateTimeFormatOptions,
    locales: Intl.LocalesArgument = "id-ID"
): string {
    return new Intl.DateTimeFormat(locales, {
        ...options,
        timeZone: WIB_TIMEZONE,
    }).format(date);
}

/** Get current date as "YYYY-MM-DD" in WIB timezone. */
export function toWIBDateString(date: Date = new Date()): string {
    const parts = wibDateFormatter.formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (!year || !month || !day) {
        throw new RangeError("Unable to format WIB calendar date");
    }

    return `${year.padStart(4, "0")}-${month}-${day}`;
}

/** Get current hours and minutes in WIB timezone. */
export function getWIBHoursMinutes(date: Date = new Date()): { hours: number; minutes: number } {
    const parts = wibTimeFormatter.formatToParts(date);
    const rawHours = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minutes = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

    return { hours: rawHours % 24, minutes };
}

/** Get day of week (0=Sunday..6=Saturday) in WIB timezone. */
export function getWIBDayOfWeek(date: Date = new Date()): number {
    return toUTCDateKey(toWIBDateString(date)).getUTCDay();
}

/** Convert an instant to an ISO-compatible WIB string with an explicit +07:00 offset. */
export function toWIBISOString(date: Date = new Date()): string {
    return new Date(date.getTime() + WIB_OFFSET_MILLISECONDS)
        .toISOString()
        .replace("Z", WIB_UTC_OFFSET);
}


