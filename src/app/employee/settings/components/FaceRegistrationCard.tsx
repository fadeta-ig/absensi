import { useState, useRef, useCallback, useEffect } from "react";
import { AlertCircle, Camera, CheckCircle, Loader2, RefreshCw, ScanFace, ShieldCheck, Trash2 } from "lucide-react";
import { createClientLogger } from "@/lib/clientLogger";
import { useConfirm } from "@/components/ConfirmModal";
import { getResponseErrorMessage } from "@/lib/clientErrors";

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
            label: flow.phase === "deleting" ? "Memproses" : "Memuat",
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

    if (flow.hasFace) {
        return {
            label: "Terdaftar",
            className: "border-[var(--primary)]/30 bg-[var(--accent)] text-[var(--accent-foreground)]",
            loading: false,
        };
    }

    return {
        label: "Belum",
        className: "border-[var(--border)] bg-[var(--secondary)] text-[var(--text-secondary)]",
        loading: false,
    };
}

function getMessageClass(type: FaceMessage["type"]) {
    switch (type) {
        case "success":
            return "border-[var(--primary)]/30 bg-[var(--accent)] text-[var(--accent-foreground)]";
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
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statusAbortRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);
    const operationIdRef = useRef(0);
    const [flow, setFlow] = useState<FaceFlow>(INITIAL_FLOW);
    const [modelsReady, setModelsReady] = useState(false);

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
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat status wajah."));
            }

            const data = await res.json();
            if (!mountedRef.current || controller.signal.aborted) return;

            setFlow({
                phase: "idle",
                hasFace: Boolean(data.hasFace),
                message: null,
                scanAttempt: 0,
                scanTotal: 0,
            });
            log.info("Status wajah", { hasFace: data.hasFace });
        } catch (err) {
            if (getAbortError(err)) return;

            const message = err instanceof Error ? err.message : "Gagal memuat status wajah.";
            log.error("Gagal cek status wajah", { error: message });
            if (!mountedRef.current) return;

            setFlow({
                phase: "status_error",
                hasFace: null,
                message: { type: "error", text: `${message} Status wajah belum dapat dipastikan.` },
                scanAttempt: 0,
                scanTotal: 0,
            });
        } finally {
            if (statusAbortRef.current === controller) statusAbortRef.current = null;
        }
    }, []);

    useEffect(() => {
        void checkFaceStatus();
        return () => statusAbortRef.current?.abort();
    }, [checkFaceStatus]);

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
            operationIdRef.current += 1;
            statusAbortRef.current?.abort();
            stopCameraStream();
        };
    }, [stopCameraStream]);

    useEffect(() => {
        if (flow.phase !== "idle" || modelsReady) return;

        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let idleId: number | null = null;
        const idleWindow = window as Window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
            cancelIdleCallback?: (handle: number) => void;
        };

        const preloadModels = async () => {
            try {
                const { loadFaceModels } = await import("@/lib/faceRecognition");
                await loadFaceModels();
                if (!cancelled && mountedRef.current) setModelsReady(true);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log.warn("Preload model wajah gagal", { error: message });
            }
        };

        if (idleWindow.requestIdleCallback) {
            idleId = idleWindow.requestIdleCallback(() => void preloadModels(), { timeout: 3000 });
        } else {
            timeoutId = setTimeout(() => void preloadModels(), 1200);
        }

        return () => {
            cancelled = true;
            if (timeoutId) clearTimeout(timeoutId);
            if (idleId !== null) idleWindow.cancelIdleCallback?.(idleId);
        };
    }, [flow.phase, modelsReady]);

    const ensureModelsLoaded = useCallback(async (operationId: number) => {
        if (modelsReady) return true;

        setFlow((current) => ({
            ...current,
            phase: "loading_models",
            message: {
                type: "info",
                text: "Menyiapkan verifikasi wajah. Proses pertama dapat memakan beberapa detik.",
            },
            scanAttempt: 0,
            scanTotal: 0,
        }));

        try {
            const { loadFaceModels } = await import("@/lib/faceRecognition");
            await loadFaceModels();
            if (!mountedRef.current || operationIdRef.current !== operationId) return false;
            setModelsReady(true);
            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : "Gagal memuat model AI.";
            log.error("Gagal load model AI", { error: message });
            if (!mountedRef.current || operationIdRef.current !== operationId) return false;

            setFlow((current) => ({
                ...current,
                phase: "error",
                message: { type: "error", text: "Gagal menyiapkan verifikasi wajah. Muat ulang halaman lalu coba lagi." },
            }));
            return false;
        }
    }, [modelsReady]);

    const cancelCameraFlow = useCallback(() => {
        operationIdRef.current += 1;
        stopCameraStream();
        setFlow((current) => ({
            phase: "idle",
            hasFace: current.hasFace,
            message: null,
            scanAttempt: 0,
            scanTotal: 0,
        }));
    }, [stopCameraStream]);

    const startFaceCamera = useCallback(async () => {
        const operationId = operationIdRef.current + 1;
        operationIdRef.current = operationId;

        const loaded = await ensureModelsLoaded(operationId);
        if (!loaded || !mountedRef.current || operationIdRef.current !== operationId) return;

        if (!navigator.mediaDevices?.getUserMedia) {
            setFlow((current) => ({
                ...current,
                phase: "error",
                message: { type: "error", text: getCameraErrorMessage(new Error("media-devices-unavailable")) },
            }));
            return;
        }

        stopCameraStream();
        setFlow((current) => ({
            ...current,
            phase: "starting_camera",
            message: { type: "info", text: "Browser akan meminta izin kamera. Izinkan untuk melanjutkan." },
            scanAttempt: 0,
            scanTotal: 0,
        }));

        try {
            await waitForNextFrame();
            if (!mountedRef.current || operationIdRef.current !== operationId) return;

            const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
            if (!mountedRef.current || operationIdRef.current !== operationId) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            streamRef.current = stream;
            const video = videoRef.current;
            if (!video) throw new Error("camera-preview-timeout");

            video.srcObject = stream;
            await waitForVideoReady(video);
            if (!mountedRef.current || operationIdRef.current !== operationId) return;

            setFlow((current) => ({
                ...current,
                phase: "camera_ready",
                message: {
                    type: "info",
                    text: "Pastikan wajah berada di tengah panduan dan preview terlihat jelas.",
                },
            }));
        } catch (err) {
            const message = getCameraErrorMessage(err);
            const errName = err instanceof DOMException || err instanceof Error ? err.name : "UnknownError";
            log.error("Gagal mengakses kamera", { errorName: errName, error: err instanceof Error ? err.message : String(err) });
            stopCameraStream();
            if (!mountedRef.current || operationIdRef.current !== operationId) return;

            setFlow((current) => ({
                ...current,
                phase: "error",
                message: { type: "error", text: message },
                scanAttempt: 0,
                scanTotal: 0,
            }));
        }
    }, [ensureModelsLoaded, stopCameraStream, waitForVideoReady]);

    const registerFace = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !streamRef.current) {
            setFlow((current) => ({
                ...current,
                phase: "error",
                message: { type: "error", text: "Preview kamera belum siap. Aktifkan kamera lalu coba lagi." },
            }));
            return;
        }

        if (video.videoWidth === 0 || video.videoHeight === 0) {
            log.warn("Video frame belum siap saat scan registrasi", { readyState: video.readyState });
            setFlow((current) => ({
                ...current,
                phase: "camera_ready",
                message: { type: "error", text: "Preview kamera belum siap. Tunggu sampai gambar terlihat jelas." },
            }));
            return;
        }

        const operationId = operationIdRef.current;
        setFlow((current) => ({
            ...current,
            phase: "detecting",
            message: { type: "info", text: "Memindai wajah. Tetap diam sebentar." },
            scanAttempt: 0,
            scanTotal: 0,
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
                        message: { type: "info", text: `Memindai wajah (${attempt}/${total}). Tetap diam sebentar.` },
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
                        text: `Wajah belum terdeteksi setelah ${FACE_SCAN_ATTEMPTS} percobaan. Pastikan cahaya cukup dan wajah menghadap kamera.`,
                    },
                    scanAttempt: 0,
                    scanTotal: 0,
                }));
                return;
            }

            setFlow((current) => ({
                ...current,
                phase: "saving",
                message: { type: "info", text: "Menyimpan data wajah ke server." },
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
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan data wajah."));
            }

            stopCameraStream();
            setFlow({
                phase: "success",
                hasFace: true,
                message: {
                    type: "success",
                    text: "Wajah berhasil didaftarkan. Verifikasi wajah siap digunakan saat absensi.",
                },
                scanAttempt: 0,
                scanTotal: 0,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "Wajah belum berhasil diproses.";
            log.error("Error saat registrasi wajah", { error: message });
            if (!mountedRef.current || operationIdRef.current !== operationId) return;

            setFlow((current) => ({
                ...current,
                phase: streamRef.current ? "camera_ready" : "error",
                message: { type: "error", text: `${message} Coba lagi saat wajah terlihat jelas.` },
                scanAttempt: 0,
                scanTotal: 0,
            }));
        }
    }, [stopCameraStream]);

    const deleteFace = useCallback(() => {
        confirm({
            title: "Hapus data wajah?",
            message: "Data wajah digunakan untuk verifikasi absensi. Setelah dihapus, Anda perlu mendaftarkan wajah kembali sebelum memakai verifikasi wajah.",
            confirmLabel: "Hapus",
            cancelLabel: "Batal",
            variant: "danger",
            onConfirm: async () => {
                const operationId = operationIdRef.current + 1;
                operationIdRef.current = operationId;
                stopCameraStream();
                setFlow((current) => ({
                    ...current,
                    phase: "deleting",
                    message: { type: "info", text: "Menghapus data wajah." },
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
                        message: { type: "success", text: "Data wajah berhasil dihapus." },
                        scanAttempt: 0,
                        scanTotal: 0,
                    });
                } catch (err) {
                    const message = err instanceof Error ? err.message : "Gagal menghapus data wajah.";
                    log.error("Error hapus wajah", { error: message });
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
    }, [confirm, stopCameraStream]);

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
                            <p className="text-xs text-[var(--text-muted)]">Verifikasi identitas saat absensi</p>
                        </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 border text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0 ${badge.className}`}>
                        {badge.loading && <Loader2 className="w-3 h-3 animate-spin" />}
                        {badge.label}
                    </span>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {activeStep && (
                    <div className="flex items-center gap-1 text-[10px] font-medium" aria-label="Progress registrasi wajah">
                        {STEP_ORDER.map((step, index) => {
                            const isDone = index < currentStepIndex;
                            const isActive = step === activeStep;

                            return (
                                <div key={step} className="contents">
                                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full border transition-colors ${
                                        isActive
                                            ? "border-[var(--primary)]/30 bg-[var(--accent)] text-[var(--accent-foreground)]"
                                            : isDone
                                                ? "border-[var(--primary)]/20 bg-[var(--primary)]/10 text-[var(--primary)]"
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
                                        <div className={`flex-1 h-px ${index < currentStepIndex ? "bg-[var(--primary)]/40" : "bg-[var(--border)]"}`} />
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
                            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        ) : flow.message.type === "error" ? (
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        ) : (
                            <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" />
                        )}
                        <span>{flow.message.text}</span>
                    </div>
                )}

                {showCameraPanel && (
                    <div className="relative aspect-[4/3] bg-[var(--foreground)] text-[var(--background)] rounded-xl overflow-hidden">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover transition-opacity duration-200 ${
                                showLiveVideo ? "opacity-100" : "opacity-0"
                            }`}
                        />

                        {!showLiveVideo && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--foreground)] text-[var(--background)]">
                                <div className="relative">
                                    <div className="spinner w-14 h-14" />
                                    <ScanFace className="w-6 h-6 text-[var(--background)] absolute inset-0 m-auto opacity-80" />
                                </div>
                                <p className="text-xs text-[var(--background)] opacity-80 text-center px-4">
                                    {flow.phase === "loading_models" ? "Menyiapkan model verifikasi wajah..." : "Mengaktifkan kamera..."}
                                </p>
                            </div>
                        )}

                        {showLiveVideo && (
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute inset-0 bg-black/20" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="relative w-44 h-56 rounded-[50%] border-2 border-[var(--primary)] bg-transparent">
                                        {(flow.phase === "detecting" || flow.phase === "saving") && (
                                            <div
                                                className="absolute inset-x-4 top-0 h-0.5 animate-[scanLine_1.5s_ease-in-out_infinite] will-change-transform"
                                                style={{ background: "linear-gradient(90deg, transparent, var(--primary), transparent)" }}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="absolute bottom-6 left-0 right-0 flex justify-center px-4">
                                    <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-black/40 text-white">
                                        {flow.phase === "detecting"
                                            ? `Mendeteksi wajah${flow.scanAttempt && flow.scanTotal ? ` ${flow.scanAttempt}/${flow.scanTotal}` : ""}`
                                            : flow.phase === "saving"
                                                ? "Menyimpan data wajah"
                                                : "Posisikan wajah di tengah"}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex gap-2">
                    {showCameraPanel && (
                        <>
                            <button
                                onClick={registerFace}
                                disabled={flow.phase !== "camera_ready"}
                                className="btn btn-primary flex-1"
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
                                            ? "Mendeteksi..."
                                            : flow.phase === "saving"
                                                ? "Menyimpan..."
                                                : "Scan & Simpan"}
                            </button>
                            <button
                                onClick={cancelCameraFlow}
                                disabled={flow.phase === "saving"}
                                className="btn btn-secondary"
                                title="Batalkan"
                            >
                                Batal
                            </button>
                        </>
                    )}

                    {!showCameraPanel && flow.phase === "status_error" && (
                        <button
                            onClick={() => void checkFaceStatus()}
                            className="btn btn-secondary flex-1"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Cek Ulang Status
                        </button>
                    )}

                    {!showCameraPanel && !isBusy && flow.hasFace === false && flow.phase !== "status_error" && (
                        <button
                            onClick={startFaceCamera}
                            className="btn btn-primary flex-1"
                        >
                            <Camera className="w-4 h-4" />
                            Daftarkan Wajah
                        </button>
                    )}

                    {!showCameraPanel && !isBusy && flow.hasFace === true && (
                        <div className="flex gap-2 w-full">
                            <button
                                onClick={startFaceCamera}
                                className="btn btn-secondary flex-1"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Perbarui Wajah
                            </button>
                            <button
                                onClick={deleteFace}
                                className="btn btn-danger flex-1"
                            >
                                <Trash2 className="w-4 h-4" />
                                Hapus
                            </button>
                        </div>
                    )}

                    {!showCameraPanel && flow.phase === "deleting" && (
                        <button className="btn btn-secondary flex-1" disabled>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Menghapus...
                        </button>
                    )}
                </div>

                {flow.hasFace === false && flow.phase === "idle" && (
                    <div className="flex items-start gap-2 p-3 bg-[var(--secondary)] rounded-lg border border-[var(--border)]">
                        <AlertCircle className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                        <p className="text-xs text-[var(--text-secondary)]">
                            Daftarkan wajah Anda untuk meningkatkan keamanan absensi.
                            Pastikan pencahayaan cukup dan wajah terlihat jelas di kamera.
                        </p>
                    </div>
                )}

                {(flow.hasFace === true || flow.phase === "success") && !showCameraPanel && (
                    <div className="flex items-start gap-2 p-3 bg-[var(--accent)] rounded-lg border border-[var(--primary)]/20">
                        <ShieldCheck className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                        <p className="text-xs text-[var(--accent-foreground)]">
                            Wajah Anda telah terdaftar. Sistem akan memverifikasi identitas saat absensi.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
