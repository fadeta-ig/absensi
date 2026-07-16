"use client";

import { useState, useCallback } from "react";
import { X, Loader2, LogIn } from "lucide-react";
import { VisitReport } from "@/types";
import { MultiPhotoCapture } from "./MultiPhotoCapture";
import { LocationValidator, LocationResult } from "./LocationValidator";

interface ClockInModalProps {
    visit: VisitReport;
    onClose: () => void;
    onClockIn: (updated: VisitReport) => void;
}

export function ClockInModal({ visit, onClose, onClockIn }: ClockInModalProps) {
    const [photos, setPhotos] = useState<string[]>([]);
    const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLocationResult = useCallback((result: LocationResult) => {
        setLocationResult(result);
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
                    action: "clock_in",
                    id: visit.id,
                    location: locationResult.deviceLocation,
                    photos,
                }),
            });
            const data = await res.json();

            if (res.ok) {
                onClockIn(data);
                onClose();
            } else {
                setError(data.error || data.details?.join(", ") || "Gagal melakukan clock in.");
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
                        <h2 className="modal-title">Clock In</h2>
                        <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
                    </div>
                    <div className="p-8 text-center text-sm text-[var(--text-muted)]">
                        Lokasi kunjungan belum ditentukan. Edit draft terlebih dahulu.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Clock In — {visit.clientName}</h2>
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
                            <LogIn className="w-4 h-4" />
                        )}
                        Clock In
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
