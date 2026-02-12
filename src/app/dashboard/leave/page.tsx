"use client";

import { useEffect, useState } from "react";
import { CalendarOff, CheckCircle, XCircle, Clock, Filter } from "lucide-react";

interface LeaveRequest {
    id: string; employeeId: string; type: string;
    startDate: string; endDate: string; reason: string;
    status: string; createdAt: string;
}

export default function LeaveManagementPage() {
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        fetch("/api/leave").then((r) => r.json()).then(setLeaves);
    }, []);

    const filtered = filter === "all" ? leaves : leaves.filter((l) => l.status === filter);

    const handleUpdate = async (id: string, status: "approved" | "rejected") => {
        const res = await fetch("/api/leave", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status }),
        });
        if (res.ok) setLeaves((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
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

    const pendingCount = leaves.filter((l) => l.status === "pending").length;

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <CalendarOff className="w-5 h-5 text-[var(--primary)]" />
                        Manajemen Cuti
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">{pendingCount} pengajuan menunggu persetujuan</p>
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[var(--text-muted)]" />
                    <select className="form-select min-w-[150px]" value={filter} onChange={(e) => setFilter(e.target.value)}>
                        <option value="all">Semua Status</option>
                        <option value="pending">Menunggu</option>
                        <option value="approved">Disetujui</option>
                        <option value="rejected">Ditolak</option>
                    </select>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="card p-12 text-center">
                    <CalendarOff className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Tidak ada pengajuan cuti</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((l) => {
                        const info = getStatusInfo(l.status);
                        const StatusIcon = info.icon;
                        return (
                            <div key={l.id} className="card p-5">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="space-y-2 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-bold text-[var(--text-primary)]">{l.employeeId}</span>
                                            <span className="badge badge-info">{getTypeLabel(l.type)}</span>
                                            <span className={`badge ${info.badge} flex items-center gap-1`}>
                                                <StatusIcon className="w-3 h-3" /> {info.label}
                                            </span>
                                        </div>
                                        <p className="text-sm text-[var(--text-secondary)]">{l.startDate} — {l.endDate}</p>
                                        <p className="text-xs text-[var(--text-muted)]">{l.reason}</p>
                                        <p className="text-[10px] text-[var(--text-muted)]">Diajukan: {new Date(l.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
                                    </div>
                                    {l.status === "pending" && (
                                        <div className="flex gap-2 shrink-0">
                                            <button onClick={() => handleUpdate(l.id, "approved")} className="btn btn-success btn-sm">
                                                <CheckCircle className="w-3.5 h-3.5" /> Setujui
                                            </button>
                                            <button onClick={() => handleUpdate(l.id, "rejected")} className="btn btn-danger btn-sm">
                                                <XCircle className="w-3.5 h-3.5" /> Tolak
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
