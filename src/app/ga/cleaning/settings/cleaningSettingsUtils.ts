import * as clientErrors from "@/lib/clientErrors";
import {
    formatWIBDateTime,
    isValidCalendarDate,
    toWIBDateString,
    wibDateTimeToDate,
} from "@/lib/timezone";

export interface CleaningTemplateItem {
    id: string;
    name: string;
    sortOrder: number;
    isActive: boolean;
}

export interface CleaningTemplate {
    id: string;
    name: string;
    isActive: boolean;
    items: CleaningTemplateItem[];
    _count: { rooms: number };
}

export interface CleaningAssignment {
    id: string;
    workerType: "INTERNAL" | "OUTSOURCE";
    startsOnWibDate: string;
    endsOnWibDate: string | null;
    user: { id: string; username: string; displayName: string };
}

export interface CleaningRoom {
    id: string;
    name: string;
    isActive: boolean;
    template: { id: string; name: string };
    assignments: CleaningAssignment[];
    _count: { checklists: number };
}

export interface AvailableCleaningUser {
    id: string;
    username: string;
    displayName: string;
    employeeId: string | null;
}

export interface OutsourceCleaningUser {
    id: string;
    username: string;
    displayName: string;
    email: string;
    isActive: boolean;
    createdAt: string;
    cleaningAssignments: Array<{
        room: { id: string; name: string };
    }>;
}

export interface BulkAssignResult {
    created: Array<{ roomName: string; displayName: string }>;
    skipped: Array<{ roomName: string; displayName: string; message: string }>;
    failed: Array<{ roomName: string; displayName: string; message: string }>;
}

export const cleaningInputClass =
    "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

const RAW_ERROR_PATTERN =
    /^(failed to fetch|load failed|networkerror|fetch failed|unexpected token|unexpected end of json|syntaxerror|typeerror|aborterror|the operation was aborted)/i;

/**
 * Mengubah error client menjadi pesan bahasa Indonesia yang ramah pengguna.
 * Tetap aman bila modul `@/lib/clientErrors` di-mock parsial pada pengujian unit.
 */
export function toFriendlyCleaningError(error: unknown, fallback: string): string {
    if (typeof clientErrors.getFriendlyClientErrorMessage === "function") {
        return clientErrors.getFriendlyClientErrorMessage(error, fallback);
    }
    if (error instanceof Error) {
        const msg = error.message.trim();
        if (msg && !RAW_ERROR_PATTERN.test(msg)) {
            return msg;
        }
    }
    return fallback;
}

/** Format YYYY-MM-DD (WIB) menjadi teks ringkas Indonesia, mis. "12 Okt 2026". */
export function formatCleaningWibDate(wibDate: string): string {
    if (!isValidCalendarDate(wibDate)) return wibDate;
    return formatWIBDateTime(wibDateTimeToDate(wibDate, "00:00:00"), {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

/**
 * Penugasan yang masih aktif atau terjadwal hari ini (termasuk yang berakhir besok),
 * agar tidak tampak terlepas sebelum waktunya.
 */
export function getVisibleAssignments(list: CleaningAssignment[]): CleaningAssignment[] {
    const todayStr = toWIBDateString();
    return list.filter((a) => a.endsOnWibDate === null || a.endsOnWibDate > todayStr);
}
