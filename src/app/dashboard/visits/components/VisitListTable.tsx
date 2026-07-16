import { CheckCircle, Eye, XCircle, LogIn, LogOut } from "lucide-react";
import { VisitReport, STATUS_CONFIG } from "../types";

interface Props {
    filtered: VisitReport[];
    updating: string | null;
    setSelectedVisit: (v: VisitReport | null) => void;
    handleStatusUpdate: (id: string, status: "approved" | "rejected", reason?: string) => void;
}

export function VisitListTable({
    filtered, updating, setSelectedVisit, handleStatusUpdate
}: Props) {
    const canApprove = (status: string) => ["clocked_out", "pending_approval"].includes(status);

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
                            <th className="hidden lg:table-cell">Clock In</th>
                            <th className="hidden lg:table-cell">Clock Out</th>
                            <th>Status</th>
                            <th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr><td colSpan={8} className="text-center py-8 text-sm text-[var(--text-muted)]">Tidak ada kunjungan ditemukan</td></tr>
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
                                            {v.clockInTime ? (
                                                <span className="flex items-center gap-1 text-blue-600">
                                                    <LogIn className="w-3 h-3" /> {v.clockInTime}
                                                </span>
                                            ) : "-"}
                                        </td>
                                        <td className="hidden lg:table-cell text-xs font-mono">
                                            {v.clockOutTime ? (
                                                <span className="flex items-center gap-1 text-orange-600">
                                                    <LogOut className="w-3 h-3" /> {v.clockOutTime}
                                                </span>
                                            ) : "-"}
                                        </td>
                                        <td><span className={`badge ${cfg.class}`}>{cfg.label}</span></td>
                                        <td>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => setSelectedVisit(v)} className="btn btn-ghost btn-sm !p-1.5" title="Detail">
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
                                                {canApprove(v.status) && (
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
                                                            onClick={() => {
                                                                const reason = prompt("Alasan penolakan (wajib):");
                                                                if (reason && reason.trim()) {
                                                                    handleStatusUpdate(v.id, "rejected", reason.trim());
                                                                }
                                                            }}
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
