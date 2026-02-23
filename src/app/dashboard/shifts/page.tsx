"use client";

import { useEffect, useState } from "react";
import { Clock, Plus, Pencil, Trash2, X, Loader2, Star, ShieldAlert, Timer } from "lucide-react";
import { useConfirm } from "@/components/ConfirmModal";

interface WorkShift {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    isDefault: boolean;
    lateCheckIn: number;
    earlyCheckIn: number;
    lateCheckOut: number;
    earlyCheckOut: number;
}

const INIT_FORM = {
    name: "",
    startTime: "08:00",
    endTime: "17:00",
    isDefault: false,
    lateCheckIn: 0,
    earlyCheckIn: 0,
    lateCheckOut: 0,
    earlyCheckOut: 0,
};

export default function ShiftsPage() {
    const [shifts, setShifts] = useState<WorkShift[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState(INIT_FORM);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch("/api/shifts").then((r) => r.json()).then(setShifts);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const method = editId ? "PUT" : "POST";
        const body = editId ? { ...form, id: editId } : form;
        const res = await fetch("/api/shifts", {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (res.ok) {
            const latest = await fetch("/api/shifts").then((r) => r.json());
            setShifts(latest);
            closeForm();
        }
        setLoading(false);
    };

    const confirm = useConfirm();

    const handleDelete = async (id: string) => {
        confirm({
            title: "Hapus Shift",
            message: "Yakin ingin menghapus shift ini?",
            variant: "danger",
            confirmLabel: "Ya, Hapus",
            onConfirm: async () => {
                const res = await fetch(`/api/shifts?id=${id}`, { method: "DELETE" });
                if (res.ok) setShifts((prev) => prev.filter((s) => s.id !== id));
            },
        });
    };

    const handleSetDefault = async (shift: WorkShift) => {
        const res = await fetch("/api/shifts", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: shift.id, isDefault: true }),
        });
        if (res.ok) {
            const latest = await fetch("/api/shifts").then((r) => r.json());
            setShifts(latest);
        }
    };

    const openEdit = (shift: WorkShift) => {
        setEditId(shift.id);
        setForm({
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            isDefault: shift.isDefault,
            lateCheckIn: shift.lateCheckIn ?? 0,
            earlyCheckIn: shift.earlyCheckIn ?? 0,
            lateCheckOut: shift.lateCheckOut ?? 0,
            earlyCheckOut: shift.earlyCheckOut ?? 0,
        });
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditId(null);
        setForm(INIT_FORM);
    };

    const formatTime = (t: string) => t;

    const calcHours = (start: string, end: string) => {
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        let diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff < 0) diff += 24 * 60;
        return `${Math.floor(diff / 60)}j ${diff % 60}m`;
    };

    const hasTolerance = (s: WorkShift) =>
        s.lateCheckIn > 0 || s.earlyCheckIn > 0 || s.lateCheckOut > 0 || s.earlyCheckOut > 0;

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Clock className="w-5 h-5 text-[var(--primary)]" />
                        Pengaturan Jam Kerja
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Kelola shift dan jam kerja karyawan</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditId(null); setForm(INIT_FORM); }}>
                    <Plus className="w-4 h-4" /> Tambah Shift
                </button>
            </div>

            {/* Shift Cards */}
            {shifts.length === 0 ? (
                <div className="card p-12 text-center">
                    <Clock className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada shift</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Buat shift pertama untuk memulai</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {shifts.map((shift) => (
                        <div key={shift.id} className={`card p-5 relative ${shift.isDefault ? "ring-2 ring-[var(--primary)]" : ""}`}>
                            {shift.isDefault && (
                                <div className="absolute top-3 right-3">
                                    <span className="badge badge-primary flex items-center gap-1">
                                        <Star className="w-3 h-3" /> Default
                                    </span>
                                </div>
                            )}
                            <div className="space-y-3">
                                <h3 className="text-base font-bold text-[var(--text-primary)]">{shift.name}</h3>
                                <div className="flex items-center gap-4">
                                    <div>
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Masuk</p>
                                        <p className="text-lg font-bold text-[var(--primary)]">{formatTime(shift.startTime)}</p>
                                    </div>
                                    <div className="text-[var(--text-muted)]">→</div>
                                    <div>
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Pulang</p>
                                        <p className="text-lg font-bold text-[var(--primary)]">{formatTime(shift.endTime)}</p>
                                    </div>
                                </div>
                                <p className="text-xs text-[var(--text-muted)]">Durasi: {calcHours(shift.startTime, shift.endTime)}</p>

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
                                    <button onClick={() => handleSetDefault(shift)} className="btn btn-ghost btn-sm text-xs gap-1 flex-1">
                                        <Star className="w-3 h-3" /> Set Default
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
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editId ? "Edit Shift" : "Tambah Shift Baru"}</h2>
                            <button className="modal-close" onClick={closeForm}><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="form-group !mb-0">
                                <label className="form-label">Nama Shift</label>
                                <input className="form-input" placeholder="contoh: Shift Pagi" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group !mb-0">
                                    <label className="form-label">Jam Masuk</label>
                                    <input type="time" className="form-input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label">Jam Pulang</label>
                                    <input type="time" className="form-input" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
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
                                        <input
                                            type="number"
                                            min={0}
                                            className="form-input"
                                            placeholder="0"
                                            value={form.lateCheckIn}
                                            onChange={(e) => setForm({ ...form, lateCheckIn: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className="form-group !mb-0">
                                        <label className="form-label text-[11px]">
                                            <Clock className="w-3 h-3 inline mr-1 text-blue-500" />
                                            Boleh Masuk Lebih Awal
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            className="form-input"
                                            placeholder="0"
                                            value={form.earlyCheckIn}
                                            onChange={(e) => setForm({ ...form, earlyCheckIn: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className="form-group !mb-0">
                                        <label className="form-label text-[11px]">
                                            <ShieldAlert className="w-3 h-3 inline mr-1 text-violet-500" />
                                            Boleh Pulang Lebih Awal
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            className="form-input"
                                            placeholder="0"
                                            value={form.earlyCheckOut}
                                            onChange={(e) => setForm({ ...form, earlyCheckOut: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className="form-group !mb-0">
                                        <label className="form-label text-[11px]">
                                            <Timer className="w-3 h-3 inline mr-1 text-emerald-500" />
                                            Boleh Pulang Lebih Lambat
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            className="form-input"
                                            placeholder="0"
                                            value={form.lateCheckOut}
                                            onChange={(e) => setForm({ ...form, lateCheckOut: parseInt(e.target.value) || 0 })}
                                        />
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
