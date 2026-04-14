/**
 * WIB (Asia/Jakarta) Timezone Helpers
 *
 * Semua logika tanggal/waktu di sistem ini HARUS menggunakan WIB,
 * karena perusahaan beroperasi di Indonesia Barat.
 * Menggunakan Intl.DateTimeFormat — zero external dependency.
 */

const WIB_TIMEZONE = "Asia/Jakarta";

/** Get current date as "YYYY-MM-DD" in WIB timezone. */
export function toWIBDateString(date: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: WIB_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
    return parts; // "en-CA" locale outputs "YYYY-MM-DD" natively
}

/** Get current hours and minutes in WIB timezone. */
export function getWIBHoursMinutes(date: Date = new Date()): { hours: number; minutes: number } {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: WIB_TIMEZONE,
        hour: "numeric",
        minute: "numeric",
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hours = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minutes = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

    return { hours, minutes };
}

/** Get day of week (0=Sunday..6=Saturday) in WIB timezone. */
export function getWIBDayOfWeek(date: Date = new Date()): number {
    const dayStr = new Intl.DateTimeFormat("en-US", {
        timeZone: WIB_TIMEZONE,
        weekday: "short",
    }).format(date);

    const dayMap: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return dayMap[dayStr] ?? 0;
}

/**
 * Convert a Date to WIB ISO string (e.g. for clockIn/clockOut storage).
 * Preserves the actual UTC instant but helps with debugging.
 */
export function toWIBISOString(date: Date = new Date()): string {
    return date.toISOString();
}
