"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
    AlertCircle,
    Camera,
    CheckCircle,
    FlipHorizontal,
    Loader2,
    RefreshCw,
    ScanFace,
    ShieldCheck,
    Trash2,
    X,
} from "lucide-react";
import { createClientLogger } from "@/lib/clientLogger";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

const log = createClientLogger("FaceRegistration");

type FaceStatus = "loading" | "registered" | "not_registered" | "error";
type ActiveStep = null | "models" | "camera" | "ready" | "detecting" | "saving";

export function FaceRegistrationCard() {
    const confirm = useConfirm();
    const toast = useToast();
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [faceStatus, setFaceStatus] = useState<FaceStatus>("loading");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [faceStreaming, setFaceStreaming] = useState(false);
    const [faceProcessing, setFaceProcessing] = useState(false);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [isMirrored, setIsMirrored] = useState(true);
    const [step, setStep] = useState<ActiveStep>(null);
    const [modalMessage, setModalMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

    const checkFaceStatus = useCallback(async () => {
        setFaceStatus("loading");
        try {
            const res = await fetch("/api/auth/face");
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memeriksa status wajah"));
            }
            const data = (await res.json()) as { hasFace?: boolean; registered?: boolean };
            const isRegistered = Boolean(data.hasFace ?? data.registered ?? false);
            setFaceStatus(isRegistered ? "registered" : "not_registered");
        } catch (err) {
            reportClientError("FaceRegistration", "Gagal cek status registrasi", err);
            setFaceStatus("error");
        }
    }, []);

    useEffect(() => {
        void checkFaceStatus();
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }
        };
    }, [checkFaceStatus]);

    const stopFaceCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.srcObject = null;
            videoRef.current.onloadedmetadata = null;
        }
        setFaceStreaming(false);
        setStep(null);
    }, []);

    const closeModal = useCallback(() => {
        stopFaceCamera();
        setIsModalOpen(false);
        setModalMessage(null);
    }, [stopFaceCamera]);

    const ensureModelsLoaded = useCallback(async (): Promise<boolean> => {
        if (modelsLoaded) return true;
        setModelsLoading(true);
        setStep("models");
        setModalMessage({ type: "info", text: "Menyiapkan modul AI biometrik wajah..." });
        try {
            const { loadFaceModels } = await import("@/lib/faceRecognition");
            await loadFaceModels();
            setModelsLoaded(true);
            return true;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            reportClientError("FaceRegistration", "Gagal memuat model AI", err);
            setModalMessage({ type: "error", text: `Gagal memuat model AI (${errMsg}). Muat ulang halaman.` });
            setStep(null);
            return false;
        } finally {
            setModelsLoading(false);
        }
    }, [modelsLoaded]);

    const openCameraModal = useCallback(async () => {
        setIsModalOpen(true);
        setModalMessage(null);

        const loaded = await ensureModelsLoaded();
        if (!loaded) return;

        setStep("camera");
        setModalMessage({ type: "info", text: "Mengaktifkan kamera..." });

        if (!navigator.mediaDevices?.getUserMedia) {
            setModalMessage({ type: "error", text: "Browser tidak mendukung akses kamera atau halaman belum memakai koneksi aman (HTTPS)." });
            setStep(null);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            });

            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play()
                        .then(() => {
                            setFaceStreaming(true);
                            setStep("ready");
                            setModalMessage({ type: "info", text: "Posisikan wajah tepat di dalam oval, lalu tekan Scan & Simpan." });
                        })
                        .catch(() => {
                            setFaceStreaming(true);
                            setStep("ready");
                            setModalMessage({ type: "info", text: "Posisikan wajah tepat di dalam oval, lalu tekan Scan & Simpan." });
                        });
                };
            }
        } catch (err) {
            const errName = err instanceof Error ? err.name : "UnknownError";
            reportClientError("FaceRegistration", "Gagal mengakses kamera", err);
            setModalMessage({ type: "error", text: `Gagal membuka kamera: ${errName}. Berikan izin akses kamera pada browser.` });
            setStep(null);
            stopFaceCamera();
        }
    }, [ensureModelsLoaded, stopFaceCamera]);

    const registerFace = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !streamRef.current) return;

        if (video.videoWidth === 0 || video.videoHeight === 0) {
            setModalMessage({ type: "error", text: "Frame kamera belum siap. Tunggu sebentar lalu coba lagi." });
            return;
        }

        setFaceProcessing(true);
        setStep("detecting");
        setModalMessage({ type: "info", text: "Memindai fitur wajah. Tetap diam sebentar..." });

        try {
            const { detectFaceDescriptors, averageFaceDescriptors, FACE_SCAN_ATTEMPTS } = await import("@/lib/faceRecognition");

            // Langsung kirim video element ke AI (seperti commit f653a2e yang terbukti bekerja).
            // JANGAN gunakan canvas perantara — canvas 320px terlalu kecil untuk
            // SSD MobileNet (butuh min 512px), dan hidden canvas di Android Chrome
            // tidak menerima frame valid dari hardware video decoder.
            const descriptors = await detectFaceDescriptors(video, {
                onAttempt: (attempt, total) => {
                    setModalMessage({
                        type: "info",
                        text: `Memindai frame (${attempt}/${total}). Tahan posisi wajah Anda...`,
                    });
                },
            });
            const descriptor = averageFaceDescriptors(descriptors);

            if (!descriptor) {
                setModalMessage({
                    type: "error",
                    text: `Wajah belum terdeteksi setelah ${FACE_SCAN_ATTEMPTS} pemindaian. Pastikan pencahayaan cukup terang, hadapkan wajah langsung ke kamera, dan bersihkan lensa depan.`,
                });
                setStep("ready");
                setFaceProcessing(false);
                return;
            }

            setStep("saving");
            setModalMessage({ type: "info", text: "Menyimpan data biometrik wajah ke server..." });

            const res = await fetch("/api/auth/face", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ descriptor: Array.from(descriptor) }),
            });

            if (res.ok) {
                setStep(null);
                setFaceStatus("registered");
                toast("Wajah berhasil didaftarkan! Verifikasi biometrik kini aktif.", "success");
                closeModal();
            } else {
                const data = await res.json();
                reportClientError("FaceRegistration", "Server tolak simpan biometrik", data);
                setModalMessage({ type: "error", text: data.error || "Gagal menyimpan data biometrik wajah." });
                setStep("ready");
            }
        } catch (err) {
            reportClientError("FaceRegistration", "Error saat registrasi wajah", err);
            setModalMessage({ type: "error", text: "Terjadi kesalahan saat memproses data wajah. Silakan coba lagi." });
            setStep("ready");
        } finally {
            setFaceProcessing(false);
        }
    }, [closeModal, toast]);

    const deleteFace = useCallback(() => {
        confirm({
            title: "Hapus Data Wajah?",
            message: "Data biometrik wajah Anda akan dihapus. Anda harus mendaftarkan wajah kembali untuk melakukan absensi biometrik.",
            confirmLabel: "Ya, Hapus Data",
            cancelLabel: "Batal",
            variant: "danger",
            onConfirm: async () => {
                setFaceProcessing(true);
                try {
                    const res = await fetch("/api/auth/face", { method: "DELETE" });
                    if (!res.ok) throw new Error("Gagal menghapus data wajah.");

                    setFaceStatus("not_registered");
                    toast("Data biometrik wajah berhasil dihapus.", "info");
                } catch (err) {
                    reportClientError("FaceRegistration", "Gagal hapus data wajah", err);
                    toast("Gagal menghapus data biometrik wajah.", "error");
                } finally {
                    setFaceProcessing(false);
                }
            },
        });
    }, [confirm, toast]);

    return (
        <>
            {/* ── Main Settings Card ── */}
            <div className="card">
                {/* Header */}
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

                        {/* Status Badge */}
                        {faceStatus === "loading" && (
                            <span className="inline-flex items-center gap-1.5 border border-[var(--border)] bg-[var(--secondary)] text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Memeriksa
                            </span>
                        )}
                        {faceStatus === "registered" && (
                            <span className="inline-flex items-center gap-1.5 border border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0">
                                <CheckCircle className="w-3 h-3" />
                                Terdaftar
                            </span>
                        )}
                        {faceStatus === "not_registered" && (
                            <span className="inline-flex items-center gap-1.5 border border-[var(--border)] bg-[var(--secondary)] text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0">
                                Belum Terdaftar
                            </span>
                        )}
                        {faceStatus === "error" && (
                            <span className="inline-flex items-center gap-1.5 border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 text-[var(--destructive)] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0">
                                <AlertCircle className="w-3 h-3" />
                                Error
                            </span>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                    {/* Status Loading */}
                    {faceStatus === "loading" && (
                        <div className="flex items-center justify-center py-6 gap-2 text-xs text-[var(--text-muted)]">
                            <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                            <span>Memeriksa status registrasi biometrik...</span>
                        </div>
                    )}

                    {/* Status Banners */}
                    {faceStatus === "registered" && (
                        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl space-y-2">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 dark:bg-emerald-400/10 flex items-center justify-center shrink-0">
                                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">Biometrik Wajah Aktif</h3>
                                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400/90">Data biometrik Anda telah tersimpan. Sistem akan mencocokkan wajah saat melakukan absensi.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {faceStatus === "not_registered" && (
                        <div className="p-3.5 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-xl space-y-2">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center shrink-0">
                                    <ScanFace className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-xs font-semibold text-blue-900 dark:text-blue-200">Wajah Belum Terdaftar</h3>
                                    <p className="text-[11px] text-blue-700 dark:text-blue-400/90">Daftarkan wajah Anda sekarang untuk mengaktifkan fitur verifikasi kehadiran otomatis.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                        {faceStatus === "not_registered" && (
                            <button
                                onClick={openCameraModal}
                                disabled={modelsLoading}
                                className="btn btn-primary flex-1 flex items-center justify-center gap-1.5"
                            >
                                <Camera className="w-4 h-4" />
                                Daftarkan Wajah
                            </button>
                        )}

                        {faceStatus === "registered" && (
                            <div className="flex gap-2 w-full">
                                <button
                                    onClick={openCameraModal}
                                    disabled={modelsLoading || faceProcessing}
                                    className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Perbarui Wajah
                                </button>
                                <button
                                    onClick={deleteFace}
                                    disabled={faceProcessing}
                                    className="btn btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 flex-1 flex items-center justify-center gap-1.5"
                                >
                                    {faceProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    Hapus Wajah
                                </button>
                            </div>
                        )}

                        {faceStatus === "error" && (
                            <button
                                onClick={checkFaceStatus}
                                className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Cek Ulang Status
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Camera Registration Modal Popup (Z-[99999] Topmost Layer) ── */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-[fadeIn_0.15s_ease]">
                    <div
                        className="relative w-full max-w-sm max-h-[92vh] bg-[var(--card)] rounded-3xl overflow-hidden shadow-2xl border border-[var(--border)] flex flex-col animate-[scaleIn_0.2s_ease]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="p-3.5 sm:p-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center shrink-0">
                                    <ScanFace className="w-4 h-4 text-[var(--accent-foreground)]" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-xs font-bold text-[var(--text-primary)] truncate">Pendaftaran Wajah</h3>
                                    <p className="text-[10px] text-[var(--text-muted)]">Posisikan wajah di dalam oval</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                                {faceStreaming && (
                                    <button
                                        type="button"
                                        onClick={() => setIsMirrored((prev) => !prev)}
                                        className="p-1.5 rounded-lg bg-[var(--secondary)] hover:bg-[var(--accent)] text-[var(--text-secondary)] transition-colors"
                                        title={isMirrored ? "Matikan Cermin" : "Aktifkan Cermin"}
                                    >
                                        <FlipHorizontal className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    disabled={faceProcessing}
                                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--secondary)] transition-colors"
                                    title="Tutup dialog"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Camera Viewport (Portrait 3:4) */}
                        <div className="relative aspect-[3/4] max-h-[52vh] bg-black overflow-hidden select-none shrink-0">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className={`w-full h-full object-cover transition-opacity duration-300 ${
                                    faceStreaming ? "opacity-100" : "opacity-0"
                                }`}
                                style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
                            />


                            {/* Loading Camera / Models Overlay */}
                            {!faceStreaming && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--card)] text-[var(--text-primary)]">
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                                        <ScanFace className="w-6 h-6 text-primary absolute inset-0 m-auto opacity-80" />
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)] text-center px-4">
                                        {step === "models" ? "Menyiapkan modul AI biometrik wajah..." : "Mengaktifkan kamera..."}
                                    </p>
                                </div>
                            )}

                            {/* Oval Frame Guide & Scan Animation */}
                            {faceStreaming && (
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                    {/* Dark vignette outside oval */}
                                    <div className="absolute inset-0 bg-black/25" />

                                    {/* Responsive Oval */}
                                    <div className={`relative w-44 h-60 rounded-[50%] border-2 transition-all duration-300 bg-transparent ${
                                        step === "detecting"
                                            ? "border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.6)]"
                                            : step === "saving"
                                                ? "border-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.6)]"
                                                : "border-white/90 shadow-[0_0_20px_rgba(255,255,255,0.4)]"
                                    }`}>
                                        {(step === "detecting" || step === "saving") && (
                                            <div
                                                className="absolute inset-x-4 top-0 h-0.5 animate-[scanLine_1.5s_ease-in-out_infinite] will-change-transform"
                                                style={{ background: "linear-gradient(90deg, transparent, #fbbf24, transparent)" }}
                                            />
                                        )}
                                    </div>

                                    {/* Distance / Lighting Tip */}
                                    <div className="absolute bottom-2.5 left-0 right-0 flex justify-center px-4">
                                        <span className="text-[10px] font-semibold px-3 py-1 rounded-full bg-black/60 text-white backdrop-blur-sm border border-white/10 shadow-sm text-center">
                                            {step === "detecting"
                                                ? "Memindai wajah... Tahan posisi"
                                                : step === "saving"
                                                    ? "Menyimpan ke server..."
                                                    : "Jarak ideal ±30-40 cm | Hadap cahaya"}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer / Feedback & Actions */}
                        <div className="p-3.5 sm:p-4 bg-[var(--card)] space-y-3 shrink-0">
                            {/* In-Modal Alert Message */}
                            {modalMessage && (
                                <div
                                    className={`flex items-start gap-2 p-2.5 rounded-xl text-xs border ${
                                        modalMessage.type === "success"
                                            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
                                            : modalMessage.type === "error"
                                                ? "border-[var(--destructive)]/30 bg-[var(--destructive)]/10 text-[var(--destructive)]"
                                                : "border-[var(--border)] bg-[var(--secondary)] text-[var(--text-secondary)]"
                                    }`}
                                    role={modalMessage.type === "error" ? "alert" : "status"}
                                >
                                    {modalMessage.type === "success" ? (
                                        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                                    ) : modalMessage.type === "error" ? (
                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--destructive)]" />
                                    ) : (
                                        <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin text-[var(--primary)]" />
                                    )}
                                    <span className="leading-relaxed font-medium">{modalMessage.text}</span>
                                </div>
                            )}

                            {/* Buttons */}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    disabled={faceProcessing}
                                    className="btn btn-secondary px-4 text-xs font-semibold"
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={registerFace}
                                    disabled={!faceStreaming || faceProcessing || step === "detecting" || step === "saving"}
                                    className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5"
                                >
                                    {faceProcessing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <ScanFace className="w-4 h-4" />
                                    )}
                                    {step === "detecting"
                                        ? "Memindai..."
                                        : step === "saving"
                                            ? "Menyimpan..."
                                            : "Scan & Simpan"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
