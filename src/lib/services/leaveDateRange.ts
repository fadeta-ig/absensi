import { isValidCalendarDate, toUTCDateKey } from "@/lib/timezone";

export const MAX_LEAVE_CALENDAR_DAYS = 366;

export class LeaveDateRangeError extends Error {
    readonly code = "INVALID_RANGE";
    readonly statusCode = 400;

    constructor(message: string) {
        super(message);
        this.name = "LeaveDateRangeError";
    }
}

export type LeaveDateRangeValidation =
    | { success: true; calendarDays: number }
    | { success: false; field: "startDate" | "endDate"; message: string };

/** Shared inclusive calendar-range contract for leave API and service callers. */
export function validateLeaveDateRange(startDate: string, endDate: string): LeaveDateRangeValidation {
    if (!isValidCalendarDate(startDate)) {
        return {
            success: false,
            field: "startDate",
            message: "Tanggal mulai harus berformat YYYY-MM-DD yang valid.",
        };
    }
    if (!isValidCalendarDate(endDate)) {
        return {
            success: false,
            field: "endDate",
            message: "Tanggal selesai harus berformat YYYY-MM-DD yang valid.",
        };
    }

    const startTime = toUTCDateKey(startDate).getTime();
    const endTime = toUTCDateKey(endDate).getTime();
    if (endTime < startTime) {
        return {
            success: false,
            field: "endDate",
            message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
        };
    }

    const calendarDays = Math.floor((endTime - startTime) / 86_400_000) + 1;
    if (calendarDays > MAX_LEAVE_CALENDAR_DAYS) {
        return {
            success: false,
            field: "endDate",
            message: `Rentang cuti maksimal ${MAX_LEAVE_CALENDAR_DAYS} hari kalender.`,
        };
    }

    return { success: true, calendarDays };
}
