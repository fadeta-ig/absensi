"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock, Plus, Pencil, Trash2, X, Loader2, Star, ShieldAlert, Timer, Copy } from "lucide-react";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface ShiftDay {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isOff: boolean;
}

interface WorkShift {
    id: string;
    name: string;
    isDefault: boolean;
    lateCheckIn: number;
    earlyCheckIn: number;
    lateCheckOut: number;
    earlyCheckOut: number;
    days: ShiftDay[];
}

const DAY_LABELS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DAY_LABELS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const DEFAULT_DAYS: ShiftDay[] = Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    startTime: "08:00",
    endTime: i === 6 ? "13:00" : "16:00",
    isOff: i === 0,
}));

const INIT_FORM = {
    name: "",
    isDefault: false,
    lateCheckIn: 0,
    earlyCheckIn: 0,
    lateCheckOut: 0,
    earlyCheckOut: 0,
    days: DEFAULT_DAYS,
};

export default function ShiftsPage() {
    const confirm = useConfirm();
    const toast = useToast();
    const [shifts, setShifts] = useState<WorkShift[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState(INIT_FORM);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [actionId, setActionId] = useState<string | null>(null);
    const [initializingPackage, setInitializingPackage] = useState(false);

    useEffect(() => {
        const loadShifts = async () => {
            setInitialLoading(true);
            setLoadError("");
            try {
                const res = await fetch("/api/shifts");
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat data shift."));
                const data = await res.json();
                setShifts(Array.isArray(data) ? data : []);
            } catch (error) {
                reportClientError("ShiftsPage", "Gagal memuat data shift", error);
                const message = error instanceof Error ? error.message : "Gagal memuat data shift.";
                setLoadError(message);
                toast(message, "error");
            } finally {
                setInitialLoading(false);
            }
        };

        void loadShifts();
    }, [toast]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const method = editId ? "PUT" : "POST";
        const body = editId ? { ...form, id: editId } : form;
        try {
            const res = await fetch("/api/shifts", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, editId ? "Gagal menyimpan perubahan shift." : "Gagal menambahkan shift."));

            const latestRes = await fetch("/api/shifts");
            if (!latestRes.ok) throw new Error(await getResponseErrorMessage(latestRes, "Shift tersimpan, tetapi data terbaru gagal dimuat."));
            const latest = await latestRes.json();
            setShifts(Array.isArray(latest) ? latest : []);
            closeForm();
            toast(editId ? "Shift berhasil diperbarui." : "Shift berhasil ditambahkan.", "success");
        } catch (error) {
            reportClientError("ShiftsPage", editId ? "Gagal menyimpan perubahan shift" : "Gagal menambahkan shift", error, { shiftId: editId });
            toast(error instanceof Error ? error.message : editId ? "Gagal menyimpan perubahan shift." : "Gagal menambahkan shift.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        confirm({
            title: "Hapus Shift",
            message: "Yakin ingin menghapus shift ini?",
            variant: "danger",
            confirmLabel: "Ya, Hapus",
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/shifts?id=${id}`, { method: "DELETE" });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus shift."));
                    setShifts((prev) => prev.filter((s) => s.id !== id));
                    toast("Shift berhasil dihapus.", "success");
                } catch (error) {
                    reportClientError("ShiftsPage", "Gagal menghapus shift", error, { shiftId: id });
                    toast(error instanceof Error ? error.message : "Gagal menghapus shift.", "error");
                }
            },
        });
    };

    const handleSetDefault = async (shift: WorkShift) => {
        setActionId(shift.id);
        try {
            const res = await fetch("/api/shifts", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: shift.id, isDefault: true }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menjadikan shift sebagai default."));

            const latestRes = await fetch("/api/shifts");
            if (!latestRes.ok) throw new Error(await getResponseErrorMessage(latestRes, "Default shift tersimpan, tetapi data terbaru gagal dimuat."));
            const latest = await latestRes.json();
            setShifts(Array.isArray(latest) ? latest : []);
            toast("Shift default berhasil diperbarui.", "success");
        } catch (error) {
            reportClientError("ShiftsPage", "Gagal menjadikan shift default", error, { shiftId: shift.id });
            toast(error instanceof Error ? error.message : "Gagal menjadikan shift sebagai default.", "error");
        } finally {
            setActionId(null);
        }
    };

    const handleInitializePackage = () => {
        confirm({
            title: "Inisialisasi Paket 3-Shift 24 Jam",
            message: "Sistem akan membuat otomatis 3 Master Shift standar format 07:00 (Pagi 07:00–15:00, Siang 15:00–23:00, dan Malam 23:00–07:00) ke database jika belum ada. Lanjutkan?",
            variant: "info",
            confirmLabel: "Ya, Inisialisasi",
            onConfirm: async () => {
                setInitializingPackage(true);
                try {
                    const res = await fetch("/api/shifts/preset", { method: "POST" });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menginisialisasi paket 3-shift."));
                    const data = await res.json();
                    if (Array.isArray(data.shifts)) {
                        setShifts(data.shifts);
                    } else {
                        const latestRes = await fetch("/api/shifts");
                        if (latestRes.ok) setShifts(await latestRes.json());
                    }
                    toast("Paket 3-Shift 24 Jam berhasil diinisialisasi!", "success");
                } catch (err) {
                    reportClientError("ShiftsPage", "Gagal inisialisasi paket 3 shift", err);
                    toast(err instanceof Error ? err.message : "Gagal menginisialisasi paket shift.", "error");
                } finally {
                    setInitializingPackage(false);
                }
            },
        });
    };

    const openEdit = (shift: WorkShift) => {
        setEditId(shift.id);
        const sortedDays = [...shift.days].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
        // Fill missing days
        const filledDays: ShiftDay[] = Array.from({ length: 7 }, (_, i) => {
            const existing = sortedDays.find((d) => d.dayOfWeek === i);
            return existing ?? { dayOfWeek: i, startTime: "08:00", endTime: "16:00", isOff: true };
        });
        setForm({
            name: shift.name,
            isDefault: shift.isDefault,
            lateCheckIn: shift.lateCheckIn ?? 0,
            earlyCheckIn: shift.earlyCheckIn ?? 0,
            lateCheckOut: shift.lateCheckOut ?? 0,
            earlyCheckOut: shift.earlyCheckOut ?? 0,
            days: filledDays,
        });
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditId(null);
        setForm(INIT_FORM);
    };

    const updateDay = (dayOfWeek: number, field: keyof ShiftDay, value: string | boolean) => {
        setForm((f) => ({
            ...f,
            days: f.days.map((d) =>
                d.dayOfWeek === dayOfWeek ? { ...d, [field]: value } : d
            ),
        }));
    };

    /** Copy Monday's schedule to Tuesday–Friday */
    const copyMondayToWeekdays = () => {
        const monday = form.days.find((d) => d.dayOfWeek === 1);
        if (!monday) return;
        setForm((f) => ({
            ...f,
            days: f.days.map((d) =>
                d.dayOfWeek >= 2 && d.dayOfWeek <= 5
                    ? { ...d, startTime: monday.startTime, endTime: monday.endTime, isOff: monday.isOff }
                    : d
            ),
        }));
    };

    const calcHours = (start: string, end: string) => {
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        let diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff < 0) diff += 24 * 60;
        return `${Math.floor(diff / 60)}j ${diff % 60}m`;
    };

    const isDayOvernight = (start: string, end: string) => {
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        return (eh * 60 + em) < (sh * 60 + sm);
    };

    const hasOvernightDays = (days: ShiftDay[]) =>
        days.some((d) => !d.isOff && isDayOvernight(d.startTime, d.endTime));

    const apply3ShiftPreset = (type: "pagi" | "siang" | "malam") => {
        if (type === "pagi") {
            setForm((f) => ({
                ...f,
                name: f.name || "Shift 1 — Pagi",
                earlyCheckIn: 30,
                lateCheckIn: 15,
                earlyCheckOut: 0,
                lateCheckOut: 60,
                days: f.days.map((d) => ({
                    ...d,
                    startTime: "07:00",
                    endTime: "15:00",
                })),
            }));
        } else if (type === "siang") {
            setForm((f) => ({
                ...f,
                name: f.name || "Shift 2 — Siang",
                earlyCheckIn: 30,
                lateCheckIn: 15,
                earlyCheckOut: 0,
                lateCheckOut: 60,
                days: f.days.map((d) => ({
                    ...d,
                    startTime: "15:00",
                    endTime: "23:00",
                })),
            }));
        } else if (type === "malam") {
            setForm((f) => ({
                ...f,
                name: f.name || "Shift 3 — Malam",
                earlyCheckIn: 30,
                lateCheckIn: 15,
                earlyCheckOut: 0,
                lateCheckOut: 60,
                days: f.days.map((d) => ({
                    ...d,
                    startTime: "23:00",
                    endTime: "07:00",
                })),
            }));
        }
    };

    const hasTolerance = (s: WorkShift) =>
        s.lateCheckIn > 0 || s.earlyCheckIn > 0 || s.lateCheckOut > 0 || s.earlyCheckOut > 0;

    const getWorkDaySummary = (days: ShiftDay[]) => {
        const workDays = days.filter((d) => !d.isOff).map((d) => d.dayOfWeek);
        if (workDays.length === 0) return "Tidak ada hari kerja";
        if (workDays.length === 7) return "Setiap hari";
        return workDays.map((d) => DAY_LABELS_SHORT[d]).join(", ");
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Clock className="w-5 h-5 text-[var(--primary)]" />
                        Pengaturan Jam Kerja
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Kelola shift dan jadwal kerja per hari</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="btn btn-secondary text-xs flex items-center gap-1.5 border border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30"
                        onClick={handleInitializePackage}
                        disabled={initializingPackage}
                        title="Inisialisasi otomatis Shift 1 (Pagi), Shift 2 (Siang), dan Shift 3 (Malam) ke database"
                    >
                        {initializingPackage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>⚡</span>}
                        Paket 3-Shift 24 Jam
                    </button>
                    <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditId(null); setForm(INIT_FORM); }}>
                        <Plus className="w-4 h-4" /> Tambah Shift
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Shift Cards */}
            {initialLoading ? (
                <div className="card p-12 text-center text-[var(--text-muted)]">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--primary)] opacity-50" />
                    <p className="text-sm font-medium">Memuat data shift...</p>
                </div>
            ) : shifts.length === 0 ? (
                <div className="card p-12 text-center">
                    <Clock className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada shift</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Buat shift pertama untuk memulai</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {shifts.map((shift) => (
                        <div key={shift.id} className={`card p-5 relative ${shift.isDefault ? "ring-2 ring-[var(--primary)]" : ""}`}>
                            <div className="absolute top-3 right-3 flex items-center gap-1.5">
                                {hasOvernightDays(shift.days) && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800" title="Shift melintasi tengah malam (pulang hari berikutnya)">
                                        🌙 Lintas Hari (+1)
                                    </span>
                                )}
                                {shift.isDefault && (
                                    <span className="badge badge-primary flex items-center gap-1">
                                        <Star className="w-3 h-3" /> Default
                                    </span>
                                )}
                            </div>
                            <div className="space-y-3">
                                <div>
                                    <h3 className="text-base font-bold text-[var(--text-primary)]">{shift.name}</h3>
                                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{getWorkDaySummary(shift.days)}</p>
                                </div>

                                {/* Per-day schedule compact */}
                                <div className="space-y-1">
                                    {[...shift.days]
                                        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                                        .map((day) => (
                                            <div key={day.dayOfWeek} className={`flex items-center gap-2 text-xs ${day.isOff ? "opacity-40" : ""}`}>
                                                <span className="w-10 font-semibold text-[var(--text-secondary)]">{DAY_LABELS_SHORT[day.dayOfWeek]}</span>
                                                {day.isOff ? (
                                                    <span className="text-red-400 font-medium">Libur</span>
                                                ) : (
                                                    <span className="font-mono text-[var(--primary)] font-bold flex items-center gap-1">
                                                        {day.startTime} – {day.endTime}
                                                        {isDayOvernight(day.startTime, day.endTime) && (
                                                            <span className="text-[10px] px-1 py-0.2 rounded bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 font-bold" title="Pulang keesokan harinya">
                                                                +1H
                                                            </span>
                                                        )}
                                                        <span className="text-[var(--text-muted)] font-normal ml-1.5">({calcHours(day.startTime, day.endTime)})</span>
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                </div>

                                {/* Tolerance badges */}
                                {hasTolerance(shift) && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {shift.earlyCheckIn > 0 && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                                                CI awal {shift.earlyCheckIn}m
                                            </span>
                                        )}
                                        {shift.lateCheckIn > 0 && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">
                                                CI toleransi {shift.lateCheckIn}m
                                            </span>
                                        )}
                                        {shift.earlyCheckOut > 0 && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">
                                                CO awal {shift.earlyCheckOut}m
                                            </span>
                                        )}
                                        {shift.lateCheckOut > 0 && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">
                                                CO lebih {shift.lateCheckOut}m
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-[var(--border)]">
                                {!shift.isDefault && (
                                    <button onClick={() => handleSetDefault(shift)} disabled={actionId === shift.id} className="btn btn-ghost btn-sm text-xs gap-1 flex-1">
                                        {actionId === shift.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />} Set Default
                                    </button>
                                )}
                                <button onClick={() => openEdit(shift)} className="btn btn-ghost btn-sm !p-1.5">
                                    <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDelete(shift.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={closeForm}>
                    <div className="modal-content max-w-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editId ? "Edit Shift" : "Tambah Shift Baru"}</h2>
                            <button className="modal-close" onClick={closeForm}><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Quick 3-Shift Presets */}
                            <div className="rounded-lg border border-[var(--border)] p-3 bg-[var(--bg-secondary)] space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                        ⚡ Template Cepat 3-Shift 24 Jam (Format 07:00):
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => apply3ShiftPreset("pagi")}
                                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors"
                                        title="Atur otomatis ke Shift Pagi 07:00 – 15:00"
                                    >
                                        ☀️ Shift 1: Pagi (07:00 – 15:00)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => apply3ShiftPreset("siang")}
                                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors"
                                        title="Atur otomatis ke Shift Siang 15:00 – 23:00"
                                    >
                                        🌤️ Shift 2: Siang (15:00 – 23:00)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => apply3ShiftPreset("malam")}
                                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 transition-colors"
                                        title="Atur otomatis ke Shift Malam 23:00 – 07:00 (Lintas Hari)"
                                    >
                                        🌙 Shift 3: Malam (23:00 – 07:00)
                                    </button>
                                </div>
                            </div>

                            <div className="form-group !mb-0">
                                <label className="form-label">Nama Shift</label>
                                <input className="form-input" placeholder="contoh: Shift Reguler" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                            </div>

                            {/* Per-Day Schedule */}
                            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-secondary)]">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                                        <Clock className="w-4 h-4 text-[var(--primary)]" />
                                        Jadwal Per Hari
                                    </div>
                                    <button type="button" onClick={copyMondayToWeekdays} className="text-[10px] flex items-center gap-1 text-[var(--primary)] hover:underline font-medium">
                                        <Copy className="w-3 h-3" /> Salin Senin → Sel-Jum
                                    </button>
                                </div>
                                <div className="divide-y divide-[var(--border)]">
                                    {form.days
                                        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                                        .map((day) => (
                                            <div key={day.dayOfWeek} className={`flex items-center gap-3 px-4 py-2.5 transition-all ${day.isOff ? "bg-[var(--secondary)] opacity-60" : ""}`}>
                                                <span className="w-14 text-xs font-semibold text-[var(--text-secondary)] shrink-0">{DAY_LABELS[day.dayOfWeek]}</span>
                                                <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={day.isOff}
                                                        onChange={(e) => updateDay(day.dayOfWeek, "isOff", e.target.checked)}
                                                        className="w-3.5 h-3.5 accent-red-500"
                                                    />
                                                    <span className="text-[10px] text-red-500 font-medium">Libur</span>
                                                </label>
                                                {!day.isOff && (
                                                    <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
                                                        {isDayOvernight(day.startTime, day.endTime) && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 font-semibold">
                                                                🌙 Pulang H+1
                                                            </span>
                                                        )}
                                                        <input
                                                            type="time"
                                                            className="form-input !py-1 !text-xs !w-24"
                                                            value={day.startTime}
                                                            onChange={(e) => updateDay(day.dayOfWeek, "startTime", e.target.value)}
                                                        />
                                                        <span className="text-[var(--text-muted)] text-xs">–</span>
                                                        <input
                                                            type="time"
                                                            className="form-input !py-1 !text-xs !w-24"
                                                            value={day.endTime}
                                                            onChange={(e) => updateDay(day.dayOfWeek, "endTime", e.target.value)}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                </div>
                            </div>

                            {/* Tolerance Settings */}
                            <div className="rounded-lg border border-[var(--border)] p-4 space-y-3 bg-[var(--bg-secondary)]">
                                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                                    <Timer className="w-4 h-4 text-[var(--primary)]" />
                                    Pengaturan Toleransi (menit)
                                </div>
                                <p className="text-[11px] text-[var(--text-muted)] -mt-1">Atur batas toleransi waktu check-in dan check-out. Isi 0 untuk tanpa toleransi.</p>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="form-group !mb-0">
                                        <label className="form-label text-[11px]">
                                            <ShieldAlert className="w-3 h-3 inline mr-1 text-amber-500" />
                                            Toleransi Terlambat Masuk
                                        </label>
                                        <input type="number" min={0} className="form-input" placeholder="0" value={form.lateCheckIn} onChange={(e) => setForm({ ...form, lateCheckIn: parseInt(e.target.value) || 0 })} />
                                    </div>
                                    <div className="form-group !mb-0">
                                        <label className="form-label text-[11px]">
                                            <Clock className="w-3 h-3 inline mr-1 text-blue-500" />
                                            Boleh Masuk Lebih Awal
                                        </label>
                                        <input type="number" min={0} className="form-input" placeholder="0" value={form.earlyCheckIn} onChange={(e) => setForm({ ...form, earlyCheckIn: parseInt(e.target.value) || 0 })} />
                                    </div>
                                    <div className="form-group !mb-0">
                                        <label className="form-label text-[11px]">
                                            <ShieldAlert className="w-3 h-3 inline mr-1 text-violet-500" />
                                            Boleh Pulang Lebih Awal
                                        </label>
                                        <input type="number" min={0} className="form-input" placeholder="0" value={form.earlyCheckOut} onChange={(e) => setForm({ ...form, earlyCheckOut: parseInt(e.target.value) || 0 })} />
                                    </div>
                                    <div className="form-group !mb-0">
                                        <label className="form-label text-[11px]">
                                            <Timer className="w-3 h-3 inline mr-1 text-emerald-500" />
                                            Boleh Pulang Lebih Lambat
                                        </label>
                                        <input type="number" min={0} className="form-input" placeholder="0" value={form.lateCheckOut} onChange={(e) => setForm({ ...form, lateCheckOut: parseInt(e.target.value) || 0 })} />
                                    </div>
                                </div>
                            </div>

                            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="w-4 h-4 accent-[var(--primary)]" />
                                Jadikan shift default
                            </label>
                            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {editId ? "Simpan Perubahan" : "Tambah Shift"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
