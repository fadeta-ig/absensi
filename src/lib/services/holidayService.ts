export type IndonesianHolidayType = "national" | "joint-leave";

export interface IndonesianHoliday {
    date: string;
    name: string;
    type: IndonesianHolidayType;
}

interface HolidayRecord {
    date?: unknown;
    description?: unknown;
    holiday_date?: unknown;
    holiday_name?: unknown;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize the supported upstream holiday payloads into the application's
 * stable calendar contract. Invalid and out-of-year records are discarded.
 */
export function normalizeHolidayPayload(payload: unknown, year: number): IndonesianHoliday[] {
    const records = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
            ? (payload as { data: unknown[] }).data
            : [];

    const uniqueHolidays = new Map<string, IndonesianHoliday>();

    for (const rawRecord of records) {
        if (!rawRecord || typeof rawRecord !== "object") continue;

        const record = rawRecord as HolidayRecord;
        const date = typeof record.date === "string"
            ? record.date
            : typeof record.holiday_date === "string"
                ? record.holiday_date
                : "";
        const name = typeof record.description === "string"
            ? record.description.trim()
            : typeof record.holiday_name === "string"
                ? record.holiday_name.trim()
                : "";

        if (!ISO_DATE_PATTERN.test(date) || !date.startsWith(`${year}-`) || !name) continue;

        const type: IndonesianHolidayType = /cuti bersama/i.test(name) ? "joint-leave" : "national";
        uniqueHolidays.set(`${date}:${name}`, { date, name, type });
    }

    return [...uniqueHolidays.values()].sort((a, b) => a.date.localeCompare(b.date));
}
