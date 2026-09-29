"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CalendarClock, CheckSquare, Info, Square, Users, XCircle, Search, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface EmployeeLite {
    id: string;
    employeeId: string;
    name: string;
    department?: string | null;
    isActive?: boolean;
    shiftId?: string | null;
}

interface ShiftLite {
    id: string;
    name: string;
    isDefault: boolean;
    days: Array<{ dayOfWeek: number; startTime: string; endTime: string; isOff: boolean }>;
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

function shiftLabel(shift: ShiftLite): string {
    const workDays = shift.days.filter((d) => !d.isOff);
    const hours = workDays.length > 0 ? `${workDays[0].startTime}-${workDays[0].endTime}` : "Libur";
    return `${shift.name} (${hours})`;
}

function addDays(dateStr: string, days: number): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
}

function formatWIBShort(dateStr: string) {
    if (!dateStr) return "";
    try {
        return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" }).format(new Date(dateStr));
    } catch {
        return dateStr;
    }
}

function formatWIBDay(dateStr: string) {
    if (!dateStr) return "";
    try {
        return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long" }).format(new Date(dateStr));
    } catch {
        return "";
    }
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
    
    // Dates
    const [viewDate, setViewDate] = useState("");
    const [targetShiftId, setTargetShiftId] = useState("");
    const [effectiveFrom, setEffectiveFrom] = useState("");
    const [uiEffectiveTo, setUiEffectiveTo] = useState(""); // inclusive
    
    // UI states
    const [loading, setLoading] = useState(true);
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
            const [empRes, shiftRes] = await Promise.all([fetch("/api/employees"), fetch("/api/shifts")]);
            if (!empRes.ok) throw new Error(await getResponseErrorMessage(empRes, "Gagal memuat karyawan."));
            if (!shiftRes.ok) throw new Error(await getResponseErrorMessage(shiftRes, "Gagal memuat shift."));
            const [empData, shiftData] = await Promise.all([empRes.json(), shiftRes.json()]);
            if (Array.isArray(empData)) setEmployees(empData.filter((e: EmployeeLite) => e.isActive !== false));
            if (Array.isArray(shiftData)) {
                setShifts(shiftData);
                setTargetShiftId((prev) => prev || (shiftData.length > 0 ? shiftData[0].id : ""));
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
            return;
        }
        const controller = new AbortController();
        rosterAbortRef.current = controller;
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
            setRosterError(error instanceof Error ? error.message : "Roster tanggal tersebut tidak dapat dimuat; fallback shift karyawan dipakai.");
        } finally {
            if (rosterAbortRef.current === controller) rosterAbortRef.current = null;
        }
    }, []);

    useEffect(() => { void loadData(); }, [loadData]);
    useEffect(() => () => {
        rosterRequestRef.current++;
        rosterAbortRef.current?.abort();
    }, []);

    const shiftNameOf = useCallback((shiftId?: string | null) => {
        return shifts.find((s) => s.id === shiftId)?.name ?? "-";
    }, [shifts]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return employees.filter((e) => {
            if (q && !e.employeeId.toLowerCase().includes(q) && !e.name.toLowerCase().includes(q)) return false;
            if (filterSource !== "all") {
                const entry = roster[e.employeeId];
                const shiftKey = entry?.shiftId ?? e.shiftId ?? "none";
                if (filterSource !== shiftKey) return false;
            }
            return true;
        });
    }, [employees, search, roster, filterSource]);

    const toggleOne = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAllFiltered = () => {
        const next = new Set(selected);
        for (const e of filtered) {
            next.add(e.employeeId);
        }
        setSelected(next);
    };

    const effectiveTo = uiEffectiveTo ? addDays(uiEffectiveTo, 1) : "";
    const rangeValid = !effectiveTo || !effectiveFrom || effectiveTo > effectiveFrom;
    const controlsDisabled = submitting || Boolean(cancellingAssignment);
    const targetShift = shifts.find((s) => s.id === targetShiftId);
    
    const canSubmit = selected.size > 0 && targetShiftId && effectiveFrom && rangeValid && !submitting && !cancellingAssignment;

    const inclusiveDays = useMemo(() => {
        if (!effectiveFrom || !uiEffectiveTo) return 0;
        const diff = Math.round((new Date(uiEffectiveTo).getTime() - new Date(effectiveFrom).getTime()) / (1000 * 60 * 60 * 24));
        return diff >= 0 ? diff + 1 : 0;
    }, [effectiveFrom, uiEffectiveTo]);

    const rangeChip = effectiveFrom && uiEffectiveTo && inclusiveDays > 0 
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

    const conflicts = useMemo(() => {
        if (!effectiveFrom) return [];
        const newStart = effectiveFrom;
        const newEnd = effectiveTo || "9999-12-31";
        
        return Array.from(selected).map(empId => {
            const entry = roster[empId];
            if (!entry?.assignment) return null;
            const a = entry.assignment;
            const aStart = a.effectiveFrom;
            const aEnd = a.effectiveTo || "9999-12-31";
            
            if (aStart < newEnd && aEnd > newStart) {
                return { empId, name: employees.find(e => e.employeeId === empId)?.name || empId };
            }
            return null;
        }).filter(Boolean) as Array<{ empId: string; name: string }>;
    }, [selected, roster, effectiveFrom, effectiveTo, employees]);

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
                        type: "success"
                    });
                    toast(`Roster tersimpan: ${appliedCount} karyawan ke ${targetShift.name}.`, "success");
                    setSelected(new Set());
                    
                    if (viewDateRef.current === submittedDate || (submittedDate <= viewDateRef.current && (!submittedEffectiveTo || submittedEffectiveTo > viewDateRef.current))) {
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
            }
        });
    };

    const handleCancelAssignment = async (employee: EmployeeLite, assignment: NonNullable<RosterEntry["assignment"]>) => {
        if (submitting || cancellingAssignment) return;
        const rangeText = assignment.effectiveTo
            ? ` sampai sebelum ${assignment.effectiveTo}`
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
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal membatalkan jadwal masa depan."));
                    
                    toast(`Jadwal masa depan ${employee.name} dibatalkan.`, "success");
                    setActionResult({
                        success: 1,
                        message: `Jadwal masa depan ${employee.name} berhasil dibatalkan.`,
                        type: "success"
                    });
                    await loadRoster(viewDate);
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Gagal membatalkan jadwal masa depan.";
                    reportClientError("ShiftRosterPage", "Gagal membatalkan jadwal masa depan", error);
                    setActionError(message);
                    toast(message, "error");
                } finally {
                    setCancellingAssignment("");
                }
            }
        });
    };

    function getSourceBadge(source?: RosterEntry["source"]) {
        switch (source) {
            case "assignment": return <span className="badge badge-info text-[10px] ml-2">Roster</span>;
            case "fallback": return <span className="badge badge-warning text-[10px] ml-2">Dasar</span>;
            case "default": return <span className="badge bg-[var(--border)] text-[var(--text-secondary)] text-[10px] ml-2">Default</span>;
            default: return null;
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
            const emp = employees.find(e => e.employeeId === empId);
            const entry = roster[empId];
            if (emp && entry?.assignment && entry.assignment.effectiveFrom > today) {
                list.push({ employee: emp, assignment: entry.assignment });
            }
        }
        return list;
    }, [selected, employees, roster, today]);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <CalendarClock className="w-5 h-5 text-[var(--primary)]" />
                    Roster Shift / Rotasi Mingguan
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Pindahkan banyak karyawan sekaligus dengan tanggal berlaku. Perubahan jadwal masa depan tidak mengubah presensi hari ini.
                </p>
            </div>

            {loadError && <div className="card p-3 text-sm text-[var(--destructive)]">{loadError}</div>}
            {actionError && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{actionError}</span>
                </div>
            )}
            {actionResult && !actionError && (
                <div role="alert" className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${actionResult.type === "success" ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400" : "border-[var(--primary)]/30 bg-[var(--primary)]/10 text-[var(--primary)]"}`}>
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{actionResult.message}</span>
                </div>
            )}

            <div className="card p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-4 border-b border-[var(--border)] pb-4 mb-2">
                        <label className="form-label" htmlFor="roster-view-date">Tanggal Lihat Roster</label>
                        <div className="flex items-center gap-3">
                            <input
                                id="roster-view-date"
                                type="date"
                                className="form-input w-48"
                                value={viewDate}
                                disabled={controlsDisabled}
                                onChange={(e) => {
                                    const nextDate = e.target.value;
                                    viewDateRef.current = nextDate;
                                    setViewDate(nextDate);
                                    void loadRoster(nextDate);
                                }}
                            />
                            {viewDate && <span className="text-sm font-medium text-[var(--text-secondary)]">{formatWIBDay(viewDate)}</span>}
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] mt-1">Pilih tanggal untuk melihat jadwal karyawan di hari tersebut.</p>
                    </div>

                    <div className="md:col-span-1">
                        <label className="form-label" htmlFor="roster-date">Berlaku Mulai Tanggal</label>
                        <div className="flex items-center gap-2">
                            <input
                                id="roster-date"
                                type="date"
                                className="form-input w-full"
                                value={effectiveFrom}
                                disabled={controlsDisabled}
                                onChange={(e) => setEffectiveFrom(e.target.value)}
                            />
                        </div>
                        {effectiveFrom && <span className="text-[11px] font-medium text-[var(--text-secondary)] mt-1 block">{formatWIBDay(effectiveFrom)}</span>}
                    </div>
                    <div className="md:col-span-1">
                        <label className="form-label" htmlFor="roster-date-to">Hari terakhir (ikut termasuk, opsional)</label>
                        <input
                            id="roster-date-to"
                            type="date"
                            className="form-input w-full"
                            value={uiEffectiveTo}
                            min={effectiveFrom || undefined}
                            disabled={controlsDisabled}
                            onChange={(e) => setUiEffectiveTo(e.target.value)}
                        />
                        {uiEffectiveTo && <span className="text-[11px] font-medium text-[var(--text-secondary)] mt-1 block">{formatWIBDay(uiEffectiveTo)}</span>}
                    </div>
                    <div className="md:col-span-2">
                        <label className="form-label" htmlFor="roster-shift">Shift Tujuan</label>
                        <select
                            id="roster-shift"
                            className="form-select w-full"
                            value={targetShiftId}
                            disabled={controlsDisabled}
                            onChange={(e) => setTargetShiftId(e.target.value)}
                        >
                            {shifts.map((s) => (
                                <option key={s.id} value={s.id}>{shiftLabel(s)}</option>
                            ))}
                        </select>
                        {rangeChip && (
                            <div className="mt-2 inline-block rounded-full bg-[var(--primary)]/10 text-[var(--primary)] text-xs font-semibold px-3 py-1 border border-[var(--primary)]/20">
                                {rangeChip}
                            </div>
                        )}
                    </div>
                </div>
                {rosterError && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                        Roster tanggal terpilih tidak dapat dimuat ({rosterError}). Daftar di bawah memakai shift karyawan saat ini sebagai fallback — periksa koneksi lalu pilih ulang tanggal.
                    </div>
                )}

                <div className="border-t border-[var(--border)] pt-4 mt-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                        <label className="form-label mb-0" htmlFor="roster-search">Pilih Karyawan ({selected.size} terpilih)</label>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-[var(--text-muted)]">Filter:</span>
                            <select 
                                className="form-select py-1 text-xs" 
                                value={filterSource} 
                                onChange={(e) => setFilterSource(e.target.value)}
                                disabled={controlsDisabled}
                            >
                                <option value="all">Semua Karyawan</option>
                                {shifts.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            {filterSource !== "all" && (
                                <button type="button" onClick={handleSelectAllFiltered} className="text-[var(--primary)] hover:underline text-xs font-semibold">
                                    Pilih semua hasil
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="relative mb-2">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                            id="roster-search"
                            className="form-input w-full pl-9"
                            placeholder="Cari NIP atau nama..."
                            value={search}
                            disabled={controlsDisabled}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    
                    <div className="max-h-72 overflow-y-auto divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl">
                        {loading ? (
                            <p className="p-4 text-sm text-[var(--text-muted)] flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Memuat karyawan...
                            </p>
                        ) : filtered.length === 0 ? (
                            <p className="p-4 text-sm text-[var(--text-muted)] italic">Tidak ada karyawan sesuai filter.</p>
                        ) : (
                            filtered.map((emp) => {
                                const rosterEntry = roster[emp.employeeId];
                                const currentShift = shifts.find(s => s.id === (rosterEntry?.shiftId ?? emp.shiftId));
                                const status = rosterEntry?.assignment ? getAssignmentStatus(rosterEntry.assignment.effectiveFrom, rosterEntry.assignment.effectiveTo, today) : "";
                                
                                return (
                                    <div key={emp.employeeId} className="flex items-center gap-2 p-2.5 hover:bg-[var(--secondary)]/50">
                                        <button
                                            type="button"
                                            disabled={controlsDisabled}
                                            onClick={() => toggleOne(emp.employeeId)}
                                            className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {selected.has(emp.employeeId)
                                                ? <CheckSquare className="w-4 h-4 text-[var(--primary)] shrink-0" />
                                                : <Square className="w-4 h-4 text-[var(--text-muted)] shrink-0" />}
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">
                                                    {emp.name}
                                                    {getSourceBadge(rosterEntry?.source)}
                                                </span>
                                                <span className="block text-[11px] font-mono text-[var(--text-muted)]">{emp.employeeId}</span>
                                            </span>
                                            <span className="text-[11px] text-[var(--text-secondary)] text-right">
                                                <span className="block font-semibold">
                                                    {currentShift ? shiftLabel(currentShift) : "-"}
                                                </span>
                                                <span className="text-[10px] text-[var(--text-muted)]">
                                                    {status ? `Jadwal ${status}` : (viewDate ? `pada ${viewDate}` : "Belum ada")}
                                                </span>
                                            </span>
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {selectedFutureAssignments.length > 0 && (
                    <div className="rounded-xl border border-[var(--border)] p-4 space-y-3 bg-[var(--bg-secondary)]">
                        <p className="text-xs font-bold text-[var(--text-primary)]">Jadwal Masa Depan Terpilih</p>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                            {selectedFutureAssignments.map(({ employee, assignment }) => (
                                <div key={assignment.id} className="flex items-center justify-between gap-2 text-xs bg-[var(--background)] p-2 rounded border border-[var(--border)]">
                                    <div>
                                        <span className="font-semibold">{employee.name}</span>
                                        <span className="text-[var(--text-muted)] block">Mulai: {formatWIBShort(assignment.effectiveFrom)} {assignment.effectiveTo ? `(s/d sebelum ${formatWIBShort(assignment.effectiveTo)})` : ""}</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--destructive)]/40 px-2 py-1 font-semibold text-[var(--destructive)] hover:bg-[var(--destructive)]/10 disabled:opacity-50"
                                        disabled={Boolean(cancellingAssignment) || submitting}
                                        onClick={() => void handleCancelAssignment(employee, assignment)}
                                        aria-label={`Batalkan jadwal masa depan ${employee.name} mulai ${assignment.effectiveFrom}`}
                                    >
                                        <XCircle className="h-3 w-3" />
                                        {cancellingAssignment === assignment.id ? "Membatalkan..." : "Batal"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="space-y-3 pt-2">
                    {/* Mandatory Group Preview */}
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/40 p-4 space-y-2">
                        {selected.size > 0 && targetShift && effectiveFrom ? (
                            <>
                                <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                    <Users className="w-3.5 h-3.5" />
                                    Preview: {selected.size} karyawan → {targetShift.name}
                                </p>
                                <p className="text-[11px] text-[var(--text-secondary)]">
                                    Mulai <strong>{formatWIBShort(effectiveFrom)}</strong> 
                                    {uiEffectiveTo ? ` sampai akhir ${formatWIBShort(uiEffectiveTo)}` : " (berjalan seterusnya)"}
                                </p>
                                <div className="mt-2 space-y-1">
                                    {previewGroups.map(([fromShiftId, list]) => (
                                        <p key={fromShiftId || "none"} className="text-xs text-[var(--text-secondary)]">
                                            • {list.length} karyawan dari {shiftNameOf(fromShiftId || undefined)}
                                        </p>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-xs text-[var(--text-muted)] italic flex items-center gap-2">
                                <Info className="w-3.5 h-3.5" /> Pilih karyawan, shift, dan tanggal mulai untuk melihat preview.
                            </p>
                        )}
                        {!rangeValid && (
                            <p className="text-xs font-semibold text-[var(--destructive)] flex items-center gap-1.5 mt-2">
                                <AlertCircle className="w-3.5 h-3.5" /> Hari terakhir tidak boleh mendahului tanggal mulai.
                            </p>
                        )}
                        {conflicts.length > 0 && rangeValid && (
                            <div className="mt-3 p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                                <p className="font-bold flex items-center gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5" /> Potensi Bentrok Jadwal
                                </p>
                                <p>
                                    Terdapat <strong>{conflicts.length}</strong> karyawan terpilih yang sudah memiliki jadwal pada rentang baru ini 
                                    (contoh: {conflicts.slice(0, 2).map(c => c.name).join(", ")}{conflicts.length > 2 ? ", dll" : ""}).
                                </p>
                                <p className="italic">Jadwal yang beririsan akan dipotong atau ditimpa oleh jadwal baru ini.</p>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="btn btn-primary w-full md:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? "Menyimpan..." : `Tetapkan ${targetShift?.name || "Shift"} untuk ${selected.size} orang`}
                    </button>
                </div>
            </div>
        </div>
    );
}
