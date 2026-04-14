import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
    // Use WIB (Asia/Jakarta) to avoid UTC date-shift between 00:00-06:59 WIB
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
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
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Convert Date/string → "YYYY-MM-DD" for display (WIB), returns "-" for null. */
export function toDateDisplay(d: Date | string | null | undefined): string {
    if (!d) return "-";
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
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
