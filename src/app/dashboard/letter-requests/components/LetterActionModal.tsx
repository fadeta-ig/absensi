import { AlertCircle, Loader2, X } from "lucide-react";
import { LetterRequest, TYPE_CONFIG } from "../types";

interface Props {
    actionTarget: LetterRequest;
    setActionTarget: (req: LetterRequest | null) => void;
    actionType: "PROCESSING" | "READY" | "REJECTED";
    submitting: boolean;
    actionNotes: string;
    setActionNotes: (notes: string) => void;
    handleAction: () => void;
}

export function LetterActionModal({
    actionTarget, setActionTarget, actionType, submitting, actionNotes, setActionNotes, handleAction
}: Props) {
    return (
        <div className="modal-overlay" onClick={() => { if (!submitting) setActionTarget(null); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">
                        {actionType === "PROCESSING" ? "Proses Surat" : actionType === "READY" ? "Tandai Siap" : "Tolak Permintaan"}
                    </h2>
                    <button className="modal-close" onClick={() => setActionTarget(null)} disabled={submitting}>
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-[var(--secondary)] rounded-xl">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${TYPE_CONFIG[actionTarget.type].bg}`}>
                            {(() => { const I = TYPE_CONFIG[actionTarget.type].icon; return <I className={`w-4 h-4 ${TYPE_CONFIG[actionTarget.type].color}`} />; })()}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-[var(--text-primary)]">{actionTarget.employeeName}</p>
                            <p className="text-xs text-[var(--text-muted)]">{TYPE_CONFIG[actionTarget.type].label}</p>
                        </div>
                    </div>

                    {actionType === "REJECTED" && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-600">
                                Permintaan yang ditolak tidak dapat dikembalikan. Pastikan alasan penolakan sudah diisi.
                            </p>
                        </div>
                    )}

                    <div className="form-group !mb-0">
                        <label className="form-label">Catatan untuk Karyawan (Opsional)</label>
                        <textarea
                            className="form-textarea"
                            rows={3}
                            value={actionNotes}
                            onChange={(e) => setActionNotes(e.target.value)}
                            placeholder={
                                actionType === "READY"
                                    ? "Contoh: Surat bisa diambil di meja HR. Bawa KTP untuk verifikasi."
                                    : actionType === "REJECTED"
                                        ? "Contoh: Data kepegawaian belum lengkap. Harap update profil terlebih dahulu."
                                        : "Contoh: Estimasi selesai 2 hari kerja."
                            }
                        />
                    </div>

                    <div className="flex gap-2">
                        <button
                            className="btn btn-secondary flex-1"
                            onClick={() => setActionTarget(null)}
                            disabled={submitting}
                        >
                            Batal
                        </button>
                        <button
                            className={`btn flex-1 ${actionType === "REJECTED" ? "bg-red-500 text-white hover:bg-red-600" : "btn-primary"}`}
                            onClick={handleAction}
                            disabled={submitting}
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {actionType === "PROCESSING" ? "Mulai Proses" : actionType === "READY" ? "Tandai Siap" : "Tolak Permintaan"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
