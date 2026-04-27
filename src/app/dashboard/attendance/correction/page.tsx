"use client";

import { useState, useEffect } from "react";
import { Clock, Calendar, CheckCircle2, History, XCircle, Send, AlertCircle } from "lucide-react";

export default function CorrectionPage() {
    const [history, setHistory] = useState<any[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<{type: "success" | "error", text: string} | null>(null);

    const [targetDate, setTargetDate] = useState("");
    const [proposedClockIn, setProposedClockIn] = useState("");
    const [proposedClockOut, setProposedClockOut] = useState("");
    const [reason, setReason] = useState("");

    const fetchHistory = async () => {
        const res = await fetch("/api/attendance/correction");
        const data = await res.json();
        if (Array.isArray(data)) setHistory(data);
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setMessage(null);

        try {
            // Kombinasi Date + Time dari input form menjadi format ISO-8601 DateTime
            // asumsikan data "targetDate" format YYYY-MM-DD
            // dan clockIn berformat "HH:MM"
            const buildIso = (timeStr: string) => {
                if (!timeStr) return null;
                const date = new Date(targetDate);
                const [h, m] = timeStr.split(":");
                date.setHours(Number(h), Number(m), 0, 0);
                return date.toISOString();
            }

            const payload = {
                targetDate,
                proposedClockIn: buildIso(proposedClockIn),
                proposedClockOut: buildIso(proposedClockOut),
                reason
            };

            const res = await fetch("/api/attendance/correction", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setMessage({ type: "success", text: "Pengajuan koreksi absensi berhasil dikirim." });
                setTargetDate("");
                setProposedClockIn("");
                setProposedClockOut("");
                setReason("");
                fetchHistory();
            } else {
                const err = await res.json();
                setMessage({ type: "error", text: err.error || "Gagal mengirim pengajuan." });
            }
        } catch (e) {
            setMessage({ type: "error", text: "Terjadi kesalahan sistem." });
        } finally {
            setSubmitting(false);
        }
    };

    const statusBadge = (s: string) => {
        const map: Record<string, {color: string, label: string, icon: any}> = {
            PENDING: { color: "bg-orange-100 text-orange-700", label: "Menunggu", icon: Clock },
            APPROVED: { color: "bg-green-100 text-green-700", label: "Disetujui", icon: CheckCircle2 },
            REJECTED: { color: "bg-red-100 text-red-700", label: "Ditolak", icon: XCircle },
        };
        const st = map[s] || { color: "bg-gray-100 text-gray-700", label: s, icon: AlertCircle };
        const Icon = st.icon;
        return (
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${st.color}`}>
                <Icon className="w-3.5 h-3.5" />
                {st.label}
            </span>
        );
    }

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <History className="w-5 h-5 text-[var(--primary)]" />
                    Koreksi Absensi
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Ajukan koreksi jika mesin error, lupa absen, atau error lokasi.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form Section */}
                <div className="lg:col-span-1">
                    <div className="card p-6">
                        <h2 className="text-lg font-bold mb-4 border-b pb-2">Buat Pengajuan Baru</h2>
                        
                        {message && (
                            <div className={`p-3 mb-4 rounded-md text-sm ${message.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                                {message.text}
                            </div>
                        )}

                        <form onSubmit={onSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Tanggal Absensi *</label>
                                <div className="relative">
                                    <Calendar className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                                    <input type="date" className="form-input pl-10" required value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Jam Masuk</label>
                                    <div className="relative">
                                        <Clock className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                                        <input type="time" className="form-input text-sm pl-9" value={proposedClockIn} onChange={(e) => setProposedClockIn(e.target.value)} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Jam Pulang</label>
                                    <div className="relative">
                                        <Clock className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                                        <input type="time" className="form-input text-sm pl-9" value={proposedClockOut} onChange={(e) => setProposedClockOut(e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Alasan / Keterangan Kendala *</label>
                                <textarea rows={3} className="form-input" placeholder="Masukkan alasan yang valid..." required value={reason} onChange={(e) => setReason(e.target.value)}></textarea>
                            </div>

                            <button type="submit" disabled={submitting} className="btn btn-primary w-full flex items-center justify-center gap-2">
                                <Send className="w-4 h-4" />
                                {submitting ? "Mengirim..." : "Kirim Pengajuan"}
                            </button>
                        </form>
                    </div>
                </div>

                {/* History Section */}
                <div className="lg:col-span-2">
                    <div className="card h-full">
                        <div className="p-4 border-b border-[var(--border)] bg-gray-50/50">
                            <h2 className="text-lg font-bold">Riwayat Pengajuan Anda</h2>
                        </div>
                        <div className="p-0 overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Target Tanggal</th>
                                        <th>Diajukan (In - Out)</th>
                                        <th>Alasan</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="text-center py-8 text-gray-500 italic">Belum ada riwayat pengajuan.</td>
                                        </tr>
                                    ) : (
                                        history.map(item => (
                                            <tr key={item.id}>
                                                <td className="font-medium">{item.targetDate}</td>
                                                <td className="text-sm font-mono tracking-tight text-blue-600">
                                                    {(item.proposedClockIn ? new Date(item.proposedClockIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit'}) : '--:--')}
                                                    {" - "}
                                                    {(item.proposedClockOut ? new Date(item.proposedClockOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit'}) : '--:--')}
                                                </td>
                                                <td className="text-sm max-w-xs truncate" title={item.reason}>{item.reason}</td>
                                                <td>{statusBadge(item.status)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
