"use client";

import { useState, useEffect, useCallback } from "react";
import { MapPin, Loader2, ShieldCheck, ShieldAlert, AlertCircle } from "lucide-react";
import { calculateDistance } from "@/lib/utils";

interface LocationValidatorProps {
    targetLocation: { lat: number; lng: number };
    targetRadius: number;
    onLocationResult: (result: LocationResult) => void;
}

export interface LocationResult {
    deviceLocation: {
        lat: number;
        lng: number;
        accuracyMeters: number;
        acquiredAt: string;
    };
    distanceMeters: number;
    isWithinRadius: boolean;
}

export function LocationValidator({
    targetLocation,
    targetRadius,
    onLocationResult,
}: LocationValidatorProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<LocationResult | null>(null);

    const checkLocation = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const { getValidatedPosition } = await import("@/lib/gpsValidator");
            const { position, validation } = await getValidatedPosition();

            if (!validation.isValid) {
                setError(validation.warnings.join(" "));
                setLoading(false);
                return;
            }

            const deviceLat = position.coords.latitude;
            const deviceLng = position.coords.longitude;
            const distanceMeters = Math.round(
                calculateDistance(deviceLat, deviceLng, targetLocation.lat, targetLocation.lng)
            );
            const isWithinRadius = distanceMeters <= targetRadius;

            const locationResult: LocationResult = {
                deviceLocation: {
                    lat: deviceLat,
                    lng: deviceLng,
                    accuracyMeters: position.coords.accuracy,
                    acquiredAt: new Date(position.timestamp).toISOString(),
                },
                distanceMeters,
                isWithinRadius,
            };

            setResult(locationResult);
            onLocationResult(locationResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Gagal mendapatkan lokasi.");
        }

        setLoading(false);
    }, [targetLocation.lat, targetLocation.lng, targetRadius, onLocationResult]);

    useEffect(() => {
        checkLocation();
    }, [checkLocation]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 p-3 rounded-lg text-xs font-medium border bg-[var(--secondary)] text-[var(--text-secondary)] border-[var(--border)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>Memverifikasi lokasi...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 rounded-lg text-xs font-medium border bg-red-50 text-red-700 border-red-200">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1">{error}</span>
                </div>
                <button
                    type="button"
                    onClick={checkLocation}
                    className="btn btn-secondary btn-sm w-full"
                >
                    <MapPin className="w-3.5 h-3.5" /> Coba Lagi
                </button>
            </div>
        );
    }

    if (!result) return null;

    return (
        <div className="space-y-2">
            <div
                className={`flex items-center gap-2 p-3 rounded-lg text-xs font-medium border ${
                    result.isWithinRadius
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-red-50 text-red-700 border-red-200"
                }`}
            >
                {result.isWithinRadius ? (
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                ) : (
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="flex-1">
                    {result.isWithinRadius
                        ? `Lokasi valid — ${result.distanceMeters}m dari titik kunjungan (maks ${targetRadius}m)`
                        : `Anda ${result.distanceMeters}m dari lokasi kunjungan. Jarak maksimal: ${targetRadius}m`}
                </span>
            </div>
            <button
                type="button"
                onClick={checkLocation}
                className="btn btn-secondary btn-sm w-full"
            >
                <MapPin className="w-3.5 h-3.5" /> Perbarui Lokasi
            </button>
        </div>
    );
}
