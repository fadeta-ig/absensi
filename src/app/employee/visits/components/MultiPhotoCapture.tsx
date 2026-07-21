"use client";

/* eslint-disable @next/next/no-img-element -- data URL preview kamera tidak melewati image optimizer */

import { useState, useRef, useCallback, useEffect } from "react";
import { AlertCircle, Camera, VideoOff, X, Loader2, SwitchCamera } from "lucide-react";
import type { VisitPhotoCategory, VisitPhotoDraft } from "@/types";
import { MIN_PHOTOS_REQUIRED, VISIT_PHOTO_CATEGORY_OPTIONS } from "../visitTypes";

interface MultiPhotoCaptureProps {
    photos: VisitPhotoDraft[];
    onPhotosChange: (photos: VisitPhotoDraft[]) => void;
    maxPhotos?: number;
    minPhotos?: number;
    disabled?: boolean;
    defaultCategory?: VisitPhotoCategory;
}

type CameraFacingMode = "environment" | "user";

const CAMERA_LABELS: Record<CameraFacingMode, string> = {
    environment: "Belakang",
    user: "Depan",
};

function getCameraErrorMessage(error: unknown) {
    const name = error instanceof DOMException || error instanceof Error ? error.name : "";

    if (!navigator.mediaDevices?.getUserMedia) {
        return "Browser tidak mendukung akses kamera.";
    }

    switch (name) {
        case "NotAllowedError":
        case "PermissionDeniedError":
            return "Izin kamera ditolak. Izinkan akses kamera di browser lalu coba lagi.";
        case "NotFoundError":
        case "DevicesNotFoundError":
            return "Kamera tidak ditemukan di perangkat ini.";
        case "NotReadableError":
        case "TrackStartError":
            return "Kamera sedang dipakai aplikasi lain atau tidak dapat dibuka.";
        case "OverconstrainedError":
            return "Mode kamera yang dipilih tidak tersedia di perangkat ini. Coba ganti kamera.";
        case "SecurityError":
            return "Browser memblokir kamera. Buka halaman dengan koneksi aman lalu coba lagi.";
        default:
            return error instanceof Error
                ? error.message
                : "Kamera tidak dapat diakses. Berikan izin kamera lalu coba lagi.";
    }
}

function getCameraConstraints(mode: CameraFacingMode): MediaStreamConstraints {
    return {
        video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
        },
    };
}

export function MultiPhotoCapture({
    photos,
    onPhotosChange,
    maxPhotos = 5,
    minPhotos = MIN_PHOTOS_REQUIRED,
    disabled = false,
    defaultCategory = "LAINNYA",
}: MultiPhotoCaptureProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const mountedRef = useRef(true);
    const [streaming, setStreaming] = useState(false);
    const [cameraLoading, setCameraLoading] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [cameraFacingMode, setCameraFacingMode] = useState<CameraFacingMode>("environment");

    const stopCameraStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.srcObject = null;
            videoRef.current.onloadedmetadata = null;
        }
    }, []);

    const waitForVideoPlayback = useCallback((video: HTMLVideoElement) => (
        new Promise<void>((resolve, reject) => {
            let settled = false;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            const finish = (callback: () => void) => {
                if (settled) return;
                settled = true;
                if (timeoutId) clearTimeout(timeoutId);
                callback();
            };

            timeoutId = setTimeout(() => {
                finish(() => reject(new Error("Preview kamera belum siap. Coba aktifkan kamera ulang.")));
            }, 5000);

            const playVideo = () => {
                video.play()
                    .then(() => finish(resolve))
                    .catch((error) => finish(() => reject(error)));
            };

            video.onloadedmetadata = playVideo;
            if (video.readyState >= video.HAVE_METADATA) playVideo();
        })
    ), []);

    const startCamera = useCallback(async (mode: CameraFacingMode = cameraFacingMode) => {
        if (disabled || cameraLoading) return;
        setCameraLoading(true);
        setCameraError(null);
        setCameraFacingMode(mode);
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error("Browser tidak mendukung akses kamera.");
            }

            stopCameraStream();
            setStreaming(false);

            const stream = await navigator.mediaDevices.getUserMedia(getCameraConstraints(mode));
            if (!mountedRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            const video = videoRef.current;
            if (!video) {
                stream.getTracks().forEach((track) => track.stop());
                throw new Error("Preview kamera belum siap. Coba aktifkan kamera ulang.");
            }

            streamRef.current = stream;
            video.srcObject = stream;
            await waitForVideoPlayback(video);

            if (!mountedRef.current) return;
            setCameraFacingMode(mode);
            setStreaming(true);
        } catch (error) {
            stopCameraStream();
            setStreaming(false);
            setCameraError(getCameraErrorMessage(error));
        } finally {
            if (mountedRef.current) setCameraLoading(false);
        }
    }, [cameraFacingMode, cameraLoading, disabled, stopCameraStream, waitForVideoPlayback]);

    const stopCamera = useCallback(() => {
        stopCameraStream();
        setStreaming(false);
    }, [stopCameraStream]);

    const switchCamera = useCallback(() => {
        const nextMode: CameraFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
        void startCamera(nextMode);
    }, [cameraFacingMode, startCamera]);

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
            stopCameraStream();
        };
    }, [stopCameraStream]);

    const capturePhoto = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;
        if (photos.length >= maxPhotos) return;

        const vid = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = vid.videoWidth || 640;
        canvas.height = vid.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            setCameraError("Gagal mengambil foto dari kamera. Coba aktifkan kamera ulang.");
            return;
        }

        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const photoData = canvas.toDataURL("image/jpeg", 0.7);
        onPhotosChange([
            ...photos,
            {
                dataUrl: photoData,
                capturedAtDevice: new Date().toISOString(),
                category: defaultCategory,
                caption: "",
            },
        ]);
        setCameraError(null);

        // Auto-stop camera if max photos reached
        if (photos.length + 1 >= maxPhotos) {
            stopCamera();
        }
    }, [photos, maxPhotos, onPhotosChange, stopCamera, defaultCategory]);

    const removePhoto = useCallback(
        (index: number) => {
            const updated = photos.filter((_, i) => i !== index);
            onPhotosChange(updated);
        },
        [photos, onPhotosChange]
    );

    const updatePhoto = useCallback(
        (index: number, patch: Partial<Pick<VisitPhotoDraft, "category" | "caption">>) => {
            onPhotosChange(photos.map((photo, photoIndex) => (
                photoIndex === index ? { ...photo, ...patch } : photo
            )));
        },
        [photos, onPhotosChange],
    );

    const isFulfilled = photos.length >= minPhotos;
    const currentCameraLabel = CAMERA_LABELS[cameraFacingMode];
    const nextCameraLabel = CAMERA_LABELS[cameraFacingMode === "environment" ? "user" : "environment"];

    return (
        <div className="space-y-3">
            {/* Counter & Status */}
            <div className="flex items-center justify-between">
                <label className="form-label !mb-0">
                    <span className="flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        Foto Bukti Kunjungan
                    </span>
                </label>
                <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        isFulfilled
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                    }`}
                >
                    {photos.length}/{minPhotos} foto {isFulfilled ? "✓" : "(min)"}
                </span>
            </div>

            {/* Photo Grid */}
            {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {photos.map((p, i) => (
                        <div key={`${p.capturedAtDevice}-${i}`} className="rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--background)]">
                            <div className="relative aspect-[4/3] group">
                                <img src={p.dataUrl} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                                {!disabled && (
                                    <button
                                        type="button"
                                        onClick={() => removePhoto(i)}
                                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md"
                                        aria-label={`Hapus foto ${i + 1}`}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-black/60 text-white px-1.5 py-0.5 rounded">
                                    {i + 1}
                                </span>
                            </div>
                            <div className="p-2 space-y-1.5">
                                <select
                                    value={p.category}
                                    onChange={(event) => updatePhoto(i, { category: event.target.value as VisitPhotoCategory })}
                                    className="form-input !py-1.5 !text-xs"
                                    disabled={disabled}
                                    aria-label={`Jenis foto ${i + 1}`}
                                >
                                    {VISIT_PHOTO_CATEGORY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    value={p.caption ?? ""}
                                    onChange={(event) => updatePhoto(i, { caption: event.target.value })}
                                    className="form-input !py-1.5 !text-xs"
                                    placeholder="Keterangan foto (opsional)"
                                    maxLength={200}
                                    disabled={disabled}
                                    aria-label={`Keterangan foto ${i + 1}`}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Camera Viewfinder */}
            {photos.length < maxPhotos && !disabled && (
                <div className="relative aspect-[4/3] bg-[var(--secondary)] rounded-lg overflow-hidden border border-[var(--border)]">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover ${streaming ? "block" : "hidden"}`}
                    />
                    {streaming && (
                        <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
                            Kamera {currentCameraLabel}
                        </span>
                    )}
                    {!streaming && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                            <Camera className="w-8 h-8 opacity-30" />
                            <p className="text-[10px] font-medium">Mode kamera: {currentCameraLabel}</p>
                            <button
                                type="button"
                                onClick={() => void startCamera()}
                                className="btn btn-secondary btn-sm"
                                disabled={cameraLoading}
                            >
                                {cameraLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Camera className="w-3.5 h-3.5" />
                                )}
                                Aktifkan Kamera
                            </button>
                        </div>
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                </div>
            )}

            {cameraError && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-2.5 text-xs text-[var(--destructive)]">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{cameraError}</span>
                </div>
            )}

            {/* Controls */}
            {streaming && photos.length < maxPhotos && (
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={capturePhoto}
                        className="btn btn-primary btn-sm flex-1"
                    >
                        <Camera className="w-3.5 h-3.5" />
                        Ambil Foto ({photos.length + 1}/{maxPhotos})
                    </button>
                    <button
                        type="button"
                        onClick={switchCamera}
                        className="btn btn-secondary btn-sm"
                        disabled={cameraLoading}
                        title={`Ganti ke kamera ${nextCameraLabel}`}
                        aria-label={`Ganti ke kamera ${nextCameraLabel}`}
                    >
                        {cameraLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <SwitchCamera className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">{nextCameraLabel}</span>
                    </button>
                    <button type="button" onClick={stopCamera} className="btn btn-secondary btn-sm">
                        <VideoOff className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
}
