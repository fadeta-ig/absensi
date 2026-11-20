"use client";

import { formatDisplayTime } from "@/lib/utils";

import { useState, useCallback } from "react";
import { X, Loader2, LogOut } from "lucide-react";
import { VisitPhotoDraft, VisitReport } from "@/types";
import { MultiPhotoCapture } from "./MultiPhotoCapture";
import { LocationValidator, LocationResult } from "./LocationValidator";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import DraftNotice from "@/components/ui/DraftNotice";
import { useEmployeeDraft } from "@/hooks/useEmployeeDraft";
import { isPlainObject } from "@/lib/formPersistence";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface ClockOutModalProps {
    visit: VisitReport;
    onClose: () => void;
    onClockOut: (updated: VisitReport) => void;
}

export function ClockOutModal({ visit, onClose, onClockOut }: ClockOutModalProps) {
    const [photos, setPhotos] = useState<VisitPhotoDraft[]>([]);
    const [pendingPhotoNotice, setPendingPhotoNotice] = useState<{ count: number; captions: string[] } | null>(null);
    const [locationResult, setLocationResult] = useState<LocationResult | null>(null);
    const [result, setResult] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const activePhotoCaptions = photos
        .map((p) => (p.caption ?? "").trim())
        .filter(Boolean);

    const {
        restored: draftRestored,
        clearDraft,
        discardDraft,
    } = useEmployeeDraft<{
        result: string;
        hadPhotoCount: number;
        hadCaptions: string[];
    }>({
        formKey: `visits:clock-out:${visit.id}`,
        value: {
            result,
            hadPhotoCount: photos.length > 0 ? photos.length : (pendingPhotoNotice?.count ?? 0),
            hadCaptions: photos.length > 0 ? activePhotoCaptions : (pendingPhotoNotice?.captions ?? []),
        },
        isDirty: (draft) =>
            draft.result.trim().length > 0 ||
            draft.hadPhotoCount > 0 ||
            draft.hadCaptions.length > 0,
        validate: (raw): raw is { result: string; hadPhotoCount: number; hadCaptions: string[] } =>
            isPlainObject(raw) &&
            typeof raw.result === "string" &&
            typeof raw.hadPhotoCount === "number" &&
            raw.hadPhotoCount >= 0 &&
            Array.isArray(raw.hadCaptions) &&
            raw.hadCaptions.every((c) => typeof c === "string"),
        onRestore: (draft) => {
            setResult(draft.result);
            if (draft.hadPhotoCount > 0 || draft.hadCaptions.length > 0) {
                setPendingPhotoNotice({ count: draft.hadPhotoCount, captions: draft.hadCaptions });
            }
        },
    });

    const handlePhotosChange = useCallback((next: VisitPhotoDraft[]) => {
        setPhotos(next);
        if (next.length > 0) {
            setPendingPhotoNotice(null);
        }
    }, []);

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
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal melakukan clock out."));
            }

            const data = await res.json();
            clearDraft();
            onClockOut(data);
            onClose();
        } catch (error) {
            reportClientError("ClockOutModal", "Gagal menyimpan clock out kunjungan", error, { visitId: visit.id });
            setError(error instanceof Error ? error.message : "Clock out belum tersimpan karena koneksi bermasalah. Periksa internet lalu coba lagi.");
        } finally {
            setLoading(false);
        }
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

                <DraftNotice
                    compact
                    visible={draftRestored && result.trim().length > 0}
                    attachmentHint={
                        pendingPhotoNotice && photos.length === 0
                            ? `${pendingPhotoNotice.count} foto bukti sebelumnya perlu diambil ulang sebelum Clock Out${pendingPhotoNotice.captions.length > 0 ? ` (catatan sebelumnya: ${pendingPhotoNotice.captions.join("; ")})` : ""}.`
                            : null
                    }
                    onDiscard={() => {
                        discardDraft();
                        setResult("");
                        setPendingPhotoNotice(null);
                    }}
                />

                {visit.clockInTime && (
                    <FeedbackMessage variant="info" compact>
                        Clock In: {formatDisplayTime(visit.clockInTime)}
                    </FeedbackMessage>
                )}

                <LocationValidator
                    targetLocation={visit.visitLocation}
                    targetRadius={visit.visitRadius}
                    onLocationResult={handleLocationResult}
                />

                <MultiPhotoCapture
                    photos={photos}
                    onPhotosChange={handlePhotosChange}
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
