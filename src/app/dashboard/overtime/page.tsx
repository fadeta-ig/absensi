"use client";

import { useEffect, useState } from "react";
import {
    Clock4, Search, CheckCircle, XCircle, Clock,
    Calendar, FileText, User, Filter, Eye, X
} from "lucide-react";

interface OvertimeRequest {
    id: string;
    employeeId: string;
    employee?: { name: string };
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

export default function DashboardOvertimePage() {
    const [requests, setRequests] = useState<OvertimeRequest[]>([]);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [selectedReq, setSelectedReq] = useState<OvertimeRequest | null>(null);
    const [updating, setUpdating] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/overtime").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setRequests(d); });
    }, []);

    const handleStatusUpdate = async (id: string, status: "approved" | "rejected") => {
        setUpdating(id);
        try {
            const res = await fetch("/api/overtime", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, status }),
            });
            if (res.ok) {
                const updated = await res.json();
                // Ensure we keep the employee name if updated doesn't include it
                setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
                if (selectedReq?.id === id) setSelectedReq({ ...selectedReq, ...updated });
            }
        } catch { /* silent */ }
        setUpdating(null);
    };

    const filtered = requests.filter((r) => {
        const empName = r.employee?.name || "";
        const matchSearch = r.employeeId.toLowerCase().includes(search.toLowerCase()) ||
            empName.toLowerCase().includes(search.toLowerCase()) ||
            r.reason.toLowerCase().includes(search.toLowerCase());
        const matchStatus = filterStatus === "all" || r.status === filterStatus;
        return matchSearch && matchStatus;
    });

    const statusCounts = {
        all: requests.length,
        pending: requests.filter((r) => r.status === "pending").length,
        approved: requests.filter((r) => r.status === "approved").length,
        rejected: requests.filter((r) => r.status === "rejected").length,
    };

    const totalApprovedHours = requests.filter((r) => r.status === "approved").reduce((sum, r) => sum + r.hours, 0);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Clock4 className="w-5 h-5 text-[var(--primary)]" />
                    Manajemen Lembur
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">{requests.length} pengajuan lembur</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                    { label: "Total", count: statusCounts.all, color: "bg-blue-50 text-blue-700 border-blue-200" },
                    { label: "Menunggu", count: statusCounts.pending, color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
                    { label: "Disetujui", count: statusCounts.approved, color: "bg-green-50 text-green-700 border-green-200" },
                    { label: "Ditolak", count: statusCounts.rejected, color: "bg-red-50 text-red-700 border-red-200" },
                    { label: "Total Jam", count: `${totalApprovedHours}h`, color: "bg-purple-50 text-purple-700 border-purple-200" },
                ].map((stat) => (
                    <div key={stat.label} className={`p-3 rounded-xl border ${stat.color}`}>
                        <p className="text-2xl font-bold">{stat.count}</p>
                        <p className="text-xs font-medium">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Search & Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input type="text" className="form-input pl-10" placeholder="Cari nama, ID atau alasan..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[var(--text-muted)]" />
                    {(["all", "pending", "approved", "rejected"] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filterStatus === s ? "bg-[var(--primary)] text-white" : "bg-[var(--secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]"}`}
                        >
                            {s === "all" ? "Semua" : STATUS_CONFIG[s].label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Karyawan</th>
                                <th>Tanggal</th>
                                <th className="hidden md:table-cell">Jam</th>
                                <th className="hidden md:table-cell">Durasi</th>
                                <th className="hidden lg:table-cell">Alasan</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-8 text-sm text-[var(--text-muted)]">Tidak ada pengajuan lembur ditemukan</td></tr>
                            ) : (
                                filtered.map((r) => {
                                    const cfg = STATUS_CONFIG[r.status];
                                    return (
                                        <tr key={r.id}>
                                            <td>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-sm text-[var(--text-primary)]">{r.employee?.name || "Karyawan"}</span>
                                                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{r.employeeId}</span>
                                                </div>
                                            </td>
                                            <td className="text-xs">{r.date}</td>
                                            <td className="hidden md:table-cell text-xs">{r.startTime} — {r.endTime}</td>
                                            <td className="hidden md:table-cell text-xs font-semibold">{r.hours}h</td>
                                            <td className="hidden lg:table-cell text-xs text-[var(--text-secondary)] max-w-[200px]">
                                                <p className="line-clamp-2">{r.reason}</p>
                                            </td>
                                            <td><span className={`badge ${cfg.class}`}>{cfg.label}</span></td>
                                            <td>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => setSelectedReq(r)} className="btn btn-ghost btn-sm !p-1.5" title="Detail">
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    {r.status === "pending" && (
                                                        <>
                                                            <button
                                                                onClick={() => handleStatusUpdate(r.id, "approved")}
                                                                className="btn btn-ghost btn-sm !p-1.5 text-green-600 hover:!bg-green-50"
                                                                disabled={updating === r.id}
                                                                title="Setujui"
                                                            >
                                                                <CheckCircle className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleStatusUpdate(r.id, "rejected")}
                                                                className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50"
                                                                disabled={updating === r.id}
                                                                title="Tolak"
                                                            >
                                                                <XCircle className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Detail Modal */}
            {selectedReq && (
                <div className="modal-overlay" onClick={() => setSelectedReq(null)}>
                    <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Detail Lembur</h2>
                            <button className="modal-close" onClick={() => setSelectedReq(null)}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-[var(--text-primary)]">{selectedReq.employee?.name || "Karyawan"}</span>
                                    <span className="text-[11px] font-mono text-[var(--text-muted)]">{selectedReq.employeeId}</span>
                                </div>
                                <span className={`badge ${STATUS_CONFIG[selectedReq.status].class}`}>
                                    {STATUS_CONFIG[selectedReq.status].label}
                                </span>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-[var(--text-muted)] mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Tanggal</p>
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedReq.date}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-[var(--text-muted)] mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Jam Lembur</p>
                                    <p className="text-sm text-[var(--text-secondary)]">{selectedReq.startTime} — {selectedReq.endTime} ({selectedReq.hours} jam)</p>
                                </div>
                                <div>
                                    <p className="text-xs text-[var(--text-muted)] mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> Alasan</p>
                                    <p className="text-sm text-[var(--text-secondary)]">{selectedReq.reason}</p>
                                </div>
                            </div>

                            {selectedReq.status === "pending" && (
                                <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
                                    <button
                                        onClick={() => handleStatusUpdate(selectedReq.id, "approved")}
                                        className="btn btn-primary flex-1"
                                        disabled={updating === selectedReq.id}
                                    >
                                        <CheckCircle className="w-4 h-4" /> Setujui
                                    </button>
                                    <button
                                        onClick={() => handleStatusUpdate(selectedReq.id, "rejected")}
                                        className="btn btn-secondary flex-1 !text-red-600 !border-red-200 hover:!bg-red-50"
                                        disabled={updating === selectedReq.id}
                                    >
                                        <XCircle className="w-4 h-4" /> Tolak
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
