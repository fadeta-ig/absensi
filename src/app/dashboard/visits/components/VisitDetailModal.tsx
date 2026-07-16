import {
    Building2, Camera, CheckCircle, Clock, FileText,
    LogIn, LogOut, MapPin, Navigation, User, X, XCircle, AlertCircle
} from "lucide-react";
import { useState } from "react";
import { VisitReport, STATUS_CONFIG } from "../types";

interface Props {
    selectedVisit: VisitReport;
    setSelectedVisit: (v: VisitReport | null) => void;
    updating: string | null;
    handleStatusUpdate: (id: string, isChecked: boolean) => void;
}

function PhotoGrid({ photos, label }: { photos: string[]; label: string }) {
    if (photos.length === 0) return null;
    return (
        <div>
            <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" /> {label}
            </p>
            <div className="grid grid-cols-2 gap-2">
                {photos.map((photo, i) => (
                    <div key={i} className="rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--secondary)]">
                        <img src={photo} alt={`${label} ${i + 1}`} className="w-full aspect-[4/3] object-cover" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function VisitDetailModal({
    selectedVisit, setSelectedVisit, updating, handleStatusUpdate
}: Props) {
    const isChecked = selectedVisit.hrChecked;

    return (
        <div className="modal-overlay" onClick={() => setSelectedVisit(null)}>
            <div className="modal-content max-w-lg p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Detail Kunjungan</h2>
                    <button className="modal-close" onClick={() => setSelectedVisit(null)}>
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                    {/* Employee Info */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-[var(--text-primary)]">
                                {selectedVisit.employeeName || selectedVisit.employeeId}
                            </p>
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

                    {/* Visit Details */}
                    <div className="space-y-3">
                        <div>
                            <p className="text-xs text-[var(--text-muted)] mb-1 flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> Klien
                            </p>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedVisit.clientName}</p>
                        </div>
                        <div>
                            <p className="text-xs text-[var(--text-muted)] mb-1 flex items-center gap-1">
                                <Navigation className="w-3 h-3" /> Alamat
                            </p>
                            <p className="text-sm text-[var(--text-secondary)]">{selectedVisit.clientAddress}</p>
                        </div>
                        <div>
                            <p className="text-xs text-[var(--text-muted)] mb-1 flex items-center gap-1">
                                <FileText className="w-3 h-3" /> Tujuan
                            </p>
                            <p className="text-sm text-[var(--text-secondary)]">{selectedVisit.purpose}</p>
                        </div>
                        {selectedVisit.result && (
                            <div>
                                <p className="text-xs text-[var(--text-muted)] mb-1">Hasil</p>
                                <p className="text-sm text-[var(--text-secondary)]">{selectedVisit.result}</p>
                            </div>
                        )}

                        {/* Clock In / Clock Out Times */}
                        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border)]">
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {selectedVisit.date}
                            </span>
                            {selectedVisit.clockInTime && (
                                <span className="flex items-center gap-1 font-mono text-blue-600 font-bold">
                                    <LogIn className="w-3 h-3" /> {selectedVisit.clockInTime}
                                </span>
                            )}
                            {selectedVisit.clockOutTime && (
                                <span className="flex items-center gap-1 font-mono text-orange-600 font-bold">
                                    <LogOut className="w-3 h-3" /> {selectedVisit.clockOutTime}
                                </span>
                            )}
                        </div>
                    </div>



                    {/* Notes */}
                    {selectedVisit.notes && (
                        <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                            <p className="text-[11px] font-bold text-yellow-700 uppercase tracking-wider mb-1">Catatan</p>
                            <p className="text-yellow-800 text-sm italic">{selectedVisit.notes}</p>
                        </div>
                    )}

                    {/* Clock In Photos */}
                    {selectedVisit.clockInPhotos && selectedVisit.clockInPhotos.length > 0 && (
                        <PhotoGrid photos={selectedVisit.clockInPhotos} label="Foto Clock In" />
                    )}

                    {/* Clock Out Photos */}
                    {selectedVisit.clockOutPhotos && selectedVisit.clockOutPhotos.length > 0 && (
                        <PhotoGrid photos={selectedVisit.clockOutPhotos} label="Foto Clock Out" />
                    )}

                    {/* Location Info */}
                    {selectedVisit.visitLocation && (
                        <div className="space-y-1">
                            <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> Koordinat
                            </p>
                            <div className="text-xs font-mono bg-[var(--secondary)] p-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] flex items-center gap-1">
                                <Navigation className="w-3 h-3 shrink-0" />
                                Tujuan: {selectedVisit.visitLocation.lat.toFixed(6)}, {selectedVisit.visitLocation.lng.toFixed(6)} (±{selectedVisit.visitRadius}m)
                            </div>
                            {selectedVisit.clockInLocation && (
                                <div className="text-xs font-mono bg-blue-50 p-2 rounded-lg border border-blue-200 text-blue-700 flex items-center gap-1">
                                    <LogIn className="w-3 h-3 shrink-0" />
                                    Clock In: {selectedVisit.clockInLocation.lat.toFixed(6)}, {selectedVisit.clockInLocation.lng.toFixed(6)}
                                </div>
                            )}
                            {selectedVisit.clockOutLocation && (
                                <div className="text-xs font-mono bg-orange-50 p-2 rounded-lg border border-orange-200 text-orange-700 flex items-center gap-1">
                                    <LogOut className="w-3 h-3 shrink-0" />
                                    Clock Out: {selectedVisit.clockOutLocation.lat.toFixed(6)}, {selectedVisit.clockOutLocation.lng.toFixed(6)}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Approval Actions */}
                    {selectedVisit.status === "clocked_out" && (
                        <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                            <button
                                onClick={() => handleStatusUpdate(selectedVisit.id, !isChecked)}
                                className={`btn w-full ${isChecked ? "btn-secondary text-red-600 hover:!bg-red-50" : "btn-primary"}`}
                                disabled={updating === selectedVisit.id}
                            >
                                {isChecked ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                                {isChecked ? "Batal Tandai Sudah Dicek" : "Tandai Sudah Dicek"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
