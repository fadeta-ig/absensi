"use client";

import {
    X, Clock, FileText, Navigation, MapPin, CheckCircle,
    AlertCircle, Building2, LogIn, LogOut
} from "lucide-react";
import { VisitReport } from "@/types";
import { VISIT_STATUS_CONFIG } from "../visitTypes";
import { VisitPhotoGrid } from "@/components/VisitPhotoGrid";
import AccessibleModal from "@/components/ui/AccessibleModal";

interface VisitDetailModalProps {
    visit: VisitReport;
    onClose: () => void;
}

/** Status timeline step */
function TimelineStep({
    label,
    time,
    isActive,
    isDone,
}: {
    label: string;
    time?: string | null;
    isActive: boolean;
    isDone: boolean;
}) {
    return (
        <div className="flex items-center gap-2">
            <div
                className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                    isDone
                        ? "bg-green-500 border-green-500"
                        : isActive
                        ? "bg-[var(--primary)] border-[var(--primary)] animate-pulse"
                        : "bg-transparent border-[var(--border)]"
                }`}
            />
            <span
                className={`text-xs font-medium ${
                    isDone
                        ? "text-green-700"
                        : isActive
                        ? "text-[var(--primary)] font-bold"
                        : "text-[var(--text-muted)]"
                }`}
            >
                {label}
            </span>
            {time && (
                <span className="text-[10px] font-mono text-[var(--text-muted)] ml-auto">
                    {time}
                </span>
            )}
        </div>
    );
}

export function VisitDetailModal({ visit, onClose }: VisitDetailModalProps) {
    const statusConfig = VISIT_STATUS_CONFIG[visit.status];
    const statusOrder = ["draft", "clocked_in", "clocked_out"];
    const currentIndex = statusOrder.indexOf(visit.status);
    const clockInEvidence = [
        ...(visit.photos?.filter((photo) => photo.phase === "CLOCK_IN") ?? []),
        ...(visit.clockInPhotos ?? []),
    ];
    const clockOutEvidence = [
        ...(visit.photos?.filter((photo) => photo.phase === "CLOCK_OUT") ?? []),
        ...(visit.clockOutPhotos ?? []),
    ];

    return (
        <AccessibleModal ariaLabel={`Detail kunjungan ${visit.clientName}`} onClose={onClose} className="max-w-lg !p-0 overflow-hidden">
                {/* Header */}
                <div className="bg-[var(--secondary)] p-5 border-b border-[var(--border)] flex items-center justify-between">
                    <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <FileText className="w-5 h-5 text-[var(--primary)]" />
                        Detail Kunjungan
                    </h2>
                    <button
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--destructive)] hover:text-white text-[var(--text-secondary)] transition-colors"
                        onClick={onClose}
                        aria-label="Tutup detail kunjungan"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
                    {/* Title & Status */}
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-xl font-bold text-[var(--text-primary)]">
                                {visit.clientName}
                            </h3>
                            <p className="text-sm text-[var(--text-muted)] mt-1 flex items-center gap-1">
                                <Clock className="w-4 h-4" /> {visit.date}
                            </p>
                        </div>
                        <span className={`badge ${statusConfig.class} text-xs px-2.5 py-1.5`}>
                            {statusConfig.label}
                        </span>
                    </div>

                    {/* Timeline */}
                    <div className="bg-[var(--secondary)] p-4 rounded-xl border border-[var(--border)] space-y-2">
                        <TimelineStep
                            label="Draft"
                            isActive={visit.status === "draft"}
                            isDone={currentIndex > 0}
                        />
                        <TimelineStep
                            label="Clock In"
                            time={visit.clockInTime}
                            isActive={visit.status === "clocked_in"}
                            isDone={currentIndex > 1}
                        />
                        <TimelineStep
                            label="Clock Out"
                            time={visit.clockOutTime}
                            isActive={visit.status === "clocked_out"}
                            isDone={visit.status === "clocked_out"}
                        />
                        {visit.status === "clocked_out" && visit.hrChecked && (
                            <TimelineStep
                                label="Sudah Dicek HR"
                                isActive={false}
                                isDone={true}
                            />
                        )}
                    </div>

                    {/* Clock In/Out Summary */}
                    {(visit.clockInTime || visit.clockOutTime) && (
                        <div className="bg-[var(--primary)]/5 p-4 rounded-xl border border-[var(--primary)]/10">
                            <p className="text-[11px] font-bold text-[var(--primary)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" /> Waktu Kunjungan
                            </p>
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                <div>
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase flex items-center gap-1">
                                        <LogIn className="w-3 h-3" /> Clock In
                                    </p>
                                    <p className="text-lg font-bold font-mono text-[var(--text-primary)]">
                                        {visit.clockInTime || "-"}
                                    </p>
                                </div>
                                <div className="text-[var(--text-muted)] text-center">→</div>
                                <div>
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase flex items-center gap-1">
                                        <LogOut className="w-3 h-3" /> Clock Out
                                    </p>
                                    <p className="text-lg font-bold font-mono text-[var(--text-primary)]">
                                        {visit.clockOutTime || "-"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Info Grid */}
                    <div className="grid gap-4 text-sm bg-[var(--background)] p-4 rounded-xl border border-[var(--border)]">
                        <div>
                            <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                <Navigation className="w-3.5 h-3.5" /> Alamat
                            </p>
                            <p className="text-[var(--text-primary)] font-medium leading-relaxed">
                                {visit.clientAddress}
                            </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[var(--border)]">
                            <div>
                                <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5" /> Tujuan
                                </p>
                                <p className="text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                                    {visit.purpose}
                                </p>
                            </div>
                            <div>
                                <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                    <CheckCircle className="w-3.5 h-3.5" /> Hasil
                                </p>
                                <p className="text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                                    {visit.result || "-"}
                                </p>
                            </div>
                        </div>
                    </div>



                    {/* HR Notes */}
                    {visit.notes && (
                        <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200">
                            <p className="text-[11px] font-bold text-yellow-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5" /> Catatan
                            </p>
                            <p className="text-yellow-800 text-sm italic leading-relaxed">
                                {visit.notes}
                            </p>
                        </div>
                    )}

                    {/* Clock In Photos */}
                    {clockInEvidence.length > 0 && (
                        <VisitPhotoGrid photos={clockInEvidence} label="Foto Clock In" />
                    )}

                    {/* Clock Out Photos */}
                    {clockOutEvidence.length > 0 && (
                        <VisitPhotoGrid photos={clockOutEvidence} label="Foto Clock Out" />
                    )}

                    {/* Location Info */}
                    {visit.visitLocation && (
                        <div>
                            <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5" /> Lokasi Kunjungan
                            </p>
                            <div className="space-y-1">
                                <div className="text-xs font-mono bg-[var(--secondary)] p-3 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] flex items-center gap-2">
                                    <Building2 className="w-3 h-3 shrink-0" />
                                    <span>Tujuan: {visit.visitLocation.lat.toFixed(6)}, {visit.visitLocation.lng.toFixed(6)} (±{visit.visitRadius}m)</span>
                                </div>
                                {visit.clockInLocation && (
                                    <div className="text-xs font-mono bg-blue-50 p-3 rounded-lg border border-blue-200 text-blue-700 flex items-center gap-2">
                                        <LogIn className="w-3 h-3 shrink-0" />
                                        <span>Clock In: {visit.clockInLocation.lat.toFixed(6)}, {visit.clockInLocation.lng.toFixed(6)}</span>
                                    </div>
                                )}
                                {visit.clockOutLocation && (
                                    <div className="text-xs font-mono bg-orange-50 p-3 rounded-lg border border-orange-200 text-orange-700 flex items-center gap-2">
                                        <LogOut className="w-3 h-3 shrink-0" />
                                        <span>Clock Out: {visit.clockOutLocation.lat.toFixed(6)}, {visit.clockOutLocation.lng.toFixed(6)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
        </AccessibleModal>
    );
}
