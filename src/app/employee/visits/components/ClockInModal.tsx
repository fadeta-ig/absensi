"use client";

import { useState, useCallback } from "react";
import { X, Loader2, LogIn } from "lucide-react";
import { VisitPhotoDraft, VisitReport } from "@/types";
import { MultiPhotoCapture } from "./MultiPhotoCapture";
import { LocationValidator, LocationResult } from "./LocationValidator";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface ClockInModalProps {
    visit: VisitReport;
    onClose: () => void;
    onClockIn: (updated: VisitReport) => void;
}

export function ClockInModal({ visit, onClose, onClockIn }: ClockInModalProps) {
    const [photos, setPhotos] = useState<VisitPhotoDraft[]>([]);
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
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal melakukan clock in."));
            }

            const data = await res.json();
            onClockIn(data);
            onClose();
        } catch (error) {
            reportClientError("ClockInModal", "Gagal menyimpan clock in kunjungan", error, { visitId: visit.id });
            setError(error instanceof Error ? error.message : "Clock in belum tersimpan karena koneksi bermasalah. Periksa internet lalu coba lagi.");
        } finally {
            setLoading(false);
        }
    };

    if (!visit.visitLocation) {
        return (
            <AccessibleModal ariaLabel="Clock in kunjungan" onClose={onClose} className="max-w-lg">
                <div className="modal-header">
                    <h2 className="modal-title">Clock In</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Tutup modal clock in">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-8 text-center text-sm text-[var(--text-muted)]">
                    Lokasi kunjungan belum ditentukan. Edit draft terlebih dahulu.
                </div>
            </AccessibleModal>
        );
    }

    return (
        <AccessibleModal
            ariaLabel={`Clock in kunjungan ${visit.clientName}`}
            onClose={onClose}
            className="max-w-lg"
            disableClose={loading}
        >
            <div className="modal-header">
                <h2 className="modal-title">Clock In - {visit.clientName}</h2>
                <button className="modal-close" onClick={onClose} disabled={loading} aria-label="Tutup modal clock in">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="space-y-4">
                {error && (
                    <FeedbackMessage variant="error">
                        {error}
                    </FeedbackMessage>
                )}

                <LocationValidator
                    targetLocation={visit.visitLocation}
                    targetRadius={visit.visitRadius}
                    onLocationResult={handleLocationResult}
                />

                <MultiPhotoCapture
                    photos={photos}
                    onPhotosChange={setPhotos}
                    minPhotos={2}
                    maxPhotos={5}
                    defaultCategory="LOKASI"
                />

                <button
                    type="button"
                    onClick={handleSubmit}
                    className="btn btn-primary w-full"
                    disabled={loading || !canSubmit}
                >
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <LogIn className="w-4 h-4" />
                    )}
                    {loading ? "Menyimpan clock in..." : "Clock In"}
                </button>

                {!canSubmit && !loading && (
                    <p className="text-[10px] text-[var(--text-muted)] text-center italic">
                        {!locationResult?.isWithinRadius && "Lokasi belum valid. "}
                        {photos.length < 2 && `Ambil minimal 2 foto (${photos.length}/2).`}
                    </p>
                )}
            </div>
        </AccessibleModal>
    );
}
