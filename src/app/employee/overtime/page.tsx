"use client";

import { useState, useEffect } from "react";
import {
    Clock4, Plus, Loader2, CheckCircle, AlertCircle, X,
    Calendar, Clock, FileText, Filter
} from "lucide-react";

interface OvertimeRequest {
    id: string;
    employeeId: string;
    date: string;
    startTime: string;
    endTime: string;
    hours: number;
    reason: string;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
}

const STATUS_CONFIG = {
    pending: { label: "Menunggu", class: "badge-warning" },
    approved: { label: "Disetujui", class: "badge-success" },
    rejected: { label: "Ditolak", class: "badge-error" },
};

export default function EmployeeOvertimePage() {
    const [requests, setRequests] = useState<OvertimeRequest[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>("all");

    const [form, setForm] = useState({
        date: new Date().toISOString().split("T")[0],
        startTime: "17:00",
        endTime: "19:00",
        reason: "",
    });

    useEffect(() => {
        fetch("/api/overtime").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setRequests(d); });
    }, []);

    const resetForm = () => {
        setForm({ date: new Date().toISOString().split("T")[0], startTime: "17:00", endTime: "19:00", reason: "" });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.date || !form.startTime || !form.endTime || !form.reason) return;
        setLoading(true);
        setMessage(null);

        try {
            const res = await fetch("/api/overtime", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();

            if (res.ok) {
                setRequests((prev) => [data, ...prev]);
                setShowForm(false);
                resetForm();
                setMessage({ type: "success", text: "Pengajuan lembur berhasil dikirim!" });
            } else {
                setMessage({ type: "error", text: data.error || "Gagal mengajukan lembur" });
            }
        } catch {
            setMessage({ type: "error", text: "Terjadi kesalahan koneksi" });
        }
        setLoading(false);
    };

    const totalApproved = requests.filter((r) => r.status === "approved").reduce((sum, r) => sum + r.hours, 0);
    const filtered = filterStatus === "all" ? requests : requests.filter((r) => r.status === filterStatus);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease] pb-20 lg:pb-0">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Clock4 className="w-5 h-5 text-[var(--primary)]" />
                        Lembur
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Total disetujui: <strong className="text-[var(--text-primary)]">{totalApproved}</strong> jam
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowForm(true); resetForm(); }}>
                    <Plus className="w-4 h-4" /> Ajukan Lembur
                </button>
            </div>

            {/* Message */}
            {message && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${message.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {message.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {message.text}
                </div>
            )}

            {/* Filter */}
            <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[var(--text-muted)]" />
                {["all", "pending", "approved", "rejected"].map((s) => (
                    <button
                        key={s}
                        onClick={() => setFilterStatus(s)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filterStatus === s
                            ? "bg-[var(--primary)] text-white"
                            : "bg-[var(--secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                            }`}
                    >
                        {s === "all" ? "Semua" : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].label}
                    </button>
                ))}
            </div>

            {/* Request List */}
            {filtered.length === 0 ? (
                <div className="card p-8 text-center">
                    <Clock4 className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm text-[var(--text-muted)]">Belum ada pengajuan lembur</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((req) => {
                        const cfg = STATUS_CONFIG[req.status];
                        return (
                            <div key={req.id} className="card p-4 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Calendar className="w-4 h-4 text-[var(--primary)] shrink-0" />
                                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{req.date}</h3>
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)] mb-1">
                                            <Clock className="w-3 h-3 inline mr-1" />
                                            {req.startTime} — {req.endTime} ({req.hours} jam)
                                        </p>
                                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                                            <FileText className="w-3 h-3 inline mr-1" />{req.reason}
                                        </p>
                                    </div>
                                    <span className={`badge ${cfg.class}`}>{cfg.label}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Pengajuan Lembur</h2>
                            <button className="modal-close" onClick={() => setShowForm(false)}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="form-group !mb-0">
                                <label className="form-label">
                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Tanggal Lembur</span>
                                </label>
                                <input type="date" className="form-input" value={form.date}
                                    onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group !mb-0">
                                    <label className="form-label">
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Jam Mulai</span>
                                    </label>
                                    <input type="time" className="form-input" value={form.startTime}
                                        onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label">
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Jam Selesai</span>
                                    </label>
                                    <input type="time" className="form-input" value={form.endTime}
                                        onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
                                </div>
                            </div>

                            <div className="form-group !mb-0">
                                <label className="form-label">
                                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Alasan Lembur</span>
                                </label>
                                <textarea className="form-input min-h-[80px] resize-none" value={form.reason}
                                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                                    placeholder="Jelaskan alasan dan pekerjaan yang dilakukan..." required />
                            </div>

                            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock4 className="w-4 h-4" />}
                                Ajukan Lembur
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
