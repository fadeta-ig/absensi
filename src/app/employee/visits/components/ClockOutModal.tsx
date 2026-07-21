"use client";

import { useState, useCallback } from "react";
import { X, Loader2, LogOut } from "lucide-react";
import { VisitPhotoDraft, VisitReport } from "@/types";
import { MultiPhotoCapture } from "./MultiPhotoCapture";
import { LocationValidator, LocationResult } from "./LocationValidator";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";

interface ClockOutModalProps {
    visit: VisitReport;
    onClose: () => void;
    onClockOut: (updated: VisitReport) => void;
}

export function ClockOutModal({ visit, onClose, onClockOut }: ClockOutModalProps) {
    const [photos, setPhotos] = useState<VisitPhotoDraft[]>([]);
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
            setError("Clock out belum tersimpan karena koneksi bermasalah. Periksa internet lalu coba lagi.");
        }

        setLoading(false);
    };

    if (!visit.visitLocation) {
        return (
            <AccessibleModal ariaLabel="Clock out kunjungan" onClose={onClose} className="max-w-lg">
                <div className="modal-header">
                    <h2 className="modal-title">Clock Out</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Tutup modal clock out">
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
            ariaLabel={`Clock out kunjungan ${visit.clientName}`}
            onClose={onClose}
            className="max-w-lg"
            disableClose={loading}
        >
            <div className="modal-header">
                <h2 className="modal-title">Clock Out - {visit.clientName}</h2>
                <button className="modal-close" onClick={onClose} disabled={loading} aria-label="Tutup modal clock out">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="space-y-4">
                {error && (
                    <FeedbackMessage variant="error">
                        {error}
                    </FeedbackMessage>
                )}

                {visit.clockInTime && (
                    <FeedbackMessage variant="info" compact>
                        Clock In: {visit.clockInTime}
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
                    defaultCategory="HASIL"
                />

                <div className="form-group !mb-0">
                    <label className="form-label">Hasil Kunjungan (Opsional)</label>
                    <textarea
                        className="form-input min-h-[60px] resize-none"
                        value={result}
                        onChange={(e) => setResult(e.target.value)}
                        placeholder="Deal approved, follow-up minggu depan..."
                    />
                </div>

                <button
                    type="button"
                    onClick={handleSubmit}
                    className="btn btn-primary w-full"
                    disabled={loading || !canSubmit}
                >
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <LogOut className="w-4 h-4" />
                    )}
                    {loading ? "Menyimpan clock out..." : "Clock Out"}
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
