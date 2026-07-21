import { AlertCircle, CheckCircle, Eye, Loader2, XCircle, LogIn, LogOut } from "lucide-react";
import { VisitReport, STATUS_CONFIG } from "../types";

interface Props {
    filtered: VisitReport[];
    loading: boolean;
    error: string;
    updating: string | null;
    setSelectedVisit: (v: VisitReport | null) => void;
    handleStatusUpdate: (id: string, isChecked: boolean) => void;
}

export function VisitListTable({
    filtered, loading, error, updating, setSelectedVisit, handleStatusUpdate
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
                            <th className="hidden lg:table-cell">Clock In</th>
                            <th className="hidden lg:table-cell">Clock Out</th>
                            <th>Status</th>
                            <th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="text-center py-10 text-sm text-[var(--text-muted)]">
                                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--primary)] opacity-50" />
                                    Memuat kunjungan...
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={8} className="py-10 text-center text-[var(--destructive)]">
                                    <div className="flex items-center justify-center gap-2">
                                        <AlertCircle className="w-4 h-4" />
                                        <span>{error}</span>
                                    </div>
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={8} className="text-center py-8 text-sm text-[var(--text-muted)]">Tidak ada kunjungan ditemukan</td></tr>
                        ) : (
                            filtered.map((v) => {
                                const cfg = STATUS_CONFIG[v.status];
                                const isChecked = v.hrChecked;
                                
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
                                        <td>
                                            <div className="flex flex-col gap-1 items-start">
                                                <span className={`badge ${cfg.class}`}>{cfg.label}</span>
                                                {v.status === "clocked_out" && (
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isChecked ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                                        {isChecked ? "✓ Dicek" : "Belum Dicek"}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => setSelectedVisit(v)} className="btn btn-ghost btn-sm !p-1.5" title="Detail">
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
                                                {v.status === "clocked_out" && (
                                                    <button
                                                        onClick={() => handleStatusUpdate(v.id, !isChecked)}
                                                        className={`btn btn-ghost btn-sm !p-1.5 ${isChecked ? "text-red-500 hover:!bg-red-50" : "text-green-600 hover:!bg-green-50"}`}
                                                        disabled={updating === v.id}
                                                        title={isChecked ? "Batal Tandai" : "Tandai Sudah Dicek"}
                                                    >
                                                        {updating === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isChecked ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                                    </button>
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
