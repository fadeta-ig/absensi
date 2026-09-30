"use client";

/* eslint-disable @next/next/no-img-element -- data URL preview kamera tidak melewati image optimizer */

import { useState, useRef, useCallback, useEffect } from "react";
import { AlertCircle, Camera, VideoOff, X, Loader2, SwitchCamera, Check, ImagePlus } from "lucide-react";
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

/**
 * Draft foto hasil jepretan/kompresi klien: mewarisi VisitPhotoDraft (kontrak
 * lama: dataUrl tetap diisi dari blob terkompresi agar submit JSON lama dan
 * modal lain tetap jalan) plus File terkompresi untuk submit multipart hemat
 * dan previewUrl objectURL agar preview tidak menahan string base64 ganda.
 */
export interface CapturedVisitPhoto extends VisitPhotoDraft {
    file?: File | null;
    previewUrl?: string | null;
}

/** Sisi terpanjang foto hasil kompresi klien (hemat upload & storage). */
export const PHOTO_MAX_DIMENSION = 1280;
/** Kualitas JPEG klien — selaras dengan pipeline server (q84 + watermark). */
export const PHOTO_JPEG_QUALITY = 0.75;
/** Batas file galeri sebelum kompresi (10MB, masih dikompresi ke ~200KB). */
export const GALLERY_SOURCE_MAX_BYTES = 10 * 1024 * 1024;

const HEIC_EXTENSION_PATTERN = /\.(heic|heif)$/i;
const HEIC_MIME_PATTERN = /heic|heif/i;

/** Deteksi dini HEIC/HEIF dari nama atau MIME (browser tidak bisa merendernya). */
export function isHeicFile(fileName: string | null | undefined, mimeType: string | null | undefined): boolean {
    return HEIC_EXTENSION_PATTERN.test(fileName ?? "") || HEIC_MIME_PATTERN.test(mimeType ?? "");
}

/** Hitung dimensi downscale dengan maxDim sisi terpanjang (tanpa upscale). */
export function computeDownscaleSize(
    sourceWidth: number,
    sourceHeight: number,
    maxDim: number = PHOTO_MAX_DIMENSION,
): { width: number; height: number } {
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
        return { width: 640, height: 480 };
    }
    const longest = Math.max(sourceWidth, sourceHeight);
    const scale = longest > maxDim ? maxDim / longest : 1;
    return {
        width: Math.max(1, Math.round(sourceWidth * scale)),
        height: Math.max(1, Math.round(sourceHeight * scale)),
    };
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => {
        try {
            canvas.toBlob((blob) => resolve(blob), "image/jpeg", PHOTO_JPEG_QUALITY);
        } catch {
            resolve(null);
        }
    });
}

function loadSourceBitmap(file: File): Promise<{ bitmap: ImageBitmap | HTMLImageElement; objectUrl: string } | null> {
    const objectUrl = URL.createObjectURL(file);
    if (typeof createImageBitmap === "function") {
        return createImageBitmap(file)
            .then((bitmap) => ({ bitmap, objectUrl }))
            .catch(() => loadViaImageElement(objectUrl));
    }
    return loadViaImageElement(objectUrl);
}

function loadViaImageElement(objectUrl: string): Promise<{ bitmap: ImageBitmap | HTMLImageElement; objectUrl: string } | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ bitmap: img, objectUrl });
        img.onerror = () => resolve(null);
        img.src = objectUrl;
    });
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
    const [processing, setProcessing] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const previewUrlsRef = useRef<Set<string>>(new Set());
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = useCallback((message: string) => {
        setToast(message);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 3500);
    }, []);

    const trackPreviewUrl = useCallback((url: string) => {
        previewUrlsRef.current.add(url);
    }, []);

    const revokePreviewUrl = useCallback((url: string | null | undefined) => {
        if (!url) return;
        if (previewUrlsRef.current.has(url)) {
            previewUrlsRef.current.delete(url);
        }
        URL.revokeObjectURL(url);
    }, []);

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
        const previewUrls = previewUrlsRef.current;

        return () => {
            mountedRef.current = false;
            stopCameraStream();
            previewUrls.forEach((url) => URL.revokeObjectURL(url));
            previewUrls.clear();
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        };
    }, [stopCameraStream]);

    const pushCompressedPhoto = useCallback((args: {
        blob: Blob;
        photos: VisitPhotoDraft[];
        maxPhotos: number;
        onPhotosChange: (photos: VisitPhotoDraft[]) => void;
        defaultCategory: VisitPhotoCategory;
        stopCamera: () => void;
    }) => {
        const { blob, photos, maxPhotos, onPhotosChange, defaultCategory, stopCamera } = args;
        const file = new File([blob], `visit-${Date.now()}.jpg`, { type: "image/jpeg" });
        const previewUrl = URL.createObjectURL(blob);
        trackPreviewUrl(previewUrl);

        // Kontrak lama dipertahankan: dataUrl diisi dari blob TERKOMPRESI
        // (bukan canvas penuh) agar submit JSON lama tetap jalan; klien baru
        // memakai `file` lewat multipart. JANGAN canvas.toDataURL untuk simpan.
        const reader = new FileReader();
        reader.onloadend = () => {
            if (!mountedRef.current) {
                revokePreviewUrl(previewUrl);
                return;
            }
            const dataUrl = typeof reader.result === "string" ? reader.result : "";
            if (!dataUrl) {
                revokePreviewUrl(previewUrl);
                setCameraError("Gagal memproses foto. Coba ambil ulang.");
                return;
            }
            const draft: CapturedVisitPhoto = {
                dataUrl,
                file,
                previewUrl,
                capturedAtDevice: new Date().toISOString(),
                category: defaultCategory,
                caption: "",
            };
            onPhotosChange([...photos, draft]);
            setCameraError(null);
            setProcessing(false);

            // Auto-stop camera if max photos reached
            if (photos.length + 1 >= maxPhotos) {
                stopCamera();
            }
        };
        reader.onerror = () => {
            revokePreviewUrl(previewUrl);
            setCameraError("Gagal memproses foto. Coba ambil ulang.");
            setProcessing(false);
        };
        reader.readAsDataURL(blob);
    }, [revokePreviewUrl, trackPreviewUrl]);

    const capturePhoto = useCallback(() => {
        if (!videoRef.current || !canvasRef.current || processing) return;
        if (photos.length >= maxPhotos) return;

        const vid = videoRef.current;
        const canvas = canvasRef.current;
        const { width, height } = computeDownscaleSize(vid.videoWidth || 0, vid.videoHeight || 0);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            setCameraError("Gagal mengambil foto dari kamera. Coba aktifkan kamera ulang.");
            return;
        }

        ctx.drawImage(vid, 0, 0, width, height);
        setProcessing(true);
        void canvasToJpegBlob(canvas).then((blob) => {
            if (!mountedRef.current) {
                setProcessing(false);
                return;
            }
            if (!blob) {
                setCameraError("Gagal mengompresi foto. Coba ambil ulang.");
                setProcessing(false);
                return;
            }
            pushCompressedPhoto({
                blob,
                photos,
                maxPhotos,
                onPhotosChange,
                defaultCategory,
                stopCamera,
            });
        });
    }, [photos, maxPhotos, onPhotosChange, stopCamera, defaultCategory, processing, pushCompressedPhoto]);

    const handleGalleryFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || disabled || processing) return;
        if (photos.length >= maxPhotos) {
            showToast(`Maksimal ${maxPhotos} foto.`);
            return;
        }

        // Tolak HEIC/HEIF dini: browser tidak bisa merender/merasternya.
        if (isHeicFile(file.name, file.type)) {
            showToast("Format HEIC/HEIF tidak didukung. Ubah ke JPG di galeri lalu pilih ulang.");
            return;
        }
        if (file.size > GALLERY_SOURCE_MAX_BYTES) {
            showToast("File terlalu besar (maksimal 10MB).");
            return;
        }

        setProcessing(true);
        void (async () => {
            const source = await loadSourceBitmap(file);
            if (!source) {
                if (mountedRef.current) {
                    showToast("File gambar tidak dapat dibaca.");
                    setProcessing(false);
                }
                return;
            }
            try {
                const naturalWidth = source.bitmap.width || 0;
                const naturalHeight = source.bitmap.height || 0;
                const { width, height } = computeDownscaleSize(naturalWidth, naturalHeight);
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) throw new Error("canvas 2d tidak tersedia");
                if (source.bitmap instanceof ImageBitmap) {
                    ctx.drawImage(source.bitmap, 0, 0, width, height);
                    source.bitmap.close();
                } else {
                    ctx.drawImage(source.bitmap, 0, 0, width, height);
                }
                const blob = await canvasToJpegBlob(canvas);
                if (!mountedRef.current) return;
                if (!blob) {
                    showToast("Gagal mengompresi foto.");
                    setProcessing(false);
                    return;
                }
                pushCompressedPhoto({
                    blob,
                    photos,
                    maxPhotos,
                    onPhotosChange,
                    defaultCategory,
                    stopCamera,
                });
            } finally {
                URL.revokeObjectURL(source.objectUrl);
            }
        })().catch(() => {
            if (mountedRef.current) {
                showToast("File gambar tidak dapat dibaca.");
                setProcessing(false);
            }
        });
    }, [disabled, processing, photos, maxPhotos, onPhotosChange, defaultCategory, stopCamera, pushCompressedPhoto, showToast]);

    const removePhoto = useCallback(
        (index: number) => {
            const target = photos[index] as CapturedVisitPhoto | undefined;
            revokePreviewUrl(target?.previewUrl);
            const updated = photos.filter((_, i) => i !== index);
            onPhotosChange(updated);
        },
        [photos, onPhotosChange, revokePreviewUrl]
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
                    className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                        isFulfilled
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                    }`}
                >
                    <span>{photos.length}/{minPhotos} foto</span>
                    {isFulfilled ? <Check className="w-3 h-3 stroke-[2.5]" /> : <span>(min)</span>}
                </span>
            </div>

            {/* Photo Grid */}
            {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {photos.map((p, i) => (
                        <div key={`${p.capturedAtDevice}-${i}`} className="rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--background)]">
                            <div className="relative aspect-[4/3] group">
                                <img src={(p as CapturedVisitPhoto).previewUrl ?? p.dataUrl} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
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
                            <button
                                type="button"
                                onClick={() => galleryInputRef.current?.click()}
                                className="btn btn-secondary btn-sm"
                                disabled={processing}
                            >
                                <ImagePlus className="w-3.5 h-3.5" />
                                Pilih dari Galeri
                            </button>
                        </div>
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                    <input
                        ref={galleryInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleGalleryFile}
                        aria-label="Pilih foto dari galeri"
                    />
                </div>
            )}

            {toast && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-700" role="status">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{toast}</span>
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
                        disabled={processing}
                    >
                        {processing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Camera className="w-3.5 h-3.5" />
                        )}
                        {processing ? "Memproses..." : `Ambil Foto (${photos.length + 1}/${maxPhotos})`}
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
