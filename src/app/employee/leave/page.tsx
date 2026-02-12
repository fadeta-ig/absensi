"use client";

import { useEffect, useState } from "react";
import { CalendarOff, Send, CalendarDays, Clock, CheckCircle, XCircle, Loader2, X } from "lucide-react";

interface LeaveRequest {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
    createdAt: string;
}

export default function LeavePage() {
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [balance, setBalance] = useState({ total: 12, used: 0 });
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ type: "annual", startDate: "", endDate: "", reason: "" });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch("/api/leave").then((r) => r.json()).then((data) => {
            setLeaves(data);
            const used = data.filter((l: LeaveRequest) => l.status === "approved").length;
            setBalance({ total: 12, used });
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const res = await fetch("/api/leave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
        });
        if (res.ok) {
            const newLeave = await res.json();
            setLeaves((prev) => [newLeave, ...prev]);
            setShowForm(false);
            setForm({ type: "annual", startDate: "", endDate: "", reason: "" });
        }
        setLoading(false);
    };

    const getTypeLabel = (t: string) => {
        switch (t) { case "annual": return "Tahunan"; case "sick": return "Sakit"; case "personal": return "Pribadi"; case "maternity": return "Melahirkan"; default: return t; }
    };

    const getStatusInfo = (s: string) => {
        switch (s) {
            case "approved": return { label: "Disetujui", badge: "badge-success", icon: CheckCircle };
            case "rejected": return { label: "Ditolak", badge: "badge-error", icon: XCircle };
            default: return { label: "Menunggu", badge: "badge-warning", icon: Clock };
        }
    };

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
                <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                    <Send className="w-4 h-4" /> Ajukan Cuti
                </button>
            </div>

            {/* Balance */}
            <div className="grid grid-cols-3 gap-4">
                <div className="card p-4 text-center">
                    <p className="text-2xl font-extrabold text-[var(--primary)]">{balance.total}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Total</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-2xl font-extrabold text-orange-500">{balance.used}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Terpakai</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-2xl font-extrabold text-green-600">{balance.total - balance.used}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Sisa</p>
                </div>
            </div>

            {/* Form */}
            {showForm && (
                <div className="card p-6 border-2 border-[var(--primary)]/20">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Form Pengajuan Cuti</h3>
                        <button onClick={() => setShowForm(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="w-4 h-4" /></button>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="form-group !mb-0">
                            <label className="form-label">Jenis Cuti</label>
                            <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                                <option value="annual">Tahunan</option>
                                <option value="sick">Sakit</option>
                                <option value="personal">Pribadi</option>
                                <option value="maternity">Melahirkan</option>
                            </select>
                        </div>
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
                        <div className="form-group !mb-0">
                            <label className="form-label">Alasan</label>
                            <textarea className="form-textarea" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
                        </div>
                        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {loading ? "Mengirim..." : "Kirim Pengajuan"}
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
                {leaves.length === 0 ? (
                    <div className="card p-8 text-center">
                        <CalendarOff className="w-10 h-10 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada pengajuan</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {leaves.map((l) => {
                            const info = getStatusInfo(l.status);
                            const StatusIcon = info.icon;
                            return (
                                <div key={l.id} className="card p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="badge badge-info">{getTypeLabel(l.type)}</span>
                                        <span className={`badge ${info.badge} flex items-center gap-1`}>
                                            <StatusIcon className="w-3 h-3" /> {info.label}
                                        </span>
                                    </div>
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">{l.startDate} — {l.endDate}</p>
                                    <p className="text-xs text-[var(--text-secondary)]">{l.reason}</p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
