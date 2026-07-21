"use client";

import { useEffect, useState } from "react";
import {
    AlertCircle, Clock4, Search, CheckCircle, XCircle, Clock,
    Calendar, FileText, User, Filter, Eye, X, Loader2
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage } from "@/lib/clientErrors";

interface OvertimeRequest {
    id: string;
    employeeId: string;
    employee?: { name: string };
    date: string;
    startTime: string;
    endTime: string;
    hours: number;
    approvedHours?: number | null;
    isHoliday: boolean;
    overtimePay: number;
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
    const toast = useToast();
    const [requests, setRequests] = useState<OvertimeRequest[]>([]);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [selectedReq, setSelectedReq] = useState<OvertimeRequest | null>(null);
    const [updating, setUpdating] = useState<string | null>(null);
    const [approvedHoursInput, setApprovedHoursInput] = useState<number>(0);
    const [isHolidayInput, setIsHolidayInput] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    useEffect(() => {
        const loadRequests = async () => {
            setInitialLoading(true);
            setLoadError("");
            try {
                const res = await fetch("/api/overtime");
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat pengajuan lembur."));
                const data = await res.json();
                setRequests(Array.isArray(data) ? data : []);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Gagal memuat pengajuan lembur.";
                setLoadError(message);
                toast(message, "error");
            } finally {
                setInitialLoading(false);
            }
        };

        void loadRequests();
    }, [toast]);

    const handleStatusUpdate = async (id: string, status: "approved" | "rejected") => {
        setUpdating(id);
        try {
            const body: Record<string, unknown> = { id, status };
            if (status === "approved") {
                body.approvedHours = approvedHoursInput;
                body.isHoliday = isHolidayInput;
            }
            const res = await fetch("/api/overtime", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const updated = await res.json();
                setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
                if (selectedReq?.id === id) setSelectedReq({ ...selectedReq, ...updated });
                toast(status === "approved" ? "Pengajuan lembur disetujui." : "Pengajuan lembur ditolak.", "success");
            } else {
                throw new Error(await getResponseErrorMessage(res, "Gagal memperbarui status lembur."));
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal memperbarui status lembur.", "error");
        } finally {
            setUpdating(null);
        }
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

            {loadError && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                    { label: "Total", count: statusCounts.all, color: "bg-blue-50 text-blue-700 border-blue-200" },
                    { label: "Menunggu", count: statusCounts.pending, color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
                    { label: "Disetujui", count: statusCounts.approved, color: "bg-green-50 text-green-700 border-green-200" },
                    { label: "Ditolak", count: statusCounts.rejected, color: "bg-red-50 text-red-700 border-red-200" },
                    { label: "Total Jam", count: `${Number(totalApprovedHours.toFixed(2))}h`, color: "bg-purple-50 text-purple-700 border-purple-200" },
                ].map((stat) => (
                    <div key={stat.label} className={`p-3 rounded-xl border ${stat.color}`}>
                        <p className="text-2xl font-bold">{stat.count}</p>
                        <p className="text-xs font-medium">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Fmt helper */}

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
                                <th>Upah Lembur</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {initialLoading ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-10 text-sm text-[var(--text-muted)]">
                                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--primary)] opacity-50" />
                                        Memuat pengajuan lembur...
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-8 text-sm text-[var(--text-muted)]">Tidak ada pengajuan lembur ditemukan</td></tr>
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
                                            <td className="hidden md:table-cell text-xs font-semibold">{Number(r.hours.toFixed(2))}h</td>
                                            <td className="hidden lg:table-cell text-xs text-[var(--text-secondary)] max-w-[200px]">
                                                <p className="line-clamp-2">{r.reason}</p>
                                            </td>
                                            <td className="text-xs font-semibold text-green-600">
                                                {r.overtimePay > 0 ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(r.overtimePay) : "-"}
                                            </td>
                                            <td><span className={`badge ${cfg.class}`}>{cfg.label}</span></td>
                                            <td>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => {
                                                        setSelectedReq(r);
                                                        setApprovedHoursInput(r.approvedHours ?? r.hours);
                                                        setIsHolidayInput(r.isHoliday ?? false);
                                                    }} className="btn btn-ghost btn-sm !p-1.5" title="Detail">
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
                                                                {updating === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                                            </button>
                                                            <button
                                                                onClick={() => handleStatusUpdate(r.id, "rejected")}
                                                                className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50"
                                                                disabled={updating === r.id}
                                                                title="Tolak"
                                                            >
                                                                {updating === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
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
                                    <p className="text-sm text-[var(--text-secondary)]">{selectedReq.startTime} — {selectedReq.endTime} ({Number(selectedReq.hours.toFixed(2))} jam)</p>
                                </div>
                                <div>
                                    <p className="text-xs text-[var(--text-muted)] mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> Alasan</p>
                                    <p className="text-sm text-[var(--text-secondary)]">{selectedReq.reason}</p>
                                </div>
                            </div>

                            {selectedReq.status === "pending" && (
                                <div className="space-y-4 pt-3 border-t border-[var(--border)]">
                                    <div className="form-group !mb-0">
                                        <label className="form-label">Jam Disetujui</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={approvedHoursInput}
                                            onChange={(e) => setApprovedHoursInput(Number(e.target.value))}
                                            min={0.5}
                                            max={12}
                                            step={0.5}
                                        />
                                        <p className="text-[10px] text-[var(--text-muted)] mt-1">Karyawan mengajukan {Number(selectedReq.hours.toFixed(2))} jam</p>
                                    </div>
                                    <div className="form-group !mb-0">
                                        <label className="form-label">Tipe Hari</label>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setIsHolidayInput(false)}
                                                className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${!isHolidayInput ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-[var(--card)] text-[var(--text-secondary)] border-[var(--border)]"
                                                    }`}
                                            >
                                                Hari Kerja
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsHolidayInput(true)}
                                                className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${isHolidayInput ? "bg-orange-500 text-white border-orange-500" : "bg-[var(--card)] text-[var(--text-secondary)] border-[var(--border)]"
                                                    }`}
                                            >
                                                Hari Libur
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleStatusUpdate(selectedReq.id, "approved")}
                                            className="btn btn-primary flex-1"
                                            disabled={updating === selectedReq.id}
                                        >
                                            {updating === selectedReq.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Setujui
                                        </button>
                                        <button
                                            onClick={() => handleStatusUpdate(selectedReq.id, "rejected")}
                                            className="btn btn-secondary flex-1 !text-red-600 !border-red-200 hover:!bg-red-50"
                                            disabled={updating === selectedReq.id}
                                        >
                                            {updating === selectedReq.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Tolak
                                        </button>
                                    </div>
                                </div>
                            )}

                            {selectedReq.status === "approved" && selectedReq.overtimePay > 0 && (
                                <div className="pt-3 border-t border-[var(--border)]">
                                    <div className="flex justify-between items-center bg-green-50 p-3 rounded-lg border border-green-200">
                                        <div>
                                            <p className="text-xs text-green-700 font-medium">Upah Lembur (PP 35/2021)</p>
                                            <p className="text-[10px] text-green-600">{Number((selectedReq.approvedHours ?? selectedReq.hours).toFixed(2))} jam disetujui</p>
                                        </div>
                                        <p className="text-lg font-extrabold text-green-700">
                                            {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(selectedReq.overtimePay)}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
