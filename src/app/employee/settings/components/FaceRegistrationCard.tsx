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
    Upload,
    X,
} from "lucide-react";
import { createClientLogger } from "@/lib/clientLogger";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

const log = createClientLogger("FaceRegistration");

type FaceStatus = "loading" | "registered" | "not_registered" | "error";
type AnalysisState = "idle" | "analyzing" | "valid" | "invalid" | "saving";

export function FaceRegistrationCard() {
    const confirm = useConfirm();
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    // Membuka kamera native HP
    const triggerNativeCamera = useCallback(() => {
        setErrorMessage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
            fileInputRef.current.click();
        }
    }, []);

    // Proses analisis foto setelah diambil dari kamera native
    const processCapturedImage = useCallback(async (imageSrc: string) => {
        setSelectedImageSrc(imageSrc);
        setIsModalOpen(true);
        setAnalysisState("analyzing");
        setErrorMessage(null);
        setDetectedDescriptor(null);

        try {
            // 1. Muat modul AI biometrik
            const { loadFaceModels, detectFaceDescriptor } = await import("@/lib/faceRecognition");
            await loadFaceModels();

            // 2. Decode dan resize foto ke dimensi optimal (max 800px)
            // Foto native HP berukuran 12MP-48MP (4000x3000) yang jika tidak di-resize
            // akan menyebabkan WebGL crash / Out of Memory di browser HP.
            const scaledCanvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const maxDim = 800;
                    let { width, height } = img;
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, width);
                    canvas.height = Math.max(1, height);
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        reject(new Error("Canvas context error"));
                        return;
                    }
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas);
                };
                img.onerror = () => reject(new Error("Gagal membaca file foto."));
                // JANGAN pasang crossOrigin untuk Base64 data: URI karena memicu hang di Chrome Android
                img.src = imageSrc;
            });

            // 3. Jalankan deteksi wajah pada foto teroptimasi
            const descriptor = await detectFaceDescriptor(scaledCanvas);

            if (descriptor) {
                setDetectedDescriptor(descriptor);
                setAnalysisState("valid");
            } else {
                setAnalysisState("invalid");
                setErrorMessage("Wajah tidak terdeteksi pada foto. Pastikan wajah menghadap lurus ke kamera dengan pencahayaan terang.");
            }
        } catch (err) {
            reportClientError("FaceRegistration", "Error saat memproses foto", err);
            setAnalysisState("invalid");
            setErrorMessage("Terjadi kesalahan saat menganalisis foto. Silakan coba ambil foto kembali.");
        }
    }, []);

    // Handler saat foto selesai diambil dari kamera HP
    const handleFileChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result;
                if (typeof result === "string") {
                    void processCapturedImage(result);
                }
            };
            reader.readAsDataURL(file);
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
        setIsModalOpen(false);
        setSelectedImageSrc(null);
        setDetectedDescriptor(null);
        setAnalysisState("idle");
        setErrorMessage(null);
    }, [analysisState]);

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
            {isModalOpen && selectedImageSrc && (
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
                            {/* Static Captured Image */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={selectedImageSrc}
                                alt="Foto Wajah"
                                className="w-full h-full object-cover"
                            />

                            {/* Guideline Frame Overlay */}
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                <div className="absolute inset-0 bg-black/20" />

                                <div
                                    className={`relative w-44 h-60 rounded-[50%] border-2 transition-all duration-300 ${
                                        analysisState === "valid"
                                            ? "border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.7)]"
                                            : analysisState === "invalid"
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

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={triggerNativeCamera}
                                    disabled={analysisState === "saving" || analysisState === "analyzing"}
                                    className="btn btn-secondary flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5"
                                >
                                    <Camera className="w-3.5 h-3.5" />
                                    Ambil Ulang
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
