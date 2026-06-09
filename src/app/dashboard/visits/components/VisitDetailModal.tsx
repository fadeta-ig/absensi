import { Building2, CheckCircle, Clock, FileText, Navigation, Timer, User, X, XCircle } from "lucide-react";
import { VisitReport, STATUS_CONFIG } from "../types";

interface Props {
    selectedVisit: VisitReport;
    setSelectedVisit: (v: VisitReport | null) => void;
    updating: string | null;
    approvalNotes: string;
    setApprovalNotes: (notes: string) => void;
    handleStatusUpdate: (id: string, status: "approved" | "rejected", notes?: string) => void;
    formatTimeRange: (start?: string | null, end?: string | null) => string;
}

export function VisitDetailModal({
    selectedVisit, setSelectedVisit, updating, approvalNotes, setApprovalNotes,
    handleStatusUpdate, formatTimeRange
}: Props) {
    return (
        <div className="modal-overlay" onClick={() => setSelectedVisit(null)}>
            <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Detail Kunjungan</h2>
                    <button className="modal-close" onClick={() => setSelectedVisit(null)}>
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="space-y-4">
                    {/* Employee Info */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-[var(--text-primary)]">{selectedVisit.employeeName || selectedVisit.employeeId}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1">
                                    <User className="w-3 h-3" /> {selectedVisit.employeeId}
                                </span>
                                {selectedVisit.employeeDepartment && (
                                    <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                                        <Building2 className="w-3 h-3" /> {selectedVisit.employeeDepartment}
                                    </span>
                                )}
                            </div>
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
                        {/* Date & Time Row */}
                        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border)]">
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {selectedVisit.date}
                            </span>
                            {selectedVisit.visitStartTime && (
                                <span className="flex items-center gap-1 font-mono text-[var(--primary)] font-bold">
                                    <Timer className="w-3 h-3" />
                                    {formatTimeRange(selectedVisit.visitStartTime, selectedVisit.visitEndTime)}
                                </span>
                            )}
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
                        <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                            <div>
                                <label className="text-xs font-medium text-[var(--text-muted)] mb-1 block">Catatan HR (opsional)</label>
                                <textarea
                                    className="form-textarea text-sm w-full"
                                    rows={2}
                                    value={approvalNotes}
                                    onChange={(e) => setApprovalNotes(e.target.value)}
                                    placeholder="Tambahkan catatan untuk karyawan..."
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { handleStatusUpdate(selectedVisit.id, "approved", approvalNotes || undefined); }}
                                    className="btn btn-primary flex-1"
                                    disabled={updating === selectedVisit.id}
                                >
                                    <CheckCircle className="w-4 h-4" /> Setujui
                                </button>
                                <button
                                    onClick={() => { handleStatusUpdate(selectedVisit.id, "rejected", approvalNotes || undefined); }}
                                    className="btn btn-secondary flex-1 !text-red-600 !border-red-200 hover:!bg-red-50"
                                    disabled={updating === selectedVisit.id}
                                >
                                    <XCircle className="w-4 h-4" /> Tolak
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
