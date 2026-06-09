import { CheckCircle, Send, X, XCircle } from "lucide-react";
import { LetterRequest, TYPE_CONFIG, STATUS_CONFIG } from "../types";

interface Props {
    detail: LetterRequest;
    setDetail: (req: LetterRequest | null) => void;
    openAction: (req: LetterRequest, type: "PROCESSING" | "READY" | "REJECTED") => void;
    fmtDate: (iso: string) => string;
}

export function LetterDetailModal({ detail, setDetail, openAction, fmtDate }: Props) {
    return (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Detail Permintaan Surat</h2>
                    <button className="modal-close" onClick={() => setDetail(null)}>
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${TYPE_CONFIG[detail.type].bg}`}>
                            {(() => { const I = TYPE_CONFIG[detail.type].icon; return <I className={`w-5 h-5 ${TYPE_CONFIG[detail.type].color}`} />; })()}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-[var(--text-primary)]">{TYPE_CONFIG[detail.type].label}</p>
                            <span className={`badge ${STATUS_CONFIG[detail.status].badge} mt-0.5`}>{STATUS_CONFIG[detail.status].label}</span>
                        </div>
                    </div>

                    <div className="space-y-3 bg-[var(--secondary)] rounded-xl p-4">
                        <div>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Karyawan</p>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{detail.employeeName ?? detail.employeeId}</p>
                            <p className="text-xs text-[var(--text-muted)]">{detail.employeeId}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Tujuan</p>
                            <p className="text-sm text-[var(--text-secondary)]">{detail.purpose}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Diajukan</p>
                                <p className="text-xs text-[var(--text-secondary)]">{fmtDate(detail.createdAt)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Terakhir Update</p>
                                <p className="text-xs text-[var(--text-secondary)]">{fmtDate(detail.updatedAt)}</p>
                            </div>
                        </div>
                        {detail.notes && (
                            <div>
                                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Catatan HR</p>
                                <p className="text-sm text-[var(--text-secondary)]">{detail.notes}</p>
                            </div>
                        )}
                    </div>

                    {/* Quick Actions from Detail */}
                    {detail.status === "PENDING" && (
                        <div className="flex gap-2">
                            <button onClick={() => { setDetail(null); openAction(detail, "PROCESSING"); }} className="btn btn-primary flex-1">
                                <Send className="w-4 h-4" /> Proses
                            </button>
                            <button onClick={() => { setDetail(null); openAction(detail, "REJECTED"); }} className="btn btn-secondary flex-1 !text-red-600">
                                <XCircle className="w-4 h-4" /> Tolak
                            </button>
                        </div>
                    )}
                    {detail.status === "PROCESSING" && (
                        <button onClick={() => { setDetail(null); openAction(detail, "READY"); }} className="btn btn-primary w-full">
                            <CheckCircle className="w-4 h-4" /> Tandai Siap Diambil
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
