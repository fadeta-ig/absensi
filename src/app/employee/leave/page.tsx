"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarOff, Send, CalendarDays, Clock, CheckCircle, XCircle, Loader2, X, Paperclip } from "lucide-react";
import { useToast } from "@/components/Toast";
import AccessibleModal from "@/components/ui/AccessibleModal";
import { StepperTimeline } from "@/components/ui/StepperTimeline";
import DataTablePagination from "@/components/ui/DataTablePagination";
import EmptyState from "@/components/ui/EmptyState";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import ListSkeleton from "@/components/ui/ListSkeleton";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge, { type StatusTone } from "@/components/ui/StatusBadge";
import { formatDisplayDate, formatIndonesianDate } from "@/lib/utils";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { useGlobalHolidays } from "@/hooks/useGlobalHolidays";
import { useEmployeeDraft } from "@/hooks/useEmployeeDraft";
import { formatReattachHint, isPlainObject } from "@/lib/formPersistence";
import DraftNotice from "@/components/ui/DraftNotice";

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

const DISCRETE_TYPES = new Set(["annual", "sick", "personal"]);
const WINDOW_DAYS = 30;
const WEEKDAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTH_NAV_LIMIT = 12;

interface MonthCursor {
    y: number;
    m: number;
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

function toDateKey(raw: string): string {
    return typeof raw === "string" ? raw.slice(0, 10) : "";
}

function getWIBTodayKey(): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function addDaysKey(key: string, days: number): string {
    const clean = toDateKey(key);
    const d = new Date(`${clean}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return clean;
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function getUTCDayKey(key: string): number {
    const clean = toDateKey(key);
    return new Date(`${clean}T00:00:00Z`).getUTCDay();
}

function calendarDaysInclusive(start: string, end: string): number {
    const s = new Date(`${toDateKey(start)}T00:00:00Z`).getTime();
    const e = new Date(`${toDateKey(end)}T00:00:00Z`).getTime();
    if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
    return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function expandRangeToDates(start: string, end: string, max = 400): string[] {
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    if (!startKey || !endKey || endKey < startKey) return [];
    const out: string[] = [];
    let cur = startKey;
    for (let i = 0; i < max; i++) {
        out.push(cur);
        if (cur === endKey) break;
        const next = addDaysKey(cur, 1);
        if (!next || next === cur || next > endKey) break;
        cur = next;
    }
    return out;
}

export default function LeavePage() {
    const toast = useToast();
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [balance, setBalance] = useState<LeaveBalance | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ type: "annual", startDate: "", endDate: "", reason: "", attachment: "" });
    const [attachmentName, setAttachmentName] = useState("");
    const [pendingAttachmentHint, setPendingAttachmentHint] = useState<string | null>(null);
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [monthCursor, setMonthCursor] = useState<MonthCursor>(() => monthCursorOf(addDaysKey(getWIBTodayKey(), 1)));
    // Kalender global (nasional + cuti bersama): disable tanggal libur resmi di grid.
    // Diambil per tahun kalender yang sedang dilihat; cache hook dipakai ulang semua kalender.
    const { holidays, holidaysByDate } = useGlobalHolidays(showForm ? monthCursor.y : null);
    const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [scheduleError, setScheduleError] = useState("");
    const scheduleLoadedRef = useRef("");
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);

    const loadLeaves = useCallback(async () => {
        setInitialLoading(true);
        setLoadError("");
        try {
            const res = await fetch("/api/leave?withBalance=1");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat data cuti."));
            const data = await res.json();

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
            reportClientError("EmployeeLeavePage", "Gagal memuat data cuti", error);
            const message = error instanceof Error ? error.message : "Gagal memuat data cuti.";
            setLoadError(message);
            toast(message, "error");
        } finally {
            setInitialLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void loadLeaves();
    }, [loadLeaves]);

    const loadSchedule = useCallback(async (startKey?: string, dayCount?: number) => {
        setScheduleLoading(true);
        setScheduleError("");
        try {
            const start = startKey ?? addDaysKey(getWIBTodayKey(), 1);
            const days = dayCount ?? WINDOW_DAYS;
            const res = await fetch(`/api/employee/shift-schedule?start=${start}&days=${days}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat jadwal shift."));
            const data = await res.json();
            setSchedule(Array.isArray(data) ? data : []);
            scheduleLoadedRef.current = `${start}:${days}`;
        } catch (error) {
            reportClientError("EmployeeLeavePage", "Gagal memuat jadwal shift", error);
            setSchedule([]);
            scheduleLoadedRef.current = "";
            setScheduleError(error instanceof Error ? error.message : "Gagal memuat jadwal shift.");
        } finally {
            setScheduleLoading(false);
        }
    }, []);

    const isAnnualForm = form.type === "annual";

    const wibToday = useMemo(() => getWIBTodayKey(), []);
    const tomorrowKey = useMemo(() => addDaysKey(wibToday, 1), [wibToday]);
    // Jendela lama H+1 s/d H+30 — dipakai sakit/pribadi (bebas dari patokan).
    const windowStart = tomorrowKey;
    const windowDates = useMemo(() => {
        const out: string[] = [];
        for (let i = 1; i <= WINDOW_DAYS; i++) {
            out.push(addDaysKey(windowStart, i));
        }
        return out;
    }, [windowStart]);
    const windowEnd = windowDates.length > 0 ? windowDates[windowDates.length - 1] : "";
    const windowKey = `${windowStart}:${windowDates.length}`;

    // Kalender annual: navigasi bulan/tahun (maks +12 bulan), tanpa panel patokan.
    // Patokan implisit = tanggal terpilih pertama; tanggal sebelumnya terkunci,
    // 30 hari ke depan (inklusif) terbuka — lintas bulan/tahun.
    const baseMonth = useMemo(() => monthCursorOf(wibToday), [wibToday]);
    const maxMonth = useMemo(() => shiftMonth(baseMonth, MONTH_NAV_LIMIT), [baseMonth]);
    const clampCursor = useCallback((c: MonthCursor): MonthCursor => {
        if (compareMonth(c, baseMonth) < 0) return baseMonth;
        if (compareMonth(c, maxMonth) > 0) return maxMonth;
        return c;
    }, [baseMonth, maxMonth]);

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
            if (typeof raw.startDate !== "string" || typeof raw.endDate !== "string" || typeof raw.reason !== "string") return false;
            if (!Array.isArray(raw.selectedDates) || !raw.selectedDates.every((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))) return false;
            if (!isPlainObject(raw.monthCursor) || typeof raw.monthCursor.y !== "number" || typeof raw.monthCursor.m !== "number") return false;
            if (raw.hadAttachmentName !== null && typeof raw.hadAttachmentName !== "string") return false;
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
            const validDates = draft.type === "annual"
                ? draft.selectedDates.filter((d) => d > wibToday).sort()
                : [...draft.selectedDates].sort();
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
    const monthLeadBlanks = getUTCDayKey(monthStart);
    const monthScheduleKey = `${monthStart}:${monthLen}`;
    // Daftar tanggal merah bulan yang sedang dilihat (untuk info di bawah grid).
    const monthLabel = `${MONTH_NAMES[monthCursor.m]} ${monthCursor.y}`;
    const monthHolidays = useMemo(() => {
        const prefix = `${monthCursor.y}-${String(monthCursor.m + 1).padStart(2, "0")}-`;
        return holidays
            .filter((holiday) => holiday.date.startsWith(prefix))
            .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    }, [holidays, monthCursor.y, monthCursor.m]);
    const yearOptions = useMemo(() => {
        const opts: number[] = [];
        for (let y = baseMonth.y; y <= maxMonth.y; y++) opts.push(y);
        return opts;
    }, [baseMonth, maxMonth]);

    // Patokan implisit annual = tanggal terpilih paling awal (selectedDates selalu terurut).
    const annualAnchor = isAnnualForm && selectedDates.length > 0 ? selectedDates[0] : null;
    const annualAnchorEnd = annualAnchor ? addDaysKey(annualAnchor, WINDOW_DAYS - 1) : null;

    useEffect(() => {
        if (!showForm || !DISCRETE_TYPES.has(form.type)) return;
        if (isAnnualForm) {
            if (scheduleLoadedRef.current !== monthScheduleKey) {
                void loadSchedule(monthStart, monthLen);
            }
        } else if (scheduleLoadedRef.current !== windowKey) {
            void loadSchedule(windowStart, windowDates.length || WINDOW_DAYS);
        }
    }, [showForm, form.type, isAnnualForm, monthScheduleKey, monthStart, monthLen, windowKey, windowStart, windowDates.length, loadSchedule]);

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

    const isDateOff = useCallback((dateKey: string): boolean => {
        const item = scheduleByDate.get(dateKey);
        if (!item || !item.shiftId) {
            return getUTCDayKey(dateKey) === 0;
        }
        return item.isOff;
    }, [scheduleByDate]);

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
                // Bila patokan (tanggal pertama) dihapus, jendela ikut geser ke
                // tanggal tersisa paling awal; pilihan di luar jendela baru dibuang.
                if (form.type === "annual" && next.length > 0) {
                    const anchor = next[0];
                    const maxKey = addDaysKey(anchor, WINDOW_DAYS - 1);
                    const kept = next.filter((d) => d >= anchor && d <= maxKey);
                    if (kept.length !== next.length) {
                        toast("Pilihan di luar 30 hari dari tanggal pertama dibuang.", "warning");
                    }
                    return kept;
                }
                return next;
            }
            if (form.type === "annual" && prev.length >= maxSelectable) {
                toast(
                    `Maksimal ${maxSelectable} tanggal untuk Cuti Tahunan (sisa disetujui ${remainingLeave} hari dikurangi ${pendingAnnualDays} hari menunggu HR).`,
                    "warning"
                );
                return prev;
            }
            if (prev.length >= WINDOW_DAYS) {
                toast(`Maksimal ${WINDOW_DAYS} tanggal dalam 30 hari ke depan.`, "warning");
                return prev;
            }
            // Annual: tanggal pertama jadi patokan — hanya patokan s/d +29 yang boleh dipilih.
            if (form.type === "annual" && prev.length > 0) {
                const anchor = prev[0];
                const maxKey = addDaysKey(anchor, WINDOW_DAYS - 1);
                if (dateKey < anchor || dateKey > maxKey) {
                    toast(`Di luar 30 hari dari tanggal pertama (${formatIndonesianDate(anchor)} s/d ${formatIndonesianDate(maxKey)}).`, "warning");
                    return prev;
                }
            }
            return [...prev, dateKey].sort();
        });
    };

    const renderDayCell = (dateKey: string) => {
        const occupied = occupiedSet.has(dateKey);
        // Libur nasional/cuti bersama (kalender global) diperlakukan seperti libur jadwal.
        const nationalHoliday = holidaysByDate.get(dateKey)?.[0] ?? null;
        const off = isDateOff(dateKey) || nationalHoliday !== null;
        const outOfAnchor = isAnnualForm && annualAnchor !== null && annualAnchorEnd !== null &&
            (dateKey < annualAnchor || dateKey > annualAnchorEnd);
        const past = isAnnualForm && dateKey <= wibToday;
        const disabled = occupied || off || past || outOfAnchor || (form.type === "annual" && availableAnnualLeave <= 0);
        const selected = selectedDateSet.has(dateKey);
        const dayNum = Number(dateKey.slice(8, 10));
        const weekday = WEEKDAY_SHORT[getUTCDayKey(dateKey)];
        return (
            <button
                key={dateKey}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => toggleDate(dateKey)}
                title={nationalHoliday ? `${formatIndonesianDate(dateKey)} — libur nasional/cuti bersama: ${nationalHoliday.name}` : occupied ? `${formatIndonesianDate(dateKey)} — sudah diajukan` : off ? `${formatIndonesianDate(dateKey)} — libur jadwal` : past ? `${formatIndonesianDate(dateKey)} — sudah lewat` : outOfAnchor ? `${formatIndonesianDate(dateKey)} — di luar 30 hari dari tanggal pertama` : formatIndonesianDate(dateKey)}
                className={`relative rounded-xl border p-2 text-center transition-colors ${
                    selected
                        ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)] font-bold"
                        : nationalHoliday
                          ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 cursor-not-allowed"
                          : occupied
                          ? "border-dashed border-[var(--border)] bg-[var(--secondary)] text-[var(--text-muted)] opacity-70 cursor-not-allowed"
                          : disabled
                            ? "border-[var(--border)] bg-[var(--muted)] text-[var(--text-muted)] opacity-50 cursor-not-allowed"
                            : "border-[var(--border)] bg-[var(--card)] text-[var(--text-primary)] hover:border-[color-mix(in_srgb,var(--primary)_40%,transparent)] hover:bg-[var(--secondary)] cursor-pointer active:scale-[0.98]"
                }`}
            >
                {selected && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-[10px] font-extrabold leading-none shadow-sm">
                        ✓
                    </span>
                )}
                <span className={`block text-[10px] ${selected ? "text-[color-mix(in_srgb,var(--primary)_70%,transparent)] font-semibold" : "text-[var(--text-muted)]"}`}>
                    {weekday}
                </span>
                <span className={`block text-base leading-tight my-0.5 ${selected ? "text-[var(--primary)] font-extrabold" : nationalHoliday ? "font-extrabold text-red-700 dark:text-red-300" : "font-semibold"}`}>
                    {dayNum}
                </span>
                <span className={`block text-[10px] ${selected ? "text-[color-mix(in_srgb,var(--primary)_70%,transparent)]" : "text-[var(--text-muted)]"}`}>
                    {occupied ? "Diajukan" : off ? "Libur" : "\u00A0"}
                </span>
            </button>
        );
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            e.target.value = "";
            toast("File terlalu besar (maksimal 2MB)", "warning");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setForm((prev) => ({ ...prev, attachment: reader.result as string }));
            setAttachmentName(file.name);
            setPendingAttachmentHint(null);
            toast("Bukti berhasil dipilih!", "success");
        };
        reader.onerror = () => {
            toast("Gagal membaca file. Silakan coba lagi.", "error");
        };
        reader.readAsDataURL(file);
        e.target.value = "";
    };

    const clearAttachment = () => {
        setForm((prev) => ({ ...prev, attachment: "" }));
        setAttachmentName("");
        setPendingAttachmentHint(null);
    };

    const handleSubmitDiscrete = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedDates.length === 0) {
            toast("Pilih minimal 1 tanggal cuti.", "warning");
            return;
        }
        if (!form.reason.trim()) {
            toast("Alasan wajib diisi.", "warning");
            return;
        }
        if (form.type === "annual" && selectedDates.length > maxSelectable) {
            toast(`Jumlah tanggal (${selectedDates.length}) melebihi kuota tersedia (${maxSelectable} hari).`, "error");
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
                    // Patokan implisit = tanggal terpilih pertama.
                    ...(form.type === "annual" ? { anchorDate: sorted[0] } : {}),
                }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal mengirim pengajuan cuti"));
            }
            const payload = await res.json();
            const createdCount = typeof payload?.count === "number" ? payload.count : sorted.length;
            clearLeaveDraft();
            setShowForm(false);
            setSelectedDates([]);
            setAttachmentName("");
            setPendingAttachmentHint(null);
            setForm({ type: "annual", startDate: "", endDate: "", reason: "", attachment: "" });
            toast(`Pengajuan cuti berhasil dikirim (${createdCount} hari).`, "success");
            await loadLeaves();
        } catch (error) {
            reportClientError("EmployeeLeavePage", "Gagal mengirim pengajuan cuti", error, { type: form.type, dates: selectedDates.join(",") });
            toast(error instanceof Error ? error.message : "Gagal mengirim pengajuan cuti", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitRange = async (e: React.FormEvent) => {
        e.preventDefault();
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
                throw new Error(await getResponseErrorMessage(res, "Gagal mengirim pengajuan cuti"));
            }
            clearLeaveDraft();
            setShowForm(false);
            setAttachmentName("");
            setPendingAttachmentHint(null);
            setForm({ type: "annual", startDate: "", endDate: "", reason: "", attachment: "" });
            toast("Pengajuan cuti berhasil dikirim!", "success");
            await loadLeaves();
        } catch (error) {
            reportClientError("EmployeeLeavePage", "Gagal mengirim pengajuan cuti", error, { type: form.type, startDate: form.startDate, endDate: form.endDate });
            toast(error instanceof Error ? error.message : "Gagal mengirim pengajuan cuti", "error");
        } finally {
            setLoading(false);
        }
    };

    const isDiscrete = DISCRETE_TYPES.has(form.type);

    const getTypeLabel = (t: string) => {
        switch (t) {
            case "annual": return "Tahunan";
            case "sick": return "Sakit";
            case "personal": return "Pribadi";
            case "maternity": return "Melahirkan";
            case "paternity": return "Paternity (Ayah)";
            default: return t;
        }
    };

    const getStatusInfo = (s: string): { label: string; tone: StatusTone; icon: typeof CheckCircle } => {
        switch (s) {
            case "approved": return { label: "Disetujui", tone: "success", icon: CheckCircle };
            case "rejected": return { label: "Ditolak", tone: "danger", icon: XCircle };
            default: return { label: "Menunggu", tone: "warning", icon: Clock };
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
                win.document.write(`<iframe src="${leave.attachment}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
            }
        }
    };

    const paginatedLeaves = leaves.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const totalPages = Math.ceil(leaves.length / pageSize) || 1;

    return (
        <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
            <PageHeader
                title="Manajemen Cuti"
                subtitle="Ajukan dan pantau pengajuan cuti"
                icon={CalendarOff}
                action={
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowForm(true)}
                    >
                        <Send className="w-4 h-4" /> Ajukan Cuti
                    </button>
                }
            />

            {loadError && (
                <FeedbackMessage variant="error" title="Gagal memuat data cuti">
                    {loadError}
                </FeedbackMessage>
            )}

            {/* Authoritative Annual Leave Balance */}
            <div className="grid grid-cols-3 gap-3">
                <div className="emp-surface p-4 text-center">
                    <p className="text-xl font-extrabold tracking-tight text-[var(--primary)]">{initialLoading ? "..." : totalLeave}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Kuota Tahunan</p>
                </div>
                <div className="emp-surface p-4 text-center">
                    <p className="text-xl font-extrabold tracking-tight text-[var(--warning)]">{initialLoading ? "..." : usedLeave}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Terpakai (Disetujui)</p>
                    {!initialLoading && pendingAnnualDays > 0 && (
                        <p className="text-[11px] font-medium text-[var(--warning)] mt-0.5">+{pendingAnnualDays} hari menunggu HR</p>
                    )}
                </div>
                <div className="emp-surface p-4 text-center">
                    <p className="text-xl font-extrabold tracking-tight text-[var(--success)]">{initialLoading ? "..." : availableAnnualLeave}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Tersedia Diajukan</p>
                    {!initialLoading && pendingAnnualDays > 0 && (
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Sisa disetujui: {remainingLeave} hari</p>
                    )}
                </div>
            </div>

            {/* Balance Warning Alerts */}
            {!initialLoading && availableAnnualLeave <= 0 ? (
                <FeedbackMessage variant="error" title="Kuota cuti tahunan tidak tersedia">
                    {remainingLeave <= 0
                        ? "Kuota Cuti Tahunan Anda telah habis. Anda tidak dapat mengajukan Cuti Tahunan baru, namun tetap dapat mengajukan Izin Sakit, Izin Pribadi, Cuti Melahirkan, atau Paternity."
                        : `Seluruh sisa Cuti Tahunan Anda (${remainingLeave} hari) sedang menunggu persetujuan HR. Anda tetap dapat mengajukan Izin Sakit, Izin Pribadi, Cuti Melahirkan, atau Paternity.`}
                </FeedbackMessage>
            ) : !initialLoading && availableAnnualLeave <= 2 ? (
                <FeedbackMessage variant="warning" title="Kuota cuti tahunan hampir habis">
                    Kuota Cuti Tahunan yang dapat diajukan tersisa {availableAnnualLeave} hari kerja.
                </FeedbackMessage>
            ) : null}

            {/* Form Modal */}
            {showForm && (
                <AccessibleModal ariaLabel="Ajukan cuti" onClose={() => setShowForm(false)} className="max-w-md">
                    <div className="modal-header">
                        <h2 className="modal-title">Ajukan Cuti</h2>
                        <button className="modal-close" onClick={() => setShowForm(false)} aria-label="Tutup form pengajuan cuti">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <form onSubmit={isDiscrete ? handleSubmitDiscrete : handleSubmitRange} className="space-y-4">
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
                                setSelectedDates([]);
                                setAttachmentName("");
                                setPendingAttachmentHint(null);
                                setMonthCursor(baseMonth);
                                setForm({ type: "annual", startDate: "", endDate: "", reason: "", attachment: "" });
                            }}
                        />
                        <div className="form-group !mb-0">
                            <label className="form-label">Jenis Cuti/Izin</label>
                            <select className="form-select" value={form.type} onChange={(e) => { setForm({ ...form, type: e.target.value }); setSelectedDates([]); setMonthCursor(baseMonth); }}>
                                <option value="annual">Tahunan</option>
                                <option value="sick">Sakit</option>
                                <option value="personal">Pribadi</option>
                                <option value="maternity">Melahirkan</option>
                                <option value="paternity">Paternity (Ayah)</option>
                            </select>
                            {form.type === "annual" && availableAnnualLeave <= 0 && (
                                <p className="text-xs text-[var(--destructive-text)] font-medium mt-1">
                                    * Kuota Cuti Tahunan tidak tersedia ({remainingLeave} sisa − {pendingAnnualDays} menunggu persetujuan HR). Pilih jenis cuti/Izin lain bila diperlukan.
                                </p>
                            )}
                        </div>
                        {isDiscrete ? (
                            <div className="form-group !mb-0">
                                <label className="form-label">Pilih Tanggal ({selectedDates.length}/{form.type === "annual" ? maxSelectable : WINDOW_DAYS} hari kerja)</label>
                                {isAnnualForm ? (
                                    <div className="flex items-center gap-2 mt-1">
                                        <button
                                            type="button"
                                            aria-label="Bulan sebelumnya"
                                            disabled={compareMonth(monthCursor, baseMonth) <= 0}
                                            onClick={() => setMonthCursor((c) => clampCursor(shiftMonth(c, -1)))}
                                            className="btn btn-ghost btn-sm px-2 disabled:opacity-40"
                                        >
                                            ‹
                                        </button>
                                        <select
                                            className="form-select flex-1"
                                            value={monthCursor.m}
                                            onChange={(e) => setMonthCursor((c) => clampCursor({ ...c, m: Number(e.target.value) }))}
                                            aria-label="Pilih bulan"
                                        >
                                            {MONTH_NAMES.map((name, i) => (
                                                <option key={name} value={i}>{name}</option>
                                            ))}
                                        </select>
                                        <select
                                            className="form-select w-24"
                                            value={monthCursor.y}
                                            onChange={(e) => setMonthCursor((c) => clampCursor({ ...c, y: Number(e.target.value) }))}
                                            aria-label="Pilih tahun"
                                        >
                                            {yearOptions.map((y) => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            aria-label="Bulan berikutnya"
                                            disabled={compareMonth(monthCursor, maxMonth) >= 0}
                                            onClick={() => setMonthCursor((c) => clampCursor(shiftMonth(c, 1)))}
                                            className="btn btn-ghost btn-sm px-2 disabled:opacity-40"
                                        >
                                            ›
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-xs text-[var(--text-muted)]">Besok s/d {windowEnd ? formatIndonesianDate(windowEnd) : ""} ({WINDOW_DAYS} hari ke depan), khusus hari kerja jadwal Anda. Satu tanggal terpilih = satu pengajuan cuti.</p>
                                )}
                                {scheduleLoading && <p className="text-xs text-[var(--text-muted)] mt-1">Memuat jadwal shift...</p>}
                                {scheduleError && (
                                    <div className="flex items-center justify-between gap-2 text-xs text-[var(--warning)] mt-1">
                                        <span>Jadwal shift gagal dimuat, libur sementara mengikuti hari Minggu. {scheduleError}</span>
                                        <button type="button" onClick={() => void loadSchedule(isAnnualForm ? monthStart : windowStart, isAnnualForm ? monthLen : windowDates.length || WINDOW_DAYS)} className="underline font-semibold shrink-0">
                                            Coba lagi
                                        </button>
                                    </div>
                                )}
                                {isAnnualForm ? (
                                    <div className="mt-2">
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
                                                return renderDayCell(dateKey);
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                                        {windowDates.map((dateKey) => renderDayCell(dateKey))}
                                    </div>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
                                    <span className="inline-flex items-center gap-1">
                                        <span className="h-2.5 w-2.5 rounded-full border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]" aria-hidden="true" />
                                        Terpilih
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <span className="h-2.5 w-2.5 rounded-full border border-[var(--border)] bg-[var(--muted)]" aria-hidden="true" />
                                        Libur jadwal
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <span className="h-2.5 w-2.5 rounded-full border border-dashed border-[var(--border)] bg-[var(--secondary)]" aria-hidden="true" />
                                        Sudah diajukan
                                    </span>
                                </div>
                                {selectedDates.length > 0 && (
                                    <div className="flex items-center justify-between gap-2 flex-wrap mt-2 rounded-lg bg-[color-mix(in_srgb,var(--primary)_5%,transparent)] border border-[color-mix(in_srgb,var(--primary)_20%,transparent)] px-3 py-2">
                                        <span className="text-xs font-semibold text-[var(--primary)]">
                                            {selectedDates.length} tanggal dipilih: {selectedDates.map((d) => formatIndonesianDate(d)).join(", ")}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDates([])}
                                            className="text-xs font-bold text-[var(--primary)] hover:underline shrink-0"
                                        >
                                            Reset pilihan
                                        </button>
                                    </div>
                                )}
                                {isDiscrete && (
                                    <div className="mt-1 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 px-3 py-2">
                                        <p className="text-xs font-bold text-red-700 dark:text-red-300">
                                            Tanggal Merah {monthLabel} ({monthHolidays.length})
                                        </p>
                                        {monthHolidays.length === 0 ? (
                                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                                Tidak ada libur nasional/cuti bersama bulan ini.
                                            </p>
                                        ) : (
                                            <ul className="mt-1 space-y-0.5">
                                                {monthHolidays.map((holiday) => (
                                                    <li key={`${holiday.date}-${holiday.name}`} className="text-[11px] text-[var(--text-secondary)]">
                                                        <span className="font-bold text-red-700 dark:text-red-300">
                                                            Tanggal {Number(holiday.date.slice(8, 10))}
                                                        </span>
                                                        {` : ${holiday.name}`}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="form-group !mb-0">
                                    <label className="form-label">Tanggal Mulai</label>
                                    <input type="date" className="form-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label">Tanggal Selesai</label>
                                    <input type="date" className="form-input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
                                </div>
                                <p className="text-[10px] text-[var(--text-muted)] sm:col-span-2">
                                    Cuti dihitung per hari kerja sesuai jadwal shift Anda. Tanggal akhir harus sama atau setelah tanggal mulai.
                                </p>
                            </div>
                        )}
                        <div className="form-group !mb-0">
                            <label className="form-label">Alasan</label>
                            <textarea className="form-textarea" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required placeholder="Berikan alasan pengajuan cuti..." />
                        </div>
                        <div className="form-group !mb-0">
                            <div className="flex items-center justify-between">
                                <label className="form-label !mb-0">Upload Bukti (Opsional)</label>
                                {form.attachment && (
                                    <button
                                        type="button"
                                        onClick={clearAttachment}
                                        className="text-[11px] font-medium text-[var(--destructive-text)] hover:underline flex items-center gap-1"
                                    >
                                        <X className="w-3 h-3" /> Hapus bukti
                                    </button>
                                )}
                            </div>
                            <div className="relative mt-1">
                                <input type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" id="leave-attachment" />
                                <label htmlFor="leave-attachment" className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-[var(--border)] rounded-lg hover:border-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_5%,transparent)] transition-all cursor-pointer group">
                                    {form.attachment ? (
                                        <div className="flex items-center gap-2 text-[var(--success)] font-medium text-xs truncate max-w-full">
                                            <Paperclip className="w-4 h-4 shrink-0" />
                                            <span className="truncate">{attachmentName || "File bukti dipilih"}</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1">
                                            <Paperclip className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--primary)]" />
                                            <span className="text-xs text-[var(--text-muted)]">Klik untuk pilih file</span>
                                        </div>
                                    )}
                                </label>
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">* Opsional — boleh dikosongkan. Maksimal 2MB (JPG/PNG/WEBP/PDF). Satu bukti disimpan sekali dan ditautkan ke semua tanggal terpilih.</p>
                        </div>
                        <button type="submit" className="btn btn-primary w-full" disabled={loading || (form.type === "annual" && availableAnnualLeave <= 0) || (isDiscrete && selectedDates.length === 0)}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {loading ? "Mengirim..." : isDiscrete ? `Kirim ${selectedDates.length} Pengajuan` : "Kirim Pengajuan"}
                        </button>
                    </form>
                </AccessibleModal>
            )}

            {/* History */}
            <div className="space-y-3">
                <h2 className="emp-eyebrow flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />
                    Riwayat Cuti
                </h2>
                {initialLoading ? (
                    <ListSkeleton label="Memuat riwayat cuti" />
                ) : leaves.length === 0 ? (
                    <EmptyState
                        icon={CalendarOff}
                        title="Belum ada pengajuan cuti"
                        description="Pengajuan yang Anda kirim akan muncul di sini beserta status persetujuannya."
                    />
                ) : (
                    <div className="space-y-3">
                        <div className="space-y-3">
                            {paginatedLeaves.map((l) => {
                                const info = getStatusInfo(l.status);
                                const StatusIcon = info.icon;
                                const hasAttachment = Boolean(l.attachmentUrl || l.attachment);
                                return (
                                    <div key={l.id} className="emp-surface p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <StatusBadge tone="neutral">{getTypeLabel(l.type)}</StatusBadge>
                                                {hasAttachment && (
                                                    <button onClick={() => openAttachment(l)} className="flex items-center gap-1.5 px-2 py-0.5 bg-[var(--secondary)] text-[var(--primary)] rounded-full text-[10px] font-bold hover:bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] transition-colors min-h-6">
                                                        <Paperclip className="w-3 h-3" /> Bukti
                                                    </button>
                                                )}
                                            </div>
                                            <StatusBadge tone={info.tone} icon={StatusIcon}>
                                                {info.label}
                                            </StatusBadge>
                                        </div>
                                        <div className="flex items-center justify-between text-sm font-semibold text-[var(--text-primary)]">
                                            <span className="text-xs sm:text-sm">
                                                {toDateKey(l.startDate) === toDateKey(l.endDate)
                                                    ? formatIndonesianDate(l.startDate)
                                                    : `${formatIndonesianDate(l.startDate)} — ${formatIndonesianDate(l.endDate)}`}
                                            </span>
                                            <span className="text-[10px] text-[var(--text-muted)] bg-[var(--secondary)] px-2 py-0.5 rounded-full">
                                                {calendarDaysInclusive(l.startDate, l.endDate)} Hari
                                            </span>
                                        </div>
                                        <p className="text-xs text-[var(--text-secondary)]">{l.reason}</p>

                                        {/* ── Status Timeline ── */}
                                        <StepperTimeline
                                            steps={[
                                                { label: "Diajukan", state: "done" },
                                                { label: "Ditinjau", state: l.status !== "pending" ? "done" : "todo" },
                                                {
                                                    label: l.status === "approved" ? "Disetujui" : l.status === "rejected" ? "Ditolak" : "Keputusan",
                                                    state: l.status === "approved" ? "done" : l.status === "rejected" ? "failed" : "todo",
                                                },
                                            ]}
                                        />
                                        <p className="text-[10px] text-[var(--text-muted)]">
                                            Diajukan: {formatDisplayDate(l.createdAt)}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>

                        <DataTablePagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={leaves.length}
                            pageSize={pageSize}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                            pageSizeOptions={[5, 10, 20]}
                            itemLabel="pengajuan"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
