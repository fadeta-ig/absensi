import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatWIBDateTime, getWIBHoursMinutes, toWIBDateString } from "@/lib/timezone"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Shared Date/Time Helpers ────────────────────────────────────
// Single source of truth — menggantikan d2s, dateStr, timeStr, toDateStr
// yang sebelumnya diduplikasi di 5+ service files.

/** Convert Date/string → "YYYY-MM-DD" in WIB timezone. Returns "" for null/undefined. */
export function toDateString(d: Date | string | null | undefined): string {
    if (!d) return "";
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return "";
    return toWIBDateString(date);
}

/** Convert Date/string → full ISO string. Returns null for null/undefined. */
export function toISOOrNull(d: Date | string | null | undefined): string | null {
    if (!d) return null;
    return d instanceof Date ? d.toISOString() : String(d);
}

/**
 * Convert Date/string → "HH:MM" time string.
 * Useful for displaying clockIn/clockOut and overtime startTime/endTime.
 */
export function toTimeString(d: Date | string | null | undefined): string {
    if (!d) return "-";
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return "-";
    const { hours, minutes } = getWIBHoursMinutes(date);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Convert Date/string → "YYYY-MM-DD" for display (WIB), returns "-" for null. */
export function toDateDisplay(d: Date | string | null | undefined): string {
    if (!d) return "-";
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return "-";
    return toWIBDateString(date);
}

/** 
 * Format Date/string → "Senin, 12 Agustus 2024" (Indonesian locale)
 * Useful for clearly surfacing days in the leave management UI.
 */
export function formatIndonesianDate(d: Date | string | null | undefined): string {
    if (!d) return "-";
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return "-";
    
    return formatWIBDateTime(date, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

/** Human-readable date for UI only; API/storage date keys remain unchanged. */
export function formatDisplayDate(value: Date | string | null | undefined): string {
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return "-";
    return formatWIBDateTime(date, { day: "numeric", month: "short", year: "numeric" });
}

/** Accept both serialized instants and already formatted legacy clock values. */
export function formatDisplayTime(value: Date | string | null | undefined): string {
    if (typeof value === "string" && /^(?:[01]\d|2[0-3])\.[0-5]\d(?:\.[0-5]\d)?$/.test(value)) {
        return value.slice(0, 5).replace(".", ":");
    }
    if (typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/.test(value)) {
        return value.slice(0, 5);
    }
    return toTimeString(value);
}

/** UI timestamp with explicit WIB, never a raw ISO fallback. */
export function formatDisplayDateTime(value: Date | string | null | undefined): string {
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return "-";
    return `${formatDisplayDate(date)}, ${toTimeString(date)} WIB`;
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}
