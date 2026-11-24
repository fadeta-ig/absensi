"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    CalendarOff,
    Send,
    CalendarDays,
    Clock,
    CheckCircle,
    XCircle,
    Loader2,
    X,
    Paperclip,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import ResponsiveSheet from "@/components/ui/ResponsiveSheet";
import DataTablePagination from "@/components/ui/DataTablePagination";
import EmptyState from "@/components/ui/EmptyState";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import ListSkeleton from "@/components/ui/ListSkeleton";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge, { type StatusTone } from "@/components/ui/StatusBadge";
import DraftNotice from "@/components/ui/DraftNotice";
import { formatDisplayDate, formatIndonesianDate } from "@/lib/utils";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import {
    addCalendarDays,
    formatWIBDateTime,
    isValidCalendarDate,
    toUTCDateKey,
    toWIBDateString,
    wibDateTimeToDate,
} from "@/lib/timezone";
import { useGlobalHolidays } from "@/hooks/useGlobalHolidays";
import { useEmployeeDraft } from "@/hooks/useEmployeeDraft";
import { formatReattachHint, isPlainObject } from "@/lib/formPersistence";

interface LeaveRequest {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
    attachment?: string | null;
    attachmentUrl?: string | null;
    attachmentMime?: string | null;
    attachmentSize?: number | null;
    createdAt: string;
    employee?: {
        totalLeave: number;
        usedLeave: number;
    };
}

interface LeaveBalance {
    totalLeave: number;
    usedLeave: number;
    pendingAnnualDays: number;
    remainingLeave: number;
    availableAnnualLeave: number;
}

interface ScheduleDay {
    date: string;
    isOff: boolean;
    shiftId: string | null;
    shiftName: string | null;
}

interface MonthCursor {
    y: number;
    m: number;
}

type HistoryStatusFilter = "all" | "pending" | "approved" | "rejected";

const DISCRETE_TYPES = new Set(["annual", "sick", "personal"]);
const WINDOW_DAYS = 30;
const MONTH_NAV_LIMIT = 12;
const WEEKDAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTH_NAMES = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
];

const LEAVE_TYPE_OPTIONS = [
    { value: "annual", label: "Cuti Tahunan" },
    { value: "sick", label: "Izin Sakit" },
    { value: "personal", label: "Izin Pribadi" },
    { value: "maternity", label: "Cuti Melahirkan" },
    { value: "paternity", label: "Cuti Ayah" },
] as const;

function toDateKey(raw: string): string {
    return typeof raw === "string" ? raw.slice(0, 10) : "";
}

function monthCursorOf(key: string): MonthCursor {
    return { y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) - 1 };
}

function monthStartOf(c: MonthCursor): string {
    return `${c.y}-${String(c.m + 1).padStart(2, "0")}-01`;
}

function daysInMonthOf(c: MonthCursor): number {
    return new Date(Date.UTC(c.y, c.m + 1, 0)).getUTCDate();
}

function shiftMonth(c: MonthCursor, delta: number): MonthCursor {
    const total = c.y * 12 + c.m + delta;
    return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
}

function compareMonth(a: MonthCursor, b: MonthCursor): number {
    return a.y * 12 + a.m - (b.y * 12 + b.m);
}

function safeAddDays(key: string, days: number): string {
    const clean = toDateKey(key);
    if (!isValidCalendarDate(clean)) return clean;
    return addCalendarDays(clean, days);
}

function getDayOfWeek(key: string): number {
    const clean = toDateKey(key);
    if (!isValidCalendarDate(clean)) return 0;
    return toUTCDateKey(clean).getUTCDay();
}

function formatShortDayMonth(key: string): string {
    const clean = toDateKey(key);
    if (!isValidCalendarDate(clean)) return clean;
    return formatWIBDateTime(wibDateTimeToDate(clean, "00:00:00"), {
        day: "numeric",
        month: "short",
    });
}

function calendarDaysInclusive(start: string, end: string): number {
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    if (!isValidCalendarDate(startKey) || !isValidCalendarDate(endKey) || endKey < startKey) {
        return 0;
    }
    const diffMs = toUTCDateKey(endKey).getTime() - toUTCDateKey(startKey).getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

function expandRangeToDates(start: string, end: string, max = 400): string[] {
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    if (!isValidCalendarDate(startKey) || !isValidCalendarDate(endKey) || endKey < startKey) {
        return [];
    }
    const out: string[] = [];
    let cur = startKey;
    for (let i = 0; i < max; i++) {
        out.push(cur);
        if (cur === endKey) break;
        const next = safeAddDays(cur, 1);
        if (!next || next === cur || next > endKey) break;
        cur = next;
    }
    return out;
}

function getTypeLabel(type: string): string {
    return LEAVE_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type;
}

function getStatusInfo(status: string): {
    label: string;
    tone: StatusTone;
    icon: typeof CheckCircle;
} {
    switch (status) {
        case "approved":
            return { label: "Disetujui", tone: "success", icon: CheckCircle };
        case "rejected":
            return { label: "Ditolak", tone: "danger", icon: XCircle };
        default:
            return { label: "Menunggu", tone: "warning", icon: Clock };
    }
}

export default function LeavePage() {
    const toast = useToast();
    const toastRef = useRef(toast);
    toastRef.current = toast;

    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [balance, setBalance] = useState<LeaveBalance | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        type: "annual",
        startDate: "",
        endDate: "",
        reason: "",
        attachment: "",
    });
    const [attachmentName, setAttachmentName] = useState("");
    const [pendingAttachmentHint, setPendingAttachmentHint] = useState<string | null>(null);
    const [selectedDates, setSelectedDates] = useState<string[]>([]);

    const wibToday = useMemo(() => toWIBDateString(), []);
    const tomorrowKey = useMemo(() => safeAddDays(wibToday, 1), [wibToday]);
    const [monthCursor, setMonthCursor] = useState<MonthCursor>(() => monthCursorOf(tomorrowKey));

    // Jendela 30 hari kalender untuk Izin Sakit / Pribadi: tepat Besok (H+1) s.d. H+30
    const windowStart = tomorrowKey;
    const windowDates = useMemo(() => {
        const out: string[] = [];
        for (let i = 0; i < WINDOW_DAYS; i++) {
            out.push(safeAddDays(windowStart, i));
        }
        return out;
    }, [windowStart]);
    const windowEnd = windowDates.length > 0 ? windowDates[windowDates.length - 1] : "";
    const windowKey = `${windowStart}:${windowDates.length}`;

    const isAnnualForm = form.type === "annual";
    const isDiscrete = DISCRETE_TYPES.has(form.type);

    // Kalender global (libur nasional + cuti bersama), mendukung rentang lintas tahun pada Sakit/Pribadi
    const primaryHolidayYear = isAnnualForm ? monthCursor.y : Number(windowStart.slice(0, 4));
    const secondaryHolidayYear =
        !isAnnualForm && windowEnd && Number(windowEnd.slice(0, 4)) !== primaryHolidayYear
            ? Number(windowEnd.slice(0, 4))
            : null;
    const primaryHolidays = useGlobalHolidays(showForm ? primaryHolidayYear : null);
    const secondaryHolidays = useGlobalHolidays(showForm ? secondaryHolidayYear : null);

    const allHolidays = useMemo(() => {
        if (!secondaryHolidayYear) return primaryHolidays.holidays;
        return [...primaryHolidays.holidays, ...secondaryHolidays.holidays];
    }, [primaryHolidays.holidays, secondaryHolidays.holidays, secondaryHolidayYear]);

    const holidaysByDate = useMemo(() => {
        const map = new Map<string, (typeof allHolidays)[number][]>();
        for (const holiday of allHolidays) {
            const list = map.get(holiday.date) ?? [];
            list.push(holiday);
            map.set(holiday.date, list);
        }
        return map;
    }, [allHolidays]);

    const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [scheduleError, setScheduleError] = useState("");
    const scheduleLoadedRef = useRef("");
    const scheduleAbortRef = useRef<AbortController | null>(null);
    const leavesAbortRef = useRef<AbortController | null>(null);

    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);

    const loadLeaves = useCallback(async () => {
        leavesAbortRef.current?.abort();
        const controller = new AbortController();
        leavesAbortRef.current = controller;

        setInitialLoading(true);
        setLoadError("");
        try {
            const res = await fetch("/api/leave?withBalance=1", {
                signal: controller.signal,
                cache: "no-store",
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat data cuti."));
            }
            const data = await res.json();
            if (controller.signal.aborted) return;

            if (data && typeof data === "object" && !Array.isArray(data) && Array.isArray(data.leaves)) {
                setLeaves(data.leaves as LeaveRequest[]);
                if (data.balance) {
                    setBalance(data.balance as LeaveBalance);
                }
            } else if (Array.isArray(data)) {
                const leaveList = data as LeaveRequest[];
                setLeaves(leaveList);
                const empQuota = leaveList[0]?.employee;
                const pendingDays = leaveList
                    .filter((l) => l.status === "pending" && l.type === "annual")
                    .reduce((sum, l) => sum + calendarDaysInclusive(l.startDate, l.endDate), 0);
                if (empQuota) {
                    const rem = Math.max(0, empQuota.totalLeave - empQuota.usedLeave);
                    setBalance({
                        totalLeave: empQuota.totalLeave,
                        usedLeave: empQuota.usedLeave,
                        pendingAnnualDays: pendingDays,
                        remainingLeave: rem,
                        availableAnnualLeave: Math.max(0, rem - pendingDays),
                    });
                }
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            reportClientError("EmployeeLeavePage", "Gagal memuat data cuti", error);
            const message = getFriendlyClientErrorMessage(
                error,
                "Gagal memuat data cuti. Periksa koneksi Anda lalu coba lagi."
            );
            setLoadError(message);
            toastRef.current(message, "error");
        } finally {
            if (leavesAbortRef.current === controller) {
                setInitialLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void loadLeaves();
        return () => leavesAbortRef.current?.abort();
    }, [loadLeaves]);

    const loadSchedule = useCallback(async (startKey?: string, dayCount?: number) => {
        scheduleAbortRef.current?.abort();
        const controller = new AbortController();
        scheduleAbortRef.current = controller;

        setScheduleLoading(true);
        setScheduleError("");
        try {
            const start = startKey ?? safeAddDays(toWIBDateString(), 1);
            const days = dayCount ?? WINDOW_DAYS;
            const res = await fetch(`/api/employee/shift-schedule?start=${start}&days=${days}`, {
                signal: controller.signal,
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat jadwal shift."));
            }
            const data = await res.json();
            if (controller.signal.aborted) return;
            setSchedule(Array.isArray(data) ? data : []);
            scheduleLoadedRef.current = `${start}:${days}`;
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            reportClientError("EmployeeLeavePage", "Gagal memuat jadwal shift", error);
            setSchedule([]);
            scheduleLoadedRef.current = "";
            setScheduleError(
                getFriendlyClientErrorMessage(error, "Jadwal shift belum dapat dimuat.")
            );
        } finally {
            if (scheduleAbortRef.current === controller) {
                setScheduleLoading(false);
            }
        }
    }, []);

    const baseMonth = useMemo(() => monthCursorOf(wibToday), [wibToday]);
    const maxMonth = useMemo(() => shiftMonth(baseMonth, MONTH_NAV_LIMIT), [baseMonth]);
    const clampCursor = useCallback(
        (c: MonthCursor): MonthCursor => {
            if (compareMonth(c, baseMonth) < 0) return baseMonth;
            if (compareMonth(c, maxMonth) > 0) return maxMonth;
            return c;
        },
        [baseMonth, maxMonth]
    );

    const {
        restored: leaveDraftRestored,
        clearDraft: clearLeaveDraft,
        discardDraft: discardLeaveDraft,
    } = useEmployeeDraft<{
        showForm: boolean;
        type: string;
        startDate: string;
        endDate: string;
        reason: string;
        selectedDates: string[];
        monthCursor: MonthCursor;
        hadAttachmentName: string | null;
    }>({
        formKey: "leave:create",
        value: {
            showForm,
            type: form.type,
            startDate: form.startDate,
            endDate: form.endDate,
            reason: form.reason,
            selectedDates,
            monthCursor,
            hadAttachmentName: form.attachment ? (attachmentName || "lampiran") : pendingAttachmentHint,
        },
        isDirty: (draft) =>
            draft.reason.trim().length > 0 ||
            draft.selectedDates.length > 0 ||
            draft.startDate.length > 0 ||
            draft.endDate.length > 0 ||
            draft.type !== "annual" ||
            Boolean(draft.hadAttachmentName),
        validate: (raw): raw is {
            showForm: boolean;
            type: string;
            startDate: string;
            endDate: string;
            reason: string;
            selectedDates: string[];
            monthCursor: MonthCursor;
            hadAttachmentName: string | null;
        } => {
            if (!isPlainObject(raw)) return false;
            const validTypes = ["annual", "sick", "personal", "maternity", "paternity"];
            if (typeof raw.showForm !== "boolean") return false;
            if (typeof raw.type !== "string" || !validTypes.includes(raw.type)) return false;
            if (
                typeof raw.startDate !== "string" ||
                typeof raw.endDate !== "string" ||
                typeof raw.reason !== "string"
            ) {
                return false;
            }
            if (
                !Array.isArray(raw.selectedDates) ||
                !raw.selectedDates.every((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
            ) {
                return false;
            }
            if (
                !isPlainObject(raw.monthCursor) ||
                typeof raw.monthCursor.y !== "number" ||
                typeof raw.monthCursor.m !== "number"
            ) {
                return false;
            }
            if (raw.hadAttachmentName !== null && typeof raw.hadAttachmentName !== "string") {
                return false;
            }
            return true;
        },
        onRestore: (draft) => {
            setForm({
                type: draft.type,
                startDate: draft.startDate,
                endDate: draft.endDate,
                reason: draft.reason,
                attachment: "",
            });
            const validDates = DISCRETE_TYPES.has(draft.type)
                ? draft.selectedDates.filter((d) => d > wibToday).sort()
                : [];
            setSelectedDates(validDates);
            setMonthCursor(clampCursor(draft.monthCursor));
            setPendingAttachmentHint(draft.hadAttachmentName);
            if (draft.showForm) {
                setShowForm(true);
            }
        },
    });

    const monthStart = monthStartOf(monthCursor);
    const monthLen = daysInMonthOf(monthCursor);
    const monthLeadBlanks = getDayOfWeek(monthStart);
    const monthScheduleKey = `${monthStart}:${monthLen}`;
    const monthLabel = `${MONTH_NAMES[monthCursor.m]} ${monthCursor.y}`;

    // Tanggal merah kontekstual: per bulan untuk Cuti Tahunan, atau dalam rentang 30 hari untuk Sakit/Pribadi
    const visibleHolidays = useMemo(() => {
        if (isAnnualForm) {
            const prefix = `${monthCursor.y}-${String(monthCursor.m + 1).padStart(2, "0")}-`;
            return allHolidays
                .filter((h) => h.date.startsWith(prefix))
                .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
        }
        return allHolidays
            .filter((h) => h.date >= windowStart && h.date <= windowEnd)
            .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    }, [allHolidays, isAnnualForm, monthCursor.y, monthCursor.m, windowStart, windowEnd]);

    const yearOptions = useMemo(() => {
        const opts: number[] = [];
        for (let y = baseMonth.y; y <= maxMonth.y; y++) opts.push(y);
        return opts;
    }, [baseMonth, maxMonth]);

    const annualAnchor = isAnnualForm && selectedDates.length > 0 ? selectedDates[0] : null;
    const annualAnchorEnd = annualAnchor ? safeAddDays(annualAnchor, WINDOW_DAYS - 1) : null;

    useEffect(() => {
        if (!showForm || !isDiscrete) return;
        if (isAnnualForm) {
            if (scheduleLoadedRef.current !== monthScheduleKey) {
                void loadSchedule(monthStart, monthLen);
            }
        } else if (scheduleLoadedRef.current !== windowKey) {
            void loadSchedule(windowStart, windowDates.length || WINDOW_DAYS);
        }
        return () => scheduleAbortRef.current?.abort();
    }, [
        showForm,
        isDiscrete,
        isAnnualForm,
        monthScheduleKey,
        monthStart,
        monthLen,
        windowKey,
        windowStart,
        windowDates.length,
        loadSchedule,
    ]);

    const occupiedSet = useMemo(() => {
        const set = new Set<string>();
        leaves
            .filter((l) => l.status === "pending" || l.status === "approved")
            .forEach((l) => {
                expandRangeToDates(l.startDate, l.endDate).forEach((d) => set.add(d));
            });
        return set;
    }, [leaves]);

    const scheduleByDate = useMemo(() => {
        const map = new Map<string, ScheduleDay>();
        schedule.forEach((s) => map.set(toDateKey(s.date), s));
        return map;
    }, [schedule]);

    const isDateOff = useCallback(
        (dateKey: string): boolean => {
            const item = scheduleByDate.get(dateKey);
            if (!item || !item.shiftId) {
                return getDayOfWeek(dateKey) === 0;
            }
            return item.isOff;
        },
        [scheduleByDate]
    );

    const totalLeave = balance?.totalLeave ?? 0;
    const usedLeave = balance?.usedLeave ?? 0;
    const pendingAnnualDays = balance?.pendingAnnualDays ?? 0;
    const remainingLeave = balance?.remainingLeave ?? 0;
    const availableAnnualLeave = balance?.availableAnnualLeave ?? 0;
    const maxSelectable = form.type === "annual" ? availableAnnualLeave : WINDOW_DAYS;
    const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);

    const toggleDate = (dateKey: string) => {
        setSelectedDates((prev) => {
            if (prev.includes(dateKey)) {
                const next = prev.filter((d) => d !== dateKey);
                if (form.type === "annual" && next.length > 0) {
                    const anchor = next[0];
                    const maxKey = safeAddDays(anchor, WINDOW_DAYS - 1);
                    const kept = next.filter((d) => d >= anchor && d <= maxKey);
                    if (kept.length !== next.length) {
                        toastRef.current(
                            "Tanggal di luar rentang 30 hari dari pilihan pertama otomatis dibatalkan.",
                            "warning"
                        );
                    }
                    return kept;
                }
                return next;
            }
            if (form.type === "annual" && prev.length >= maxSelectable) {
                toastRef.current(
                    `Batas pilihan Cuti Tahunan adalah ${maxSelectable} hari sesuai sisa tersedia Anda.`,
                    "warning"
                );
                return prev;
            }
            if (prev.length >= WINDOW_DAYS) {
                toastRef.current(`Maksimal ${WINDOW_DAYS} hari dalam satu pengajuan.`, "warning");
                return prev;
            }
            if (form.type === "annual" && prev.length > 0) {
                const anchor = prev[0];
                const maxKey = safeAddDays(anchor, WINDOW_DAYS - 1);
                if (dateKey < anchor || dateKey > maxKey) {
                    toastRef.current(
                        `Pilih tanggal dalam rentang ${formatShortDayMonth(anchor)} s.d. ${formatShortDayMonth(maxKey)}.`,
                        "warning"
                    );
                    return prev;
                }
            }
            return [...prev, dateKey].sort();
        });
    };

    const renderDayCell = (dateKey: string, showWeekdayAndMonth: boolean) => {
        const occupied = occupiedSet.has(dateKey);
        const nationalHoliday = holidaysByDate.get(dateKey)?.[0] ?? null;
        const off = isDateOff(dateKey) || nationalHoliday !== null;
        const outOfAnchor =
            isAnnualForm &&
            annualAnchor !== null &&
            annualAnchorEnd !== null &&
            (dateKey < annualAnchor || dateKey > annualAnchorEnd);
        const past = dateKey <= wibToday;
        const disabled =
            occupied ||
            off ||
            past ||
            outOfAnchor ||
            (form.type === "annual" && availableAnnualLeave <= 0);
        const selected = selectedDateSet.has(dateKey);
        const dayNum = Number(dateKey.slice(8, 10));
        const weekday = WEEKDAY_SHORT[getDayOfWeek(dateKey)];
        const monthShort = showWeekdayAndMonth ? MONTH_NAMES[Number(dateKey.slice(5, 7)) - 1]?.slice(0, 3) : "";

        const titleText = nationalHoliday
            ? `${formatIndonesianDate(dateKey)} · Libur nasional: ${nationalHoliday.name}`
            : occupied
                ? `${formatIndonesianDate(dateKey)} · Sudah diajukan`
                : off
                    ? `${formatIndonesianDate(dateKey)} · Libur jadwal`
                    : past
                        ? `${formatIndonesianDate(dateKey)} · Tanggal sudah lewat`
                        : outOfAnchor
                            ? `${formatIndonesianDate(dateKey)} · Di luar rentang 30 hari dari tanggal pertama`
                            : formatIndonesianDate(dateKey);

        return (
            <button
                key={dateKey}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => toggleDate(dateKey)}
                title={titleText}
                className={`relative rounded-xl border px-1.5 py-2 text-center transition-colors min-h-[48px] flex flex-col items-center justify-center ${
                    selected
                        ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)] font-bold"
                        : nationalHoliday
                            ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 cursor-not-allowed"
                            : occupied
                                ? "border-dashed border-[var(--border)] bg-[var(--secondary)] text-[var(--text-muted)] opacity-70 cursor-not-allowed"
                                : disabled
                                    ? "border-[var(--border)] bg-[var(--muted)] text-[var(--text-muted)] opacity-45 cursor-not-allowed"
                                    : "border-[var(--border)] bg-[var(--card)] text-[var(--text-primary)] hover:border-[color-mix(in_srgb,var(--primary)_45%,transparent)] hover:bg-[var(--secondary)] cursor-pointer active:scale-[0.97]"
                }`}
            >
                {selected && (
                    <span
                        aria-hidden="true"
                        className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-[9px] font-extrabold leading-none"
                    >
                        ✓
                    </span>
                )}
                {showWeekdayAndMonth && (
                    <span
                        className={`block text-[10px] leading-none mb-0.5 ${
                            selected
                                ? "text-[color-mix(in_srgb,var(--primary)_80%,transparent)] font-semibold"
                                : "text-[var(--text-muted)]"
                        }`}
                    >
                        {weekday} · {monthShort}
                    </span>
                )}
                <span
                    className={`block text-sm leading-tight ${
                        selected
                            ? "text-[var(--primary)] font-extrabold"
                            : nationalHoliday
                                ? "font-bold text-red-700 dark:text-red-300"
                                : "font-semibold"
                    }`}
                >
                    {dayNum}
                </span>
                {(occupied || off) && (
                    <span className="block text-[9px] leading-tight mt-0.5 text-[var(--text-muted)] truncate max-w-full">
                        {occupied ? "Diajukan" : nationalHoliday ? "Merah" : "Libur"}
                    </span>
                )}
            </button>
        );
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            e.target.value = "";
            toastRef.current("Ukuran file melebihi batas maksimal 2 MB.", "warning");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setForm((prev) => ({ ...prev, attachment: reader.result as string }));
            setAttachmentName(file.name);
            setPendingAttachmentHint(null);
            toastRef.current("Bukti lampiran dipilih.", "success");
        };
        reader.onerror = () => {
            toastRef.current("File tidak dapat dibaca. Silakan pilih file lain.", "error");
        };
        reader.readAsDataURL(file);
        e.target.value = "";
    };

    const clearAttachment = () => {
        setForm((prev) => ({ ...prev, attachment: "" }));
        setAttachmentName("");
        setPendingAttachmentHint(null);
    };

    const rangeCalendarDays = useMemo(() => {
        if (isDiscrete || !form.startDate || !form.endDate) return 0;
        return calendarDaysInclusive(form.startDate, form.endDate);
    }, [isDiscrete, form.startDate, form.endDate]);

    const rangeValidationError = useMemo(() => {
        if (isDiscrete || !form.startDate || !form.endDate) return "";
        if (form.endDate < form.startDate) {
            return "Tanggal selesai harus sama atau setelah tanggal mulai.";
        }
        if (form.type === "maternity" && rangeCalendarDays < 90) {
            return `Durasi saat ini ${rangeCalendarDays} hari kalender (minimal 90 hari kalender).`;
        }
        if (form.type === "paternity" && rangeCalendarDays > 3) {
            return `Durasi saat ini ${rangeCalendarDays} hari kalender (maksimal 3 hari kalender).`;
        }
        return "";
    }, [isDiscrete, form.type, form.startDate, form.endDate, rangeCalendarDays]);

    const resetFormState = () => {
        setSelectedDates([]);
        setAttachmentName("");
        setPendingAttachmentHint(null);
        setMonthCursor(baseMonth);
        setForm({ type: "annual", startDate: "", endDate: "", reason: "", attachment: "" });
    };

    const handleSubmitDiscrete = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedDates.length === 0) {
            toastRef.current("Pilih minimal 1 tanggal terlebih dahulu.", "warning");
            return;
        }
        if (!form.reason.trim()) {
            toastRef.current("Alasan pengajuan wajib diisi.", "warning");
            return;
        }
        if (form.type === "annual" && selectedDates.length > maxSelectable) {
            toastRef.current(
                `Pilihan (${selectedDates.length} hari) melebihi sisa kuota tersedia (${maxSelectable} hari).`,
                "error"
            );
            return;
        }
        setLoading(true);
        try {
            const sorted = [...selectedDates].sort();
            const res = await fetch("/api/leave", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: form.type,
                    dates: sorted,
                    reason: form.reason.trim(),
                    attachment: form.attachment || null,
                    ...(form.type === "annual" ? { anchorDate: sorted[0] } : {}),
                }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal mengirim pengajuan cuti."));
            }
            const payload = await res.json();
            const createdCount = typeof payload?.count === "number" ? payload.count : sorted.length;
            clearLeaveDraft();
            setShowForm(false);
            resetFormState();
            toastRef.current(`Pengajuan terkirim (${createdCount} hari).`, "success");
            await loadLeaves();
        } catch (error) {
            reportClientError("EmployeeLeavePage", "Gagal mengirim pengajuan cuti", error, {
                type: form.type,
                dates: selectedDates.join(","),
            });
            toastRef.current(
                getFriendlyClientErrorMessage(
                    error,
                    "Gagal mengirim pengajuan cuti. Periksa koneksi Anda lalu coba lagi."
                ),
                "error"
            );
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitRange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (rangeValidationError) {
            toastRef.current(rangeValidationError, "warning");
            return;
        }
        if (!form.reason.trim()) {
            toastRef.current("Alasan pengajuan wajib diisi.", "warning");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/leave", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: form.type,
                    startDate: form.startDate,
                    endDate: form.endDate,
                    reason: form.reason.trim(),
                    attachment: form.attachment || null,
                }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal mengirim pengajuan cuti."));
            }
            clearLeaveDraft();
            setShowForm(false);
            resetFormState();
            toastRef.current("Pengajuan cuti terkirim.", "success");
            await loadLeaves();
        } catch (error) {
            reportClientError("EmployeeLeavePage", "Gagal mengirim pengajuan cuti", error, {
                type: form.type,
                startDate: form.startDate,
                endDate: form.endDate,
            });
            toastRef.current(
                getFriendlyClientErrorMessage(
                    error,
                    "Gagal mengirim pengajuan cuti. Periksa koneksi Anda lalu coba lagi."
                ),
                "error"
            );
        } finally {
            setLoading(false);
        }
    };

    const openAttachment = (leave: LeaveRequest) => {
        if (leave.attachmentUrl) {
            window.open(leave.attachmentUrl, "_blank", "noopener,noreferrer");
            return;
        }
        if (leave.attachment) {
            const win = window.open();
            if (win) {
                win.document.write(
                    `<iframe src="${leave.attachment}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
                );
            }
        }
    };

    const statusCounts = useMemo(() => {
        const counts = { all: leaves.length, pending: 0, approved: 0, rejected: 0 };
        for (const item of leaves) {
            if (item.status === "approved") counts.approved += 1;
            else if (item.status === "rejected") counts.rejected += 1;
            else counts.pending += 1;
        }
        return counts;
    }, [leaves]);

    const filteredLeaves = useMemo(() => {
        if (statusFilter === "all") return leaves;
        return leaves.filter((item) => {
            if (statusFilter === "pending") {
                return item.status !== "approved" && item.status !== "rejected";
            }
            return item.status === statusFilter;
        });
    }, [leaves, statusFilter]);

    const totalPages = Math.ceil(filteredLeaves.length / pageSize) || 1;
    const safePage = Math.min(currentPage, totalPages);
    const paginatedLeaves = filteredLeaves.slice((safePage - 1) * pageSize, safePage * pageSize);

    const canSubmitForm =
        !loading &&
        !(form.type === "annual" && availableAnnualLeave <= 0) &&
        (isDiscrete ? selectedDates.length > 0 : Boolean(form.startDate && form.endDate && !rangeValidationError));

    return (
        <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
            <PageHeader
                title="Cuti & Izin"
                subtitle="Ajukan cuti atau izin dan pantau status persetujuannya."
                icon={CalendarOff}
                action={
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setShowForm(true)}
                    >
                        <Send className="w-4 h-4" /> Ajukan Cuti
                    </button>
                }
            />

            {loadError && (
                <FeedbackMessage variant="error" title="Gagal memuat data cuti">
                    <div className="flex items-center justify-between gap-2">
                        <span>{loadError}</span>
                        <button
                            type="button"
                            onClick={() => void loadLeaves()}
                            className="font-semibold underline shrink-0"
                        >
                            Coba lagi
                        </button>
                    </div>
                </FeedbackMessage>
            )}

            {/* Ringkasan Kuota Tahunan (satu sumber informasi, tanpa angka ganda) */}
            <div className="grid grid-cols-3 gap-3">
                <div className="emp-surface p-4 text-center">
                    <p className="text-xl font-extrabold tracking-tight text-[var(--primary)] tabular-nums">
                        {initialLoading ? "..." : totalLeave}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Kuota Tahunan</p>
                </div>
                <div className="emp-surface p-4 text-center">
                    <p className="text-xl font-extrabold tracking-tight text-[var(--warning)] tabular-nums">
                        {initialLoading ? "..." : usedLeave}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Terpakai</p>
                    {!initialLoading && pendingAnnualDays > 0 && (
                        <p className="text-[11px] font-medium text-[var(--warning)] mt-0.5">
                            +{pendingAnnualDays} menunggu HR
                        </p>
                    )}
                </div>
                <div className="emp-surface p-4 text-center">
                    <p className="text-xl font-extrabold tracking-tight text-[var(--success)] tabular-nums">
                        {initialLoading ? "..." : availableAnnualLeave}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Sisa Tersedia</p>
                </div>
            </div>

            {/* Peringatan Kuota Ringkas */}
            {!initialLoading && availableAnnualLeave <= 0 ? (
                <FeedbackMessage
                    variant="error"
                    title={
                        remainingLeave <= 0
                            ? "Kuota Cuti Tahunan habis"
                            : "Seluruh sisa Cuti Tahunan menunggu persetujuan"
                    }
                >
                    {remainingLeave <= 0
                        ? "Anda tetap dapat mengajukan Izin Sakit, Izin Pribadi, Cuti Melahirkan, atau Cuti Ayah."
                        : `${remainingLeave} hari sedang diproses HR. Jenis izin dan cuti lainnya tetap dapat diajukan.`}
                </FeedbackMessage>
            ) : !initialLoading && availableAnnualLeave <= 2 ? (
                <FeedbackMessage
                    variant="warning"
                    title={`Kuota Cuti Tahunan tersisa ${availableAnnualLeave} hari`}
                >
                    Gunakan sesuai kebutuhan atau pilih jenis izin lain bila diperlukan.
                </FeedbackMessage>
            ) : null}

            {/* Form Pengajuan dalam ResponsiveSheet (Bottom Sheet di mobile, Centered Modal di desktop) */}
            <ResponsiveSheet
                isOpen={showForm}
                onClose={() => {
                    if (!loading) setShowForm(false);
                }}
                title="Ajukan Cuti & Izin"
                description="Pilih jenis, tentukan tanggal, lalu tuliskan alasan singkat."
                size="lg"
                closeOnBackdrop={false}
                disableClose={loading}
                closeLabel="Tutup form pengajuan cuti"
                footer={
                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            disabled={loading}
                            className="btn btn-secondary min-h-[44px] px-4"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            form="employee-leave-form"
                            className="btn btn-primary flex-1 min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
                            disabled={!canSubmitForm}
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Send className="w-4 h-4" />
                            )}
                            {loading
                                ? "Mengirim..."
                                : isDiscrete && selectedDates.length > 0
                                    ? `Ajukan (${selectedDates.length} Hari)`
                                    : "Kirim Pengajuan"}
                        </button>
                    </div>
                }
            >
                <form
                    id="employee-leave-form"
                    onSubmit={isDiscrete ? handleSubmitDiscrete : handleSubmitRange}
                    className="space-y-4"
                >
                    <DraftNotice
                        compact
                        visible={leaveDraftRestored}
                        attachmentHint={
                            form.attachment
                                ? null
                                : formatReattachHint(pendingAttachmentHint ? [pendingAttachmentHint] : null)
                        }
                        onDiscard={() => {
                            discardLeaveDraft();
                            resetFormState();
                        }}
                    />

                    {/* Jenis Cuti / Izin */}
                    <div className="form-group !mb-0">
                        <label htmlFor="leave-type" className="form-label">
                            Jenis Cuti / Izin
                        </label>
                        <select
                            id="leave-type"
                            className="form-select"
                            value={form.type}
                            onChange={(e) => {
                                setForm((prev) => ({
                                    ...prev,
                                    type: e.target.value,
                                    startDate: "",
                                    endDate: "",
                                }));
                                setSelectedDates([]);
                                setMonthCursor(baseMonth);
                            }}
                        >
                            {LEAVE_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        {form.type === "annual" && availableAnnualLeave <= 0 && (
                            <p className="text-xs text-[var(--destructive-text)] font-medium mt-1">
                                Kuota Cuti Tahunan sedang kosong. Pilih jenis izin atau cuti lain.
                            </p>
                        )}
                    </div>

                    {/* Pemilihan Tanggal */}
                    {isDiscrete ? (
                        <div className="form-group !mb-0 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <label className="form-label !mb-0">Pilih Tanggal</label>
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="font-semibold text-[var(--primary)] tabular-nums">
                                        {form.type === "annual"
                                            ? `${selectedDates.length}/${maxSelectable} hari`
                                            : `${selectedDates.length} hari dipilih`}
                                    </span>
                                    {selectedDates.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDates([])}
                                            className="text-[var(--text-muted)] hover:text-[var(--destructive-text)] font-medium underline"
                                        >
                                            Hapus pilihan
                                        </button>
                                    )}
                                </div>
                            </div>

                            {isAnnualForm ? (
                                <>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            aria-label="Bulan sebelumnya"
                                            disabled={compareMonth(monthCursor, baseMonth) <= 0}
                                            onClick={() =>
                                                setMonthCursor((c) => clampCursor(shiftMonth(c, -1)))
                                            }
                                            className="btn btn-ghost btn-sm px-2 disabled:opacity-40"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <select
                                            className="form-select flex-1"
                                            value={monthCursor.m}
                                            onChange={(e) =>
                                                setMonthCursor((c) =>
                                                    clampCursor({ ...c, m: Number(e.target.value) })
                                                )
                                            }
                                            aria-label="Pilih bulan"
                                        >
                                            {MONTH_NAMES.map((name, i) => (
                                                <option key={name} value={i}>
                                                    {name}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            className="form-select w-24"
                                            value={monthCursor.y}
                                            onChange={(e) =>
                                                setMonthCursor((c) =>
                                                    clampCursor({ ...c, y: Number(e.target.value) })
                                                )
                                            }
                                            aria-label="Pilih tahun"
                                        >
                                            {yearOptions.map((y) => (
                                                <option key={y} value={y}>
                                                    {y}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            aria-label="Bulan berikutnya"
                                            disabled={compareMonth(monthCursor, maxMonth) >= 0}
                                            onClick={() =>
                                                setMonthCursor((c) => clampCursor(shiftMonth(c, 1)))
                                            }
                                            className="btn btn-ghost btn-sm px-2 disabled:opacity-40"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-[var(--text-muted)]">
                                        {annualAnchor && annualAnchorEnd
                                            ? `Rentang pilihan aktif: ${formatShortDayMonth(annualAnchor)} s.d. ${formatShortDayMonth(annualAnchorEnd)}.`
                                            : "Pilih mulai besok. Tanggal tambahan tersedia hingga 30 hari dari pilihan pertama."}
                                    </p>
                                </>
                            ) : (
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    Tersedia untuk {formatShortDayMonth(windowStart)} s.d.{" "}
                                    {windowEnd ? formatShortDayMonth(windowEnd) : ""} (khusus hari kerja jadwal Anda).
                                </p>
                            )}

                            {scheduleLoading && (
                                <p className="text-xs text-[var(--text-muted)]">
                                    Memuat jadwal shift...
                                </p>
                            )}
                            {scheduleError && (
                                <div className="flex items-center justify-between gap-2 text-xs text-[var(--warning)]">
                                    <span>
                                        Jadwal shift gagal dimuat, hari libur sementara mengikuti hari Minggu.
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            void loadSchedule(
                                                isAnnualForm ? monthStart : windowStart,
                                                isAnnualForm ? monthLen : windowDates.length || WINDOW_DAYS
                                            )
                                        }
                                        className="underline font-semibold shrink-0"
                                    >
                                        Coba lagi
                                    </button>
                                </div>
                            )}

                            {isAnnualForm ? (
                                <div>
                                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[var(--text-muted)] mb-1">
                                        {WEEKDAY_SHORT.map((d) => (
                                            <span key={d}>{d}</span>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1">
                                        {Array.from({ length: monthLeadBlanks }).map((_, i) => (
                                            <span key={`blank-${i}`} />
                                        ))}
                                        {Array.from({ length: monthLen }).map((_, i) => {
                                            const dateKey = `${monthStart.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
                                            return renderDayCell(dateKey, false);
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                                    {windowDates.map((dateKey) => renderDayCell(dateKey, true))}
                                </div>
                            )}

                            {/* Legenda Warna Lengkap */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
                                <span className="inline-flex items-center gap-1">
                                    <span
                                        className="h-2.5 w-2.5 rounded-full border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_15%,transparent)]"
                                        aria-hidden="true"
                                    />
                                    Terpilih
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <span
                                        className="h-2.5 w-2.5 rounded-full border border-red-400 bg-red-100 dark:bg-red-950/60"
                                        aria-hidden="true"
                                    />
                                    Libur nasional
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <span
                                        className="h-2.5 w-2.5 rounded-full border border-[var(--border)] bg-[var(--muted)]"
                                        aria-hidden="true"
                                    />
                                    Libur jadwal
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <span
                                        className="h-2.5 w-2.5 rounded-full border border-dashed border-[var(--border)] bg-[var(--secondary)]"
                                        aria-hidden="true"
                                    />
                                    Sudah diajukan
                                </span>
                            </div>

                            {/* Chip Tanggal Terpilih (bisa hapus satu per satu langsung) */}
                            {selectedDates.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {selectedDates.map((d) => (
                                        <span
                                            key={d}
                                            className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] border border-[color-mix(in_srgb,var(--primary)_25%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--primary)]"
                                        >
                                            {formatShortDayMonth(d)}
                                            <button
                                                type="button"
                                                onClick={() => toggleDate(d)}
                                                aria-label={`Hapus tanggal ${formatIndonesianDate(d)}`}
                                                className="hover:opacity-70 leading-none"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Daftar Libur Nasional sesuai rentang yang sedang dilihat */}
                            {visibleHolidays.length > 0 && (
                                <div className="rounded-xl border border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/30 px-3 py-2">
                                    <p className="text-[11px] font-bold text-red-700 dark:text-red-300">
                                        {isAnnualForm
                                            ? `Tanggal Merah ${monthLabel}`
                                            : "Tanggal Merah dalam 30 Hari ke Depan"}
                                    </p>
                                    <ul className="mt-1 space-y-0.5">
                                        {visibleHolidays.map((holiday) => (
                                            <li
                                                key={`${holiday.date}-${holiday.name}`}
                                                className="text-[11px] text-[var(--text-secondary)]"
                                            >
                                                <span className="font-semibold text-red-700 dark:text-red-300">
                                                    {formatShortDayMonth(holiday.date)}
                                                </span>
                                                {`: ${holiday.name}`}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="form-group !mb-0">
                                    <label htmlFor="leave-start-date" className="form-label">
                                        Tanggal Mulai
                                    </label>
                                    <input
                                        id="leave-start-date"
                                        type="date"
                                        className="form-input"
                                        value={form.startDate}
                                        onChange={(e) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                startDate: e.target.value,
                                            }))
                                        }
                                        required
                                    />
                                </div>
                                <div className="form-group !mb-0">
                                    <label htmlFor="leave-end-date" className="form-label">
                                        Tanggal Selesai
                                    </label>
                                    <input
                                        id="leave-end-date"
                                        type="date"
                                        min={form.startDate || undefined}
                                        className="form-input"
                                        value={form.endDate}
                                        onChange={(e) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                endDate: e.target.value,
                                            }))
                                        }
                                        required
                                    />
                                </div>
                            </div>

                            <p className="text-[11px] text-[var(--text-muted)]">
                                {form.type === "maternity"
                                    ? "Khusus karyawan perempuan, minimal 90 hari kalender (termasuk hari libur)."
                                    : "Khusus karyawan laki-laki, maksimal 3 hari kalender (termasuk hari libur)."}
                            </p>

                            {form.startDate && form.endDate && (
                                <p
                                    className={`text-xs font-semibold ${
                                        rangeValidationError
                                            ? "text-[var(--destructive-text)]"
                                            : "text-[var(--primary)]"
                                    }`}
                                >
                                    {rangeValidationError || `Durasi: ${rangeCalendarDays} hari kalender`}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Alasan */}
                    <div className="form-group !mb-0">
                        <label htmlFor="leave-reason" className="form-label">
                            Alasan
                        </label>
                        <textarea
                            id="leave-reason"
                            className="form-textarea"
                            value={form.reason}
                            onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                            required
                            placeholder="Tuliskan alasan pengajuan cuti atau izin..."
                        />
                    </div>

                    {/* Lampiran Bukti */}
                    <div className="form-group !mb-0">
                        <div className="flex items-center justify-between">
                            <label htmlFor="leave-attachment" className="form-label !mb-0">
                                Lampiran Bukti (Opsional)
                            </label>
                            {form.attachment && (
                                <button
                                    type="button"
                                    onClick={clearAttachment}
                                    className="text-[11px] font-medium text-[var(--destructive-text)] hover:underline flex items-center gap-1"
                                >
                                    <X className="w-3 h-3" /> Hapus
                                </button>
                            )}
                        </div>
                        <div className="relative mt-1">
                            <input
                                type="file"
                                accept="image/*,.pdf"
                                onChange={handleFileChange}
                                className="hidden"
                                id="leave-attachment"
                            />
                            <label
                                htmlFor="leave-attachment"
                                className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-[var(--border)] rounded-xl hover:border-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_5%,transparent)] transition-all cursor-pointer group"
                            >
                                {form.attachment ? (
                                    <div className="flex items-center gap-2 text-[var(--success)] font-medium text-xs truncate max-w-full">
                                        <Paperclip className="w-4 h-4 shrink-0" />
                                        <span className="truncate">
                                            {attachmentName || "Bukti lampiran dipilih"}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                        <Paperclip className="w-4 h-4 group-hover:text-[var(--primary)]" />
                                        <span>Pilih file JPG, PNG, WEBP, atau PDF (maks. 2 MB)</span>
                                    </div>
                                )}
                            </label>
                        </div>
                    </div>
                </form>
            </ResponsiveSheet>

            {/* Riwayat Pengajuan */}
            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="emp-eyebrow flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5" />
                        Riwayat Pengajuan
                    </h2>

                    {!initialLoading && leaves.length > 0 && (
                        <div className="inline-flex flex-wrap rounded-lg border border-[var(--border)] bg-[var(--secondary)]/60 p-0.5 text-[11px]">
                            {(
                                [
                                    ["all", `Semua (${statusCounts.all})`],
                                    ["pending", `Menunggu (${statusCounts.pending})`],
                                    ["approved", `Disetujui (${statusCounts.approved})`],
                                    ["rejected", `Ditolak (${statusCounts.rejected})`],
                                ] as Array<[HistoryStatusFilter, string]>
                            ).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => {
                                        setStatusFilter(key);
                                        setCurrentPage(1);
                                    }}
                                    className={`px-2 py-1 rounded-md font-medium transition-colors ${
                                        statusFilter === key
                                            ? "bg-[var(--card)] text-[var(--primary)] shadow-sm"
                                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {initialLoading ? (
                    <ListSkeleton label="Memuat riwayat pengajuan" />
                ) : leaves.length === 0 ? (
                    <EmptyState
                        icon={CalendarOff}
                        title="Belum ada pengajuan"
                        description="Pengajuan cuti atau izin yang Anda kirim akan tampil di sini."
                    />
                ) : filteredLeaves.length === 0 ? (
                    <div className="emp-surface p-6 text-center text-xs text-[var(--text-muted)]">
                        Tidak ada pengajuan dengan status ini.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {paginatedLeaves.map((l) => {
                            const info = getStatusInfo(l.status);
                            const StatusIcon = info.icon;
                            const hasAttachment = Boolean(l.attachmentUrl || l.attachment);
                            const days = calendarDaysInclusive(l.startDate, l.endDate);
                            return (
                                <div key={l.id} className="emp-surface p-4 space-y-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <StatusBadge tone="neutral">
                                                {getTypeLabel(l.type)}
                                            </StatusBadge>
                                            {hasAttachment && (
                                                <button
                                                    type="button"
                                                    onClick={() => openAttachment(l)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--secondary)] text-[var(--primary)] rounded-full text-[10px] font-bold hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] transition-colors min-h-6"
                                                >
                                                    <Paperclip className="w-3 h-3" /> Bukti
                                                </button>
                                            )}
                                        </div>
                                        <StatusBadge tone={info.tone} icon={StatusIcon}>
                                            {info.label}
                                        </StatusBadge>
                                    </div>

                                    <div className="flex items-center justify-between gap-2 text-sm font-semibold text-[var(--text-primary)]">
                                        <span className="text-xs sm:text-sm">
                                            {toDateKey(l.startDate) === toDateKey(l.endDate)
                                                ? formatIndonesianDate(l.startDate)
                                                : `${formatIndonesianDate(l.startDate)} s.d. ${formatIndonesianDate(l.endDate)}`}
                                        </span>
                                        <span className="text-[11px] font-medium text-[var(--text-muted)] bg-[var(--secondary)] px-2 py-0.5 rounded-full shrink-0">
                                            {days} hari
                                        </span>
                                    </div>

                                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                        {l.reason}
                                    </p>

                                    <p className="text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border)]/50">
                                        Diajukan {formatDisplayDate(l.createdAt)}
                                    </p>
                                </div>
                            );
                        })}

                        <DataTablePagination
                            currentPage={safePage}
                            totalPages={totalPages}
                            totalItems={filteredLeaves.length}
                            pageSize={pageSize}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={(s) => {
                                setPageSize(s);
                                setCurrentPage(1);
                            }}
                            pageSizeOptions={[5, 10, 20]}
                            itemLabel="pengajuan"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
