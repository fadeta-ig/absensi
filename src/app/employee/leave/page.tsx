"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CalendarOff, Send, CalendarDays, Clock, CheckCircle, XCircle, Loader2, X, Paperclip } from "lucide-react";
import { useToast } from "@/components/Toast";
import { StepperTimeline } from "@/components/ui/StepperTimeline";
import { Skeleton } from "@/components/ui/Skeleton";
import DataTablePagination from "@/components/ui/DataTablePagination";
import { formatDisplayDate, formatIndonesianDate } from "@/lib/utils";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

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
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [scheduleError, setScheduleError] = useState("");
    const scheduleLoadedRef = useRef(false);
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

    const loadSchedule = useCallback(async () => {
        setScheduleLoading(true);
        setScheduleError("");
        try {
            const res = await fetch("/api/employee/shift-schedule?days=31");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat jadwal shift."));
            const data = await res.json();
            setSchedule(Array.isArray(data) ? data : []);
            scheduleLoadedRef.current = true;
        } catch (error) {
            reportClientError("EmployeeLeavePage", "Gagal memuat jadwal shift", error);
            setSchedule([]);
            scheduleLoadedRef.current = false;
            setScheduleError(error instanceof Error ? error.message : "Gagal memuat jadwal shift.");
        } finally {
            setScheduleLoading(false);
        }
    }, []);

    useEffect(() => {
        if (showForm && DISCRETE_TYPES.has(form.type) && !scheduleLoadedRef.current) {
            void loadSchedule();
        }
    }, [showForm, form.type, loadSchedule]);

    const wibToday = useMemo(() => getWIBTodayKey(), []);
    const windowDates = useMemo(() => {
        const out: string[] = [];
        for (let i = 1; i <= WINDOW_DAYS; i++) {
            out.push(addDaysKey(wibToday, i));
        }
        return out;
    }, [wibToday]);
    const windowEnd = windowDates.length > 0 ? windowDates[windowDates.length - 1] : "";

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
            if (prev.includes(dateKey)) return prev.filter((d) => d !== dateKey);
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
            return [...prev, dateKey].sort();
        });
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
                }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal mengirim pengajuan cuti"));
            }
            const payload = await res.json();
            const createdCount = typeof payload?.count === "number" ? payload.count : sorted.length;
            setShowForm(false);
            setSelectedDates([]);
            setAttachmentName("");
            setForm({ type: form.type, startDate: "", endDate: "", reason: "", attachment: "" });
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
            setShowForm(false);
            setAttachmentName("");
            setForm({ type: form.type, startDate: "", endDate: "", reason: "", attachment: "" });
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

    const getStatusInfo = (s: string) => {
        switch (s) {
            case "approved": return { label: "Disetujui", badge: "badge-success", icon: CheckCircle };
            case "rejected": return { label: "Ditolak", badge: "badge-error", icon: XCircle };
            default: return { label: "Menunggu", badge: "badge-warning", icon: Clock };
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
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <CalendarOff className="w-5 h-5 text-[var(--primary)]" />
                        Manajemen Cuti
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Ajukan dan pantau pengajuan cuti</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => setShowForm(!showForm)}
                >
                    <Send className="w-4 h-4" /> Ajukan Cuti
                </button>
            </div>

            {loadError && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Authoritative Annual Leave Balance */}
            <div className="grid grid-cols-3 gap-4">
                <div className="card p-4 text-center">
                    <p className="text-2xl font-extrabold text-[var(--primary)]">{initialLoading ? "..." : totalLeave}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Kuota Tahunan</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-2xl font-extrabold text-orange-500">{initialLoading ? "..." : usedLeave}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Terpakai (Disetujui)</p>
                    {!initialLoading && pendingAnnualDays > 0 && (
                        <p className="text-[11px] font-medium text-amber-600 mt-0.5">+{pendingAnnualDays} hari menunggu HR</p>
                    )}
                </div>
                <div className="card p-4 text-center">
                    <p className="text-2xl font-extrabold text-green-600">{initialLoading ? "..." : availableAnnualLeave}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Tersedia Diajukan</p>
                    {!initialLoading && pendingAnnualDays > 0 && (
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Sisa disetujui: {remainingLeave} hari</p>
                    )}
                </div>
            </div>

            {/* Balance Warning Alerts */}
            {!initialLoading && availableAnnualLeave <= 0 ? (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-600 font-medium text-sm">
                    <XCircle className="w-5 h-5 flex-shrink-0" />
                    <span>
                        {remainingLeave <= 0
                            ? "Kuota Cuti Tahunan Anda telah habis. Anda tidak dapat mengajukan Cuti Tahunan baru, namun tetap dapat mengajukan Izin Sakit, Izin Pribadi, Cuti Melahirkan, atau Paternity."
                            : `Seluruh sisa Cuti Tahunan Anda (${remainingLeave} hari) sedang menunggu persetujuan HR. Anda tetap dapat mengajukan Izin Sakit, Izin Pribadi, Cuti Melahirkan, atau Paternity.`}
                    </span>
                </div>
            ) : !initialLoading && availableAnnualLeave <= 2 ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-3 text-amber-600 font-medium text-sm">
                    <CalendarOff className="w-5 h-5 flex-shrink-0" />
                    <span>Peringatan: Kuota Cuti Tahunan yang dapat diajukan tersisa {availableAnnualLeave} hari kerja.</span>
                </div>
            ) : null}

            {/* Form */}
            {showForm && (
                <div className="card p-6 border-2 border-[var(--primary)]/20 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Form Pengajuan Cuti</h3>
                        <button onClick={() => setShowForm(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="w-4 h-4" /></button>
                    </div>
                    <form onSubmit={isDiscrete ? handleSubmitDiscrete : handleSubmitRange} className="space-y-4">
                        <div className="form-group !mb-0">
                            <label className="form-label">Jenis Cuti</label>
                            <select className="form-select" value={form.type} onChange={(e) => { setForm({ ...form, type: e.target.value }); setSelectedDates([]); }}>
                                <option value="annual">Tahunan</option>
                                <option value="sick">Sakit</option>
                                <option value="personal">Pribadi</option>
                                <option value="maternity">Melahirkan</option>
                                <option value="paternity">Paternity (Ayah)</option>
                            </select>
                            {form.type === "annual" && availableAnnualLeave <= 0 && (
                                <p className="text-xs text-red-500 font-medium mt-1">
                                    * Kuota Cuti Tahunan tidak tersedia ({remainingLeave} sisa − {pendingAnnualDays} menunggu persetujuan HR). Pilih jenis cuti lain bila diperlukan.
                                </p>
                            )}
                        </div>
                        {isDiscrete ? (
                            <div className="form-group !mb-0">
                                <label className="form-label">Pilih Tanggal ({selectedDates.length}/{form.type === "annual" ? maxSelectable : WINDOW_DAYS} hari kerja)</label>
                                <p className="text-xs text-[var(--text-muted)]">Besok s/d {windowEnd ? formatIndonesianDate(windowEnd) : ""} ({WINDOW_DAYS} hari ke depan), khusus hari kerja jadwal Anda. Satu tanggal terpilih = satu pengajuan cuti.</p>
                                {scheduleLoading && <p className="text-xs text-[var(--text-muted)] mt-1">Memuat jadwal shift...</p>}
                                {scheduleError && (
                                    <div className="flex items-center justify-between gap-2 text-xs text-amber-600 mt-1">
                                        <span>Jadwal shift gagal dimuat, libur sementara mengikuti hari Minggu. {scheduleError}</span>
                                        <button type="button" onClick={() => void loadSchedule()} className="underline font-semibold shrink-0">
                                            Coba lagi
                                        </button>
                                    </div>
                                )}
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                                    {windowDates.map((dateKey) => {
                                        const occupied = occupiedSet.has(dateKey);
                                        const off = isDateOff(dateKey);
                                        const disabled = occupied || off || (form.type === "annual" && availableAnnualLeave <= 0);
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
                                                title={occupied ? `${formatIndonesianDate(dateKey)} — sudah diajukan` : off ? `${formatIndonesianDate(dateKey)} — libur jadwal` : formatIndonesianDate(dateKey)}
                                                className={`relative rounded-lg border-2 p-2 text-center transition-all ${
                                                    selected
                                                        ? "border-red-600 bg-red-600 text-white font-bold shadow-md ring-2 ring-red-500/30"
                                                        : disabled
                                                          ? "border-[var(--border)] bg-[var(--muted)] text-[var(--text-muted)] opacity-50 cursor-not-allowed"
                                                          : "border-[var(--border)] bg-[var(--card)] text-[var(--text-primary)] hover:border-red-500 hover:bg-[var(--accent)] cursor-pointer"
                                                }`}
                                            >
                                                {selected && (
                                                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-white text-red-600 flex items-center justify-center text-[10px] font-extrabold leading-none shadow-sm">
                                                        ✓
                                                    </span>
                                                )}
                                                <span className={`block text-[10px] ${selected ? "text-red-100 font-semibold" : "text-[var(--text-muted)]"}`}>
                                                    {weekday}
                                                </span>
                                                <span className={`block text-base leading-tight my-0.5 ${selected ? "text-white font-extrabold" : "font-semibold"}`}>
                                                    {dayNum}
                                                </span>
                                                <span className={`block text-[10px] ${selected ? "text-red-100" : "text-[var(--text-muted)]"}`}>
                                                    {occupied ? "Diajukan" : off ? "Libur" : `${dateKey.slice(5, 7)}/${dateKey.slice(0, 4)}`}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {selectedDates.length > 0 && (
                                    <div className="flex items-center justify-between gap-2 flex-wrap mt-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2">
                                        <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                                            {selectedDates.length} tanggal dipilih: {selectedDates.map((d) => formatIndonesianDate(d)).join(", ")}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDates([])}
                                            className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline shrink-0"
                                        >
                                            Reset pilihan
                                        </button>
                                    </div>
                                )}
                                {form.type === "annual" && (
                                    <p className="text-xs text-[var(--text-muted)] mt-1">Sisa disetujui {remainingLeave} hari − menunggu persetujuan {pendingAnnualDays} hari = maks {maxSelectable} tanggal.</p>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group !mb-0">
                                    <label className="form-label">Tanggal Mulai</label>
                                    <input type="date" className="form-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label">Tanggal Selesai</label>
                                    <input type="date" className="form-input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
                                </div>
                            </div>
                        )}
                        <div className="form-group !mb-0">
                            <label className="form-label">Alasan</label>
                            <textarea className="form-textarea" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required placeholder="Berikan alasan pengajuan cuti..." />
                        </div>
                        <div className="form-group !mb-0">
                            <div className="flex items-center justify-between">
                                <label className="form-label !mb-0">Upload Bukti (PDF/Foto)</label>
                                {form.attachment && (
                                    <button
                                        type="button"
                                        onClick={clearAttachment}
                                        className="text-[11px] font-medium text-red-500 hover:underline flex items-center gap-1"
                                    >
                                        <X className="w-3 h-3" /> Hapus bukti
                                    </button>
                                )}
                            </div>
                            <div className="relative mt-1">
                                <input type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" id="leave-attachment" />
                                <label htmlFor="leave-attachment" className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-[var(--border)] rounded-lg hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all cursor-pointer group">
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
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">* Maksimal 2MB (JPG/PNG/WEBP/PDF). Satu bukti disimpan sekali dan ditautkan ke semua tanggal terpilih.</p>
                        </div>
                        <button type="submit" className="btn btn-primary w-full" disabled={loading || (form.type === "annual" && availableAnnualLeave <= 0) || (isDiscrete && selectedDates.length === 0)}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {loading ? "Mengirim..." : isDiscrete ? `Kirim ${selectedDates.length} Pengajuan` : "Kirim Pengajuan"}
                        </button>
                    </form>
                </div>
            )}

            {/* History */}
            <div className="space-y-3">
                <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-[var(--primary)]" />
                    Riwayat Cuti
                </h2>
                {initialLoading ? (
                    <div className="space-y-3" role="status" aria-live="polite" aria-label="Memuat riwayat cuti">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="card p-4 space-y-2">
                                <Skeleton className="h-5 w-2/3" />
                                <Skeleton className="h-4 w-1/2" />
                                <Skeleton className="h-3 w-1/3" />
                            </div>
                        ))}
                    </div>
                ) : leaves.length === 0 ? (
                    <div className="card p-8 text-center">
                        <CalendarOff className="w-10 h-10 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada pengajuan</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            {paginatedLeaves.map((l) => {
                                const info = getStatusInfo(l.status);
                                const StatusIcon = info.icon;
                                const hasAttachment = Boolean(l.attachmentUrl || l.attachment);
                                return (
                                    <div key={l.id} className="card p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="badge badge-info">{getTypeLabel(l.type)}</span>
                                                {hasAttachment && (
                                                    <button onClick={() => openAttachment(l)} className="flex items-center gap-1.5 px-2 py-0.5 bg-[var(--secondary)] text-[var(--primary)] rounded text-[10px] font-bold hover:bg-[var(--primary)]/10 transition-colors">
                                                        <Paperclip className="w-3 h-3" /> Bukti
                                                    </button>
                                                )}
                                            </div>
                                            <span className={`badge ${info.badge} flex items-center gap-1`}>
                                                <StatusIcon className="w-3 h-3" /> {info.label}
                                            </span>
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
