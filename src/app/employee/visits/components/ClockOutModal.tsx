"use client";

import { useState, useCallback } from "react";
import { X, Loader2, LogOut } from "lucide-react";
import { VisitReport } from "@/types";
import { MultiPhotoCapture } from "./MultiPhotoCapture";
import { LocationValidator, LocationResult } from "./LocationValidator";

interface ClockOutModalProps {
    visit: VisitReport;
    onClose: () => void;
    onClockOut: (updated: VisitReport) => void;
}

export function ClockOutModal({ visit, onClose, onClockOut }: ClockOutModalProps) {
    const [photos, setPhotos] = useState<string[]>([]);
    const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
    const [result, setResult] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLocationResult = useCallback((r: LocationResult) => {
        setLocationResult(r);
    }, []);

    const canSubmit =
        photos.length >= 2 &&
        locationResult?.isWithinRadius === true &&
        !loading;

    const handleSubmit = async () => {
        if (!canSubmit || !locationResult) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/visits", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "clock_out",
                    id: visit.id,
                    location: locationResult.deviceLocation,
                    photos,
                    result: result || null,
                }),
            });
            const data = await res.json();

            if (res.ok) {
                onClockOut(data);
                onClose();
            } else {
                setError(data.error || data.details?.join(", ") || "Gagal melakukan clock out.");
            }
        } catch {
            setError("Terjadi kesalahan koneksi.");
        }

        setLoading(false);
    };

    if (!visit.visitLocation) {
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                        <h2 className="modal-title">Clock Out</h2>
                        <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
                    </div>
                    <div className="p-8 text-center text-sm text-[var(--text-muted)]">
                        Lokasi kunjungan belum ditentukan.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Clock Out — {visit.clientName}</h2>
                    <button className="modal-close" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg text-sm border bg-red-50 text-red-700 border-red-200">
                            {error}
                        </div>
                    )}

                    {/* Clock In Summary */}
                    {visit.clockInTime && (
                        <div className="flex items-center gap-2 p-3 rounded-lg text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
                            <LogOut className="w-3.5 h-3.5 shrink-0" />
                            Clock In: {visit.clockInTime}
                        </div>
                    )}

                    {/* Location Validation */}
                    <LocationValidator
                        targetLocation={visit.visitLocation}
                        targetRadius={visit.visitRadius}
                        onLocationResult={handleLocationResult}
                    />

                    {/* Photo Capture */}
                    <MultiPhotoCapture
                        photos={photos}
                        onPhotosChange={setPhotos}
                        minPhotos={2}
                        maxPhotos={5}
                    />

                    {/* Result */}
                    <div className="form-group !mb-0">
                        <label className="form-label">Hasil Kunjungan (Opsional)</label>
                        <textarea
                            className="form-input min-h-[60px] resize-none"
                            value={result}
                            onChange={(e) => setResult(e.target.value)}
                            placeholder="Deal approved, follow-up minggu depan..."
                        />
                    </div>

                    {/* Submit */}
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="btn btn-primary w-full"
                        disabled={!canSubmit}
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <LogOut className="w-4 h-4" />
                        )}
                        Clock Out
                    </button>

                    {!canSubmit && !loading && (
                        <p className="text-[10px] text-[var(--text-muted)] text-center italic">
                            {!locationResult?.isWithinRadius && "Lokasi belum valid. "}
                            {photos.length < 2 && `Ambil minimal 2 foto (${photos.length}/2).`}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
