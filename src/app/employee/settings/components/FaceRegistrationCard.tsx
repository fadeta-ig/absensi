"use client";

import { useState, useRef, useCallback, useEffect, ChangeEvent } from "react";
import {
    AlertCircle,
    Camera,
    CheckCircle,
    CheckCircle2,
    Loader2,
    RefreshCw,
    ScanFace,
    ShieldCheck,
    Trash2,
    X,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

type FaceStatus = "loading" | "registered" | "not_registered" | "error";
type AnalysisState = "idle" | "analyzing" | "valid" | "invalid" | "error" | "saving";

const MAX_CAPTURE_BYTES = 25 * 1024 * 1024;
const MAX_ANALYSIS_HEIGHT = 640;
const MODEL_LOAD_TIMEOUT_MS = 20_000;
const DETECTION_TIMEOUT_MS = 20_000;

class FaceAnalysisTimeoutError extends Error {
    constructor(stage: string) {
        super(`${stage} melebihi batas waktu`);
        this.name = "FaceAnalysisTimeoutError";
    }
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, stage: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new FaceAnalysisTimeoutError(stage)), timeoutMs);
        operation.then(
            (value) => {
                window.clearTimeout(timeoutId);
                resolve(value);
            },
            (error: unknown) => {
                window.clearTimeout(timeoutId);
                reject(error);
            }
        );
    });
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    return canvas;
}

async function optimizeCapturedImage(file: File): Promise<HTMLCanvasElement> {
    if (file.size === 0) throw new Error("File foto kosong.");
    if (file.size > MAX_CAPTURE_BYTES) throw new Error("Ukuran foto melebihi 25 MB.");

    if (typeof createImageBitmap === "function") {
        let bitmap: ImageBitmap | null = null;
        try {
            bitmap = await createImageBitmap(file, {
                imageOrientation: "from-image",
                resizeHeight: MAX_ANALYSIS_HEIGHT,
                resizeQuality: "high",
            });
            const canvas = createCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas tidak tersedia pada browser ini.");
            context.drawImage(bitmap, 0, 0);
            return canvas;
        } catch (error) {
            // Safari dan beberapa format kamera tidak mendukung createImageBitmap.
            // Lanjutkan ke decoder Image berbasis object URL di bawah.
            if (!(error instanceof Error)) throw error;
        } finally {
            bitmap?.close();
        }
    }

    return new Promise<HTMLCanvasElement>((resolve, reject) => {
        const imageUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            const scale = Math.min(1, MAX_ANALYSIS_HEIGHT / Math.max(1, image.height));
            const canvas = createCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
            const context = canvas.getContext("2d");
            URL.revokeObjectURL(imageUrl);
            if (!context) {
                reject(new Error("Canvas tidak tersedia pada browser ini."));
                return;
            }
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas);
        };
        image.onerror = () => {
            URL.revokeObjectURL(imageUrl);
            reject(new Error("Format foto tidak dapat dibaca. Gunakan foto JPEG atau PNG dari kamera."));
        };
        image.src = imageUrl;
    });
}

export function FaceRegistrationCard() {
    const confirm = useConfirm();
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const analysisRunRef = useRef(0);

    const [faceStatus, setFaceStatus] = useState<FaceStatus>("loading");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
    const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
    const [detectedDescriptor, setDetectedDescriptor] = useState<Float32Array | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);

    // Cek status pendaftaran saat inisialisasi
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
    }, [checkFaceStatus]);

    const cancelAnalysis = useCallback(() => {
        analysisRunRef.current += 1;
    }, []);

    // Membuka kamera native HP dan membatalkan analisis sebelumnya bila ada.
    const triggerNativeCamera = useCallback(() => {
        cancelAnalysis();
        setErrorMessage(null);
        setDetectedDescriptor(null);
        if (analysisState === "analyzing") setAnalysisState("idle");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
            fileInputRef.current.click();
        }
    }, [analysisState, cancelAnalysis]);

    // Proses analisis foto setelah diambil dari kamera native
    const processCapturedImage = useCallback(async (file: File) => {
        const runId = analysisRunRef.current + 1;
        analysisRunRef.current = runId;
        setIsModalOpen(true);
        setSelectedImageSrc(null);
        setAnalysisState("analyzing");
        setErrorMessage(null);
        setDetectedDescriptor(null);

        try {
            // Ubah foto asli menjadi bitmap kecil sebelum model dan preview memakainya.
            const scaledCanvas = await withTimeout(
                optimizeCapturedImage(file),
                DETECTION_TIMEOUT_MS,
                "Pemrosesan foto"
            );
            if (analysisRunRef.current !== runId) return;
            setSelectedImageSrc(scaledCanvas.toDataURL("image/jpeg", 0.9));

            const { loadFaceModels, detectFaceDescriptorDetailed } = await import("@/lib/faceRecognition");
            await withTimeout(loadFaceModels(), MODEL_LOAD_TIMEOUT_MS, "Pemuatan mesin wajah");
            if (analysisRunRef.current !== runId) return;

            const result = await withTimeout(
                detectFaceDescriptorDetailed(scaledCanvas),
                DETECTION_TIMEOUT_MS,
                "Pemindaian wajah"
            );
            if (analysisRunRef.current !== runId) return;

            if (result.status === "success") {
                setDetectedDescriptor(result.descriptor);
                setAnalysisState("valid");
            } else if (result.status === "not_found") {
                setAnalysisState("invalid");
                setErrorMessage("Wajah tidak terdeteksi pada foto. Pastikan wajah menghadap lurus ke kamera dengan pencahayaan terang.");
            } else {
                reportClientError("FaceRegistration", "Mesin deteksi wajah gagal", result, { stage: result.stage });
                setAnalysisState("error");
                setErrorMessage("Mesin pemindai wajah gagal dijalankan. Coba tutup aplikasi lain, lalu ambil foto ulang atau muat ulang halaman.");
            }
        } catch (err) {
            if (analysisRunRef.current !== runId) return;
            reportClientError("FaceRegistration", "Error saat memproses foto", err);
            setAnalysisState("error");
            setErrorMessage(
                err instanceof FaceAnalysisTimeoutError
                    ? "Pemindaian terlalu lama dan dihentikan agar tidak macet. Coba ambil foto ulang."
                    : err instanceof Error
                        ? err.message
                        : "Terjadi kesalahan saat menganalisis foto. Silakan coba ambil foto kembali."
            );
        }
    }, []);

    // Handler saat foto selesai diambil dari kamera HP
    const handleFileChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            void processCapturedImage(file);
        },
        [processCapturedImage]
    );

    // Simpan data biometrik yang sudah terverifikasi ke server
    const saveBiometricData = useCallback(async () => {
        if (!detectedDescriptor) return;

        setAnalysisState("saving");
        try {
            const res = await fetch("/api/auth/face", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ descriptor: Array.from(detectedDescriptor) }),
            });

            if (res.ok) {
                setFaceStatus("registered");
                setIsModalOpen(false);
                toast("Wajah berhasil didaftarkan! Verifikasi biometrik kini aktif.", "success");
            } else {
                const data = await res.json();
                reportClientError("FaceRegistration", "Server tolak simpan biometrik", data);
                setAnalysisState("valid");
                setErrorMessage(data.error || "Gagal menyimpan data biometrik ke server.");
            }
        } catch (err) {
            reportClientError("FaceRegistration", "Error simpan biometrik", err);
            setAnalysisState("valid");
            setErrorMessage("Koneksi bermasalah saat menyimpan data. Coba simpan kembali.");
        }
    }, [detectedDescriptor, toast]);

    // Hapus data biometrik
    const deleteFace = useCallback(() => {
        confirm({
            title: "Hapus Data Wajah?",
            message: "Data biometrik wajah Anda akan dihapus. Anda harus mendaftarkan foto wajah kembali untuk absensi biometrik.",
            confirmLabel: "Ya, Hapus Data",
            cancelLabel: "Batal",
            variant: "danger",
            onConfirm: async () => {
                setIsActionLoading(true);
                try {
                    const res = await fetch("/api/auth/face", { method: "DELETE" });
                    if (!res.ok) throw new Error("Gagal menghapus data wajah.");

                    setFaceStatus("not_registered");
                    toast("Data biometrik wajah berhasil dihapus.", "info");
                } catch (err) {
                    reportClientError("FaceRegistration", "Gagal hapus data wajah", err);
                    toast("Gagal menghapus data biometrik wajah.", "error");
                } finally {
                    setIsActionLoading(false);
                }
            },
        });
    }, [confirm, toast]);

    const closeModal = useCallback(() => {
        if (analysisState === "saving") return;
        cancelAnalysis();
        setIsModalOpen(false);
        setSelectedImageSrc(null);
        setDetectedDescriptor(null);
        setAnalysisState("idle");
        setErrorMessage(null);
    }, [analysisState, cancelAnalysis]);

    return (
        <>
            {/* Input file kamera native (tersembunyi) */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Ambil foto wajah dengan kamera"
            />

            {/* ── Main Settings Card ── */}
            <div className="card">
                {/* Header */}
                <div className="p-4 border-b border-[var(--border)]">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-[var(--accent)] flex items-center justify-center shrink-0">
                                <ScanFace className="w-5 h-5 text-[var(--accent-foreground)]" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-sm font-bold text-[var(--text-primary)]">Registrasi Wajah</h2>
                                <p className="text-xs text-[var(--text-muted)]">Verifikasi biometrik saat absensi kehadiran</p>
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

                    {/* Status Banner: Terdaftar */}
                    {faceStatus === "registered" && (
                        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl space-y-2">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-400/10 flex items-center justify-center shrink-0 mt-0.5">
                                    <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">Biometrik Wajah Aktif</h3>
                                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400/90 leading-relaxed mt-0.5">
                                        Data biometrik wajah Anda telah tersimpan. Sistem akan mencocokkan wajah Anda secara otomatis saat absensi.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Status Banner: Belum Terdaftar + Panduan Foto */}
                    {faceStatus === "not_registered" && (
                        <div className="space-y-3">
                            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-2xl">
                                <div className="flex items-start gap-2.5">
                                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center shrink-0 mt-0.5">
                                        <ScanFace className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-xs font-bold text-blue-900 dark:text-blue-200">Wajah Belum Terdaftar</h3>
                                        <p className="text-[11px] text-blue-700 dark:text-blue-400/90 leading-relaxed mt-0.5">
                                            Ambil foto selfie wajah Anda dengan kamera HP untuk mengaktifkan verifikasi kehadiran otomatis.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Tips Selfie Jelas */}
                            <div className="p-3.5 bg-[var(--secondary)] rounded-2xl space-y-2 text-[11px] text-[var(--text-secondary)] border border-[var(--border)]">
                                <span className="font-bold text-[var(--text-primary)] block text-xs">Petunjuk Foto Selfie yang Benar:</span>
                                <ul className="space-y-1.5 list-disc list-inside">
                                    <li>Hadapkan wajah lurus menatap kamera.</li>
                                    <li>Pastikan pencahayaan terang dan tidak ada bayangan gelap.</li>
                                    <li>Lepaskan kacamata hitam atau masker saat mengambil foto.</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-1">
                        {faceStatus === "not_registered" && (
                            <button
                                onClick={triggerNativeCamera}
                                className="btn btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold shadow-sm"
                            >
                                <Camera className="w-4 h-4" />
                                Ambil Foto Wajah
                            </button>
                        )}

                        {faceStatus === "registered" && (
                            <div className="flex gap-2 w-full">
                                <button
                                    onClick={triggerNativeCamera}
                                    disabled={isActionLoading}
                                    className="btn btn-secondary flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold"
                                >
                                    <Camera className="w-4 h-4" />
                                    Perbarui Foto
                                </button>
                                <button
                                    onClick={deleteFace}
                                    disabled={isActionLoading}
                                    className="btn btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold"
                                >
                                    {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    Hapus Wajah
                                </button>
                            </div>
                        )}

                        {faceStatus === "error" && (
                            <button
                                onClick={checkFaceStatus}
                                className="btn btn-secondary flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Cek Ulang Status
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Photo Preview & Verification Modal ── */}
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
                                    <h3 className="text-xs font-bold text-[var(--text-primary)] truncate">Verifikasi Foto Wajah</h3>
                                    <p className="text-[10px] text-[var(--text-muted)]">Hasil tangkapan kamera</p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={closeModal}
                                disabled={analysisState === "saving"}
                                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--secondary)] transition-colors"
                                title="Tutup"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Photo Viewport with Verification Overlay */}
                        <div className="relative aspect-[3/4] max-h-[50vh] bg-black overflow-hidden select-none shrink-0 flex items-center justify-center">
                            {selectedImageSrc ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={selectedImageSrc}
                                    alt="Foto Wajah"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="flex items-center gap-2 text-xs text-white/80">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Menyiapkan foto...
                                </div>
                            )}

                            {/* Guideline Frame Overlay */}
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                <div className="absolute inset-0 bg-black/20" />

                                <div
                                    className={`relative w-44 h-60 rounded-[50%] border-2 transition-all duration-300 ${
                                        analysisState === "valid"
                                            ? "border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.7)]"
                                            : analysisState === "invalid" || analysisState === "error"
                                                ? "border-red-400 shadow-[0_0_30px_rgba(248,113,113,0.7)]"
                                                : "border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.6)]"
                                    }`}
                                >
                                    {analysisState === "analyzing" && (
                                        <div
                                            className="absolute inset-x-4 top-0 h-0.5 animate-[scanLine_1.5s_ease-in-out_infinite] will-change-transform"
                                            style={{ background: "linear-gradient(90deg, transparent, #fbbf24, transparent)" }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer & Actions */}
                        <div className="p-4 bg-[var(--card)] space-y-3 shrink-0">
                            {/* State: Analyzing */}
                            {analysisState === "analyzing" && (
                                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[var(--secondary)] border border-[var(--border)] text-xs text-[var(--text-secondary)]">
                                    <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)] shrink-0" />
                                    <span className="font-medium">Menganalisis fitur biometrik wajah...</span>
                                </div>
                            )}

                            {/* State: Valid */}
                            {analysisState === "valid" && (
                                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold">Wajah Berhasil Dikenali!</p>
                                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                                            Kualitas foto sempurna. Klik Simpan Data untuk mengaktifkan biometrik.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* State: Invalid */}
                            {analysisState === "invalid" && (
                                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-xs text-red-800 dark:text-red-300">
                                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold">Wajah Belum Terdeteksi</p>
                                        <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5 leading-relaxed">
                                            {errorMessage || "Pastikan wajah menatap langsung ke kamera dan ruangan cukup terang."}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {analysisState === "error" && (
                                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-xs text-red-800 dark:text-red-300">
                                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold">Pemindaian Tidak Dapat Dilanjutkan</p>
                                        <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5 leading-relaxed">
                                            {errorMessage || "Silakan ambil foto ulang."}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={triggerNativeCamera}
                                    disabled={analysisState === "saving"}
                                    className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5"
                                >
                                    <Camera className="w-3.5 h-3.5" />
                                    {analysisState === "analyzing" ? "Batalkan & Ambil Ulang" : "Ambil Ulang"}
                                </button>

                                {analysisState === "valid" && (
                                    <button
                                        type="button"
                                        onClick={saveBiometricData}
                                        className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 shadow-sm"
                                    >
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        Simpan Biometrik
                                    </button>
                                )}

                                {analysisState === "saving" && (
                                    <button
                                        disabled
                                        className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 opacity-80"
                                    >
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Menyimpan...
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
