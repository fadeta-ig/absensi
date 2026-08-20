"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { AlertCircle, Camera, CheckCircle, FlipHorizontal, Loader2, RefreshCw, ScanFace, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { createClientLogger } from "@/lib/clientLogger";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

const log = createClientLogger("FaceRegistration");

type FacePhase =
    | "checking_status"
    | "idle"
    | "status_error"
    | "loading_models"
    | "starting_camera"
    | "camera_ready"
    | "detecting"
    | "saving"
    | "deleting"
    | "success"
    | "error";

type FaceMessage = {
    type: "success" | "error" | "info";
    text: string;
};

type FaceFlow = {
    phase: FacePhase;
    hasFace: boolean | null;
    message: FaceMessage | null;
    scanAttempt: number;
    scanTotal: number;
};

type StepKey = "models" | "camera" | "ready" | "detecting" | "saving";

const INITIAL_FLOW: FaceFlow = {
    phase: "checking_status",
    hasFace: null,
    message: null,
    scanAttempt: 0,
    scanTotal: 0,
};

const STEP_ORDER: StepKey[] = ["models", "camera", "ready", "detecting", "saving"];
const STEP_LABELS: Record<StepKey, string> = {
    models: "AI",
    camera: "Kamera",
    ready: "Siap",
    detecting: "Scan",
    saving: "Simpan",
};

const PHASE_STEP: Partial<Record<FacePhase, StepKey>> = {
    loading_models: "models",
    starting_camera: "camera",
    camera_ready: "ready",
    detecting: "detecting",
    saving: "saving",
};

const CAMERA_PHASES = new Set<FacePhase>([
    "loading_models",
    "starting_camera",
    "camera_ready",
    "detecting",
    "saving",
]);

const LIVE_VIDEO_PHASES = new Set<FacePhase>(["camera_ready", "detecting", "saving"]);
const BUSY_PHASES = new Set<FacePhase>([
    "checking_status",
    "loading_models",
    "starting_camera",
    "detecting",
    "saving",
    "deleting",
]);

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
    audio: false,
    video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 15, max: 24 },
    },
};

function getAbortError(err: unknown) {
    return err instanceof DOMException && err.name === "AbortError";
}

function getCameraErrorMessage(err: unknown) {
    const errorName = err instanceof DOMException || err instanceof Error ? err.name : "";
    const errorMessage = err instanceof Error ? err.message : "";

    if (!navigator.mediaDevices?.getUserMedia) {
        return "Browser tidak mendukung kamera atau halaman belum memakai koneksi aman.";
    }

    if (errorMessage === "camera-preview-timeout") {
        return "Preview kamera belum siap. Tutup aplikasi lain yang memakai kamera, lalu coba lagi.";
    }

    switch (errorName) {
        case "NotAllowedError":
        case "PermissionDeniedError":
            return "Izin kamera ditolak. Izinkan akses kamera di browser, lalu coba lagi.";
        case "NotFoundError":
        case "DevicesNotFoundError":
            return "Kamera tidak ditemukan. Sambungkan atau aktifkan kamera perangkat.";
        case "NotReadableError":
        case "TrackStartError":
            return "Kamera sedang dipakai aplikasi lain atau tidak dapat dibuka.";
        case "OverconstrainedError":
            return "Kamera tidak mendukung pengaturan yang diminta. Coba kamera lain atau muat ulang halaman.";
        case "SecurityError":
            return "Browser memblokir kamera. Buka halaman dengan koneksi aman lalu coba lagi.";
        default:
            return "Gagal mengakses kamera. Periksa izin browser dan coba lagi.";
    }
}

function getBadge(flow: FaceFlow) {
    if (flow.phase === "checking_status" || flow.phase === "deleting") {
        return {
            label: flow.phase === "deleting" ? "Memproses" : "Memeriksa",
            className: "border-[var(--border)] bg-[var(--secondary)] text-[var(--text-muted)]",
            loading: true,
        };
    }

    if (flow.phase === "status_error" || (flow.phase === "error" && flow.hasFace === null)) {
        return {
            label: "Error",
            className: "border-[var(--destructive)]/30 bg-[var(--destructive)]/10 text-[var(--destructive)]",
            loading: false,
        };
    }

    if (flow.hasFace === true) {
        return {
            label: "Terdaftar",
            className: "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
            loading: false,
        };
    }

    return {
        label: "Belum Terdaftar",
        className: "border-[var(--border)] bg-[var(--secondary)] text-[var(--text-secondary)]",
        loading: false,
    };
}

function getMessageClass(type: FaceMessage["type"]) {
    switch (type) {
        case "success":
            return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800";
        case "error":
            return "border-[var(--destructive)]/30 bg-[var(--destructive)]/10 text-[var(--destructive)]";
        default:
            return "border-[var(--border)] bg-[var(--secondary)] text-[var(--text-secondary)]";
    }
}

function waitForNextFrame() {
    return new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

export function FaceRegistrationCard() {
    const confirm = useConfirm();
    const toast = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statusAbortRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);
    const operationIdRef = useRef(0);
    const [flow, setFlow] = useState<FaceFlow>(INITIAL_FLOW);
    const [modelsReady, setModelsReady] = useState(false);
    const [isMirrored, setIsMirrored] = useState(true);

    const clearReadyTimer = useCallback(() => {
        if (readyTimerRef.current) {
            clearTimeout(readyTimerRef.current);
            readyTimerRef.current = null;
        }
    }, []);

    const stopCameraStream = useCallback(() => {
        clearReadyTimer();

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.srcObject = null;
            videoRef.current.onloadedmetadata = null;
        }
    }, [clearReadyTimer]);

    const waitForVideoReady = useCallback((video: HTMLVideoElement) => {
        clearReadyTimer();

        return new Promise<void>((resolve, reject) => {
            let settled = false;

            const finish = (callback: () => void) => {
                if (settled) return;
                settled = true;
                clearReadyTimer();
                callback();
            };

            readyTimerRef.current = setTimeout(() => {
                if (video.readyState >= video.HAVE_CURRENT_DATA) {
                    finish(resolve);
                    return;
                }
                finish(() => reject(new Error("camera-preview-timeout")));
            }, 5000);

            const playVideo = () => {
                video.play()
                    .then(() => finish(resolve))
                    .catch((err) => finish(() => reject(err)));
            };

            video.onloadedmetadata = playVideo;
            if (video.readyState >= video.HAVE_METADATA) playVideo();
        });
    }, [clearReadyTimer]);

    const checkFaceStatus = useCallback(async () => {
        statusAbortRef.current?.abort();
        const controller = new AbortController();
        statusAbortRef.current = controller;

        setFlow({
            phase: "checking_status",
            hasFace: null,
            message: null,
            scanAttempt: 0,
            scanTotal: 0,
        });

        try {
            const res = await fetch("/api/auth/face", { signal: controller.signal });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memeriksa status registrasi wajah."));
            }

            const data = (await res.json()) as { hasFace?: boolean; registered?: boolean };
            if (!mountedRef.current) return;

            const isRegistered = Boolean(data.hasFace ?? data.registered ?? false);

            setFlow({
                phase: "idle",
                hasFace: isRegistered,
                message: null,
                scanAttempt: 0,
                scanTotal: 0,
            });
        } catch (err) {
            if (getAbortError(err) || !mountedRef.current) return;

            reportClientError("FaceRegistration", "Error cek status registrasi wajah", err);
            const message = err instanceof Error ? err.message : "Gagal memeriksa status registrasi wajah.";
            setFlow({
                phase: "status_error",
                hasFace: null,
                message: { type: "error", text: message },
                scanAttempt: 0,
                scanTotal: 0,
            });
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        void checkFaceStatus();

        return () => {
            mountedRef.current = false;
            statusAbortRef.current?.abort();
            clearReadyTimer();
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }
        };
    }, [checkFaceStatus, clearReadyTimer]);

    const cancelCameraFlow = useCallback(() => {
        operationIdRef.current += 1;
        stopCameraStream();
        setFlow((current) => ({
            ...current,
            phase: "idle",
            message: null,
            scanAttempt: 0,
            scanTotal: 0,
        }));
    }, [stopCameraStream]);

    const startFaceCamera = useCallback(async () => {
        const operationId = operationIdRef.current + 1;
        operationIdRef.current = operationId;
        stopCameraStream();

        setFlow((current) => ({
            ...current,
            phase: modelsReady ? "starting_camera" : "loading_models",
            message: {
                type: "info",
                text: modelsReady
                    ? "Mengaktifkan kamera untuk pendaftaran wajah..."
                    : "Menyiapkan model AI biometrik wajah...",
            },
            scanAttempt: 0,
            scanTotal: 0,
        }));

        try {
            if (!modelsReady) {
                const { loadFaceModels } = await import("@/lib/faceRecognition");
                await loadFaceModels();
                if (!mountedRef.current || operationIdRef.current !== operationId) return;
                setModelsReady(true);
            }

            setFlow((current) => ({
                ...current,
                phase: "starting_camera",
                message: { type: "info", text: "Membuka kamera..." },
            }));

            const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
            if (!mountedRef.current || operationIdRef.current !== operationId) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            streamRef.current = stream;

            await waitForNextFrame();
            const video = videoRef.current;
            if (!video) {
                throw new Error("Elemen video tidak ditemukan.");
            }

            video.srcObject = stream;
            await waitForVideoReady(video);
            if (!mountedRef.current || operationIdRef.current !== operationId) return;

            setFlow((current) => ({
                ...current,
                phase: "camera_ready",
                message: {
                    type: "info",
                    text: "Posisikan wajah tepat di tengah lingkaran oval, lalu tekan tombol Scan & Simpan.",
                },
            }));
        } catch (err) {
            if (!mountedRef.current || operationIdRef.current !== operationId) return;

            stopCameraStream();
            const message = getCameraErrorMessage(err);
            reportClientError("FaceRegistration", "Gagal memulai kamera untuk registrasi wajah", err);

            setFlow((current) => ({
                ...current,
                phase: "error",
                message: { type: "error", text: message },
            }));
        }
    }, [modelsReady, stopCameraStream, waitForVideoReady]);

    const registerFace = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !streamRef.current) {
            setFlow((current) => ({
                ...current,
                phase: "error",
                message: { type: "error", text: "Kamera belum aktif. Buka kembali kamera untuk melanjutkan." },
            }));
            return;
        }

        const operationId = operationIdRef.current;
        setFlow((current) => ({
            ...current,
            phase: "detecting",
            message: { type: "info", text: "Memindai fitur wajah. Tetap diam dan tatap kamera sejenak..." },
            scanAttempt: 1,
            scanTotal: 3,
        }));

        try {
            const { detectFaceDescriptors, averageFaceDescriptors, FACE_SCAN_ATTEMPTS } = await import("@/lib/faceRecognition");
            setFlow((current) => ({
                ...current,
                scanTotal: FACE_SCAN_ATTEMPTS,
            }));

            const descriptors = await detectFaceDescriptors(video, {
                onAttempt: (attempt, total) => {
                    if (!mountedRef.current || operationIdRef.current !== operationId) return;
                    setFlow((current) => ({
                        ...current,
                        scanAttempt: attempt,
                        scanTotal: total,
                        message: { type: "info", text: `Memindai frame (${attempt}/${total}). Tahan posisi wajah Anda...` },
                    }));
                },
            });
            if (!mountedRef.current || operationIdRef.current !== operationId) return;

            const descriptor = averageFaceDescriptors(descriptors);
            if (!descriptor) {
                setFlow((current) => ({
                    ...current,
                    phase: "camera_ready",
                    message: {
                        type: "error",
                        text: `Wajah belum terdeteksi. Pastikan ruangan cukup terang, bersihkan lensa kamera depan, dan hadapkan wajah ke kamera.`,
                    },
                    scanAttempt: 0,
                    scanTotal: 0,
                }));
                return;
            }

            setFlow((current) => ({
                ...current,
                phase: "saving",
                message: { type: "info", text: "Menyimpan data biometrik wajah secara aman ke server..." },
                scanAttempt: 0,
                scanTotal: 0,
            }));

            const res = await fetch("/api/auth/face", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ descriptor: Array.from(descriptor) }),
            });
            if (!mountedRef.current || operationIdRef.current !== operationId) return;

            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan data biometrik wajah."));
            }

            stopCameraStream();
            setFlow({
                phase: "success",
                hasFace: true,
                message: {
                    type: "success",
                    text: "Wajah berhasil didaftarkan! Data biometrik aktif dan siap digunakan untuk absensi kehadiran.",
                },
                scanAttempt: 0,
                scanTotal: 0,
            });
            toast("Wajah berhasil didaftarkan. Verifikasi wajah aktif untuk absensi masuk & pulang.", "success");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Wajah belum berhasil diproses.";
            reportClientError("FaceRegistration", "Error saat registrasi wajah", err);
            if (!mountedRef.current || operationIdRef.current !== operationId) return;

            setFlow((current) => ({
                ...current,
                phase: streamRef.current ? "camera_ready" : "error",
                message: { type: "error", text: `${message} Periksa pencahayaan dan coba lagi.` },
                scanAttempt: 0,
                scanTotal: 0,
            }));
        }
    }, [stopCameraStream, toast]);

    const deleteFace = useCallback(() => {
        confirm({
            title: "Hapus data biometrik wajah?",
            message: "Data wajah digunakan untuk validasi absensi harian. Setelah dihapus, Anda harus mendaftarkan wajah kembali sebelum dapat melakukan presensi berbasis wajah.",
            confirmLabel: "Hapus Wajah",
            cancelLabel: "Batal",
            variant: "danger",
            onConfirm: async () => {
                const operationId = operationIdRef.current + 1;
                operationIdRef.current = operationId;
                stopCameraStream();
                setFlow((current) => ({
                    ...current,
                    phase: "deleting",
                    message: { type: "info", text: "Menghapus data wajah dari server..." },
                    scanAttempt: 0,
                    scanTotal: 0,
                }));

                try {
                    const res = await fetch("/api/auth/face", { method: "DELETE" });
                    if (!mountedRef.current || operationIdRef.current !== operationId) return;

                    if (!res.ok) {
                        throw new Error(await getResponseErrorMessage(res, "Gagal menghapus data wajah."));
                    }

                    setFlow({
                        phase: "idle",
                        hasFace: false,
                        message: { type: "success", text: "Data biometrik wajah berhasil dihapus." },
                        scanAttempt: 0,
                        scanTotal: 0,
                    });
                    toast("Data biometrik wajah berhasil dihapus.", "success");
                } catch (err) {
                    const message = err instanceof Error ? err.message : "Gagal menghapus data wajah.";
                    reportClientError("FaceRegistration", "Error hapus wajah", err);
                    if (!mountedRef.current || operationIdRef.current !== operationId) return;

                    setFlow((current) => ({
                        ...current,
                        phase: "idle",
                        hasFace: true,
                        message: { type: "error", text: message },
                    }));
                }
            },
        });
    }, [confirm, stopCameraStream, toast]);

    const activeStep = PHASE_STEP[flow.phase];
    const currentStepIndex = activeStep ? STEP_ORDER.indexOf(activeStep) : -1;
    const showCameraPanel = CAMERA_PHASES.has(flow.phase);
    const showLiveVideo = LIVE_VIDEO_PHASES.has(flow.phase);
    const isBusy = BUSY_PHASES.has(flow.phase);
    const badge = getBadge(flow);

    return (
        <div className="card">
            <div className="p-4 border-b border-[var(--border)]">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center shrink-0">
                            <ScanFace className="w-4 h-4 text-[var(--accent-foreground)]" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Registrasi Wajah</h2>
                            <p className="text-xs text-[var(--text-muted)]">Verifikasi identitas biometrik saat absensi</p>
                        </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 border text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0 ${badge.className}`}>
                        {badge.loading && <Loader2 className="w-3 h-3 animate-spin" />}
                        {badge.label}
                    </span>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {flow.phase === "checking_status" && (
                    <div className="flex items-center justify-center py-6 gap-2 text-xs text-[var(--text-muted)]">
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                        <span>Memeriksa status registrasi biometrik...</span>
                    </div>
                )}

                {activeStep && (
                    <div className="flex items-center gap-1 text-[10px] font-medium" aria-label="Progress registrasi wajah">
                        {STEP_ORDER.map((step, index) => {
                            const isDone = index < currentStepIndex;
                            const isActive = step === activeStep;

                            return (
                                <div key={step} className="contents">
                                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-colors ${
                                        isActive
                                            ? "border-[var(--primary)]/30 bg-[var(--accent)] text-[var(--accent-foreground)] font-semibold"
                                            : isDone
                                                ? "border-emerald-500/20 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
                                                : "border-[var(--border)] bg-[var(--secondary)] text-[var(--text-muted)]"
                                    }`}>
                                        {isDone ? (
                                            <CheckCircle className="w-3 h-3" />
                                        ) : isActive ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <span className="w-3 h-3 rounded-full border border-current inline-block" />
                                        )}
                                        {STEP_LABELS[step]}
                                    </div>
                                    {index < STEP_ORDER.length - 1 && (
                                        <div className={`flex-1 h-px ${index < currentStepIndex ? "bg-emerald-500/40" : "bg-[var(--border)]"}`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {flow.message && (
                    <div
                        className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${getMessageClass(flow.message.type)}`}
                        role={flow.message.type === "error" ? "alert" : "status"}
                        aria-live={flow.message.type === "error" ? "assertive" : "polite"}
                    >
                        {flow.message.type === "success" ? (
                            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                        ) : flow.message.type === "error" ? (
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--destructive)]" />
                        ) : (
                            <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin text-[var(--primary)]" />
                        )}
                        <span className="text-xs leading-relaxed font-medium">{flow.message.text}</span>
                    </div>
                )}

                {showCameraPanel && (
                    <div className="relative aspect-[4/3] bg-[var(--foreground)] text-[var(--background)] rounded-xl overflow-hidden shadow-inner">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover transition-opacity duration-200 ${
                                showLiveVideo ? "opacity-100" : "opacity-0"
                            }`}
                            style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
                        />

                        {/* Mirror / Flip Viewport Toggle */}
                        {showLiveVideo && (
                            <button
                                type="button"
                                onClick={() => setIsMirrored((prev) => !prev)}
                                className="absolute top-3 right-3 z-10 px-2.5 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white text-[11px] font-medium flex items-center gap-1.5 backdrop-blur-sm transition-all border border-white/20 shadow-sm"
                                title="Klik untuk membalik/cermin tampilan kamera"
                            >
                                <FlipHorizontal className="w-3.5 h-3.5" />
                                <span>{isMirrored ? "Cermin: ON" : "Cermin: OFF"}</span>
                            </button>
                        )}

                        {!showLiveVideo && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--foreground)] text-[var(--background)]">
                                <div className="relative">
                                    <div className="spinner w-14 h-14" />
                                    <ScanFace className="w-6 h-6 text-[var(--background)] absolute inset-0 m-auto opacity-80" />
                                </div>
                                <p className="text-xs text-[var(--background)] opacity-80 text-center px-4">
                                    {flow.phase === "loading_models" ? "Menyiapkan modul AI biometrik wajah..." : "Mengaktifkan kamera..."}
                                </p>
                            </div>
                        )}

                        {showLiveVideo && (
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute inset-0 bg-black/20" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className={`relative w-48 h-60 rounded-[50%] border-2 transition-all duration-300 bg-transparent ${
                                        flow.phase === "detecting"
                                            ? "border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.5)]"
                                            : flow.phase === "saving"
                                                ? "border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)]"
                                                : "border-[var(--primary)] shadow-[0_0_15px_rgba(128,0,32,0.3)]"
                                    }`}>
                                        {(flow.phase === "detecting" || flow.phase === "saving") && (
                                            <div
                                                className="absolute inset-x-4 top-0 h-0.5 animate-[scanLine_1.5s_ease-in-out_infinite] will-change-transform"
                                                style={{ background: "linear-gradient(90deg, transparent, #fbbf24, transparent)" }}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
                                    <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-black/60 text-white backdrop-blur-sm border border-white/10 shadow-sm">
                                        {flow.phase === "detecting"
                                            ? `Memindai frame${flow.scanAttempt && flow.scanTotal ? ` ${flow.scanAttempt}/${flow.scanTotal}` : ""}... Tahan posisi`
                                            : flow.phase === "saving"
                                                ? "Menyimpan data wajah..."
                                                : "Posisikan seluruh wajah di dalam lingkaran oval"}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Error recovery hint */}
                {flow.phase === "camera_ready" && flow.message?.type === "error" && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg text-xs text-amber-800 dark:text-amber-300 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>Tips Pemindaian Optimal:</span>
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400/90 pl-1">
                            <li>Bersihkan lensa kamera depan jika sedikit berdebu atau berembun.</li>
                            <li>Posisikan wajah menghadap ke sumber cahaya terang (hindari membelakangi lampu/jendela).</li>
                            <li>Lepaskan masker atau kacamata hitam pekat saat memindai.</li>
                        </ul>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                    {showCameraPanel && (
                        <>
                            <button
                                onClick={registerFace}
                                disabled={flow.phase !== "camera_ready"}
                                className="btn btn-primary flex-1 flex items-center justify-center gap-1.5"
                            >
                                {flow.phase === "detecting" || flow.phase === "saving" ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <ScanFace className="w-4 h-4" />
                                )}
                                {flow.phase === "loading_models"
                                    ? "Menyiapkan..."
                                    : flow.phase === "starting_camera"
                                        ? "Membuka Kamera..."
                                        : flow.phase === "detecting"
                                            ? "Memindai..."
                                            : flow.phase === "saving"
                                                ? "Menyimpan..."
                                                : "Scan & Simpan"}
                            </button>
                            <button
                                onClick={cancelCameraFlow}
                                disabled={flow.phase === "saving"}
                                className="btn btn-secondary"
                                title="Batalkan proses"
                            >
                                Batal
                            </button>
                        </>
                    )}

                    {!showCameraPanel && flow.phase === "status_error" && (
                        <button
                            onClick={() => void checkFaceStatus()}
                            className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Cek Ulang Status
                        </button>
                    )}

                    {!showCameraPanel && !isBusy && flow.hasFace !== true && flow.phase !== "status_error" && (
                        <button
                            onClick={startFaceCamera}
                            className="btn btn-primary flex-1 flex items-center justify-center gap-1.5"
                        >
                            <Camera className="w-4 h-4" />
                            Daftarkan Wajah
                        </button>
                    )}

                    {!showCameraPanel && !isBusy && flow.hasFace === true && (
                        <div className="flex gap-2 w-full">
                            <button
                                onClick={startFaceCamera}
                                className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Perbarui Wajah
                            </button>
                            <button
                                onClick={deleteFace}
                                className="btn btn-danger flex-1 flex items-center justify-center gap-1.5"
                            >
                                <Trash2 className="w-4 h-4" />
                                Hapus Wajah
                            </button>
                        </div>
                    )}

                    {!showCameraPanel && flow.phase === "deleting" && (
                        <button className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5" disabled>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Menghapus Data Wajah...
                        </button>
                    )}
                </div>

                {flow.hasFace !== true && flow.phase === "idle" && !showCameraPanel && (
                    <div className="flex items-start gap-2.5 p-3.5 bg-[var(--secondary)] rounded-xl border border-[var(--border)]">
                        <AlertCircle className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                        <div className="text-xs space-y-1">
                            <p className="font-semibold text-[var(--text-primary)]">Wajah Belum Terdaftar</p>
                            <p className="text-[var(--text-secondary)] leading-relaxed">
                                Daftarkan wajah Anda untuk mengaktifkan fitur verifikasi biometrik saat absensi.
                                Pastikan pencahayaan cukup dan wajah terlihat jelas di kamera.
                            </p>
                        </div>
                    </div>
                )}

                {(flow.hasFace === true || flow.phase === "success") && !showCameraPanel && (
                    <div className="p-4 bg-emerald-50/80 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800/40 space-y-2">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                                Wajah Anda Telah Berhasil Terdaftar
                            </p>
                        </div>
                        <p className="text-xs text-emerald-800 dark:text-emerald-400/90 leading-relaxed">
                            Data biometrik tersimpan secara aman dengan enkripsi 128-vektor. Sistem siap memverifikasi identitas Anda secara instan saat melakukan absensi masuk dan pulang.
                        </p>
                        <div className="pt-1 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Status: Siap Digunakan untuk Absensi Masuk & Pulang</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
