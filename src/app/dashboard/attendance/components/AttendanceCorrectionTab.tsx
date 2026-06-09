import { AttendanceCorrection } from "../types";

interface Props {
    corrections: AttendanceCorrection[];
    processingId: string | null;
    getEmpInfo: (id: string) => { name: string; department: string; division: string };
    handleCorrectionAction: (id: string, s: "APPROVED" | "REJECTED") => void;
}

export function AttendanceCorrectionTab({
    corrections, processingId, getEmpInfo, handleCorrectionAction
}: Props) {
    return (
        <div className="card overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-[var(--secondary)]/50">
                <h2 className="text-lg font-bold">Daftar Pengajuan Susulan Karyawan</h2>
            </div>
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead className="bg-[#F9FAFB]">
                        <tr>
                            <th>Karyawan</th>
                            <th>Target Tanggal</th>
                            <th>Waktu Pengajuan</th>
                            <th>Alasan</th>
                            <th>Status</th>
                            <th className="text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {corrections.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-10 text-[var(--text-muted)] italic">Tidak ada pengajuan koreksi masuk.</td></tr>
                        ) : (
                            corrections.map(c => {
                                const ei = getEmpInfo(c.employeeId);
                                return (
                                    <tr key={c.id}>
                                        <td><div className="font-bold">{ei.name}</div><div className="text-xs text-[var(--text-secondary)]">{c.employeeId}</div></td>
                                        <td className="font-medium text-sm">{c.targetDate}</td>
                                        <td className="font-mono text-sm tracking-tight text-blue-600">
                                            {(c.proposedClockIn ? new Date(c.proposedClockIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--')}
                                            {" - "}
                                            {(c.proposedClockOut ? new Date(c.proposedClockOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--')}
                                        </td>
                                        <td className="text-sm max-w-[200px] truncate" title={c.reason}>{c.reason}</td>
                                        <td>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${c.status === "PENDING" ? "bg-orange-100 text-orange-700" : c.status === "APPROVED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                                {c.status}
                                            </span>
                                        </td>
                                        <td className="text-center">
                                            {c.status === "PENDING" ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleCorrectionAction(c.id, "APPROVED")}
                                                        disabled={processingId === c.id}
                                                        className="p-1 px-3 bg-green-500 text-white rounded-md text-xs font-bold hover:bg-green-600 disabled:opacity-50"
                                                    >
                                                        Terima
                                                    </button>
                                                    <button
                                                        onClick={() => handleCorrectionAction(c.id, "REJECTED")}
                                                        disabled={processingId === c.id}
                                                        className="p-1 px-3 bg-red-500 text-white rounded-md text-xs font-bold hover:bg-red-600 disabled:opacity-50"
                                                    >
                                                        Tolak
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-[var(--text-muted)] italic">Selesai</span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
