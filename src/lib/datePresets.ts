/**
 * Date Preset & Filter Utility for HR Dashboard
 * Provides reliable, local-timezone boundary calculations for date filters.
 */

export function toLocalISODate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getToday(): string {
    return toLocalISODate(new Date());
}

export function getYesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISODate(d);
}

/**
 * Returns Monday to Sunday for the current week.
 */
export function getThisWeekRange(): { start: string; end: string } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return {
        start: toLocalISODate(monday),
        end: toLocalISODate(sunday),
    };
}

/**
 * Returns 1st day to last day of the current month.
 */
export function getThisMonthRange(): { start: string; end: string } {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return {
        start: toLocalISODate(firstDay),
        end: toLocalISODate(lastDay),
    };
}

/**
 * Returns 1st day to last day of the previous month.
 */
export function getLastMonthRange(): { start: string; end: string } {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);

    return {
        start: toLocalISODate(firstDay),
        end: toLocalISODate(lastDay),
    };
}

/**
 * Returns 1st day to last day of the current year.
 */
export function getThisYearRange(): { start: string; end: string } {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), 0, 1);
    const lastDay = new Date(now.getFullYear(), 11, 31);

    return {
        start: toLocalISODate(firstDay),
        end: toLocalISODate(lastDay),
    };
}

/**
 * Checks if a single date string (YYYY-MM-DD or ISO) falls within [start, end].
 */
export function isDateInRange(targetDateStr: string | null | undefined, start?: string, end?: string): boolean {
    if (!targetDateStr) return false;
    const dateOnly = targetDateStr.slice(0, 10);
    if (start && dateOnly < start) return false;
    if (end && dateOnly > end) return false;
    return true;
}

/**
 * Checks if a date range [itemStart, itemEnd] overlaps with filter range [filterStart, filterEnd].
 */
export function isRangeOverlapping(
    itemStartStr: string,
    itemEndStr: string,
    filterStart?: string,
    filterEnd?: string
): boolean {
    const itemStart = itemStartStr.slice(0, 10);
    const itemEnd = itemEndStr.slice(0, 10);

    if (filterStart && itemEnd < filterStart) return false;
    if (filterEnd && itemStart > filterEnd) return false;
    return true;
}
