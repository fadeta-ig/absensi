"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    CalendarClock,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Search,
    Sparkles,
    X,
} from "lucide-react";
import BulkActionBar from "@/components/ui/BulkActionBar";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getResponseErrorMessage } from "@/lib/clientErrors";
import { addCalendarDays, isValidCalendarDate, toUTCDateKey, toWIBDateString } from "@/lib/timezone";
import AssignRosterModal from "./AssignRosterModal";
import ManageRosterModal from "./ManageRosterModal";
import type {
    EmployeeLite,
    RosterTimelineCell,
    RosterTimelineResponse,
    ShiftLite,
    ShiftSource,
} from "./rosterUi";
import {
    SHIFT_PALETTES,
    formatWIBFullDate,
    formatWIBShort,
    formatWIBDayShort,
    getShiftPrimaryHours,
    normalizeDepartment,
    sourceBadgeLabel,
} from "./rosterUi";

export default function ShiftRosterPage() {
    const [employees, setEmployees] = useState<EmployeeLite[]>([]);
    const [shifts, setShifts] = useState<ShiftLite[]>([]);
    const [timeline, setTimeline] = useState<RosterTimelineResponse | null>(null);
    const [today, setToday] = useState("");

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState("");
    const [filterShift, setFilterShift] = useState("all");
    const [filterOrigin, setFilterOrigin] = useState<"all" | "assignment" | "base">("all");
    const [filterDepartment, setFilterDepartment] = useState("all");

    const [viewDate, setViewDate] = useState("");
    const [rangeDays, setRangeDays] = useState<7 | 14>(7);

    const [assignOpen, setAssignOpen] = useState(false);
    const [assignTargets, setAssignTargets] = useState<EmployeeLite[]>([]);
    const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [loadingRoster, setLoadingRoster] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [rosterError, setRosterError] = useState("");

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
        const map = new Map<string, RosterTimelineResponse["assignments"][number]>();
        for (const asg of timeline?.assignments ?? []) map.set(asg.id, asg);
        return map;
    }, [timeline]);

    const assignmentsByEmployee = useMemo(() => {
        const map = new Map<string, RosterTimelineResponse["assignments"]>();
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

    const matchesBaseFilters = useCallback(
        (emp: EmployeeLite) => {
            const cell = viewDate ? resolveCell(emp, viewDate) : null;
            if (filterOrigin === "assignment" && cell?.source !== "assignment") return false;
            if (filterOrigin === "base" && cell?.source === "assignment") return false;
            if (filterDepartment !== "all" && normalizeDepartment(emp.department) !== filterDepartment) return false;
            const q = search.trim().toLowerCase();
            if (!q) return true;
            return (
                emp.name.toLowerCase().includes(q) ||
                emp.employeeId.toLowerCase().includes(q) ||
                normalizeDepartment(emp.department).toLowerCase().includes(q)
            );
        },
        [viewDate, resolveCell, filterOrigin, filterDepartment, search],
    );

    const filtered = useMemo(() => {
        return employees.filter((emp) => {
            if (!matchesBaseFilters(emp)) return false;
            if (filterShift === "all") return true;
            const cell = viewDate ? resolveCell(emp, viewDate) : null;
            const effectiveShiftId = cell?.shiftId ?? emp.shiftId ?? defaultShiftId ?? "none";
            return effectiveShiftId === filterShift;
        });
    }, [employees, matchesBaseFilters, filterShift, viewDate, resolveCell, defaultShiftId]);

    const countByShift = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const emp of employees) {
            if (!matchesBaseFilters(emp)) continue;
            const cell = viewDate ? resolveCell(emp, viewDate) : null;
            const effectiveShiftId = cell?.shiftId ?? emp.shiftId ?? defaultShiftId ?? "none";
            counts[effectiveShiftId] = (counts[effectiveShiftId] ?? 0) + 1;
        }
        return counts;
    }, [employees, matchesBaseFilters, viewDate, resolveCell, defaultShiftId]);

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

    const selectAllFiltered = useCallback(() => {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const emp of filtered) next.add(emp.employeeId);
            return next;
        });
    }, [filtered]);

    const toggleAllFiltered = () => {
        if (allFilteredSelected) {
            setSelected((prev) => {
                const next = new Set(prev);
                for (const emp of filtered) next.delete(emp.employeeId);
                return next;
            });
        } else {
            selectAllFiltered();
        }
    };

    const hasActiveFilters =
        filterShift !== "all" || filterOrigin !== "all" || filterDepartment !== "all" || search.trim() !== "";

    const resetFilters = () => {
        setSearch("");
        setFilterShift("all");
        setFilterOrigin("all");
        setFilterDepartment("all");
    };

    const openAssignModal = () => {
        setAssignTargets(employees.filter((emp) => selected.has(emp.employeeId)));
        setAssignOpen(true);
    };

    const handleAssignApplied = useCallback(() => {
        setAssignOpen(false);
        setSelected(new Set());
        if (viewDateRef.current) {
            void loadTimeline(viewDateRef.current, rangeDaysRef.current);
        }
    }, [loadTimeline]);

    const detailEmployee = useMemo(
        () => (detailEmployeeId ? employees.find((e) => e.employeeId === detailEmployeeId) ?? null : null),
        [detailEmployeeId, employees],
    );

    const detailAssignments = useMemo(
        () => (detailEmployeeId ? assignmentsByEmployee.get(detailEmployeeId) ?? [] : []),
        [detailEmployeeId, assignmentsByEmployee],
    );

    const controlsDisabled = loading;
    const lastColumn = dateColumns.length > 0 ? dateColumns[dateColumns.length - 1] : "";

    return (
        <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
            {/* ─── Header + Navigasi Periode ─────────────────────────────── */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <CalendarClock className="w-5 h-5 text-[var(--primary)]" />
                        Roster Shift
                    </h1>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                        {viewDate ? (
                            <>
                                <span className="font-semibold text-[var(--text-primary)]">
                                    {formatWIBFullDate(viewDate)}
                                </span>
                                {lastColumn && lastColumn !== viewDate && (
                                    <span> s.d. {formatWIBShort(lastColumn)}</span>
                                )}{" "}
                                {today && viewDate === today && (
                                    <span className="badge badge-success text-[10px] !py-0 ml-1">Hari Ini</span>
                                )}
                                {today && viewDate > today && (
                                    <span className="badge badge-info text-[10px] !py-0 ml-1">Masa Depan</span>
                                )}
                                {today && viewDate < today && (
                                    <span className="badge bg-[var(--secondary)] text-[var(--text-muted)] text-[10px] !py-0 ml-1">
                                        Riwayat
                                    </span>
                                )}
                            </>
                        ) : (
                            "Pilih tanggal untuk melihat jadwal karyawan."
                        )}
                    </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5 text-[11px]">
                        <button
                            type="button"
                            disabled={controlsDisabled}
                            onClick={() => handleRangeDaysChange(7)}
                            className={`px-2 py-1 rounded-md font-semibold transition-colors ${
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
                            className={`px-2 py-1 rounded-md font-semibold transition-colors ${
                                rangeDays === 14
                                    ? "bg-[var(--primary)] text-white"
                                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                        >
                            14 Hari
                        </button>
                    </div>
                    <button
                        type="button"
                        disabled={controlsDisabled || !isValidCalendarDate(viewDate)}
                        onClick={() => handleViewDateChange(addCalendarDays(viewDate, -rangeDays))}
                        className="btn btn-secondary btn-sm !px-2 !py-1.5"
                        title={`Mundur ${rangeDays} hari`}
                        aria-label="Periode sebelumnya"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <input
                        id="roster-view-date"
                        type="date"
                        aria-label="Tanggal Lihat Roster"
                        className="form-input !w-40 !py-1.5 text-xs font-semibold"
                        value={viewDate}
                        disabled={controlsDisabled}
                        onChange={(e) => handleViewDateChange(e.target.value)}
                    />
                    <button
                        type="button"
                        disabled={controlsDisabled || !isValidCalendarDate(viewDate)}
                        onClick={() => handleViewDateChange(addCalendarDays(viewDate, rangeDays))}
                        className="btn btn-secondary btn-sm !px-2 !py-1.5"
                        title={`Maju ${rangeDays} hari`}
                        aria-label="Periode berikutnya"
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
                </div>
            </div>

            {loadError && <FeedbackMessage variant="error">{loadError}</FeedbackMessage>}
            {rosterError && (
                <FeedbackMessage variant="warning">
                    Timeline roster tidak dapat dimuat ({rosterError}). Tabel memakai shift dasar karyawan sebagai
                    fallback — periksa koneksi lalu pilih ulang tanggal.
                </FeedbackMessage>
            )}

            {/* ─── Filter ────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                    <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        id="roster-search"
                        type="text"
                        className="form-input !pl-9 !w-56 text-xs"
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
                <select
                    id="roster-filter-dept"
                    className="form-select !w-auto text-xs"
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
                <select
                    id="roster-filter-origin"
                    className="form-select !w-auto text-xs"
                    aria-label="Filter berdasarkan sumber jadwal"
                    value={filterOrigin}
                    disabled={controlsDisabled}
                    onChange={(e) => setFilterOrigin(e.target.value as "all" | "assignment" | "base")}
                >
                    <option value="all">Semua sumber</option>
                    <option value="assignment">Roster</option>
                    <option value="base">Shift dasar</option>
                </select>
                {hasActiveFilters && (
                    <button
                        type="button"
                        disabled={controlsDisabled}
                        onClick={resetFilters}
                        className="text-[11px] font-semibold text-[var(--primary)] hover:underline"
                    >
                        Reset filter
                    </button>
                )}
            </div>

            {/* ─── Legenda + Filter Shift ──────────────────────────────── */}
            {shifts.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                    {shifts.map((s) => {
                        const isActive = filterShift === s.id;
                        const palette = shiftPaletteById.get(s.id) ?? SHIFT_PALETTES[0];
                        return (
                            <button
                                key={s.id}
                                type="button"
                                disabled={controlsDisabled}
                                onClick={() => setFilterShift((prev) => (prev === s.id ? "all" : s.id))}
                                aria-pressed={isActive}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all ${
                                    isActive
                                        ? "border-[var(--primary)] bg-[var(--primary)]/10 font-bold text-[var(--text-primary)]"
                                        : "border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:border-[var(--primary)]/40"
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full ${palette.dot}`} />
                                {s.name}
                                <span className="font-bold text-[var(--text-muted)]">{countByShift[s.id] ?? 0}</span>
                            </button>
                        );
                    })}
                    <span className="text-[var(--text-muted)] ml-1">
                        Kotak solid = Roster • Garis putus = Dasar/Default
                    </span>
                </div>
            )}

            {/* ─── Matriks Timeline ──────────────────────────────────── */}
            <div className="card p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-sm font-bold text-[var(--text-primary)]">
                        Matriks Jadwal{" "}
                        <span className="font-normal text-[var(--text-muted)]">
                            ({filtered.length} dari {employees.length} karyawan)
                        </span>
                    </h2>
                    {loadingRoster && (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                            Memuat...
                        </span>
                    )}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-14 text-sm text-[var(--text-muted)]">
                        <Loader2 className="w-5 h-5 animate-spin mr-2 text-[var(--primary)]" /> Memuat data roster...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12 px-4 border border-dashed border-[var(--border)] rounded-xl">
                        <p className="text-sm font-semibold text-[var(--text-secondary)]">
                            Tidak ada karyawan yang cocok dengan filter.
                        </p>
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="text-xs font-semibold text-[var(--primary)] hover:underline mt-1"
                        >
                            Reset filter
                        </button>
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
                                        <TableHead className="min-w-[210px]">Karyawan</TableHead>
                                        {dateColumns.map((colDate) => {
                                            const weekday = toUTCDateKey(colDate).getUTCDay();
                                            const isSunday = weekday === 0;
                                            const isTodayCol = Boolean(today && colDate === today);
                                            return (
                                                <TableHead
                                                    key={colDate}
                                                    className={`text-center min-w-[92px] !px-1.5 !py-2 ${
                                                        isTodayCol ? "bg-emerald-500/10" : ""
                                                    }`}
                                                >
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        <span
                                                            className={`text-[10px] font-bold uppercase ${
                                                                isSunday
                                                                    ? "text-rose-600 dark:text-rose-400"
                                                                    : "text-[var(--text-muted)]"
                                                            }`}
                                                        >
                                                            {formatWIBDayShort(colDate)}
                                                        </span>
                                                        <span className="text-xs font-bold text-[var(--text-primary)]">
                                                            {formatWIBShort(colDate)}
                                                        </span>
                                                        {isTodayCol && (
                                                            <span className="text-[9px] font-bold px-1.5 py-0 rounded-full bg-emerald-500 text-white">
                                                                Hari Ini
                                                            </span>
                                                        )}
                                                    </div>
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
                                                        title="Pilih karyawan ini untuk penetapan roster"
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
                                                        <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
                                                            <span className="font-mono">{emp.employeeId}</span>
                                                            {dept && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span>{dept}</span>
                                                                </>
                                                            )}
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
                                                            <div
                                                                title={
                                                                    asg
                                                                        ? `${shift?.name ?? "Shift"} (${sourceBadgeLabel(cell.source)})`
                                                                        : `${shift?.name ?? "Belum ada"} (${sourceBadgeLabel(cell.source)})`
                                                                }
                                                                className={`rounded-lg border px-1.5 py-1 flex flex-col gap-0.5 ${
                                                                    isOff
                                                                        ? "bg-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-300"
                                                                        : cell.source === "assignment"
                                                                          ? palette.solid
                                                                          : palette.muted
                                                                }`}
                                                            >
                                                                <span className="text-[10px] font-bold truncate text-left">
                                                                    {shift ? shift.name : "Kosong"}
                                                                </span>
                                                                <span className="text-[10px] opacity-85 truncate text-left">
                                                                    {isOff
                                                                        ? "Libur"
                                                                        : daySchedule
                                                                          ? `${daySchedule.startTime}-${daySchedule.endTime}`
                                                                          : getShiftPrimaryHours(shift)}
                                                                </span>
                                                            </div>
                                                        </TableCell>
                                                    );
                                                })}

                                                <TableCell className="text-right">
                                                    <button
                                                        type="button"
                                                        disabled={controlsDisabled}
                                                        onClick={() => setDetailEmployeeId(emp.employeeId)}
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

            <BulkActionBar
                selectedCount={selected.size}
                totalCount={filtered.length}
                onClearSelection={() => setSelected(new Set())}
                onSelectAll={selectAllFiltered}
                allSelected={allFilteredSelected}
                itemLabel="karyawan"
            >
                <button type="button" onClick={openAssignModal} className="btn btn-primary btn-sm">
                    <Sparkles className="w-3.5 h-3.5" />
                    Tetapkan Roster
                </button>
            </BulkActionBar>

            {assignOpen && (
                <AssignRosterModal
                    employees={assignTargets}
                    shifts={shifts}
                    defaultStartDate={viewDateRef.current || today || toWIBDateString()}
                    shiftNameOf={shiftNameOf}
                    onClose={() => setAssignOpen(false)}
                    onApplied={handleAssignApplied}
                />
            )}

            {detailEmployee && (
                <ManageRosterModal
                    employee={detailEmployee}
                    assignments={detailAssignments}
                    today={today}
                    shiftNameOf={shiftNameOf}
                    onClose={() => setDetailEmployeeId(null)}
                    onChanged={() => {
                        if (viewDateRef.current) {
                            void loadTimeline(viewDateRef.current, rangeDaysRef.current);
                        }
                    }}
                />
            )}
        </div>
    );
}
