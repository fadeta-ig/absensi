"use client";

import { useEffect, useState, useMemo } from "react";
import { ShieldAlert, Search, Filter, Clock, Activity, FileJson, X, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface AuditUser {
    displayName: string;
    username: string;
}

interface AuditLog {
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    details: string | null;
    actorIdentifier: string;
    actorName: string | null;
    actorRole: string | null;
    createdAt: string;
    user: AuditUser | null;
}

interface Pagination {
    total: number;
    limit: number;
    offset: number;
    totalPages: number;
}

export default function AuditTrailPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    
    // Filters
    const [search, setSearch] = useState("");
    const [actionFilter, setActionFilter] = useState("");
    const [entityFilter, setEntityFilter] = useState("");
    const [page, setPage] = useState(1);
    const limit = 20;

    // Modal Details
    const [selectedDetails, setSelectedDetails] = useState<string | null>(null);

    const fetchLogs = async (p: number, searchQ: string, actF: string, entF: string) => {
        setLoading(true);
        setLoadError("");
        try {
            const offset = (p - 1) * limit;
            const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
            if (actF) params.append("action", actF);
            if (entF) params.append("entity", entF);

            const res = await fetch(`/api/audit?${params.toString()}`);
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat jejak audit."));
            }

            const data = await res.json();
            // Client-side search for the search input (on user name or ID) since our simple API doesn't support deep relation search yet
            let filteredData = data.data as AuditLog[];
            if (searchQ) {
                const q = searchQ.toLowerCase();
                filteredData = filteredData.filter(log =>
                    (log.actorName?.toLowerCase().includes(q) ?? false) ||
                    log.actorIdentifier.toLowerCase().includes(q) ||
                    (log.entityId && log.entityId.toLowerCase().includes(q))
                );
            }
            setLogs(filteredData);
            setPagination(data.pagination);
        } catch (err) {
            reportClientError("AuditTrailPage", "Gagal memuat jejak audit", err, { page: p, searchQ, actionFilter: actF, entityFilter: entF });
            setLogs([]);
            setPagination(null);
            setLoadError(err instanceof Error ? err.message : "Gagal memuat jejak audit.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs(page, search, actionFilter, entityFilter);
    }, [page, search, actionFilter, entityFilter]);

    // Extract unique actions and entities for filter dropdowns (based on current data chunk)
    const uniqueActions = useMemo(() => Array.from(new Set(logs.map(l => l.action))), [logs]);
    const uniqueEntities = useMemo(() => Array.from(new Set(logs.map(l => l.entity))), [logs]);

    const formatAction = (action: string) => {
        const lower = action.toLowerCase();
        if (lower.includes("delete")) return <span className="text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded">{action}</span>;
        if (lower.includes("approve")) return <span className="text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded">{action}</span>;
        if (lower.includes("reject")) return <span className="text-orange-500 font-bold bg-orange-500/10 px-2 py-0.5 rounded">{action}</span>;
        if (lower.includes("create")) return <span className="text-blue-500 font-bold bg-blue-500/10 px-2 py-0.5 rounded">{action}</span>;
        if (lower.includes("update")) return <span className="text-indigo-500 font-bold bg-indigo-500/10 px-2 py-0.5 rounded">{action}</span>;
        return <span className="text-[var(--text-primary)] font-semibold">{action}</span>;
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
                        <ShieldAlert className="w-6 h-6 text-red-500" />
                        Sistem Audit Trail
                    </h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Rekam jejak aktivitas kritikal Administrator di dalam sistem.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="badge bg-[var(--secondary)] text-[var(--text-secondary)] font-mono text-xs">
                        {pagination ? `${pagination.total} records` : "Memuat..."}
                    </span>
                </div>
            </div>

            {/* Filters */}
            <div className="card p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Global Search */}
                    <div className="relative md:col-span-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input 
                            type="text" 
                            className="form-input pl-10 w-full" 
                            placeholder="Cari nama admin, ID karyawan, atau ID Entitas..." 
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        />
                    </div>
                    
                    {/* Action Filter */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <select 
                            className="form-select pl-10 w-full appearance-none"
                            value={actionFilter}
                            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                        >
                            <option value="">Semua Aksi</option>
                            <option value="DELETE">Hapus (DELETE)</option>
                            <option value="APPROVE">Setuju (APPROVE)</option>
                            <option value="REJECT">Tolak (REJECT)</option>
                            <option value="CREATE">Buat (CREATE)</option>
                            <option value="UPDATE">Ubah (UPDATE)</option>
                            {uniqueActions.filter(a => !["DELETE","APPROVE","REJECT","CREATE","UPDATE"].some(k => a.includes(k))).map(a => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>
                    </div>

                    {/* Entity Filter */}
                    <div className="relative">
                        <Activity className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <select 
                            className="form-select pl-10 w-full appearance-none"
                            value={entityFilter}
                            onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
                        >
                            <option value="">Semua Entitas</option>
                            <option value="PAYSLIP">Slip Gaji</option>
                            <option value="OVERTIME">Lembur</option>
                            <option value="ATTENDANCE">Absensi</option>
                            <option value="EMPLOYEE">Karyawan</option>
                            <option value="NEWS">Berita</option>
                            {uniqueEntities.filter(e => !["PAYSLIP","OVERTIME","ATTENDANCE","EMPLOYEE","NEWS"].includes(e)).map(e => (
                                <option key={e} value={e}>{e}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table w-full">
                        <thead>
                            <tr>
                                <th><div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> Waktu</div></th>
                                <th>Aksi</th>
                                <th>Entitas Target</th>
                                <th>Aktor (Admin)</th>
                                <th className="text-center">Payload</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center">
                                        <div className="spinner mx-auto" />
                                        <p className="text-xs text-[var(--text-muted)] mt-2">Menyinkronkan log...</p>
                                    </td>
                                </tr>
                            ) : loadError ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center">
                                        <AlertCircle className="w-10 h-10 mx-auto mb-3 text-[var(--destructive)] opacity-70" />
                                        <p className="text-sm font-semibold text-[var(--destructive)]">{loadError}</p>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-[var(--text-muted)] text-sm">
                                        <ShieldAlert className="w-10 h-10 opacity-20 mx-auto mb-3" />
                                        Tidak ada jejak audit yang ditemukan.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id}>
                                        <td className="whitespace-nowrap">
                                            <div className="text-xs font-semibold text-[var(--text-primary)]">
                                                {new Date(log.createdAt).toLocaleDateString("id-ID", { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </div>
                                            <div className="text-[10px] text-[var(--text-muted)] font-mono">
                                                {new Date(log.createdAt).toLocaleTimeString("id-ID")}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="text-xs tracking-wider">
                                                {formatAction(log.action)}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="text-xs font-bold text-[var(--text-primary)]">{log.entity}</div>
                                            {log.entityId && (
                                                <div className="text-[10px] text-[var(--text-muted)] font-mono truncate max-w-[150px]" title={log.entityId}>
                                                    {log.entityId}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                                    {(log.actorName || log.actorIdentifier).charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold text-[var(--text-primary)]">{log.actorName || log.user?.displayName || "System"}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)] font-mono">{log.actorIdentifier}{log.actorRole ? ` · ${log.actorRole}` : ""}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            {log.details ? (
                                                <button 
                                                    onClick={() => setSelectedDetails(log.details)}
                                                    className="btn btn-ghost btn-sm !p-1.5 text-blue-500 hover:!bg-blue-50 dark:hover:!bg-blue-500/10 mx-auto"
                                                    title="Lihat Data JSON"
                                                >
                                                    <FileJson className="w-4 h-4" />
                                                </button>
                                            ) : (
                                                <span className="text-[10px] text-[var(--text-muted)]">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination Controls */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="p-4 border-t border-[var(--border)] flex items-center justify-between bg-[var(--secondary)]/30">
                        <span className="text-xs text-[var(--text-muted)] font-medium">
                            Halaman {page} dari {pagination.totalPages}
                        </span>
                        <div className="flex gap-1">
                            <button 
                                disabled={page === 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                className="btn btn-ghost btn-sm !p-1.5 disabled:opacity-30"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button 
                                disabled={page === pagination.totalPages}
                                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                className="btn btn-ghost btn-sm !p-1.5 disabled:opacity-30"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* JSON Details Modal */}
            {selectedDetails && (
                <div className="modal-overlay z-[999] animate-[fadeIn_0.2s_ease]" onClick={() => setSelectedDetails(null)}>
                    <div className="modal-content max-w-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--secondary)]/50">
                            <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <FileJson className="w-4 h-4 text-indigo-500" />
                                Payload Details
                            </h3>
                            <button onClick={() => setSelectedDetails(null)} className="p-1 rounded-md hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-0 overflow-hidden rounded-b-xl">
                            <pre className="p-4 text-[11px] leading-relaxed text-[var(--text-primary)] bg-[#1e1e1e] dark:bg-[#0d0d0d] text-green-400 font-mono overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                                {(() => {
                                    try {
                                        return JSON.stringify(JSON.parse(selectedDetails), null, 2);
                                    } catch {
                                        return selectedDetails; // If not valid JSON string
                                    }
                                })()}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
