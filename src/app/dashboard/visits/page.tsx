"use client";

import { useEffect, useState } from "react";
import {
    MapPinned, Search, CheckCircle, XCircle, Clock,
    Building2, Navigation, FileText, User, Filter, Eye, X
} from "lucide-react";

interface VisitReport {
    id: string;
    employeeId: string;
    date: string;
    clientName: string;
    clientAddress: string;
    purpose: string;
    result?: string | null;
    location?: { lat: number; lng: number } | null;
    photo?: string | null;
    status: "pending" | "approved" | "rejected";
    notes?: string | null;
    createdAt: string;
}

const STATUS_CONFIG = {
    pending: { label: "Menunggu", class: "badge-warning" },
    approved: { label: "Disetujui", class: "badge-success" },
    rejected: { label: "Ditolak", class: "badge-error" },
};

export default function DashboardVisitsPage() {
    const [visits, setVisits] = useState<VisitReport[]>([]);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [selectedVisit, setSelectedVisit] = useState<VisitReport | null>(null);
    const [updating, setUpdating] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/visits").then((r) => r.json()).then(setVisits);
    }, []);

    const handleStatusUpdate = async (id: string, status: "approved" | "rejected") => {
        setUpdating(id);
        try {
            const res = await fetch("/api/visits", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, status }),
            });
            if (res.ok) {
                const updated = await res.json();
                setVisits((prev) => prev.map((v) => (v.id === id ? updated : v)));
                if (selectedVisit?.id === id) setSelectedVisit(updated);
            }
        } catch {
            // silent
        }
        setUpdating(null);
    };

    const filtered = visits.filter((v) => {
        const matchSearch = v.clientName.toLowerCase().includes(search.toLowerCase()) ||
            v.employeeId.toLowerCase().includes(search.toLowerCase()) ||
            v.purpose.toLowerCase().includes(search.toLowerCase());
        const matchStatus = filterStatus === "all" || v.status === filterStatus;
        return matchSearch && matchStatus;
    });

    const statusCounts = {
        all: visits.length,
        pending: visits.filter((v) => v.status === "pending").length,
        approved: visits.filter((v) => v.status === "approved").length,
        rejected: visits.filter((v) => v.status === "rejected").length,
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <MapPinned className="w-5 h-5 text-[var(--primary)]" />
                    Manajemen Kunjungan
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">{visits.length} laporan kunjungan</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: "Total", count: statusCounts.all, color: "bg-blue-50 text-blue-700 border-blue-200" },
                    { label: "Menunggu", count: statusCounts.pending, color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
                    { label: "Disetujui", count: statusCounts.approved, color: "bg-green-50 text-green-700 border-green-200" },
                    { label: "Ditolak", count: statusCounts.rejected, color: "bg-red-50 text-red-700 border-red-200" },
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
                    <input type="text" className="form-input pl-10" placeholder="Cari klien, employee ID, atau tujuan..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                                <th>Klien</th>
                                <th className="hidden md:table-cell">Tujuan</th>
                                <th className="hidden lg:table-cell">Tanggal</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-8 text-sm text-[var(--text-muted)]">Tidak ada kunjungan ditemukan</td></tr>
                            ) : (
                                filtered.map((v) => {
                                    const cfg = STATUS_CONFIG[v.status];
                                    return (
                                        <tr key={v.id}>
                                            <td className="font-mono text-xs">
                                                <div className="flex items-center gap-1.5">
                                                    <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                                    {v.employeeId}
                                                </div>
                                            </td>
                                            <td>
                                                <div>
                                                    <p className="font-medium text-[var(--text-primary)] text-sm">{v.clientName}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)] line-clamp-1">{v.clientAddress}</p>
                                                </div>
                                            </td>
                                            <td className="hidden md:table-cell text-xs text-[var(--text-secondary)] max-w-[200px]">
                                                <p className="line-clamp-2">{v.purpose}</p>
                                            </td>
                                            <td className="hidden lg:table-cell text-xs">{v.date}</td>
                                            <td><span className={`badge ${cfg.class}`}>{cfg.label}</span></td>
                                            <td>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => setSelectedVisit(v)} className="btn btn-ghost btn-sm !p-1.5" title="Detail">
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    {v.status === "pending" && (
                                                        <>
                                                            <button
                                                                onClick={() => handleStatusUpdate(v.id, "approved")}
                                                                className="btn btn-ghost btn-sm !p-1.5 text-green-600 hover:!bg-green-50"
                                                                disabled={updating === v.id}
                                                                title="Setujui"
                                                            >
                                                                <CheckCircle className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleStatusUpdate(v.id, "rejected")}
                                                                className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50"
                                                                disabled={updating === v.id}
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
            {selectedVisit && (
                <div className="modal-overlay" onClick={() => setSelectedVisit(null)}>
                    <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Detail Kunjungan</h2>
                            <button className="modal-close" onClick={() => setSelectedVisit(null)}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-[var(--text-muted)]" />
                                    <span className="text-sm font-mono text-[var(--text-secondary)]">{selectedVisit.employeeId}</span>
                                </div>
                                <span className={`badge ${STATUS_CONFIG[selectedVisit.status].class}`}>
                                    {STATUS_CONFIG[selectedVisit.status].label}
                                </span>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-[var(--text-muted)] mb-1 flex items-center gap-1"><Building2 className="w-3 h-3" /> Klien</p>
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedVisit.clientName}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-[var(--text-muted)] mb-1 flex items-center gap-1"><Navigation className="w-3 h-3" /> Alamat</p>
                                    <p className="text-sm text-[var(--text-secondary)]">{selectedVisit.clientAddress}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-[var(--text-muted)] mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> Tujuan</p>
                                    <p className="text-sm text-[var(--text-secondary)]">{selectedVisit.purpose}</p>
                                </div>
                                {selectedVisit.result && (
                                    <div>
                                        <p className="text-xs text-[var(--text-muted)] mb-1">Hasil</p>
                                        <p className="text-sm text-[var(--text-secondary)]">{selectedVisit.result}</p>
                                    </div>
                                )}
                                {selectedVisit.notes && (
                                    <div>
                                        <p className="text-xs text-[var(--text-muted)] mb-1">Catatan</p>
                                        <p className="text-sm text-[var(--text-secondary)]">{selectedVisit.notes}</p>
                                    </div>
                                )}
                                <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                                    <Clock className="w-3 h-3" /> {selectedVisit.date}
                                </div>
                            </div>

                            {selectedVisit.photo && (
                                <div className="rounded-lg overflow-hidden border border-[var(--border)]">
                                    <img src={selectedVisit.photo} alt="Bukti kunjungan" className="w-full object-cover max-h-[300px]" />
                                </div>
                            )}

                            {selectedVisit.location && (
                                <div className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                                    <Navigation className="w-3 h-3" />
                                    Lokasi: {selectedVisit.location.lat.toFixed(6)}, {selectedVisit.location.lng.toFixed(6)}
                                </div>
                            )}

                            {selectedVisit.status === "pending" && (
                                <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
                                    <button
                                        onClick={() => { handleStatusUpdate(selectedVisit.id, "approved"); }}
                                        className="btn btn-primary flex-1"
                                        disabled={updating === selectedVisit.id}
                                    >
                                        <CheckCircle className="w-4 h-4" /> Setujui
                                    </button>
                                    <button
                                        onClick={() => { handleStatusUpdate(selectedVisit.id, "rejected"); }}
                                        className="btn btn-secondary flex-1 !text-red-600 !border-red-200 hover:!bg-red-50"
                                        disabled={updating === selectedVisit.id}
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
