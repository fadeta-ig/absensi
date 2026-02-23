interface GpsValidationResult {
    isValid: boolean;
    warnings: string[];
}

/** Maximum acceptable GPS accuracy in meters */
const MAX_ACCURACY_METERS = 100;

/** Suspiciously perfect accuracy threshold (meters) */
const SUSPICIOUS_ACCURACY_METERS = 1;

/** Maximum realistic walking speed (m/s) — ~50 km/h */
const MAX_SPEED_MS = 14;

/**
 * Validate GPS position data for authenticity.
 * Checks accuracy, speed anomalies, and mock-location heuristics.
 */
export function validateGpsPosition(position: GeolocationPosition): GpsValidationResult {
    const warnings: string[] = [];
    let isValid = true;

    const { accuracy, speed, altitudeAccuracy } = position.coords;

    // Check 1: GPS accuracy too low (> 100m → unreliable or spoofed)
    if (accuracy > MAX_ACCURACY_METERS) {
        warnings.push(`Akurasi GPS terlalu rendah (${Math.round(accuracy)}m). Pastikan GPS aktif dan berada di area terbuka.`);
        isValid = false;
    }

    // Check 2: Suspiciously perfect accuracy (< 1m → likely mock GPS)
    if (accuracy > 0 && accuracy < SUSPICIOUS_ACCURACY_METERS) {
        warnings.push("Akurasi GPS mencurigakan. Pastikan tidak menggunakan aplikasi lokasi palsu.");
        isValid = false;
    }

    // Check 3: Accuracy exactly 0 (impossible on real hardware)
    if (accuracy === 0) {
        warnings.push("Data GPS tidak valid (akurasi 0).");
        isValid = false;
    }

    // Check 4: Speed anomaly (moving too fast for walking/standing)
    if (speed !== null && speed > MAX_SPEED_MS) {
        warnings.push(`Kecepatan tidak wajar terdeteksi (${Math.round(speed * 3.6)} km/h).`);
        isValid = false;
    }

    // Check 5: Missing altitude accuracy on device that should have it
    // Most real GPS chips provide altitudeAccuracy; mock apps often don't
    if (altitudeAccuracy === null && accuracy < 20) {
        warnings.push("Data altitude tidak tersedia — perangkat mungkin menggunakan lokasi simulasi.");
        // Don't invalidate — some browsers legit don't provide this
    }

    return { isValid, warnings };
}

/**
 * Enhanced geolocation request with mock-detection metadata.
 * Returns position with additional validation info.
 */
export function getValidatedPosition(): Promise<{
    position: GeolocationPosition;
    validation: GpsValidationResult;
}> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation tidak didukung oleh browser ini."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const validation = validateGpsPosition(position);
                resolve({ position, validation });
            },
            (error) => {
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        reject(new Error("Izin lokasi ditolak. Aktifkan akses lokasi."));
                        break;
                    case error.POSITION_UNAVAILABLE:
                        reject(new Error("Lokasi tidak tersedia. Aktifkan GPS."));
                        break;
                    case error.TIMEOUT:
                        reject(new Error("Timeout mendapatkan lokasi. Coba lagi."));
                        break;
                    default:
                        reject(new Error("Gagal mendapatkan lokasi."));
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0,
            }
        );
    });
}
