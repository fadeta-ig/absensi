import { CheckCircle, Eye, XCircle } from "lucide-react";
import { VisitReport, STATUS_CONFIG } from "../types";

interface Props {
    filtered: VisitReport[];
    updating: string | null;
    setSelectedVisit: (v: VisitReport | null) => void;
    handleStatusUpdate: (id: string, status: "approved" | "rejected") => void;
    formatTimeRange: (start?: string | null, end?: string | null) => string;
}

export function VisitListTable({
    filtered, updating, setSelectedVisit, handleStatusUpdate, formatTimeRange
}: Props) {
    return (
        <div className="card overflow-hidden">
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Karyawan</th>
                            <th>Klien</th>
                            <th className="hidden md:table-cell">Tujuan</th>
                            <th className="hidden lg:table-cell">Tanggal</th>
                            <th className="hidden lg:table-cell">Jam</th>
                            <th>Status</th>
                            <th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-8 text-sm text-[var(--text-muted)]">Tidak ada kunjungan ditemukan</td></tr>
                        ) : (
                            filtered.map((v) => {
                                const cfg = STATUS_CONFIG[v.status];
                                return (
                                    <tr key={v.id}>
                                        <td>
                                            <div>
                                                <p className="text-sm font-semibold text-[var(--text-primary)]">{v.employeeName || "-"}</p>
                                                <p className="text-[10px] font-mono text-[var(--text-muted)]">{v.employeeId}</p>
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
                                        <td className="hidden lg:table-cell text-xs font-mono">
                                            {formatTimeRange(v.visitStartTime, v.visitEndTime)}
                                        </td>
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
    );
}
