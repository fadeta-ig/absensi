"use client";

/* eslint-disable @next/next/no-img-element -- data URL preview kamera tidak melewati image optimizer */

import { useState, useRef, useCallback } from "react";
import { Camera, VideoOff, X, Loader2 } from "lucide-react";
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
    const [streaming, setStreaming] = useState(false);
    const [cameraLoading, setCameraLoading] = useState(false);

    const startCamera = useCallback(async () => {
        if (disabled) return;
        setCameraLoading(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "environment",
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play()
                        .then(() => setStreaming(true))
                        .catch(() => setStreaming(true));
                };
            }
        } catch {
            // Camera access denied
        }
        setCameraLoading(false);
    }, [disabled]);

    const stopCamera = useCallback(() => {
        if (videoRef.current?.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
            videoRef.current.srcObject = null;
            videoRef.current.onloadedmetadata = null;
            setStreaming(false);
        }
    }, []);

    const capturePhoto = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;
        if (photos.length >= maxPhotos) return;

        const vid = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = vid.videoWidth || 640;
        canvas.height = vid.videoHeight || 480;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

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
                    {!streaming && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                            <Camera className="w-8 h-8 opacity-30" />
                            <button
                                type="button"
                                onClick={startCamera}
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
                    <button type="button" onClick={stopCamera} className="btn btn-secondary btn-sm">
                        <VideoOff className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
}
