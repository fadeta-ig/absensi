"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, Navigation, FileText, MapPin, X, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { DEFAULT_VISIT_RADIUS } from "../visitTypes";

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
    const [visitLocation, setVisitLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mapReady, setMapReady] = useState(false);

    // Get current device location as initial map center
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    if (!visitLocation) {
                        setVisitLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    }
                    setMapReady(true);
                },
                () => {
                    // Default to Jakarta if GPS unavailable
                    if (!visitLocation) {
                        setVisitLocation({ lat: -6.2088, lng: 106.8456 });
                    }
                    setMapReady(true);
                }
            );
        } else {
            setVisitLocation({ lat: -6.2088, lng: 106.8456 });
            setMapReady(true);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            const data = await res.json();

            if (res.ok) {
                onCreated(data);
                onClose();
            } else {
                setError(data.error || data.details?.join(", ") || "Gagal membuat draft kunjungan.");
            }
        } catch {
            setError("Terjadi kesalahan koneksi.");
        }

        setLoading(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">Buat Draft Kunjungan</h2>
                    <button className="modal-close" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 flex items-center gap-2 p-3 rounded-lg text-sm border bg-red-50 text-red-700 border-red-200">
                        {error}
                    </div>
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
                        {mapReady && visitLocation ? (
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
                        Simpan Draft
                    </button>
                </form>
            </div>
        </div>
    );
}
