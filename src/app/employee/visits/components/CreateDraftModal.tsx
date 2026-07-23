"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, Navigation, FileText, MapPin, X, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { DEFAULT_VISIT_RADIUS } from "../visitTypes";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

const LocationMap = dynamic(() => import("@/components/LocationMap"), { ssr: false });

interface CreateDraftModalProps {
    onClose: () => void;
    onCreated: (visit: import("@/types").VisitReport) => void;
}

export function CreateDraftModal({ onClose, onCreated }: CreateDraftModalProps) {
    const [form, setForm] = useState({
        clientName: "",
        clientAddress: "",
        purpose: "",
        notes: "",
    });
    const [visitLocation, setVisitLocation] = useState({ lat: -6.2088, lng: 106.8456 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [locationWarning, setLocationWarning] = useState<string | null>(() =>
        typeof navigator !== "undefined" && !navigator.geolocation
            ? "Browser tidak mendukung geolocation. Tentukan titik kunjungan secara manual pada peta."
            : null
    );

    // Get current device location as initial map center
    useEffect(() => {
        if (!navigator.geolocation) return;

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setVisitLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setLocationWarning(null);
            },
            () => setLocationWarning("Lokasi perangkat tidak dapat digunakan. Tentukan titik kunjungan secara manual pada peta.")
        );
    }, []);

    const handleMapClick = useCallback((lat: number, lng: number) => {
        setVisitLocation({ lat, lng });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.clientName || !form.clientAddress || !form.purpose || !visitLocation) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/visits", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "create_draft",
                    clientName: form.clientName,
                    clientAddress: form.clientAddress,
                    purpose: form.purpose,
                    notes: form.notes || null,
                    visitLocation,
                    visitRadius: DEFAULT_VISIT_RADIUS,
                }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal membuat draft kunjungan."));
            }

            const data = await res.json();
            onCreated(data);
            onClose();
        } catch (error) {
            reportClientError("CreateDraftModal", "Gagal membuat draft kunjungan", error, { clientName: form.clientName });
            setError(error instanceof Error ? error.message : "Draft kunjungan belum tersimpan karena koneksi bermasalah. Periksa internet lalu coba lagi.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AccessibleModal
            ariaLabel="Buat draft kunjungan"
            onClose={onClose}
            className="max-w-lg"
            disableClose={loading}
        >
                <div className="modal-header">
                    <h2 className="modal-title">Buat Draft Kunjungan</h2>
                    <button className="modal-close" onClick={onClose} disabled={loading} aria-label="Tutup modal buat draft kunjungan">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {error && (
                    <FeedbackMessage variant="error" className="mb-4">
                        {error}
                    </FeedbackMessage>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="form-group !mb-0">
                        <label className="form-label">
                            <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> Nama Klien / Perusahaan *
                            </span>
                        </label>
                        <input
                            className="form-input"
                            value={form.clientName}
                            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                            placeholder="PT Contoh Sukses"
                            required
                        />
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label">
                            <span className="flex items-center gap-1">
                                <Navigation className="w-3 h-3" /> Alamat Kunjungan *
                            </span>
                        </label>
                        <textarea
                            className="form-input min-h-[60px] resize-none"
                            value={form.clientAddress}
                            onChange={(e) => setForm({ ...form, clientAddress: e.target.value })}
                            placeholder="Jl. Contoh No. 123, Jakarta"
                            required
                        />
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label">
                            <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" /> Tujuan Kunjungan *
                            </span>
                        </label>
                        <textarea
                            className="form-input min-h-[60px] resize-none"
                            value={form.purpose}
                            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                            placeholder="Meeting pembahasan project..."
                            required
                        />
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label">Catatan (Opsional)</label>
                        <input
                            className="form-input"
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            placeholder="Catatan tambahan..."
                        />
                    </div>

                    {/* Location Picker */}
                    <div className="form-group !mb-0">
                        <label className="form-label">
                            <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> Titik Lokasi Kunjungan *
                            </span>
                        </label>
                        <p className="text-[10px] text-[var(--text-muted)] mb-2 italic">
                            Tap pada peta untuk menentukan lokasi tujuan kunjungan
                        </p>
                        {locationWarning && (
                            <FeedbackMessage variant="warning" compact className="mb-2">
                                {locationWarning}
                            </FeedbackMessage>
                        )}
                        {visitLocation ? (
                            <div className="rounded-lg overflow-hidden border border-[var(--border)] h-[200px]">
                                <LocationMap
                                    center={[visitLocation.lat, visitLocation.lng]}
                                    zoom={15}
                                    markerPosition={[visitLocation.lat, visitLocation.lng]}
                                    onMapClick={handleMapClick}
                                />
                            </div>
                        ) : (
                            <div className="h-[200px] flex items-center justify-center bg-[var(--secondary)] rounded-lg border border-[var(--border)]">
                                <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
                                <span className="sr-only">Memuat peta lokasi kunjungan</span>
                            </div>
                        )}
                        {visitLocation && (
                            <p className="text-[10px] font-mono text-[var(--text-muted)] mt-1.5 flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {visitLocation.lat.toFixed(6)}, {visitLocation.lng.toFixed(6)}
                                <span className="ml-auto text-[var(--primary)] font-semibold">
                                    Radius: {DEFAULT_VISIT_RADIUS}m
                                </span>
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary w-full"
                        disabled={loading || !form.clientName || !form.clientAddress || !form.purpose || !visitLocation}
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                        {loading ? "Menyimpan draft..." : "Simpan Draft"}
                    </button>
                </form>
        </AccessibleModal>
    );
}
