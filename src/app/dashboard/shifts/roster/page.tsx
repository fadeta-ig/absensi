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
    Filter,
    Info,
    Layers,
    Loader2,
    RefreshCw,
    RotateCcw,
    Search,
    Sparkles,
    Square,
    Users,
    X,
    XCircle,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
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

interface RosterEntry {
    employeeId: string;
    shiftId: string | null;
    source: "assignment" | "fallback" | "default" | "none";
    assignment: {
        id: string;
        effectiveFrom: string;
        effectiveTo: string | null;
    } | null;
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
    if (!dateStr) return "";
    if (!isValidCalendarDate(dateStr)) return dateStr;
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

function formatWIBDay(dateStr: string): string {
    if (!isValidCalendarDate(dateStr)) return "";
    return formatWIBDateTime(toUTCDateKey(dateStr), { weekday: "long" });
}

function toInclusiveEndDate(exclusiveTo: string | null | undefined): string | null {
    if (!exclusiveTo || !isValidCalendarDate(exclusiveTo)) return null;
    return addCalendarDays(exclusiveTo, -1);
}

function getMondayOfWIBWeek(referenceDate: string, weekOffset = 0): string {
    const baseDate = isValidCalendarDate(referenceDate) ? referenceDate : toWIBDateString();
    const utcDay = toUTCDateKey(baseDate).getUTCDay(); // 0 = Sun, 1 = Mon, ...
    const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
    return addCalendarDays(baseDate, diffToMonday + weekOffset * 7);
}

export default function ShiftRosterPage() {
    const toast = useToast();
    const confirm = useConfirm();

    const [employees, setEmployees] = useState<EmployeeLite[]>([]);
    const [shifts, setShifts] = useState<ShiftLite[]>([]);
    const [roster, setRoster] = useState<Record<string, RosterEntry>>({});
    const [today, setToday] = useState("");

    // Selection and Filtering
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [filterSource, setFilterSource] = useState<string>("all");
    const [filterOrigin, setFilterOrigin] = useState<"all" | "assignment" | "base">("all");
    const [filterDepartment, setFilterDepartment] = useState<string>("all");

    // Dates & Target Shift
    const [viewDate, setViewDate] = useState("");
    const [targetShiftId, setTargetShiftId] = useState("");
    const [effectiveFrom, setEffectiveFrom] = useState("");
    const [uiEffectiveTo, setUiEffectiveTo] = useState(""); // inclusive

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

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            const [empRes, shiftRes, initialRosterRes] = await Promise.all([
                fetch("/api/employees"),
                fetch("/api/shifts"),
                fetch("/api/shifts/assignments", { cache: "no-store" }).catch(() => null),
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
            if (initialRosterRes && initialRosterRes.ok) {
                const rosterData = await initialRosterRes.json();
                if (rosterRequestRef.current === 0 && rosterData && Array.isArray(rosterData.roster)) {
                    const map: Record<string, RosterEntry> = {};
                    for (const row of rosterData.roster as RosterEntry[]) {
                        if (row.employeeId) map[row.employeeId] = row;
                    }
                    setRoster(map);
                    if (typeof rosterData.today === "string" && rosterData.today) {
                        setToday(rosterData.today);
                    }
                    const resolvedViewDate =
                        typeof rosterData.date === "string" && rosterData.date
                            ? rosterData.date
                            : typeof rosterData.today === "string"
                              ? rosterData.today
                              : "";
                    if (resolvedViewDate && !viewDateRef.current) {
                        viewDateRef.current = resolvedViewDate;
                        setViewDate(resolvedViewDate);
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

    const loadRoster = useCallback(async (date: string) => {
        rosterAbortRef.current?.abort();
        const requestId = ++rosterRequestRef.current;
        if (!date) {
            rosterAbortRef.current = null;
            setRoster({});
            setRosterError("");
            setLoadingRoster(false);
            return;
        }
        const controller = new AbortController();
        rosterAbortRef.current = controller;
        setLoadingRoster(true);
        try {
            const res = await fetch(`/api/shifts/assignments?date=${date}`, {
                cache: "no-store",
                signal: controller.signal,
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat roster tanggal tersebut."));
            const data = await res.json();
            if (requestId === rosterRequestRef.current && Array.isArray(data.roster)) {
                const map: Record<string, RosterEntry> = {};
                for (const row of data.roster as RosterEntry[]) {
                    if (row.employeeId) map[row.employeeId] = row;
                }
                setRoster(map);
                if (typeof data.today === "string") setToday(data.today);
                setRosterError("");
            }
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") return;
            if (requestId !== rosterRequestRef.current) return;
            setRoster({});
            setRosterError(
                error instanceof Error
                    ? error.message
                    : "Roster tanggal tersebut tidak dapat dimuat; fallback shift karyawan dipakai.",
            );
        } finally {
            if (rosterAbortRef.current === controller) {
                rosterAbortRef.current = null;
                setLoadingRoster(false);
            }
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
        (nextDate: string) => {
            viewDateRef.current = nextDate;
            setViewDate(nextDate);
            void loadRoster(nextDate);
        },
        [loadRoster],
    );

    const shiftNameOf = useCallback(
        (shiftId?: string | null) => {
            return shifts.find((s) => s.id === shiftId)?.name ?? "Belum Ada Shift";
        },
        [shifts],
    );

    const departments = useMemo(() => {
        const set = new Set<string>();
        for (const emp of employees) {
            if (emp.department && emp.department.trim()) {
                set.add(emp.department.trim());
            }
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
            const entry = roster[emp.employeeId];
            const effectiveShiftId = entry?.shiftId ?? emp.shiftId ?? "none";
            byShift[effectiveShiftId] = (byShift[effectiveShiftId] ?? 0) + 1;

            if (entry?.source === "assignment") {
                assignmentCount++;
                if (today && entry.assignment && entry.assignment.effectiveFrom > today) {
                    futureCount++;
                }
            } else {
                baseCount++;
            }
        }

        return {
            total: employees.length,
            assignmentCount,
            baseCount,
            futureCount,
            byShift,
        };
    }, [employees, roster, today]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return employees.filter((e) => {
            if (
                q &&
                !e.employeeId.toLowerCase().includes(q) &&
                !e.name.toLowerCase().includes(q) &&
                !(e.department ?? "").toLowerCase().includes(q)
            ) {
                return false;
            }
            const entry = roster[e.employeeId];
            if (filterSource !== "all") {
                const shiftKey = entry?.shiftId ?? e.shiftId ?? "none";
                if (filterSource !== shiftKey) return false;
            }
            if (filterOrigin === "assignment" && entry?.source !== "assignment") {
                return false;
            }
            if (filterOrigin === "base" && entry?.source === "assignment") {
                return false;
            }
            if (filterDepartment !== "all" && (e.department ?? "") !== filterDepartment) {
                return false;
            }
            return true;
        });
    }, [employees, search, roster, filterSource, filterOrigin, filterDepartment]);

    const isAllFilteredSelected = useMemo(
        () => filtered.length > 0 && filtered.every((emp) => selected.has(emp.employeeId)),
        [filtered, selected],
    );

    const toggleOne = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAllFiltered = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const e of filtered) {
                next.add(e.employeeId);
            }
            return next;
        });
    };

    const handleToggleAllFiltered = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (isAllFilteredSelected) {
                for (const e of filtered) {
                    next.delete(e.employeeId);
                }
            } else {
                for (const e of filtered) {
                    next.add(e.employeeId);
                }
            }
            return next;
        });
    };

    const handleSelectUnassignedFiltered = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const e of filtered) {
                if (roster[e.employeeId]?.source !== "assignment") {
                    next.add(e.employeeId);
                }
            }
            return next;
        });
    };

    const clearSelection = () => setSelected(new Set());

    const resetFilters = () => {
        setSearch("");
        setFilterSource("all");
        setFilterOrigin("all");
        setFilterDepartment("all");
    };

    const hasActiveFilters = Boolean(
        search.trim() || filterSource !== "all" || filterOrigin !== "all" || filterDepartment !== "all",
    );

    const effectiveTo = isValidCalendarDate(uiEffectiveTo) ? addCalendarDays(uiEffectiveTo, 1) : "";
    const rangeValid = !effectiveTo || !effectiveFrom || effectiveTo > effectiveFrom;
    const controlsDisabled = submitting || Boolean(cancellingAssignment);
    const targetShift = shifts.find((s) => s.id === targetShiftId);

    const canSubmit = Boolean(
        selected.size > 0 && targetShiftId && effectiveFrom && rangeValid && !submitting && !cancellingAssignment,
    );

    const inclusiveDays = useMemo(() => {
        if (!isValidCalendarDate(effectiveFrom) || !isValidCalendarDate(uiEffectiveTo)) return 0;
        const diff = Math.round(
            (toUTCDateKey(uiEffectiveTo).getTime() - toUTCDateKey(effectiveFrom).getTime()) / (1000 * 60 * 60 * 24),
        );
        return diff >= 0 ? diff + 1 : 0;
    }, [effectiveFrom, uiEffectiveTo]);

    const rangeChip =
        effectiveFrom && uiEffectiveTo && inclusiveDays > 0
            ? `${formatWIBShort(effectiveFrom)} – ${formatWIBShort(uiEffectiveTo)} (${inclusiveDays} hari) • ${selected.size} orang`
            : "";

    const previewGroups = useMemo(() => {
        const groups = new Map<string, EmployeeLite[]>();
        for (const emp of employees) {
            if (!selected.has(emp.employeeId)) continue;
            const key = (viewDate && roster[emp.employeeId]?.shiftId) || emp.shiftId || "";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(emp);
        }
        return Array.from(groups.entries());
    }, [employees, selected, roster, viewDate]);

    const selectedEmployeesList = useMemo(
        () => employees.filter((e) => selected.has(e.employeeId)),
        [employees, selected],
    );

    const conflicts = useMemo(() => {
        if (!effectiveFrom) return [];
        const newStart = effectiveFrom;
        const newEnd = effectiveTo || "9999-12-31";

        return Array.from(selected)
            .map((empId) => {
                const entry = roster[empId];
                if (!entry?.assignment) return null;
                const a = entry.assignment;
                const aStart = a.effectiveFrom;
                const aEnd = a.effectiveTo || "9999-12-31";

                if (aStart < newEnd && aEnd > newStart) {
                    const isAutoChainable = a.effectiveTo === null && aStart < newStart;
                    return {
                        empId,
                        name: employees.find((e) => e.employeeId === empId)?.name || empId,
                        isAutoChainable,
                        effectiveFrom: a.effectiveFrom,
                        effectiveTo: a.effectiveTo,
                    };
                }
                return null;
            })
            .filter(Boolean) as Array<{
            empId: string;
            name: string;
            isAutoChainable: boolean;
            effectiveFrom: string;
            effectiveTo: string | null;
        }>;
    }, [selected, roster, effectiveFrom, effectiveTo, employees]);

    const applyDurationPreset = (days: number | null) => {
        const start = isValidCalendarDate(effectiveFrom)
            ? effectiveFrom
            : isValidCalendarDate(viewDate)
              ? viewDate
              : today || toWIBDateString();
        if (!isValidCalendarDate(effectiveFrom)) {
            setEffectiveFrom(start);
        }
        if (days === null) {
            setUiEffectiveTo("");
        } else {
            setUiEffectiveTo(addCalendarDays(start, days - 1));
        }
    };

    const handleSubmit = async () => {
        if (!canSubmit || !targetShift) return;

        const submittedDate = effectiveFrom;
        const submittedEffectiveTo = effectiveTo;
        const submittedShiftId = targetShiftId;
        const submittedEmployeeIds = Array.from(selected);

        const rangeText = submittedEffectiveTo
            ? `mulai ${formatWIBShort(submittedDate)} sampai akhir ${formatWIBShort(uiEffectiveTo)}`
            : `mulai ${formatWIBShort(submittedDate)} (dan seterusnya)`;

        confirm({
            title: "Simpan Roster",
            message: `${submittedEmployeeIds.length} karyawan akan dipindahkan ke ${targetShift.name} ${rangeText}. Setuju?`,
            confirmLabel: "Simpan",
            variant: "info",
            onConfirm: async () => {
                setSubmitting(true);
                setActionError("");
                setActionResult(null);
                try {
                    const res = await fetch("/api/shifts/assignments", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            assignments: submittedEmployeeIds.map((employeeId) => ({
                                employeeId,
                                shiftId: submittedShiftId,
                                effectiveFrom: submittedDate,
                                ...(submittedEffectiveTo ? { effectiveTo: submittedEffectiveTo } : {}),
                            })),
                        }),
                    });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan roster."));
                    const data = await res.json();

                    const appliedCount = data.applied ?? submittedEmployeeIds.length;
                    setActionResult({
                        success: appliedCount,
                        message: `Berhasil menetapkan ${appliedCount} karyawan ke ${targetShift.name}.`,
                        type: "success",
                    });
                    toast(`Roster tersimpan: ${appliedCount} karyawan ke ${targetShift.name}.`, "success");
                    setSelected(new Set());

                    if (
                        viewDateRef.current === submittedDate ||
                        (submittedDate <= viewDateRef.current &&
                            (!submittedEffectiveTo || submittedEffectiveTo > viewDateRef.current))
                    ) {
                        await loadRoster(viewDateRef.current);
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Gagal menyimpan roster.";
                    reportClientError("ShiftRosterPage", "Gagal menyimpan roster", error);
                    setActionError(message);
                    toast(message, "error");
                } finally {
                    setSubmitting(false);
                }
            },
        });
    };

    const handleCancelAssignment = async (
        employee: EmployeeLite,
        assignment: NonNullable<RosterEntry["assignment"]>,
    ) => {
        if (submitting || cancellingAssignment) return;
        const inclusiveEnd = toInclusiveEndDate(assignment.effectiveTo);
        const rangeText = inclusiveEnd
            ? ` sampai akhir ${formatWIBShort(inclusiveEnd)}`
            : " dan seterusnya";

        confirm({
            title: "Batalkan Jadwal",
            message: `Jadwal masa depan ${employee.name} mulai ${assignment.effectiveFrom}${rangeText} akan dibatalkan. Jadwal sebelumnya akan berlaku kembali. Setuju?`,
            confirmLabel: "Batalkan",
            variant: "danger",
            onConfirm: async () => {
                setCancellingAssignment(assignment.id);
                setActionError("");
                setActionResult(null);
                try {
                    const res = await fetch("/api/shifts/assignments", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            employeeId: employee.employeeId,
                            effectiveFrom: assignment.effectiveFrom,
                        }),
                    });
                    if (!res.ok) {
                        throw new Error(await getResponseErrorMessage(res, "Gagal membatalkan jadwal masa depan."));
                    }

                    toast(`Jadwal masa depan ${employee.name} dibatalkan.`, "success");
                    setActionResult({
                        success: 1,
                        message: `Jadwal masa depan ${employee.name} berhasil dibatalkan.`,
                        type: "success",
                    });
                    await loadRoster(viewDateRef.current || viewDate);
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Gagal membatalkan jadwal masa depan.";
                    reportClientError("ShiftRosterPage", "Gagal membatalkan jadwal masa depan", error);
                    setActionError(message);
                    toast(message, "error");
                } finally {
                    setCancellingAssignment("");
                }
            },
        });
    };

    function getSourceBadge(source?: RosterEntry["source"]) {
        switch (source) {
            case "assignment":
                return <span className="badge badge-info text-[10px]">Roster</span>;
            case "fallback":
                return <span className="badge badge-warning text-[10px]">Dasar</span>;
            case "default":
                return (
                    <span className="badge bg-[var(--secondary)] text-[var(--text-secondary)] border border-[var(--border)] text-[10px]">
                        Default
                    </span>
                );
            default:
                return null;
        }
    }

    function getAssignmentStatus(from: string, to: string | null, todayStr: string) {
        if (!todayStr) return "Berjalan";
        if (to && to <= todayStr) return "Riwayat";
        if (from > todayStr) return "Masa depan";
        return "Berjalan";
    }

    const selectedFutureAssignments = useMemo(() => {
        const list: Array<{ employee: EmployeeLite; assignment: NonNullable<RosterEntry["assignment"]> }> = [];
        if (!today) return list;
        for (const empId of selected) {
            const emp = employees.find((e) => e.employeeId === empId);
            const entry = roster[empId];
            if (emp && entry?.assignment && entry.assignment.effectiveFrom > today) {
                list.push({ employee: emp, assignment: entry.assignment });
            }
        }
        return list;
    }, [selected, employees, roster, today]);

    const referenceToday = today || (isValidCalendarDate(viewDate) ? viewDate : "");

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* ─── Header & Inspector Bar ──────────────────────────────────────── */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] shrink-0">
                            <CalendarClock className="w-5 h-5" />
                        </span>
                        <span>Roster Shift / Rotasi Mingguan</span>
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Pindahkan banyak karyawan sekaligus dengan tanggal berlaku. Perubahan jadwal masa depan tidak mengubah presensi hari ini.
                    </p>
                </div>

                {/* Tanggal Lihat Roster Toolbar */}
                <div className="card p-3.5 flex flex-col sm:flex-row sm:items-center gap-3 border-[var(--primary)]/20 bg-[var(--card)]">
                    <div className="min-w-0">
                        <label
                            className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1"
                            htmlFor="roster-view-date"
                        >
                            Tanggal Lihat Roster
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                                disabled={controlsDisabled}
                                onClick={() => handleViewDateChange(today || toWIBDateString())}
                                className="btn btn-secondary btn-sm text-xs"
                            >
                                Hari Ini
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
                                    onClick={() => void loadRoster(viewDate)}
                                    className="btn btn-ghost btn-sm !px-2 !py-1.5"
                                    title="Muat ulang roster tanggal ini"
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
                                    Pilih tanggal untuk melihat jadwal karyawan di hari tersebut.
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
                    Roster tanggal terpilih tidak dapat dimuat ({rosterError}). Daftar di bawah memakai shift karyawan saat ini sebagai fallback — periksa koneksi lalu pilih ulang tanggal.
                </FeedbackMessage>
            )}

            {/* ─── KPI & Distribusi Shift pada Tanggal Lihat ───────────────────── */}
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
                            ? `${rosterStats.futureCount} jadwal masa depan terdeteksi`
                            : "Siap dipilih untuk rotasi"}
                    </p>
                </div>
            </div>

            {/* ─── Distribusi Per Shift (Quick Filter Strip) ───────────────────── */}
            {shifts.length > 0 && (
                <div className="card p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-[var(--primary)]" />
                            Distribusi Shift Karyawan {viewDate ? `(${formatWIBDay(viewDate)}, ${formatWIBShort(viewDate)})` : ""}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                        {shifts.map((s) => {
                            const count = rosterStats.byShift[s.id] ?? 0;
                            const isFiltered = filterSource === s.id;
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
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                                            {s.name}
                                        </p>
                                        <p
                                            className={`text-[11px] mt-0.5 ${
                                                daySchedule?.isOff
                                                    ? "text-rose-600 dark:text-rose-400 font-medium"
                                                    : "text-[var(--text-muted)]"
                                            }`}
                                        >
                                            {hoursLabel}
                                        </p>
                                    </div>
                                    <span
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${
                                            isFiltered
                                                ? "bg-[var(--primary)] text-white"
                                                : "bg-[var(--card)] text-[var(--text-primary)] border border-[var(--border)]"
                                        }`}
                                    >
                                        {count} org
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ─── Main Split Workspace ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                {/* LEFT COLUMN: Employee Roster Table */}
                <div className="xl:col-span-7 2xl:col-span-8 card overflow-hidden">
                    {/* Table Filter & Selection Header */}
                    <div className="p-4 border-b border-[var(--border)] space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <label className="form-label mb-0 text-sm font-bold" htmlFor="roster-search">
                                    Pilih Karyawan ({selected.size} terpilih)
                                </label>
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    Menampilkan {filtered.length} dari {employees.length} karyawan aktif
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {filtered.length > 0 && (
                                    <button
                                        type="button"
                                        disabled={controlsDisabled}
                                        onClick={handleSelectAllFiltered}
                                        className="btn btn-secondary btn-sm text-xs font-semibold text-[var(--primary)]"
                                    >
                                        Pilih semua hasil
                                    </button>
                                )}
                                {filtered.some((e) => roster[e.employeeId]?.source !== "assignment") && (
                                    <button
                                        type="button"
                                        disabled={controlsDisabled}
                                        onClick={handleSelectUnassignedFiltered}
                                        className="btn btn-secondary btn-sm text-xs"
                                        title="Pilih karyawan yang masih memakai shift dasar/default"
                                    >
                                        Pilih Belum Roster
                                    </button>
                                )}
                                {selected.size > 0 && (
                                    <button
                                        type="button"
                                        disabled={controlsDisabled}
                                        onClick={clearSelection}
                                        className="btn btn-ghost btn-sm text-xs text-[var(--destructive)]"
                                    >
                                        Reset Pilihan
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Search & Filter Controls */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                            <div className="relative sm:col-span-5">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                                <input
                                    id="roster-search"
                                    className="form-input w-full pl-9 pr-8 text-xs"
                                    placeholder="Cari NIP atau nama..."
                                    value={search}
                                    disabled={controlsDisabled}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => setSearch("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                        title="Hapus pencarian"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            <div className="sm:col-span-4 flex items-center gap-1.5">
                                <Filter className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 hidden sm:block" />
                                <select
                                    aria-label="Filter Shift Karyawan"
                                    className="form-select py-1.5 text-xs w-full"
                                    value={filterSource}
                                    onChange={(e) => setFilterSource(e.target.value)}
                                    disabled={controlsDisabled}
                                >
                                    <option value="all">Semua Karyawan</option>
                                    {shifts.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="sm:col-span-3">
                                <select
                                    aria-label="Filter Departemen"
                                    className="form-select py-1.5 text-xs w-full"
                                    value={filterDepartment}
                                    onChange={(e) => setFilterDepartment(e.target.value)}
                                    disabled={controlsDisabled}
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

                        {hasActiveFilters && (
                            <div className="flex items-center justify-between pt-1 text-xs">
                                <span className="text-[var(--text-muted)]">
                                    Filter aktif menyaring {filtered.length} karyawan
                                </span>
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="text-[var(--primary)] font-semibold hover:underline flex items-center gap-1"
                                >
                                    <RotateCcw className="w-3 h-3" /> Reset Semua Filter
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Employee Roster Data Table */}
                    <div className="max-h-[560px] overflow-y-auto">
                        <Table>
                            <TableHeader className="sticky top-0 z-10 bg-[var(--card)] shadow-sm">
                                <TableRow>
                                    <TableHead className="w-10 text-center">
                                        <button
                                            type="button"
                                            disabled={controlsDisabled || filtered.length === 0}
                                            onClick={handleToggleAllFiltered}
                                            className="text-[var(--text-muted)] hover:text-[var(--primary)] disabled:opacity-50 p-0.5"
                                            title={isAllFilteredSelected ? "Batalkan semua hasil filter" : "Pilih semua hasil filter"}
                                        >
                                            {isAllFilteredSelected ? (
                                                <CheckSquare className="w-4 h-4 text-[var(--primary)]" />
                                            ) : (
                                                <Square className="w-4 h-4" />
                                            )}
                                        </button>
                                    </TableHead>
                                    <TableHead>Karyawan</TableHead>
                                    <TableHead className="hidden md:table-cell">Shift Dasar</TableHead>
                                    <TableHead>Jadwal Efektif</TableHead>
                                    <TableHead className="text-right">Status & Periode</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="py-12 text-center text-sm text-[var(--text-muted)]">
                                            <div className="flex items-center justify-center gap-2">
                                                <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                                                <span>Memuat karyawan...</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : filtered.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="py-10 text-center text-sm text-[var(--text-muted)] italic">
                                            Tidak ada karyawan sesuai filter.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filtered.map((emp) => {
                                        const rosterEntry = roster[emp.employeeId];
                                        const currentShift = shifts.find(
                                            (s) => s.id === (rosterEntry?.shiftId ?? emp.shiftId),
                                        );
                                        const baseShift = shifts.find((s) => s.id === emp.shiftId);
                                        const status = rosterEntry?.assignment
                                            ? getAssignmentStatus(
                                                  rosterEntry.assignment.effectiveFrom,
                                                  rosterEntry.assignment.effectiveTo,
                                                  today,
                                              )
                                            : "";
                                        const isSelected = selected.has(emp.employeeId);
                                        const inclusiveEnd = toInclusiveEndDate(rosterEntry?.assignment?.effectiveTo);
                                        const daySchedule =
                                            currentShift && viewedWeekday !== null
                                                ? currentShift.days.find((d) => d.dayOfWeek === viewedWeekday)
                                                : null;

                                        return (
                                            <TableRow
                                                key={emp.employeeId}
                                                onClick={() => {
                                                    if (!controlsDisabled) toggleOne(emp.employeeId);
                                                }}
                                                className={`cursor-pointer transition-colors ${
                                                    isSelected
                                                        ? "bg-[var(--primary)]/5 hover:bg-[var(--primary)]/10"
                                                        : "hover:bg-[var(--secondary)]/50"
                                                }`}
                                            >
                                                <TableCell
                                                    className="text-center"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        disabled={controlsDisabled}
                                                        onChange={() => toggleOne(emp.employeeId)}
                                                        aria-label={`Centang ${emp.employeeId}`}
                                                        className="w-4 h-4 accent-[var(--primary)] rounded cursor-pointer disabled:cursor-not-allowed"
                                                    />
                                                </TableCell>
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        disabled={controlsDisabled}
                                                        onClick={() => toggleOne(emp.employeeId)}
                                                        className="flex min-w-0 w-full items-center gap-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60"
                                                    >
                                                        {isSelected ? (
                                                            <CheckSquare className="w-4 h-4 text-[var(--primary)] shrink-0 sm:hidden" />
                                                        ) : (
                                                            <Square className="w-4 h-4 text-[var(--text-muted)] shrink-0 sm:hidden" />
                                                        )}
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                                                    {emp.name}
                                                                </span>
                                                                {getSourceBadge(rosterEntry?.source)}
                                                            </span>
                                                            <span className="block text-[11px] font-mono text-[var(--text-muted)]">
                                                                {emp.employeeId}
                                                                {emp.department ? ` • ${emp.department}` : ""}
                                                            </span>
                                                        </span>
                                                        <span className="sr-only">
                                                            {currentShift ? shiftLabel(currentShift) : "-"}
                                                        </span>
                                                    </button>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell">
                                                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                                                        {baseShift ? baseShift.name : "Default"}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="min-w-0">
                                                        <span className="block text-xs font-semibold text-[var(--text-primary)]">
                                                            {currentShift ? shiftLabel(currentShift) : "-"}
                                                        </span>
                                                        {daySchedule && (
                                                            <span
                                                                className={`text-[10px] font-medium ${
                                                                    daySchedule.isOff
                                                                        ? "text-rose-600 dark:text-rose-400"
                                                                        : "text-[var(--text-muted)]"
                                                                }`}
                                                            >
                                                                {daySchedule.isOff
                                                                    ? "Hari Libur Shift"
                                                                    : `Jam hari ini: ${daySchedule.startTime} – ${daySchedule.endTime}`}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex flex-col items-end gap-0.5">
                                                        <span
                                                            className={`text-[11px] font-semibold ${
                                                                status === "Berjalan"
                                                                    ? "text-emerald-700 dark:text-emerald-400"
                                                                    : status === "Masa depan"
                                                                      ? "text-sky-700 dark:text-sky-400"
                                                                      : "text-[var(--text-muted)]"
                                                            }`}
                                                        >
                                                            {status
                                                                ? `Jadwal ${status}`
                                                                : viewDate
                                                                  ? `pada ${viewDate}`
                                                                  : "Belum ada"}
                                                        </span>
                                                        {rosterEntry?.assignment && (
                                                            <span className="text-[10px] text-[var(--text-muted)] font-mono">
                                                                {formatWIBShort(rosterEntry.assignment.effectiveFrom)}
                                                                {inclusiveEnd
                                                                    ? ` – ${formatWIBShort(inclusiveEnd)}`
                                                                    : " → Seterusnya"}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {/* RIGHT COLUMN: Assignment Command & Preview Panel */}
                <div className="xl:col-span-5 2xl:col-span-4 space-y-4 xl:sticky xl:top-20">
                    <div className="card p-5 space-y-5 border-[var(--primary)]/20">
                        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                            <div>
                                <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-[var(--primary)]" />
                                    Atur Jadwal Roster Baru
                                </h2>
                                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                    Tentukan periode berlaku dan shift tujuan untuk karyawan terpilih
                                </p>
                            </div>
                            {selected.size > 0 && (
                                <span className="badge badge-primary text-xs font-bold">
                                    {selected.size} dipilih
                                </span>
                            )}
                        </div>

                        {/* Step 1: Tanggal Berlaku & Hari Terakhir */}
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="form-label" htmlFor="roster-date">
                                        Berlaku Mulai Tanggal
                                    </label>
                                    <input
                                        id="roster-date"
                                        type="date"
                                        className="form-input w-full text-xs"
                                        value={effectiveFrom}
                                        disabled={controlsDisabled}
                                        onChange={(e) => setEffectiveFrom(e.target.value)}
                                    />
                                    {effectiveFrom && (
                                        <span className="text-[11px] font-medium text-[var(--text-secondary)] mt-1 block">
                                            {formatWIBDay(effectiveFrom)}, {formatWIBShort(effectiveFrom)}
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <label className="form-label" htmlFor="roster-date-to">
                                        Hari terakhir (ikut termasuk, opsional)
                                    </label>
                                    <input
                                        id="roster-date-to"
                                        type="date"
                                        className="form-input w-full text-xs"
                                        value={uiEffectiveTo}
                                        min={effectiveFrom || undefined}
                                        disabled={controlsDisabled}
                                        onChange={(e) => setUiEffectiveTo(e.target.value)}
                                    />
                                    {uiEffectiveTo ? (
                                        <span className="text-[11px] font-medium text-[var(--text-secondary)] mt-1 block">
                                            {formatWIBDay(uiEffectiveTo)}, {formatWIBShort(uiEffectiveTo)}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                                            Kosongkan bila berlaku seterusnya
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Quick Date & Duration Presets */}
                            <div className="rounded-xl bg-[var(--secondary)]/50 border border-[var(--border)] p-2.5 space-y-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mr-1 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" /> Mulai Cepat:
                                    </span>
                                    <button
                                        type="button"
                                        disabled={controlsDisabled}
                                        onClick={() => setEffectiveFrom(today || toWIBDateString())}
                                        className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
                                    >
                                        Hari Ini
                                    </button>
                                    <button
                                        type="button"
                                        disabled={controlsDisabled}
                                        onClick={() => setEffectiveFrom(getMondayOfWIBWeek(referenceToday, 1))}
                                        className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
                                    >
                                        Senin Depan
                                    </button>
                                    {viewDate && (
                                        <button
                                            type="button"
                                            disabled={controlsDisabled}
                                            onClick={() => setEffectiveFrom(viewDate)}
                                            className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
                                        >
                                            Samakan Tgl Lihat
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[var(--border)]/60">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mr-1">
                                        Durasi:
                                    </span>
                                    {[
                                        { label: "1 Hari", days: 1 },
                                        { label: "6 Hari Kerja", days: 6 },
                                        { label: "1 Minggu", days: 7 },
                                        { label: "2 Minggu", days: 14 },
                                        { label: "Seterusnya", days: null },
                                    ].map((preset) => (
                                        <button
                                            key={preset.label}
                                            type="button"
                                            disabled={controlsDisabled}
                                            onClick={() => applyDurationPreset(preset.days)}
                                            className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Step 2: Shift Tujuan & Rincian Hari Kerja */}
                        <div className="space-y-2.5">
                            <div>
                                <label className="form-label" htmlFor="roster-shift">
                                    Shift Tujuan
                                </label>
                                <select
                                    id="roster-shift"
                                    className="form-select w-full text-xs font-semibold"
                                    value={targetShiftId}
                                    disabled={controlsDisabled}
                                    onChange={(e) => setTargetShiftId(e.target.value)}
                                >
                                    {shifts.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {shiftLabel(s)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {rangeChip && (
                                <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] text-xs font-semibold px-3 py-1 border border-[var(--primary)]/20">
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    <span>{rangeChip}</span>
                                </div>
                            )}

                            {/* Visual Weekly Schedule Breakdown of Target Shift */}
                            {targetShift && targetShift.days.length > 0 && (
                                <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/30 p-2.5">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                                        Jadwal Mingguan {targetShift.name}
                                    </p>
                                    <div className="grid grid-cols-7 gap-1 text-center">
                                        {SHORT_DAY_LABELS.map(({ dayOfWeek, label }) => {
                                            const dayObj = targetShift.days.find((d) => d.dayOfWeek === dayOfWeek);
                                            const isOff = !dayObj || dayObj.isOff;
                                            return (
                                                <div
                                                    key={dayOfWeek}
                                                    className={`rounded-lg p-1 border text-[10px] ${
                                                        isOff
                                                            ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
                                                            : "bg-[var(--card)] border-[var(--border)] text-[var(--text-primary)]"
                                                    }`}
                                                >
                                                    <span className="block font-bold">{label}</span>
                                                    <span className="block text-[9px] leading-tight mt-0.5 font-mono">
                                                        {isOff
                                                            ? "Libur"
                                                            : `${dayObj.startTime}\n${dayObj.endTime}`}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Step 3: Jadwal Masa Depan Terpilih (Cancellation Panel) */}
                        {selectedFutureAssignments.length > 0 && (
                            <div className="rounded-xl border border-amber-500/30 p-3.5 space-y-2.5 bg-amber-500/5">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold text-[var(--text-primary)]">
                                        Jadwal Masa Depan Terpilih
                                    </p>
                                    <span className="badge badge-warning text-[10px]">
                                        {selectedFutureAssignments.length} jadwal
                                    </span>
                                </div>
                                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                    {selectedFutureAssignments.map(({ employee, assignment }) => {
                                        const inclusiveEnd = toInclusiveEndDate(assignment.effectiveTo);
                                        return (
                                            <div
                                                key={assignment.id}
                                                className="flex items-center justify-between gap-2 text-xs bg-[var(--card)] p-2.5 rounded-lg border border-[var(--border)]"
                                            >
                                                <div className="min-w-0">
                                                    <span className="font-semibold text-[var(--text-primary)] block truncate">
                                                        {employee.name} ({employee.employeeId})
                                                    </span>
                                                    <span className="text-[11px] text-[var(--text-muted)] block">
                                                        Mulai: {formatWIBShort(assignment.effectiveFrom)}{" "}
                                                        {inclusiveEnd
                                                            ? `s/d ${formatWIBShort(inclusiveEnd)}`
                                                            : "(seterusnya)"}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--destructive)]/40 px-2.5 py-1 font-semibold text-[var(--destructive)] hover:bg-[var(--destructive)]/10 disabled:opacity-50"
                                                    disabled={Boolean(cancellingAssignment) || submitting}
                                                    onClick={() => void handleCancelAssignment(employee, assignment)}
                                                    aria-label={`Batalkan jadwal masa depan ${employee.name} mulai ${assignment.effectiveFrom}`}
                                                >
                                                    <XCircle className="h-3.5 w-3.5" />
                                                    {cancellingAssignment === assignment.id ? "Membatalkan..." : "Batal"}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Step 4: Mandatory Group Preview & Conflict Inspector */}
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/40 p-4 space-y-2.5">
                            {selected.size > 0 && targetShift && effectiveFrom ? (
                                <>
                                    <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                        <Users className="w-3.5 h-3.5 text-[var(--primary)]" />
                                        Preview: {selected.size} karyawan → {targetShift.name}
                                    </p>
                                    <p className="text-[11px] text-[var(--text-secondary)]">
                                        Mulai <strong>{formatWIBShort(effectiveFrom)}</strong>
                                        {uiEffectiveTo
                                            ? ` sampai akhir ${formatWIBShort(uiEffectiveTo)}`
                                            : " (berjalan seterusnya)"}
                                    </p>
                                    <div className="pt-1 space-y-1">
                                        {previewGroups.map(([fromShiftId, list]) => (
                                            <p
                                                key={fromShiftId || "none"}
                                                className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"
                                            >
                                                <ArrowRight className="w-3 h-3 text-[var(--primary)] shrink-0" />
                                                <span>
                                                    {list.length} karyawan dari{" "}
                                                    <strong>{shiftNameOf(fromShiftId || undefined)}</strong>
                                                </span>
                                            </p>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <p className="text-xs text-[var(--text-muted)] italic flex items-center gap-2">
                                    <Info className="w-3.5 h-3.5 shrink-0" /> Pilih karyawan, shift, dan tanggal mulai untuk melihat preview.
                                </p>
                            )}

                            {selectedEmployeesList.length > 0 && (
                                <div className="pt-2 border-t border-[var(--border)]/70">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                                        Karyawan Terpilih ({selectedEmployeesList.length})
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                        {selectedEmployeesList.map((emp) => (
                                            <span
                                                key={emp.employeeId}
                                                className="inline-flex items-center gap-1 rounded-md bg-[var(--card)] border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)]"
                                            >
                                                <span>{`${emp.name} (${emp.employeeId})`}</span>
                                                <button
                                                    type="button"
                                                    disabled={controlsDisabled}
                                                    onClick={() => toggleOne(emp.employeeId)}
                                                    aria-label={`Hapus pilihan ${emp.employeeId}`}
                                                    className="text-[var(--text-muted)] hover:text-[var(--destructive)]"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!rangeValid && (
                                <p className="text-xs font-semibold text-[var(--destructive)] flex items-center gap-1.5 mt-2">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Hari terakhir tidak boleh mendahului tanggal mulai.
                                </p>
                            )}

                            {conflicts.length > 0 && rangeValid && (
                                <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                                    <p className="font-bold flex items-center gap-1.5">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Potensi Bentrok Jadwal
                                    </p>
                                    <p>
                                        Terdapat <strong>{conflicts.length}</strong> karyawan terpilih yang sudah memiliki jadwal pada rentang baru ini (contoh:{" "}
                                        {conflicts
                                            .slice(0, 2)
                                            .map((c) => c.name)
                                            .join(", ")}
                                        {conflicts.length > 2 ? ", dll" : ""}).
                                    </p>
                                    <p className="italic">
                                        Jadwal terbuka sebelumnya akan otomatis ditutup pada tanggal mulai baru; jadwal berbatas yang bertumpuk harus dibatalkan terlebih dahulu.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Primary Action Button */}
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting
                                ? "Menyimpan..."
                                : `Tetapkan ${targetShift?.name || "Shift"} untuk ${selected.size} orang`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
