import { addCalendarDays, formatWIBDateTime, isValidCalendarDate, toUTCDateKey } from "@/lib/timezone";

export interface EmployeeLite {
    id: string;
    employeeId: string;
    name: string;
    department?: string | null;
    division?: string | null;
    position?: string | null;
    isActive?: boolean;
    shiftId?: string | null;
}

export interface ShiftDayLite {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isOff: boolean;
}

export interface ShiftLite {
    id: string;
    name: string;
    isDefault: boolean;
    days: ShiftDayLite[];
}

export type ShiftSource = "assignment" | "fallback" | "default" | "none";

export interface RosterTimelineCell {
    date: string;
    shiftId: string | null;
    source: ShiftSource;
    assignmentId: string | null;
}

export interface RosterTimelineAssignment {
    id: string;
    employeeId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
}

export interface RosterTimelineResponse {
    from: string;
    to: string;
    today: string;
    days: number;
    defaultShiftId: string | null;
    employees: Array<{
        employeeId: string;
        baseShiftId: string | null;
        cells: RosterTimelineCell[];
    }>;
    assignments: RosterTimelineAssignment[];
}

export interface RosterPlanAction {
    type: "truncate" | "split" | "replace" | "trimStart";
    assignmentId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    resultFrom?: string;
    resultTo?: string | null;
}

export interface RosterPlanConflict {
    employeeId: string;
    assignmentId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    reason: "HISTORY" | "FUTURE";
}

export interface RosterPlanItem {
    employeeId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    actions: RosterPlanAction[];
    conflicts: RosterPlanConflict[];
    after: { date: string; shiftId: string | null; source: ShiftSource } | null;
}

export interface DryRunOutcome {
    applied: number;
    dryRun: boolean;
    plan: RosterPlanItem[];
    conflicts: RosterPlanConflict[];
}

export const SHIFT_PALETTES = [
    {
        solid: "bg-sky-500/15 text-sky-800 border-sky-500/40 dark:bg-sky-500/20 dark:text-sky-200 dark:border-sky-400/40",
        muted: "bg-sky-500/5 text-sky-700/80 border-sky-500/25 border-dashed dark:text-sky-300/80",
        dot: "bg-sky-500",
    },
    {
        solid: "bg-emerald-500/15 text-emerald-800 border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-400/40",
        muted: "bg-emerald-500/5 text-emerald-700/80 border-emerald-500/25 border-dashed dark:text-emerald-300/80",
        dot: "bg-emerald-500",
    },
    {
        solid: "bg-violet-500/15 text-violet-800 border-violet-500/40 dark:bg-violet-500/20 dark:text-violet-200 dark:border-violet-400/40",
        muted: "bg-violet-500/5 text-violet-700/80 border-violet-500/25 border-dashed dark:text-violet-300/80",
        dot: "bg-violet-500",
    },
    {
        solid: "bg-amber-500/15 text-amber-800 border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-400/40",
        muted: "bg-amber-500/5 text-amber-700/80 border-amber-500/25 border-dashed dark:text-amber-300/80",
        dot: "bg-amber-500",
    },
    {
        solid: "bg-fuchsia-500/15 text-fuchsia-800 border-fuchsia-500/40 dark:bg-fuchsia-500/20 dark:text-fuchsia-200 dark:border-fuchsia-400/40",
        muted: "bg-fuchsia-500/5 text-fuchsia-700/80 border-fuchsia-500/25 border-dashed dark:text-fuchsia-300/80",
        dot: "bg-fuchsia-500",
    },
];

export function getShiftPrimaryHours(shift?: ShiftLite | null): string {
    if (!shift) return "-";
    const workDays = shift.days.filter((d) => !d.isOff);
    return workDays.length > 0 ? `${workDays[0].startTime}-${workDays[0].endTime}` : "Libur";
}

export function shiftLabel(shift: ShiftLite): string {
    if (/\d{2}:\d{2}/.test(shift.name)) {
        return shift.name;
    }
    const hours = getShiftPrimaryHours(shift);
    return `${shift.name} (${hours})`;
}

export function formatWIBShort(dateStr: string): string {
    if (!dateStr || !isValidCalendarDate(dateStr)) return dateStr || "";
    return formatWIBDateTime(toUTCDateKey(dateStr), { day: "numeric", month: "short" });
}

export function formatWIBFullDate(dateStr: string): string {
    if (!dateStr || !isValidCalendarDate(dateStr)) return "";
    return formatWIBDateTime(toUTCDateKey(dateStr), {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

export function formatWIBDayShort(dateStr: string): string {
    if (!isValidCalendarDate(dateStr)) return "";
    return formatWIBDateTime(toUTCDateKey(dateStr), { weekday: "short" });
}

export function toInclusiveEndDate(exclusiveTo: string | null | undefined): string | null {
    if (!exclusiveTo || !isValidCalendarDate(exclusiveTo)) return null;
    return addCalendarDays(exclusiveTo, -1);
}

export function formatAssignmentInterval(from: string, exclusiveTo: string | null): string {
    const incEnd = toInclusiveEndDate(exclusiveTo);
    if (!incEnd) return `Mulai ${formatWIBShort(from)} (Seterusnya)`;
    if (incEnd === from) return `${formatWIBShort(from)} (1 hari)`;
    return `${formatWIBShort(from)} – ${formatWIBShort(incEnd)}`;
}

export function normalizeDepartment(dept?: string | null): string {
    if (!dept) return "";
    const trimmed = dept.trim();
    return trimmed === "-" ? "" : trimmed;
}

export function sourceBadgeLabel(source: ShiftSource): string {
    if (source === "assignment") return "Roster";
    if (source === "fallback") return "Dasar";
    if (source === "default") return "Default";
    return "Kosong";
}
