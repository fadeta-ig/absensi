"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertCircle,
    ArrowRight,
    Calendar,
    CalendarClock,
    CheckCircle2,
    CheckSquare,
    ChevronLeft,
    ChevronRight,
    Clock,
    Edit3,
    Filter,
    Info,
    Layers,
    Loader2,
    RefreshCw,
    RotateCcw,
    Scissors,
    Search,
    Sparkles,
    Square,
    Trash2,
    Users,
    X,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { addCalendarDays, formatWIBDateTime, isValidCalendarDate, toUTCDateKey, toWIBDateString } from "@/lib/timezone";

interface EmployeeLite {
    id: string;
    employeeId: string;
    name: string;
    department?: string | null;
    division?: string | null;
    position?: string | null;
    isActive?: boolean;
    shiftId?: string | null;
}

interface ShiftDayLite {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isOff: boolean;
}

interface ShiftLite {
    id: string;
    name: string;
    isDefault: boolean;
    days: ShiftDayLite[];
}

type ShiftSource = "assignment" | "fallback" | "default" | "none";

interface RosterTimelineCell {
    date: string;
    shiftId: string | null;
    source: ShiftSource;
    assignmentId: string | null;
}

interface RosterTimelineAssignment {
    id: string;
    employeeId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
}

interface RosterTimelineResponse {
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

interface RosterPlanAction {
    type: "truncate" | "split" | "replace" | "trimStart";
    assignmentId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    resultFrom?: string;
    resultTo?: string | null;
}

interface RosterPlanConflict {
    employeeId: string;
    assignmentId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    reason: "HISTORY" | "FUTURE";
}

interface RosterPlanItem {
    employeeId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    actions: RosterPlanAction[];
    conflicts: RosterPlanConflict[];
    after: { date: string; shiftId: string | null; source: ShiftSource } | null;
}

interface DryRunOutcome {
    applied: number;
    dryRun: boolean;
    plan: RosterPlanItem[];
    conflicts: RosterPlanConflict[];
}

const SHORT_DAY_LABELS: Array<{ dayOfWeek: number; label: string }> = [
    { dayOfWeek: 1, label: "Sen" },
    { dayOfWeek: 2, label: "Sel" },
    { dayOfWeek: 3, label: "Rab" },
    { dayOfWeek: 4, label: "Kam" },
    { dayOfWeek: 5, label: "Jum" },
    { dayOfWeek: 6, label: "Sab" },
    { dayOfWeek: 0, label: "Min" },
];

const SHIFT_PALETTES = [
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

function getShiftPrimaryHours(shift?: ShiftLite | null): string {
    if (!shift) return "-";
    const workDays = shift.days.filter((d) => !d.isOff);
    return workDays.length > 0 ? `${workDays[0].startTime}-${workDays[0].endTime}` : "Libur";
}

function shiftLabel(shift: ShiftLite): string {
    if (/\d{2}:\d{2}/.test(shift.name)) {
        return shift.name;
    }
    const hours = getShiftPrimaryHours(shift);
    return `${shift.name} (${hours})`;
}

function formatWIBShort(dateStr: string): string {
    if (!dateStr || !isValidCalendarDate(dateStr)) return dateStr || "";
    return formatWIBDateTime(toUTCDateKey(dateStr), { day: "numeric", month: "short" });
}

function formatWIBFullDate(dateStr: string): string {
    if (!dateStr || !isValidCalendarDate(dateStr)) return "";
    return formatWIBDateTime(toUTCDateKey(dateStr), {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function formatWIBDayShort(dateStr: string): string {
    if (!isValidCalendarDate(dateStr)) return "";
    return formatWIBDateTime(toUTCDateKey(dateStr), { weekday: "short" });
}

function toInclusiveEndDate(exclusiveTo: string | null | undefined): string | null {
    if (!exclusiveTo || !isValidCalendarDate(exclusiveTo)) return null;
    return addCalendarDays(exclusiveTo, -1);
}

function formatAssignmentInterval(from: string, exclusiveTo: string | null): string {
    const incEnd = toInclusiveEndDate(exclusiveTo);
    if (!incEnd) return `Mulai ${formatWIBShort(from)} (Seterusnya)`;
    if (incEnd === from) return `${formatWIBShort(from)} (1 hari)`;
    return `${formatWIBShort(from)} – ${formatWIBShort(incEnd)}`;
}

function getMondayOfWIBWeek(referenceDate: string, weekOffset = 0): string {
    const baseDate = isValidCalendarDate(referenceDate) ? referenceDate : toWIBDateString();
    const utcDay = toUTCDateKey(baseDate).getUTCDay();
    const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
    return addCalendarDays(baseDate, diffToMonday + weekOffset * 7);
}

function normalizeDepartment(dept?: string | null): string {
    if (!dept) return "";
    const trimmed = dept.trim();
    return trimmed === "-" ? "" : trimmed;
}

function sourceBadgeLabel(source: ShiftSource): string {
    if (source === "assignment") return "Roster";
    if (source === "fallback") return "Dasar";
    if (source === "default") return "Default";
    return "Kosong";
}

export default function ShiftRosterPage() {
    const toast = useToast();
    const confirm = useConfirm();

    const [employees, setEmployees] = useState<EmployeeLite[]>([]);
    const [shifts, setShifts] = useState<ShiftLite[]>([]);
    const [timeline, setTimeline] = useState<RosterTimelineResponse | null>(null);
    const [today, setToday] = useState("");

    // Selection and Filtering
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [filterSource, setFilterSource] = useState<string>("all");
    const [filterOrigin, setFilterOrigin] = useState<"all" | "assignment" | "base">("all");
    const [filterDepartment, setFilterDepartment] = useState<string>("all");

    // Timeline & Focus Date
    const [viewDate, setViewDate] = useState("");
    const [rangeDays, setRangeDays] = useState<7 | 14>(7);

    // Assignment Composer state
    const [targetShiftId, setTargetShiftId] = useState("");
    const [effectiveFrom, setEffectiveFrom] = useState("");
    const [uiEffectiveTo, setUiEffectiveTo] = useState(""); // inclusive
    const [replaceFuture, setReplaceFuture] = useState(false);

    // Server Dry-Run Preview state
    const [dryRunPlan, setDryRunPlan] = useState<DryRunOutcome | null>(null);
    const [loadingDryRun, setLoadingDryRun] = useState(false);

    // Employee Detail Modal state
    const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null);
    const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
    const [editUiEndDate, setEditUiEndDate] = useState<string>("");
    const [editOpenEnded, setEditOpenEnded] = useState<boolean>(false);
    const [updatingEndId, setUpdatingEndId] = useState<string>("");

    // UI states
    const [loading, setLoading] = useState(true);
    const [loadingRoster, setLoadingRoster] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [cancellingAssignment, setCancellingAssignment] = useState("");
    const [loadError, setLoadError] = useState("");
    const [rosterError, setRosterError] = useState("");
    const [actionError, setActionError] = useState("");
    const [actionResult, setActionResult] = useState<{ success: number; message: string; type: "success" | "info" } | null>(null);

    const rosterAbortRef = useRef<AbortController | null>(null);
    const rosterRequestRef = useRef(0);
    const viewDateRef = useRef("");
    const rangeDaysRef = useRef<7 | 14>(7);

    const shiftById = useMemo(() => {
        const map = new Map<string, ShiftLite>();
        for (const shift of shifts) map.set(shift.id, shift);
        return map;
    }, [shifts]);

    const shiftPaletteById = useMemo(() => {
        const map = new Map<string, (typeof SHIFT_PALETTES)[number]>();
        shifts.forEach((shift, index) => {
            map.set(shift.id, SHIFT_PALETTES[index % SHIFT_PALETTES.length]);
        });
        return map;
    }, [shifts]);

    const shiftNameOf = useCallback(
        (shiftId?: string | null) => {
            if (!shiftId) return "Belum Ada Shift";
            return shiftById.get(shiftId)?.name ?? "Belum Ada Shift";
        },
        [shiftById],
    );

    const loadTimeline = useCallback(async (fromDate: string, days: 7 | 14 = rangeDaysRef.current) => {
        rosterAbortRef.current?.abort();
        const requestId = ++rosterRequestRef.current;
        if (!fromDate || !isValidCalendarDate(fromDate)) {
            rosterAbortRef.current = null;
            setTimeline(null);
            setRosterError("");
            setLoadingRoster(false);
            return;
        }
        const controller = new AbortController();
        rosterAbortRef.current = controller;
        setLoadingRoster(true);
        try {
            const res = await fetch(`/api/shifts/assignments/timeline?from=${fromDate}&days=${days}`, {
                cache: "no-store",
                signal: controller.signal,
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat timeline roster."));
            const data = (await res.json()) as RosterTimelineResponse;
            if (requestId === rosterRequestRef.current && data && Array.isArray(data.employees)) {
                setTimeline(data);
                if (typeof data.today === "string" && data.today) setToday(data.today);
                setRosterError("");
            }
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") return;
            if (requestId !== rosterRequestRef.current) return;
            setTimeline(null);
            setRosterError(
                error instanceof Error
                    ? error.message
                    : "Timeline roster tidak dapat dimuat; fallback shift karyawan dipakai.",
            );
        } finally {
            if (rosterAbortRef.current === controller) {
                rosterAbortRef.current = null;
                setLoadingRoster(false);
            }
        }
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            const [empRes, shiftRes, initialTimelineRes] = await Promise.all([
                fetch("/api/employees"),
                fetch("/api/shifts"),
                fetch(`/api/shifts/assignments/timeline?days=${rangeDaysRef.current}`, { cache: "no-store" }).catch(() => null),
            ]);
            if (!empRes.ok) throw new Error(await getResponseErrorMessage(empRes, "Gagal memuat karyawan."));
            if (!shiftRes.ok) throw new Error(await getResponseErrorMessage(shiftRes, "Gagal memuat shift."));
            const [empData, shiftData] = await Promise.all([empRes.json(), shiftRes.json()]);
            if (Array.isArray(empData)) {
                setEmployees(empData.filter((e: EmployeeLite) => e.isActive !== false));
            }
            if (Array.isArray(shiftData)) {
                setShifts(shiftData);
                setTargetShiftId((prev) => prev || (shiftData.length > 0 ? shiftData[0].id : ""));
            }
            if (initialTimelineRes && initialTimelineRes.ok) {
                const timelineData = (await initialTimelineRes.json()) as RosterTimelineResponse;
                if (rosterRequestRef.current === 0 && timelineData && Array.isArray(timelineData.employees)) {
                    setTimeline(timelineData);
                    if (typeof timelineData.today === "string" && timelineData.today) {
                        setToday(timelineData.today);
                    }
                    const resolvedFrom =
                        typeof timelineData.from === "string" && timelineData.from
                            ? timelineData.from
                            : typeof timelineData.today === "string"
                              ? timelineData.today
                              : "";
                    if (resolvedFrom && !viewDateRef.current) {
                        viewDateRef.current = resolvedFrom;
                        setViewDate(resolvedFrom);
                        setEffectiveFrom((prev) => prev || resolvedFrom);
                    }
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Gagal memuat data roster.";
            setLoadError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(
        () => () => {
            rosterRequestRef.current++;
            rosterAbortRef.current?.abort();
        },
        [],
    );

    const handleViewDateChange = useCallback(
        (nextDate: string, nextDays: 7 | 14 = rangeDaysRef.current) => {
            viewDateRef.current = nextDate;
            setViewDate(nextDate);
            void loadTimeline(nextDate, nextDays);
        },
        [loadTimeline],
    );

    const handleRangeDaysChange = useCallback(
        (nextDays: 7 | 14) => {
            rangeDaysRef.current = nextDays;
            setRangeDays(nextDays);
            if (viewDateRef.current) {
                void loadTimeline(viewDateRef.current, nextDays);
            }
        },
        [loadTimeline],
    );

    const dateColumns = useMemo(() => {
        const base = isValidCalendarDate(viewDate)
            ? viewDate
            : timeline?.from && isValidCalendarDate(timeline.from)
              ? timeline.from
              : today && isValidCalendarDate(today)
                ? today
                : "";
        if (!base) return [];
        return Array.from({ length: rangeDays }, (_, idx) => addCalendarDays(base, idx));
    }, [viewDate, timeline?.from, today, rangeDays]);

    const timelineByEmployee = useMemo(() => {
        const map = new Map<string, { baseShiftId: string | null; cellByDate: Map<string, RosterTimelineCell> }>();
        if (!timeline) return map;
        for (const row of timeline.employees) {
            const cellByDate = new Map<string, RosterTimelineCell>();
            for (const cell of row.cells) cellByDate.set(cell.date, cell);
            map.set(row.employeeId, { baseShiftId: row.baseShiftId, cellByDate });
        }
        return map;
    }, [timeline]);

    const assignmentsById = useMemo(() => {
        const map = new Map<string, RosterTimelineAssignment>();
        for (const asg of timeline?.assignments ?? []) map.set(asg.id, asg);
        return map;
    }, [timeline]);

    const assignmentsByEmployee = useMemo(() => {
        const map = new Map<string, RosterTimelineAssignment[]>();
        for (const asg of timeline?.assignments ?? []) {
            const list = map.get(asg.employeeId) ?? [];
            list.push(asg);
            map.set(asg.employeeId, list);
        }
        return map;
    }, [timeline]);

    const defaultShiftId = useMemo(() => {
        return timeline?.defaultShiftId ?? shifts.find((s) => s.isDefault)?.id ?? null;
    }, [timeline, shifts]);

    // Resolve cell for an employee on a given date (falls back gracefully if timeline not loaded yet)
    const resolveCell = useCallback(
        (emp: EmployeeLite, date: string): RosterTimelineCell => {
            const empTimeline = timelineByEmployee.get(emp.employeeId);
            const cell = empTimeline?.cellByDate.get(date);
            if (cell) return cell;
            if (emp.shiftId && shiftById.has(emp.shiftId)) {
                return { date, shiftId: emp.shiftId, source: "fallback", assignmentId: null };
            }
            if (defaultShiftId) {
                return { date, shiftId: defaultShiftId, source: "default", assignmentId: null };
            }
            return { date, shiftId: null, source: "none", assignmentId: null };
        },
        [timelineByEmployee, shiftById, defaultShiftId],
    );

    const departments = useMemo(() => {
        const set = new Set<string>();
        for (const emp of employees) {
            const dept = normalizeDepartment(emp.department);
            if (dept) set.add(dept);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [employees]);

    const viewedWeekday = useMemo(() => {
        if (!isValidCalendarDate(viewDate)) return null;
        return toUTCDateKey(viewDate).getUTCDay();
    }, [viewDate]);

    const rosterStats = useMemo(() => {
        let assignmentCount = 0;
        let baseCount = 0;
        let futureCount = 0;
        const byShift: Record<string, number> = {};

        for (const emp of employees) {
            const cell = viewDate ? resolveCell(emp, viewDate) : { shiftId: emp.shiftId ?? defaultShiftId, source: "fallback" as ShiftSource, assignmentId: null, date: "" };
            const effectiveShiftId = cell.shiftId ?? "none";
            byShift[effectiveShiftId] = (byShift[effectiveShiftId] ?? 0) + 1;

            if (cell.source === "assignment") {
                assignmentCount++;
            } else {
                baseCount++;
            }
            const empAssignments = assignmentsByEmployee.get(emp.employeeId) ?? [];
            if (today && empAssignments.some((a) => a.effectiveFrom >= today)) {
                futureCount++;
            }
        }

        return {
            total: employees.length,
            assignmentCount,
            baseCount,
            futureCount,
            byShift,
        };
    }, [employees, viewDate, resolveCell, defaultShiftId, assignmentsByEmployee, today]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return employees.filter((emp) => {
            const cell = viewDate ? resolveCell(emp, viewDate) : null;
            const effectiveShiftId = cell?.shiftId ?? emp.shiftId ?? defaultShiftId ?? "none";
            const isAssignment = cell?.source === "assignment";

            if (filterSource !== "all" && effectiveShiftId !== filterSource) return false;
            if (filterOrigin === "assignment" && !isAssignment) return false;
            if (filterOrigin === "base" && isAssignment) return false;
            if (filterDepartment !== "all" && normalizeDepartment(emp.department) !== filterDepartment) return false;
            if (!q) return true;
            return (
                emp.name.toLowerCase().includes(q) ||
                emp.employeeId.toLowerCase().includes(q) ||
                normalizeDepartment(emp.department).toLowerCase().includes(q)
            );
        });
    }, [employees, search, filterSource, filterOrigin, filterDepartment, viewDate, resolveCell, defaultShiftId]);

    const allFilteredSelected = useMemo(
        () => filtered.length > 0 && filtered.every((emp) => selected.has(emp.employeeId)),
        [filtered, selected],
    );

    const toggleOne = (employeeId: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(employeeId)) next.delete(employeeId);
            else next.add(employeeId);
            return next;
        });
    };

    const toggleAllFiltered = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (allFilteredSelected) {
                for (const emp of filtered) next.delete(emp.employeeId);
            } else {
                for (const emp of filtered) next.add(emp.employeeId);
            }
            return next;
        });
    };

    const selectOnlyBaseShiftOnFilter = () => {
        const next = new Set<string>();
        for (const emp of filtered) {
            const cell = viewDate ? resolveCell(emp, viewDate) : null;
            if (cell?.source !== "assignment") next.add(emp.employeeId);
        }
        setSelected(next);
    };

    const dateRangeInvalid = Boolean(uiEffectiveTo && effectiveFrom && uiEffectiveTo < effectiveFrom);

    const durationDays = useMemo(() => {
        if (!effectiveFrom || !uiEffectiveTo || !isValidCalendarDate(effectiveFrom) || !isValidCalendarDate(uiEffectiveTo)) {
            return null;
        }
        if (uiEffectiveTo < effectiveFrom) return null;
        const startMs = toUTCDateKey(effectiveFrom).getTime();
        const endMs = toUTCDateKey(uiEffectiveTo).getTime();
        return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
    }, [effectiveFrom, uiEffectiveTo]);

    const applyPeriodPreset = (mode: "single" | "sixDays" | "sevenDays" | "twoWeeks" | "open") => {
        const start = isValidCalendarDate(effectiveFrom)
            ? effectiveFrom
            : isValidCalendarDate(viewDate)
              ? viewDate
              : today || toWIBDateString();
        if (!isValidCalendarDate(effectiveFrom)) {
            setEffectiveFrom(start);
        }
        if (mode === "single") setUiEffectiveTo(start);
        else if (mode === "sixDays") setUiEffectiveTo(addCalendarDays(start, 5));
        else if (mode === "sevenDays") setUiEffectiveTo(addCalendarDays(start, 6));
        else if (mode === "twoWeeks") setUiEffectiveTo(addCalendarDays(start, 13));
        else setUiEffectiveTo("");
    };

    // Debounced Server-side Dry-Run Preview
    useEffect(() => {
        if (
            selected.size === 0 ||
            !targetShiftId ||
            !isValidCalendarDate(effectiveFrom) ||
            dateRangeInvalid ||
            (uiEffectiveTo && !isValidCalendarDate(uiEffectiveTo))
        ) {
            setDryRunPlan(null);
            setLoadingDryRun(false);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setLoadingDryRun(true);
            try {
                const exclusiveEffectiveTo = uiEffectiveTo ? addCalendarDays(uiEffectiveTo, 1) : null;
                const assignments = Array.from(selected).map((employeeId) => ({
                    employeeId,
                    shiftId: targetShiftId,
                    effectiveFrom,
                    effectiveTo: exclusiveEffectiveTo,
                }));
                const res = await fetch("/api/shifts/assignments", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ assignments, replaceFuture, dryRun: true }),
                    signal: controller.signal,
                });
                if (!res.ok) {
                    setDryRunPlan(null);
                    return;
                }
                const data = (await res.json()) as DryRunOutcome;
                if (data && Array.isArray(data.plan)) {
                    setDryRunPlan(data);
                }
            } catch {
                // Ignore abort / network errors on preview
            } finally {
                if (!controller.signal.aborted) setLoadingDryRun(false);
            }
        }, 180);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [selected, targetShiftId, effectiveFrom, uiEffectiveTo, replaceFuture, dateRangeInvalid]);

    const dryRunSummary = useMemo(() => {
        if (!dryRunPlan) return null;
        let cleanCount = 0;
        let truncateCount = 0;
        let splitCount = 0;
        let replaceCount = 0;
        let futureConflictCount = 0;
        let historyConflictCount = 0;

        for (const item of dryRunPlan.plan) {
            if (item.conflicts.length > 0) {
                for (const c of item.conflicts) {
                    if (c.reason === "FUTURE") futureConflictCount++;
                    else historyConflictCount++;
                }
            } else if (item.actions.length === 0) {
                cleanCount++;
            } else {
                if (item.actions.some((a) => a.type === "split")) splitCount++;
                else if (item.actions.some((a) => a.type === "truncate")) truncateCount++;
                if (item.actions.some((a) => a.type === "replace" || a.type === "trimStart")) replaceCount++;
            }
        }
        return {
            cleanCount,
            truncateCount,
            splitCount,
            replaceCount,
            futureConflictCount,
            historyConflictCount,
            totalConflicts: dryRunPlan.conflicts.length,
        };
    }, [dryRunPlan]);

    const executeAssign = async () => {
        setSubmitting(true);
        setActionError("");
        setActionResult(null);
        const exclusiveEffectiveTo = uiEffectiveTo ? addCalendarDays(uiEffectiveTo, 1) : null;
        try {
            const assignments = Array.from(selected).map((employeeId) => ({
                employeeId,
                shiftId: targetShiftId,
                effectiveFrom,
                effectiveTo: exclusiveEffectiveTo,
            }));
            const res = await fetch("/api/shifts/assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignments, replaceFuture }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan jadwal shift."));
            }
            const data = await res.json();
            const targetName = shiftNameOf(targetShiftId);
            const appliedCount = data.applied ?? assignments.length;
            const successMsg = `Roster tersimpan: ${appliedCount} karyawan ke ${targetName}.`;
            setActionResult({
                success: appliedCount,
                message: successMsg,
                type: "success",
            });
            toast(successMsg, "success");
            setSelected(new Set());
            const activeViewDate = viewDateRef.current;
            if (!activeViewDate) {
                handleViewDateChange(effectiveFrom);
            } else {
                await loadTimeline(activeViewDate, rangeDaysRef.current);
            }
        } catch (error) {
            reportClientError("ShiftRosterPage.handleAssign", "Gagal menetapkan shift roster", error);
            const message = error instanceof Error ? error.message : "Gagal menyimpan jadwal shift.";
            setActionError(message);
            toast(message, "error");
        } finally {
            setSubmitting(false);
        }
    };

    const handleAssignSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selected.size === 0 || !targetShiftId || !effectiveFrom || dateRangeInvalid) return;

        const targetName = shiftNameOf(targetShiftId);
        const periodLabel = uiEffectiveTo
            ? `${formatWIBShort(effectiveFrom)} s.d. ${formatWIBShort(uiEffectiveTo)} (${durationDays ?? 1} hari, inklusif)`
            : `mulai ${formatWIBShort(effectiveFrom)} (berlaku seterusnya)`;

        const warningNotes: string[] = [];
        if (dryRunSummary) {
            if (dryRunSummary.splitCount > 0) {
                warningNotes.push(`${dryRunSummary.splitCount} jadwal berjalan akan dibelah dan otomatis dilanjutkan setelah periode ini selesai.`);
            }
            if (dryRunSummary.truncateCount > 0) {
                warningNotes.push(`${dryRunSummary.truncateCount} jadwal berjalan sebelumnya akan dipotong pada ${formatWIBShort(addCalendarDays(effectiveFrom, -1))}.`);
            }
            if (dryRunSummary.replaceCount > 0) {
                warningNotes.push(`${dryRunSummary.replaceCount} jadwal masa depan akan ditimpa/dipangkas.`);
            }
        }

        confirm({
            title: "Konfirmasi Penetapan Roster Shift",
            message: [
                `Tetapkan "${targetName}" untuk ${selected.size} karyawan terpilih (${periodLabel})?`,
                ...warningNotes,
            ].join(" "),
            confirmLabel: `Ya, Tetapkan (${selected.size} Karyawan)`,
            variant: warningNotes.length > 0 ? "warning" : "info",
            onConfirm: executeAssign,
        });
    };

    const handleCancelAssignment = (employeeId: string, assignmentFrom: string, employeeName: string) => {
        const assignmentKey = `${employeeId}:${assignmentFrom}`;
        const isToday = Boolean(today && assignmentFrom === today);
        const labelKind = isToday ? "jadwal hari ini" : "jadwal masa depan";

        confirm({
            title: "Batalkan Jadwal Roster",
            message: `Batalkan ${labelKind} ${employeeName} yang berlaku mulai ${formatWIBShort(assignmentFrom)}? Jadwal sebelumnya (bila ada) akan otomatis disambungkan kembali.`,
            confirmLabel: "Ya, Batalkan Jadwal",
            variant: "danger",
            onConfirm: async () => {
                setCancellingAssignment(assignmentKey);
                setActionError("");
                setActionResult(null);
                try {
                    const res = await fetch("/api/shifts/assignments", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ employeeId, effectiveFrom: assignmentFrom }),
                    });
                    if (!res.ok) {
                        throw new Error(await getResponseErrorMessage(res, "Gagal membatalkan jadwal masa depan."));
                    }
                    const msg = `Jadwal masa depan ${employeeName} dibatalkan.`;
                    toast(msg, "success");
                    setActionResult({
                        success: 1,
                        message: msg,
                        type: "info",
                    });
                    if (viewDateRef.current) {
                        await loadTimeline(viewDateRef.current, rangeDaysRef.current);
                    }
                } catch (error) {
                    reportClientError("ShiftRosterPage.handleCancelAssignment", "Gagal membatalkan roster", error);
                    const message = error instanceof Error ? error.message : "Gagal membatalkan jadwal masa depan.";
                    setActionError(message);
                    toast(message, "error");
                } finally {
                    setCancellingAssignment((current) => (current === assignmentKey ? "" : current));
                }
            },
        });
    };

    const handleUpdateAssignmentEnd = async (asg: RosterTimelineAssignment, employeeName: string) => {
        const exclusiveNewEnd = editOpenEnded ? null : editUiEndDate ? addCalendarDays(editUiEndDate, 1) : null;
        if (!editOpenEnded && !isValidCalendarDate(editUiEndDate)) {
            toast("Pilih tanggal hari terakhir yang valid atau centang Tanpa Batas Akhir.", "error");
            return;
        }
        setUpdatingEndId(asg.id);
        setActionError("");
        try {
            const res = await fetch("/api/shifts/assignments", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeId: asg.employeeId,
                    effectiveFrom: asg.effectiveFrom,
                    effectiveTo: exclusiveNewEnd,
                }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memperbarui tanggal akhir jadwal."));
            }
            const endLabel = editOpenEnded ? "tanpa batas akhir" : `s.d. ${formatWIBShort(editUiEndDate)} (inklusif)`;
            const msg = `Tanggal akhir jadwal ${employeeName} diperbarui (${endLabel}).`;
            toast(msg, "success");
            setActionResult({ success: 1, message: msg, type: "success" });
            setEditingAssignmentId(null);
            if (viewDateRef.current) {
                await loadTimeline(viewDateRef.current, rangeDaysRef.current);
            }
        } catch (error) {
            reportClientError("ShiftRosterPage.handleUpdateAssignmentEnd", "Gagal mengubah akhir roster", error);
            const message = error instanceof Error ? error.message : "Gagal memperbarui tanggal akhir jadwal.";
            setActionError(message);
            toast(message, "error");
        } finally {
            setUpdatingEndId("");
        }
    };

    // Selected employees' cancellable assignments (effectiveFrom >= today)
    const selectedCancellableAssignments = useMemo(() => {
        const refToday = today || toWIBDateString();
        const items: Array<{
            employeeId: string;
            employeeName: string;
            shiftName: string;
            effectiveFrom: string;
            effectiveTo: string | null;
        }> = [];
        for (const empId of selected) {
            const emp = employees.find((e) => e.employeeId === empId);
            if (!emp) continue;
            const list = assignmentsByEmployee.get(empId) ?? [];
            for (const asg of list) {
                if (asg.effectiveFrom >= refToday) {
                    items.push({
                        employeeId: empId,
                        employeeName: emp.name,
                        shiftName: shiftNameOf(asg.shiftId),
                        effectiveFrom: asg.effectiveFrom,
                        effectiveTo: asg.effectiveTo,
                    });
                }
            }
        }
        return items;
    }, [selected, employees, assignmentsByEmployee, today, shiftNameOf]);

    const detailEmployee = useMemo(
        () => (detailEmployeeId ? employees.find((e) => e.employeeId === detailEmployeeId) ?? null : null),
        [detailEmployeeId, employees],
    );

    const detailAssignments = useMemo(
        () => (detailEmployeeId ? assignmentsByEmployee.get(detailEmployeeId) ?? [] : []),
        [detailEmployeeId, assignmentsByEmployee],
    );

    const targetShift = useMemo(
        () => shifts.find((s) => s.id === targetShiftId) ?? null,
        [shifts, targetShiftId],
    );

    const controlsDisabled = loading || submitting || Boolean(cancellingAssignment) || Boolean(updatingEndId);
    const referenceToday = today || viewDate || toWIBDateString();

    return (
        <div className="space-y-5 animate-[fadeIn_0.3s_ease]">
            {/* ─── Header & Navigasi Timeline ─────────────────────────────────── */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <CalendarClock className="w-5 h-5 text-[var(--primary)]" />
                        Roster Shift Mingguan & Rotasi
                    </h1>
                    <p className="text-xs text-[var(--text-muted)] mt-1 max-w-2xl">
                        Pantau matriks shift kerja karyawan lintas hari, tetapkan rotasi sementara atau permanen dengan pratinjau bentrok otomatis, serta ubah tanggal akhir atau batalkan jadwal kapan saja.
                    </p>
                </div>

                {/* Date Navigator Card */}
                <div className="card p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-[var(--secondary)]/40 border border-[var(--border)]">
                    <div className="flex flex-col">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <label
                                htmlFor="roster-view-date"
                                className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1"
                            >
                                <Calendar className="w-3 h-3 text-[var(--primary)]" />
                                Tanggal Lihat Roster
                            </label>
                            <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5 text-[11px]">
                                <button
                                    type="button"
                                    disabled={controlsDisabled}
                                    onClick={() => handleRangeDaysChange(7)}
                                    className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                                        rangeDays === 7
                                            ? "bg-[var(--primary)] text-white"
                                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    }`}
                                >
                                    7 Hari
                                </button>
                                <button
                                    type="button"
                                    disabled={controlsDisabled}
                                    onClick={() => handleRangeDaysChange(14)}
                                    className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                                        rangeDays === 14
                                            ? "bg-[var(--primary)] text-white"
                                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    }`}
                                >
                                    14 Hari
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                                type="button"
                                disabled={controlsDisabled || !isValidCalendarDate(viewDate)}
                                onClick={() => handleViewDateChange(addCalendarDays(viewDate, -rangeDays))}
                                className="btn btn-secondary btn-sm !px-2 !py-1.5 text-xs"
                                title={`Mundur ${rangeDays} hari`}
                            >
                                -{rangeDays}h
                            </button>
                            <button
                                type="button"
                                disabled={controlsDisabled || !isValidCalendarDate(viewDate)}
                                onClick={() => handleViewDateChange(addCalendarDays(viewDate, -1))}
                                className="btn btn-secondary btn-sm !px-2 !py-1.5"
                                title="Hari Sebelumnya"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <input
                                id="roster-view-date"
                                type="date"
                                className="form-input !w-40 !py-1.5 text-xs font-semibold"
                                value={viewDate}
                                disabled={controlsDisabled}
                                onChange={(e) => handleViewDateChange(e.target.value)}
                            />
                            <button
                                type="button"
                                disabled={controlsDisabled || !isValidCalendarDate(viewDate)}
                                onClick={() => handleViewDateChange(addCalendarDays(viewDate, 1))}
                                className="btn btn-secondary btn-sm !px-2 !py-1.5"
                                title="Hari Berikutnya"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                disabled={controlsDisabled || !isValidCalendarDate(viewDate)}
                                onClick={() => handleViewDateChange(addCalendarDays(viewDate, rangeDays))}
                                className="btn btn-secondary btn-sm !px-2 !py-1.5 text-xs"
                                title={`Maju ${rangeDays} hari`}
                            >
                                +{rangeDays}h
                            </button>
                            <button
                                type="button"
                                disabled={controlsDisabled}
                                onClick={() => handleViewDateChange(today || toWIBDateString())}
                                className="btn btn-secondary btn-sm text-xs"
                            >
                                Hari Ini
                            </button>
                            <button
                                type="button"
                                disabled={controlsDisabled}
                                onClick={() => handleViewDateChange(getMondayOfWIBWeek(referenceToday, 0))}
                                className="btn btn-secondary btn-sm text-xs"
                                title="Lompat ke Senin minggu ini"
                            >
                                Senin Ini
                            </button>
                            <button
                                type="button"
                                disabled={controlsDisabled}
                                onClick={() => handleViewDateChange(getMondayOfWIBWeek(referenceToday, 1))}
                                className="btn btn-secondary btn-sm text-xs"
                                title="Lompat ke Senin minggu depan"
                            >
                                Senin Depan
                            </button>
                            {viewDate && (
                                <button
                                    type="button"
                                    disabled={controlsDisabled || loadingRoster}
                                    onClick={() => void loadTimeline(viewDate, rangeDays)}
                                    className="btn btn-ghost btn-sm !px-2 !py-1.5"
                                    title="Muat ulang timeline roster"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${loadingRoster ? "animate-spin text-[var(--primary)]" : ""}`} />
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                            {viewDate ? (
                                <>
                                    <span className="font-semibold text-[var(--text-primary)]">
                                        {formatWIBFullDate(viewDate)}
                                    </span>
                                    {dateColumns.length > 1 && (
                                        <span className="text-[var(--text-muted)]">
                                            s.d. {formatWIBShort(dateColumns[dateColumns.length - 1])}
                                        </span>
                                    )}
                                    {today && viewDate === today && (
                                        <span className="badge badge-success text-[10px] !py-0">Hari Ini</span>
                                    )}
                                    {today && viewDate > today && (
                                        <span className="badge badge-info text-[10px] !py-0">Masa Depan</span>
                                    )}
                                    {today && viewDate < today && (
                                        <span className="badge bg-[var(--secondary)] text-[var(--text-muted)] text-[10px] !py-0">
                                            Riwayat
                                        </span>
                                    )}
                                </>
                            ) : (
                                <span className="text-[var(--text-muted)]">
                                    Pilih tanggal untuk melihat jadwal karyawan.
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Feedback & Alerts ───────────────────────────────────────────── */}
            {loadError && <FeedbackMessage variant="error">{loadError}</FeedbackMessage>}
            {actionError && <FeedbackMessage variant="error">{actionError}</FeedbackMessage>}
            {actionResult && !actionError && (
                <FeedbackMessage variant={actionResult.type === "success" ? "success" : "info"} role="alert">
                    {actionResult.message}
                </FeedbackMessage>
            )}
            {rosterError && (
                <FeedbackMessage variant="warning">
                    Timeline roster tidak dapat dimuat ({rosterError}). Tabel di bawah memakai shift dasar karyawan sebagai fallback — periksa koneksi lalu muat ulang.
                </FeedbackMessage>
            )}

            {/* ─── KPI & Distribusi Shift pada Tanggal Fokus ──────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                    type="button"
                    disabled={controlsDisabled}
                    onClick={() => {
                        setFilterOrigin("all");
                        setFilterSource("all");
                    }}
                    className={`card p-3.5 text-left transition-all border ${
                        filterOrigin === "all" && filterSource === "all"
                            ? "border-[var(--primary)] ring-1 ring-[var(--primary)]/20"
                            : "hover:border-[var(--primary)]/40"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">Total Karyawan Aktif</span>
                        <Users className="w-4 h-4 text-[var(--primary)]" />
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{rosterStats.total}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {selected.size > 0 ? `${selected.size} karyawan sedang dipilih` : "Klik baris untuk memilih karyawan"}
                    </p>
                </button>

                <button
                    type="button"
                    disabled={controlsDisabled}
                    onClick={() => setFilterOrigin((prev) => (prev === "assignment" ? "all" : "assignment"))}
                    className={`card p-3.5 text-left transition-all border ${
                        filterOrigin === "assignment"
                            ? "border-sky-500 ring-1 ring-sky-500/20 bg-sky-500/5"
                            : "hover:border-sky-500/40"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">Terjadwal Roster</span>
                        <span className="badge badge-info text-[10px]">Roster</span>
                    </div>
                    <p className="text-2xl font-bold text-sky-700 dark:text-sky-400 mt-1">
                        {rosterStats.assignmentCount}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {viewDate ? `Aktif pada ${formatWIBShort(viewDate)}` : "Penugasan bertanggal"}
                    </p>
                </button>

                <button
                    type="button"
                    disabled={controlsDisabled}
                    onClick={() => setFilterOrigin((prev) => (prev === "base" ? "all" : "base"))}
                    className={`card p-3.5 text-left transition-all border ${
                        filterOrigin === "base"
                            ? "border-amber-500 ring-1 ring-amber-500/20 bg-amber-500/5"
                            : "hover:border-amber-500/40"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">Shift Dasar / Default</span>
                        <span className="badge badge-warning text-[10px]">Dasar</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">
                        {rosterStats.baseCount}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        Mengikuti profil dasar karyawan
                    </p>
                </button>

                <div className="card p-3.5 border">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">Master Shift Aktif</span>
                        <Layers className="w-4 h-4 text-[var(--primary)]" />
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{shifts.length}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {rosterStats.futureCount > 0
                            ? `${rosterStats.futureCount} karyawan punya jadwal aktif/mendatang`
                            : "Siap dipilih untuk rotasi"}
                    </p>
                </div>
            </div>

            {/* ─── Distribusi Per Shift (Quick Filter Strip) ───────────────────── */}
            {shifts.length > 0 && (
                <div className="card p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
                        <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-[var(--primary)]" />
                            Distribusi & Legenda Shift {viewDate ? `(Fokus: ${formatWIBShort(viewDate)})` : ""}
                        </span>
                        <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                            <span className="inline-flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-sm bg-sky-500/30 border border-sky-500/60" />
                                Kotak Solid = <strong>Roster</strong>
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <span className="w-2.5 h-2.5 rounded-sm bg-slate-500/10 border border-dashed border-slate-400" />
                                Garis Putus = <strong>Dasar / Default</strong>
                            </span>
                            {filterSource !== "all" && (
                                <button
                                    type="button"
                                    disabled={controlsDisabled}
                                    onClick={() => setFilterSource("all")}
                                    className="text-[11px] font-semibold text-[var(--primary)] hover:underline flex items-center gap-1"
                                >
                                    <RotateCcw className="w-3 h-3" /> Tampilkan Semua Shift
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                        {shifts.map((s) => {
                            const count = rosterStats.byShift[s.id] ?? 0;
                            const isFiltered = filterSource === s.id;
                            const palette = shiftPaletteById.get(s.id) ?? SHIFT_PALETTES[0];
                            const daySchedule =
                                viewedWeekday !== null ? s.days.find((d) => d.dayOfWeek === viewedWeekday) : null;
                            const hoursLabel = daySchedule
                                ? daySchedule.isOff
                                    ? "Libur terjadwal"
                                    : `${daySchedule.startTime} – ${daySchedule.endTime}`
                                : getShiftPrimaryHours(s);

                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    disabled={controlsDisabled}
                                    onClick={() => setFilterSource((prev) => (prev === s.id ? "all" : s.id))}
                                    className={`rounded-xl border p-2.5 text-left transition-all flex items-center justify-between gap-2 ${
                                        isFiltered
                                            ? "border-[var(--primary)] bg-[var(--primary)]/10 shadow-sm"
                                            : "border-[var(--border)] bg-[var(--secondary)]/30 hover:bg-[var(--secondary)]/70"
                                    }`}
                                >
                                    <div className="min-w-0 flex items-start gap-2">
                                        <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${palette.dot}`} />
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                                                {s.name}
                                            </p>
                                            <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                                                {hoursLabel}
                                            </p>
                                        </div>
                                    </div>
                                    <span
                                        className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                                            isFiltered
                                                ? "bg-[var(--primary)] text-white"
                                                : "bg-[var(--card)] text-[var(--text-primary)] border border-[var(--border)]"
                                        }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ─── Main Split View: Matriks Timeline (Kiri) + Panel Penugasan (Kanan) ─ */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* ─── Kolom Kiri: Matriks Timeline Karyawan (8 cols) ───────────── */}
                <div className="xl:col-span-8 card p-4 space-y-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <span>Matriks Jadwal Karyawan ({filtered.length})</span>
                                {loadingRoster && (
                                    <span className="inline-flex items-center gap-1 text-xs font-normal text-[var(--text-muted)]">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                                        Memuat...
                                    </span>
                                )}
                            </h2>
                            <p className="text-[11px] text-[var(--text-muted)]">
                                Klik baris untuk memilih karyawan ke penugasan, atau klik tombol <strong>Kelola</strong> pada karyawan untuk mengubah tanggal akhir / membatalkan jadwalnya.
                            </p>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                                type="button"
                                onClick={toggleAllFiltered}
                                disabled={controlsDisabled || filtered.length === 0}
                                className="btn btn-secondary btn-sm text-xs"
                            >
                                {allFilteredSelected ? (
                                    <CheckSquare className="w-3.5 h-3.5" />
                                ) : (
                                    <Square className="w-3.5 h-3.5" />
                                )}
                                {allFilteredSelected ? "Batal Pilih Filter" : `Pilih Semua (${filtered.length})`}
                            </button>
                            <button
                                type="button"
                                onClick={selectOnlyBaseShiftOnFilter}
                                disabled={controlsDisabled || filtered.length === 0}
                                className="btn btn-secondary btn-sm text-xs"
                                title="Pilih karyawan pada daftar ini yang belum punya penugasan roster di tanggal fokus"
                            >
                                Pilih yang Masih Shift Dasar
                            </button>
                            {selected.size > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setSelected(new Set())}
                                    disabled={controlsDisabled}
                                    className="btn btn-ghost btn-sm text-xs text-[var(--danger)]"
                                >
                                    Reset ({selected.size})
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filter Bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="relative sm:col-span-5">
                            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                id="roster-search"
                                type="text"
                                className="form-input !pl-9 text-xs"
                                placeholder="Cari NIP atau nama..."
                                aria-label="Cari NIP atau nama karyawan"
                                value={search}
                                disabled={controlsDisabled}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            {search && (
                                <button
                                    type="button"
                                    disabled={controlsDisabled}
                                    onClick={() => setSearch("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                    aria-label="Hapus pencarian"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <div className="sm:col-span-4">
                            <select
                                id="roster-filter-shift"
                                className="form-select text-xs"
                                aria-label="Filter berdasarkan shift efektif"
                                value={filterSource}
                                disabled={controlsDisabled}
                                onChange={(e) => setFilterSource(e.target.value)}
                            >
                                <option value="all">Semua Shift Efektif</option>
                                {shifts.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} ({rosterStats.byShift[s.id] ?? 0})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="sm:col-span-3">
                            <select
                                id="roster-filter-dept"
                                className="form-select text-xs"
                                aria-label="Filter berdasarkan departemen"
                                value={filterDepartment}
                                disabled={controlsDisabled}
                                onChange={(e) => setFilterDepartment(e.target.value)}
                            >
                                <option value="all">Semua Departemen</option>
                                {departments.map((dept) => (
                                    <option key={dept} value={dept}>
                                        {dept}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Active Filter Chips */}
                    {(filterOrigin !== "all" || filterSource !== "all" || filterDepartment !== "all" || search) && (
                        <div className="flex items-center gap-1.5 flex-wrap text-xs pt-0.5">
                            <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                                <Filter className="w-3 h-3" /> Filter aktif:
                            </span>
                            {filterOrigin !== "all" && (
                                <span className="badge badge-info gap-1">
                                    Sumber: {filterOrigin === "assignment" ? "Jadwal Roster" : "Shift Dasar"}
                                    <button
                                        type="button"
                                        onClick={() => setFilterOrigin("all")}
                                        className="hover:opacity-75"
                                        aria-label="Hapus filter sumber"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            )}
                            {filterSource !== "all" && (
                                <span className="badge badge-primary gap-1">
                                    Shift: {shiftNameOf(filterSource)}
                                    <button
                                        type="button"
                                        onClick={() => setFilterSource("all")}
                                        className="hover:opacity-75"
                                        aria-label="Hapus filter shift"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            )}
                            {filterDepartment !== "all" && (
                                <span className="badge bg-[var(--secondary)] text-[var(--text-primary)] gap-1">
                                    Dept: {filterDepartment}
                                    <button
                                        type="button"
                                        onClick={() => setFilterDepartment("all")}
                                        className="hover:opacity-75"
                                        aria-label="Hapus filter departemen"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setSearch("");
                                    setFilterOrigin("all");
                                    setFilterSource("all");
                                    setFilterDepartment("all");
                                }}
                                className="text-[11px] font-semibold text-[var(--primary)] hover:underline ml-1"
                            >
                                Reset semua
                            </button>
                        </div>
                    )}

                    {/* Timeline Grid Table */}
                    {loading ? (
                        <div className="flex items-center justify-center py-14 text-sm text-[var(--text-muted)]">
                            <Loader2 className="w-5 h-5 animate-spin mr-2 text-[var(--primary)]" /> Memuat matriks karyawan & jadwal...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-12 px-4 border border-dashed border-[var(--border)] rounded-xl">
                            <p className="text-sm font-semibold text-[var(--text-secondary)]">
                                Tidak ada karyawan yang cocok dengan filter.
                            </p>
                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                Coba ubah kata kunci pencarian atau tampilkan semua filter shift.
                            </p>
                        </div>
                    ) : (
                        <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                            <div className="max-h-[600px] overflow-auto">
                            <Table className="min-w-[780px]">
                                <TableHeader className="sticky top-0 z-20 bg-[var(--card)] shadow-sm">
                                    <TableRow>
                                        <TableHead className="w-10 text-center">
                                            <input
                                                type="checkbox"
                                                aria-label="Pilih semua karyawan hasil filter"
                                                checked={allFilteredSelected}
                                                disabled={controlsDisabled || filtered.length === 0}
                                                onChange={toggleAllFiltered}
                                                className="rounded border-[var(--border)]"
                                            />
                                        </TableHead>
                                        <TableHead className="min-w-[210px]">Karyawan & Shift Dasar</TableHead>
                                        {dateColumns.map((colDate) => {
                                            const weekday = toUTCDateKey(colDate).getUTCDay();
                                            const isSunday = weekday === 0;
                                            const isTodayCol = Boolean(today && colDate === today);
                                            const isFocusCol = colDate === viewDate;
                                            const inTargetPeriod = Boolean(
                                                effectiveFrom &&
                                                    isValidCalendarDate(effectiveFrom) &&
                                                    colDate >= effectiveFrom &&
                                                    (!uiEffectiveTo || colDate <= uiEffectiveTo),
                                            );

                                            return (
                                                <TableHead
                                                    key={colDate}
                                                    className={`text-center min-w-[92px] !px-1.5 !py-2 transition-colors ${
                                                        isTodayCol
                                                            ? "bg-emerald-500/10"
                                                            : isFocusCol
                                                              ? "bg-[var(--primary)]/10"
                                                              : inTargetPeriod
                                                                ? "bg-sky-500/5"
                                                                : ""
                                                    }`}
                                                >
                                                    <button
                                                        type="button"
                                                        disabled={controlsDisabled}
                                                        onClick={() => {
                                                            setEffectiveFrom(colDate);
                                                        }}
                                                        title={`Klik untuk menjadikan ${formatWIBFullDate(colDate)} sebagai Tanggal Mulai Penugasan`}
                                                        className="w-full flex flex-col items-center gap-0.5 group"
                                                    >
                                                        <span
                                                            className={`text-[10px] font-bold uppercase ${
                                                                isSunday
                                                                    ? "text-rose-600 dark:text-rose-400"
                                                                    : "text-[var(--text-muted)]"
                                                            }`}
                                                        >
                                                            {formatWIBDayShort(colDate)}
                                                        </span>
                                                        <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--primary)]">
                                                            {formatWIBShort(colDate)}
                                                        </span>
                                                        {isTodayCol && (
                                                            <span className="text-[9px] font-bold px-1.5 py-0 rounded-full bg-emerald-500 text-white">
                                                                Hari Ini
                                                            </span>
                                                        )}
                                                    </button>
                                                </TableHead>
                                            );
                                        })}
                                        <TableHead className="text-right min-w-[90px]">Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.map((emp) => {
                                        const isChecked = selected.has(emp.employeeId);
                                        const focusCell = viewDate
                                            ? resolveCell(emp, viewDate)
                                            : {
                                                  date: "",
                                                  shiftId: emp.shiftId ?? defaultShiftId,
                                                  source: "fallback" as ShiftSource,
                                                  assignmentId: null,
                                              };
                                        const focusShiftName = shiftNameOf(focusCell.shiftId);
                                        const focusAssignment = focusCell.assignmentId
                                            ? assignmentsById.get(focusCell.assignmentId) ?? null
                                            : null;
                                        const empAssignments = assignmentsByEmployee.get(emp.employeeId) ?? [];
                                        const dept = normalizeDepartment(emp.department);
                                        const isRunningOnFocus = Boolean(
                                            focusCell.source === "assignment" &&
                                                focusAssignment &&
                                                today &&
                                                focusAssignment.effectiveFrom <= today,
                                        );

                                        return (
                                            <TableRow
                                                key={emp.employeeId}
                                                className={`transition-colors ${
                                                    isChecked
                                                        ? "bg-[var(--primary)]/10 hover:bg-[var(--primary)]/15"
                                                        : "hover:bg-[var(--secondary)]/60"
                                                }`}
                                            >
                                                <TableCell className="text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        disabled={controlsDisabled}
                                                        onChange={() => toggleOne(emp.employeeId)}
                                                        aria-label={`Pilih ${emp.name}`}
                                                        className="rounded border-[var(--border)]"
                                                    />
                                                </TableCell>

                                                <TableCell>
                                                    <button
                                                        type="button"
                                                        disabled={controlsDisabled}
                                                        aria-label={`${emp.name} (${emp.employeeId}) - ${focusShiftName}`}
                                                        onClick={() => toggleOne(emp.employeeId)}
                                                        className="w-full text-left"
                                                    >
                                                        <div className="font-semibold text-xs text-[var(--text-primary)] flex items-center gap-1.5 flex-wrap">
                                                            <span>{emp.name}</span>
                                                            {isRunningOnFocus && (
                                                                <span className="badge badge-success text-[9px] !py-0">
                                                                    Jadwal Berjalan
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 flex-wrap mt-0.5">
                                                            <span className="font-mono">{emp.employeeId}</span>
                                                            {dept && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span>{dept}</span>
                                                                </>
                                                            )}
                                                            <span>•</span>
                                                            <span>Dasar: {shiftNameOf(emp.shiftId ?? defaultShiftId)}</span>
                                                        </div>
                                                    </button>
                                                </TableCell>

                                                {dateColumns.map((colDate) => {
                                                    const cell = resolveCell(emp, colDate);
                                                    const shift = cell.shiftId ? shiftById.get(cell.shiftId) ?? null : null;
                                                    const weekday = toUTCDateKey(colDate).getUTCDay();
                                                    const daySchedule = shift?.days.find((d) => d.dayOfWeek === weekday) ?? null;
                                                    const isOff = daySchedule ? daySchedule.isOff : weekday === 0;
                                                    const palette =
                                                        (cell.shiftId ? shiftPaletteById.get(cell.shiftId) : null) ??
                                                        SHIFT_PALETTES[0];
                                                    const asg = cell.assignmentId ? assignmentsById.get(cell.assignmentId) : null;
                                                    const isTodayCol = Boolean(today && colDate === today);

                                                    return (
                                                        <TableCell
                                                            key={colDate}
                                                            className={`!p-1.5 text-center align-middle ${
                                                                isTodayCol ? "bg-emerald-500/5" : ""
                                                            }`}
                                                        >
                                                            <button
                                                                type="button"
                                                                disabled={controlsDisabled}
                                                                onClick={() => toggleOne(emp.employeeId)}
                                                                title={
                                                                    asg
                                                                        ? `${shift?.name ?? "Shift"} (${sourceBadgeLabel(cell.source)}: ${formatAssignmentInterval(asg.effectiveFrom, asg.effectiveTo)})`
                                                                        : `${shift?.name ?? "Belum ada"} (${sourceBadgeLabel(cell.source)})`
                                                                }
                                                                className={`w-full rounded-lg border px-1.5 py-1 text-left transition-all flex flex-col gap-0.5 ${
                                                                    isOff
                                                                        ? "bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-300"
                                                                        : cell.source === "assignment"
                                                                          ? palette.solid
                                                                          : palette.muted
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between gap-1">
                                                                    <span className="text-[10px] font-bold truncate">
                                                                        {shift ? shift.name : "Kosong"}
                                                                    </span>
                                                                    <span className="text-[9px] font-semibold opacity-75 shrink-0">
                                                                        {cell.source === "assignment" ? "R" : "D"}
                                                                    </span>
                                                                </div>
                                                                <span className="text-[10px] opacity-85 truncate">
                                                                    {isOff
                                                                        ? "Libur"
                                                                        : daySchedule
                                                                          ? `${daySchedule.startTime}-${daySchedule.endTime}`
                                                                          : getShiftPrimaryHours(shift)}
                                                                </span>
                                                            </button>
                                                        </TableCell>
                                                    );
                                                })}

                                                <TableCell className="text-right">
                                                    <button
                                                        type="button"
                                                        disabled={controlsDisabled}
                                                        onClick={() => {
                                                            setDetailEmployeeId(emp.employeeId);
                                                            setEditingAssignmentId(null);
                                                        }}
                                                        aria-label={`Kelola jadwal ${emp.name}`}
                                                        className="btn btn-secondary btn-sm !px-2 !py-1 text-[11px]"
                                                    >
                                                        Kelola
                                                        {empAssignments.length > 0 && (
                                                            <span className="ml-1 px-1.5 py-0 rounded-full bg-[var(--primary)]/15 text-[var(--primary)] font-bold text-[10px]">
                                                                {empAssignments.length}
                                                            </span>
                                                        )}
                                                    </button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                            </div>
                        </div>
                    )}
                </div>

                {/* ─── Kolom Kanan: Panel Penugasan & Pratinjau Server (4 cols) ───── */}
                <form
                    onSubmit={handleAssignSubmit}
                    className="xl:col-span-4 card p-4 space-y-4 xl:sticky xl:top-20 border-t-4 border-t-[var(--primary)]"
                >
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                <Sparkles className="w-4 h-4 text-[var(--primary)]" />
                                Panel Penugasan Roster
                            </h2>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                Simulasi otomatis memeriksa jadwal yang dipotong, dibelah, atau bertabrakan sebelum disimpan.
                            </p>
                        </div>
                        <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                                selected.size > 0
                                    ? "bg-[var(--primary)] text-white"
                                    : "bg-[var(--secondary)] text-[var(--text-muted)]"
                            }`}
                        >
                            {selected.size} dipilih
                        </span>
                    </div>

                    {/* Step 1: Ringkasan Karyawan Terpilih */}
                    <div className="rounded-xl bg-[var(--secondary)]/50 border border-[var(--border)] p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-[var(--text-secondary)]">
                                1. Karyawan Terpilih
                            </span>
                            {selected.size > 0 && (
                                <button
                                    type="button"
                                    disabled={controlsDisabled}
                                    onClick={() => setSelected(new Set())}
                                    className="text-[11px] text-[var(--danger)] hover:underline font-medium"
                                >
                                    Kosongkan
                                </button>
                            )}
                        </div>
                        {selected.size === 0 ? (
                            <p className="text-xs text-[var(--text-muted)]">
                                Belum ada karyawan dipilih. Klik baris pada tabel di sebelah kiri untuk memilih.
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                {Array.from(selected).map((empId) => {
                                    const emp = employees.find((e) => e.employeeId === empId);
                                    return (
                                        <span
                                            key={empId}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--card)] border border-[var(--border)] text-[11px] font-medium text-[var(--text-primary)]"
                                        >
                                            <span className="truncate max-w-[140px]">{emp?.name ?? empId}</span>
                                            <button
                                                type="button"
                                                disabled={controlsDisabled}
                                                onClick={() => toggleOne(empId)}
                                                className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                                                aria-label={`Hapus ${emp?.name ?? empId} dari pilihan`}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Step 2: Periode Berlaku */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-[var(--text-secondary)]">
                                2. Periode Berlaku (WIB)
                            </span>
                            {viewDate && effectiveFrom !== viewDate && (
                                <button
                                    type="button"
                                    disabled={controlsDisabled}
                                    onClick={() => setEffectiveFrom(viewDate)}
                                    className="text-[11px] font-semibold text-[var(--primary)] hover:underline"
                                >
                                    Samakan dengan Tanggal Lihat ({formatWIBShort(viewDate)})
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="form-group !mb-0">
                                <label className="form-label text-xs" htmlFor="roster-date">
                                    Berlaku Mulai Tanggal
                                </label>
                                <input
                                    id="roster-date"
                                    type="date"
                                    className="form-input text-xs"
                                    value={effectiveFrom}
                                    disabled={controlsDisabled}
                                    onChange={(e) => setEffectiveFrom(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label text-xs" htmlFor="roster-date-to">
                                    Hari terakhir (ikut termasuk, opsional)
                                </label>
                                <input
                                    id="roster-date-to"
                                    type="date"
                                    className="form-input text-xs"
                                    min={effectiveFrom || undefined}
                                    value={uiEffectiveTo}
                                    disabled={controlsDisabled}
                                    onChange={(e) => setUiEffectiveTo(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Quick Duration Presets */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] text-[var(--text-muted)] mr-0.5">Preset cepat:</span>
                            <button
                                type="button"
                                disabled={controlsDisabled}
                                onClick={() => applyPeriodPreset("single")}
                                className="px-2 py-0.5 rounded-md border border-[var(--border)] bg-[var(--secondary)]/50 hover:bg-[var(--secondary)] text-[11px] font-medium"
                            >
                                1 Hari
                            </button>
                            <button
                                type="button"
                                disabled={controlsDisabled}
                                onClick={() => applyPeriodPreset("sixDays")}
                                className="px-2 py-0.5 rounded-md border border-[var(--border)] bg-[var(--secondary)]/50 hover:bg-[var(--secondary)] text-[11px] font-medium"
                            >
                                6 Hari (Sen–Sab)
                            </button>
                            <button
                                type="button"
                                disabled={controlsDisabled}
                                onClick={() => applyPeriodPreset("sevenDays")}
                                className="px-2 py-0.5 rounded-md border border-[var(--border)] bg-[var(--secondary)]/50 hover:bg-[var(--secondary)] text-[11px] font-medium"
                            >
                                7 Hari Penuh
                            </button>
                            <button
                                type="button"
                                disabled={controlsDisabled}
                                onClick={() => applyPeriodPreset("twoWeeks")}
                                className="px-2 py-0.5 rounded-md border border-[var(--border)] bg-[var(--secondary)]/50 hover:bg-[var(--secondary)] text-[11px] font-medium"
                            >
                                14 Hari
                            </button>
                            {uiEffectiveTo && (
                                <button
                                    type="button"
                                    disabled={controlsDisabled}
                                    onClick={() => applyPeriodPreset("open")}
                                    className="px-2 py-0.5 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                >
                                    Tanpa Batas Akhir
                                </button>
                            )}
                        </div>

                        {dateRangeInvalid ? (
                            <p className="text-xs text-[var(--danger)] flex items-center gap-1 font-medium">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                Hari terakhir tidak boleh sebelum tanggal mulai.
                            </p>
                        ) : (
                            <div className="rounded-lg bg-[var(--secondary)]/40 px-2.5 py-2 text-[11px] text-[var(--text-secondary)] flex items-start gap-2">
                                <Info className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                                <div>
                                    {uiEffectiveTo && durationDays ? (
                                        <span>
                                            Berlaku <strong>{formatWIBShort(effectiveFrom)}</strong> s.d.{" "}
                                            <strong>{formatWIBShort(uiEffectiveTo)}</strong>{" "}
                                            <span className="font-bold text-[var(--primary)]">
                                                ({durationDays} hari, inklusif)
                                            </span>
                                            .
                                        </span>
                                    ) : effectiveFrom ? (
                                        <span>
                                            Berlaku mulai <strong>{formatWIBShort(effectiveFrom)}</strong> dan{" "}
                                            <strong>terus berjalan (tanpa batas akhir)</strong> hingga ada penugasan berikutnya.
                                        </span>
                                    ) : (
                                        <span>Pilih tanggal mulai berlaku untuk penugasan ini.</span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Step 3: Shift Tujuan */}
                    <div className="space-y-2">
                        <label className="form-label text-xs" htmlFor="roster-shift">
                            Shift Tujuan
                        </label>
                        <select
                            id="roster-shift"
                            className="form-select text-xs font-semibold"
                            value={targetShiftId}
                            disabled={controlsDisabled}
                            onChange={(e) => setTargetShiftId(e.target.value)}
                            required
                        >
                            {shifts.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {shiftLabel(s)}
                                    {s.isDefault ? " — Default" : ""}
                                </option>
                            ))}
                        </select>

                        {targetShift && (
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/30 p-2.5 space-y-1.5">
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-semibold text-[var(--text-primary)]">
                                         Pola Hari Kerja: {targetShift.name}
                                    </span>
                                    {targetShift.isDefault && (
                                        <span className="badge badge-info text-[10px] !py-0">Default</span>
                                    )}
                                </div>
                                <div className="grid grid-cols-7 gap-1 text-center">
                                    {SHORT_DAY_LABELS.map(({ dayOfWeek, label }) => {
                                        const d = targetShift.days.find((day) => day.dayOfWeek === dayOfWeek);
                                        const isOff = !d || d.isOff;
                                        return (
                                            <div
                                                key={dayOfWeek}
                                                className={`rounded-md py-1 px-0.5 border text-[10px] ${
                                                    isOff
                                                        ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
                                                        : "bg-[var(--card)] border-[var(--border)] text-[var(--text-primary)]"
                                                }`}
                                            >
                                                <div className="font-bold">{label}</div>
                                                <div className="text-[9px] truncate mt-0.5">
                                                    {isOff ? "Libur" : `${d.startTime}`}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Step 4: Opsi Timpa & Pratinjau Server (Dry-Run) */}
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/30 p-3 space-y-2.5">
                        <label
                            htmlFor="roster-replace-future"
                            className="flex items-start gap-2 cursor-pointer select-none"
                        >
                            <input
                                id="roster-replace-future"
                                type="checkbox"
                                checked={replaceFuture}
                                disabled={controlsDisabled}
                                onChange={(e) => setReplaceFuture(e.target.checked)}
                                className="mt-0.5 rounded border-[var(--border)]"
                            />
                            <span className="text-xs text-[var(--text-primary)] leading-snug">
                                <strong>Timpa / pangkas jadwal masa depan</strong> yang bertabrakan di dalam periode ini (termasuk koreksi jadwal hari ini).
                            </span>
                        </label>

                        {selected.size > 0 && effectiveFrom && !dateRangeInvalid && (
                            <div className="border-t border-[var(--border)] pt-2.5 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                        Pratinjau Dampak Server
                                    </span>
                                    {loadingDryRun && (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                                            <Loader2 className="w-3 h-3 animate-spin" /> Menghitung...
                                        </span>
                                    )}
                                </div>

                                {dryRunPlan && dryRunSummary && (
                                    <>
                                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                                            {dryRunSummary.cleanCount > 0 && (
                                                <span className="badge badge-success">
                                                    {dryRunSummary.cleanCount} siap ditetapkan
                                                </span>
                                            )}
                                            {dryRunSummary.truncateCount > 0 && (
                                                <span className="badge badge-info">
                                                    {dryRunSummary.truncateCount} potong jadwal berjalan
                                                </span>
                                            )}
                                            {dryRunSummary.splitCount > 0 && (
                                                <span className="badge badge-info">
                                                    <Scissors className="w-3 h-3 mr-0.5" />
                                                    {dryRunSummary.splitCount} belah & sambung kembali
                                                </span>
                                            )}
                                            {dryRunSummary.replaceCount > 0 && (
                                                <span className="badge badge-warning">
                                                    {dryRunSummary.replaceCount} jadwal diganti/dipangkas
                                                </span>
                                            )}
                                            {dryRunSummary.totalConflicts > 0 && (
                                                <span className="badge badge-error">
                                                    {dryRunSummary.totalConflicts} bentrok
                                                </span>
                                            )}
                                        </div>

                                        {dryRunSummary.futureConflictCount > 0 && !replaceFuture && (
                                            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-300 space-y-1.5">
                                                <p>
                                                    Ada <strong>{dryRunSummary.futureConflictCount} jadwal masa depan/hari ini</strong> yang dimulai di dalam periode baru.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => setReplaceFuture(true)}
                                                    className="btn btn-secondary btn-sm !py-1 !px-2 text-[11px] font-bold"
                                                >
                                                    Aktifkan Timpa Jadwal Masa Depan
                                                </button>
                                            </div>
                                        )}

                                        {dryRunSummary.historyConflictCount > 0 && (
                                            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-700 dark:text-rose-300">
                                                Terdapat <strong>{dryRunSummary.historyConflictCount} jadwal riwayat masa lalu</strong> yang dimulai di dalam periode ini dan tidak boleh dihapus. Majukan Tanggal Mulai ke hari ini atau setelah jadwal riwayat tersebut.
                                            </div>
                                        )}

                                        {/* Per-employee dry-run details */}
                                        <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                                            {dryRunPlan.plan.map((item) => {
                                                const emp = employees.find((e) => e.employeeId === item.employeeId);
                                                return (
                                                    <div
                                                        key={item.employeeId}
                                                        className="rounded-lg bg-[var(--card)] border border-[var(--border)] px-2.5 py-1.5 text-[11px] space-y-0.5"
                                                    >
                                                        <div className="flex items-center justify-between gap-1">
                                                            <span className="font-semibold text-[var(--text-primary)] truncate">
                                                                {emp?.name ?? item.employeeId}
                                                            </span>
                                                            <span className="text-[10px] font-semibold text-[var(--primary)] inline-flex items-center gap-1 shrink-0">
                                                                <ArrowRight className="w-3 h-3" />
                                                                {shiftNameOf(item.shiftId)}
                                                            </span>
                                                        </div>
                                                        {item.actions.map((act, idx) => (
                                                            <p key={idx} className="text-[10px] text-[var(--text-muted)]">
                                                                •{" "}
                                                                {act.type === "truncate" &&
                                                                    `Memotong ${shiftNameOf(act.shiftId)} agar berakhir sebelum ${formatWIBShort(item.effectiveFrom)}`}
                                                                {act.type === "split" &&
                                                                    `Melanjutkan kembali ${shiftNameOf(act.shiftId)} mulai ${formatWIBShort(act.resultFrom ?? "")}`}
                                                                {act.type === "replace" &&
                                                                    `Menimpa ${shiftNameOf(act.shiftId)} (${formatAssignmentInterval(act.effectiveFrom, act.effectiveTo)})`}
                                                                {act.type === "trimStart" &&
                                                                    `Memangkas awal ${shiftNameOf(act.shiftId)} menjadi mulai ${formatWIBShort(act.resultFrom ?? "")}`}
                                                            </p>
                                                        ))}
                                                        {item.conflicts.map((conf, idx) => (
                                                            <p key={idx} className="text-[10px] text-[var(--danger)] font-medium">
                                                                • Bentrok {conf.reason === "HISTORY" ? "riwayat" : "jadwal"}:{" "}
                                                                {shiftNameOf(conf.shiftId)} ({formatAssignmentInterval(conf.effectiveFrom, conf.effectiveTo)})
                                                            </p>
                                                        ))}
                                                        {item.after && (
                                                            <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                                                                • Mulai {formatWIBShort(item.after.date)}: berlaku{" "}
                                                                <strong>{shiftNameOf(item.after.shiftId)}</strong> ({sourceBadgeLabel(item.after.source)})
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={
                            controlsDisabled ||
                            selected.size === 0 ||
                            !targetShiftId ||
                            !effectiveFrom ||
                            dateRangeInvalid
                        }
                        className="btn btn-primary w-full justify-center"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan Roster...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                Tetapkan {shiftNameOf(targetShiftId)} untuk {selected.size} orang
                            </>
                        )}
                    </button>

                    {/* Quick Cancel Section for Selected Employees */}
                    {selectedCancellableAssignments.length > 0 && (
                        <div className="border-t border-[var(--border)] pt-3 space-y-2">
                            <p className="text-xs font-bold text-[var(--text-primary)]">
                                Jadwal Aktif / Masa Depan Karyawan Terpilih ({selectedCancellableAssignments.length})
                            </p>
                            <div className="space-y-1.5 max-h-44 overflow-y-auto">
                                {selectedCancellableAssignments.map((item) => {
                                    const key = `${item.employeeId}:${item.effectiveFrom}`;
                                    const isCancelling = cancellingAssignment === key;
                                    return (
                                        <div
                                            key={key}
                                            className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/40 p-2 flex items-center justify-between gap-2 text-xs"
                                        >
                                            <div className="min-w-0">
                                                <p className="font-semibold text-[var(--text-primary)] truncate">
                                                    {item.employeeName} — {item.shiftName}
                                                </p>
                                                <p className="text-[11px] text-[var(--text-muted)]">
                                                    {formatAssignmentInterval(item.effectiveFrom, item.effectiveTo)}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                disabled={controlsDisabled}
                                                aria-label={`Batalkan jadwal masa depan ${item.employeeName} mulai ${item.effectiveFrom}`}
                                                onClick={() =>
                                                    handleCancelAssignment(
                                                        item.employeeId,
                                                        item.effectiveFrom,
                                                        item.employeeName,
                                                    )
                                                }
                                                className="btn btn-danger btn-sm !px-2.5 !py-1 text-[11px] shrink-0"
                                            >
                                                {isCancelling ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    "Batalkan"
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </form>
            </div>

            {/* ─── Modal Kelola Jadwal Per Karyawan (Ubah Akhir / Batalkan) ───── */}
            {detailEmployee && (
                <AccessibleModal
                    onClose={() => {
                        setDetailEmployeeId(null);
                        setEditingAssignmentId(null);
                    }}
                    ariaLabel={`Kelola Jadwal Roster ${detailEmployee.name}`}
                    className="max-w-xl w-full"
                >
                    <div className="modal-header">
                        <div>
                            <h3 className="modal-title text-base font-bold text-[var(--text-primary)]">
                                Riwayat & Jadwal Roster — {detailEmployee.name}
                            </h3>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                {detailEmployee.employeeId} • Shift Dasar:{" "}
                                <strong>{shiftNameOf(detailEmployee.shiftId ?? defaultShiftId)}</strong>
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setDetailEmployeeId(null);
                                setEditingAssignmentId(null);
                            }}
                            className="modal-close"
                            aria-label="Tutup dialog"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                        {detailAssignments.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--text-muted)]">
                                Karyawan ini belum memiliki jadwal roster bertanggal dan selalu mengikuti shift dasar{" "}
                                <strong>{shiftNameOf(detailEmployee.shiftId ?? defaultShiftId)}</strong>.
                            </div>
                        ) : (
                            detailAssignments.map((asg) => {
                                const refToday = today || toWIBDateString();
                                const isFutureOrToday = asg.effectiveFrom >= refToday;
                                const isEndedInPast = Boolean(asg.effectiveTo && asg.effectiveTo < refToday);
                                const isEditing = editingAssignmentId === asg.id;
                                const incEnd = toInclusiveEndDate(asg.effectiveTo);
                                const cancelKey = `${asg.employeeId}:${asg.effectiveFrom}`;

                                return (
                                    <div
                                        key={asg.id}
                                        className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/30 p-3 space-y-2.5"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-xs font-bold text-[var(--text-primary)]">
                                                        {shiftNameOf(asg.shiftId)}
                                                    </span>
                                                    {isEndedInPast ? (
                                                        <span className="badge bg-[var(--secondary)] text-[var(--text-muted)] text-[10px]">
                                                            Selesai
                                                        </span>
                                                    ) : asg.effectiveFrom <= refToday ? (
                                                        <span className="badge badge-success text-[10px]">
                                                            Sedang Berjalan
                                                        </span>
                                                    ) : (
                                                        <span className="badge badge-info text-[10px]">
                                                            Terjadwal
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                                    {formatAssignmentInterval(asg.effectiveFrom, asg.effectiveTo)}
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {!isEndedInPast && (
                                                    <button
                                                        type="button"
                                                        disabled={controlsDisabled}
                                                        onClick={() => {
                                                            if (isEditing) {
                                                                setEditingAssignmentId(null);
                                                            } else {
                                                                setEditingAssignmentId(asg.id);
                                                                setEditOpenEnded(asg.effectiveTo === null);
                                                                setEditUiEndDate(incEnd ?? refToday);
                                                            }
                                                        }}
                                                        className="btn btn-secondary btn-sm !px-2.5 !py-1 text-xs"
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5" />
                                                        Ubah Akhir
                                                    </button>
                                                )}
                                                {isFutureOrToday && (
                                                    <button
                                                        type="button"
                                                        disabled={controlsDisabled}
                                                        aria-label={`Batalkan jadwal masa depan ${detailEmployee.name} mulai ${asg.effectiveFrom}`}
                                                        onClick={() =>
                                                            handleCancelAssignment(
                                                                asg.employeeId,
                                                                asg.effectiveFrom,
                                                                detailEmployee.name,
                                                            )
                                                        }
                                                        className="btn btn-danger btn-sm !px-2.5 !py-1 text-xs"
                                                    >
                                                        {cancellingAssignment === cancelKey ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                Batalkan
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {isEditing && (
                                            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 space-y-2.5">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                                                    <div>
                                                        <label
                                                            htmlFor={`edit-end-${asg.id}`}
                                                            className="form-label text-[11px]"
                                                        >
                                                            Hari terakhir baru (inklusif)
                                                        </label>
                                                        <input
                                                            id={`edit-end-${asg.id}`}
                                                            type="date"
                                                            min={asg.effectiveFrom > refToday ? asg.effectiveFrom : refToday}
                                                            value={editUiEndDate}
                                                            disabled={editOpenEnded || updatingEndId === asg.id}
                                                            onChange={(e) => setEditUiEndDate(e.target.value)}
                                                            className="form-input text-xs"
                                                        />
                                                    </div>
                                                    <label className="flex items-center gap-2 text-xs cursor-pointer pb-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={editOpenEnded}
                                                            disabled={updatingEndId === asg.id}
                                                            onChange={(e) => setEditOpenEnded(e.target.checked)}
                                                        />
                                                        <span>Tanpa batas akhir (seterusnya)</span>
                                                    </label>
                                                </div>
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingAssignmentId(null)}
                                                        className="btn btn-ghost btn-sm text-xs"
                                                    >
                                                        Batal
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={updatingEndId === asg.id}
                                                        onClick={() =>
                                                            void handleUpdateAssignmentEnd(asg, detailEmployee.name)
                                                        }
                                                        className="btn btn-primary btn-sm text-xs"
                                                    >
                                                        {updatingEndId === asg.id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            "Simpan Tanggal Akhir"
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
