"use client";

import { useEffect, useState } from "react";
import { CalendarOff, Send, CalendarDays, Clock, CheckCircle, XCircle, Loader2, X, Paperclip, FileText, Image as ImageIcon } from "lucide-react";

interface LeaveRequest {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
    attachment?: string | null;
    createdAt: string;
}

export default function LeavePage() {
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [balance, setBalance] = useState({ total: 12, used: 0 });
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ type: "annual", startDate: "", endDate: "", reason: "", attachment: "" });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch("/api/leave").then((r) => r.json()).then((data) => {
            if (Array.isArray(data)) {
                setLeaves(data);
                const approvedLeaves = data.filter((l: LeaveRequest) => l.status === "approved");

                // Day-based calculation for balance
                let usedDays = 0;
                approvedLeaves.forEach(l => {
                    const s = new Date(l.startDate);
                    const e = new Date(l.endDate);
                    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    usedDays += diff;
                });

                setBalance({ total: 12, used: usedDays });
            }
        });
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            alert("File terlalu besar (maksimal 2MB)");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setForm({ ...form, attachment: reader.result as string });
        };
        reader.readAsDataURL(file);
    };

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
            setForm({ type: "annual", startDate: "", endDate: "", reason: "", attachment: "" });
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

    const openAttachment = (data: string) => {
        const win = window.open();
        if (win) {
            win.document.write(`<iframe src="${data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
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
                <div className="card p-6 border-2 border-[var(--primary)]/20 shadow-xl">
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
                            <textarea className="form-textarea" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required placeholder="Berikan alasan pengajuan cuti..." />
                        </div>
                        <div className="form-group !mb-0">
                            <label className="form-label">Upload Bukti (PDF/Foto)</label>
                            <div className="relative mt-1">
                                <input type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" id="leave-attachment" />
                                <label htmlFor="leave-attachment" className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-[var(--border)] rounded-lg hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all cursor-pointer group">
                                    {form.attachment ? (
                                        <div className="flex items-center gap-2 text-[var(--success)] font-medium text-xs">
                                            <Paperclip className="w-4 h-4" /> File dipilih
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1">
                                            <Paperclip className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--primary)]" />
                                            <span className="text-xs text-[var(--text-muted)]">Klik untuk pilih file</span>
                                        </div>
                                    )}
                                </label>
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">* Maksimal 2MB (Gunakan foto jika PDF terlalu besar)</p>
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
                                <div key={l.id} className="card p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="badge badge-info">{getTypeLabel(l.type)}</span>
                                            {l.attachment && (
                                                <button onClick={() => openAttachment(l.attachment!)} className="flex items-center gap-1.5 px-2 py-0.5 bg-[var(--secondary)] text-[var(--primary)] rounded text-[10px] font-bold hover:bg-[var(--primary)]/10 transition-colors">
                                                    <Paperclip className="w-3 h-3" /> Bukti
                                                </button>
                                            )}
                                        </div>
                                        <span className={`badge ${info.badge} flex items-center gap-1`}>
                                            <StatusIcon className="w-3 h-3" /> {info.label}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm font-semibold text-[var(--text-primary)]">
                                        <span>{l.startDate} — {l.endDate}</span>
                                        <span className="text-[10px] text-[var(--text-muted)] bg-[var(--secondary)] px-2 py-0.5 rounded-full">
                                            {Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} Hari
                                        </span>
                                    </div>
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
