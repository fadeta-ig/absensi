"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
    Settings, Lock, Eye, EyeOff, Loader2, CheckCircle,
    AlertCircle, ShieldCheck, Camera, ScanFace, Trash2, Video, RefreshCw
} from "lucide-react";
import { createClientLogger } from "@/lib/clientLogger";

const log = createClientLogger("SettingsPage");

export default function SettingsPage() {
    // ── Password State ──
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // ── Face Registration State ──
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [faceStatus, setFaceStatus] = useState<"loading" | "registered" | "not_registered">("loading");
    const [faceStreaming, setFaceStreaming] = useState(false);
    const [faceProcessing, setFaceProcessing] = useState(false);
    const [faceMessage, setFaceMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [modelsLoading, setModelsLoading] = useState(false);
    // Step: null=idle, 'models'=loading AI, 'camera'=starting cam, 'detecting'=scanning, 'saving'=saving
    const [step, setStep] = useState<null | "models" | "camera" | "ready" | "detecting" | "saving" | "done">(null);

    // ── Check face registration status ──
    useEffect(() => {
        log.debug("Mengecek status registrasi wajah...");
        fetch("/api/auth/face")
            .then((r) => r.json())
            .then((data) => {
                const status = data.hasFace ? "registered" : "not_registered";
                setFaceStatus(status);
                log.info("Status wajah", { hasFace: data.hasFace, status });
            })
            .catch((err) => {
                log.error("Gagal cek status wajah", { error: String(err) });
                setFaceStatus("not_registered");
            });
    }, []);

    // ── Load face-api models lazily ──
    const ensureModelsLoaded = useCallback(async () => {
        if (modelsLoaded) return true;
        setModelsLoading(true);
        setStep("models");
        setFaceMessage({ type: "info", text: "Memuat model AI deteksi wajah..." });
        try {
            const { loadFaceModels } = await import("@/lib/faceRecognition");
            await loadFaceModels();
            setModelsLoaded(true);
            return true;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            log.error("Gagal load model AI", { error: errMsg });
            setFaceMessage({ type: "error", text: "Gagal memuat model AI. Coba refresh halaman." });
            setStep(null);
            return false;
        } finally {
            setModelsLoading(false);
        }
    }, [modelsLoaded]);

    // ── Camera Controls ──
    const startFaceCamera = useCallback(async () => {
        setFaceMessage(null);
        const loaded = await ensureModelsLoaded();
        if (!loaded) return;

        setStep("camera");
        setFaceMessage({ type: "info", text: "Mengaktifkan kamera..." });

        if (!navigator.mediaDevices?.getUserMedia) {
            const msg = "Browser tidak mendukung kamera atau halaman tidak HTTPS.";
            log.error(msg, { protocol: window.location.protocol });
            setFaceMessage({ type: "error", text: msg });
            setStep(null);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: 640, height: 480 },
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play()
                        .then(() => {
                            setFaceStreaming(true);
                            setStep("ready");
                            setFaceMessage({ type: "info", text: "Posisikan wajah di dalam lingkaran, lalu tekan Scan & Simpan." });
                        })
                        .catch(() => {
                            setFaceStreaming(true);
                            setStep("ready");
                            setFaceMessage({ type: "info", text: "Posisikan wajah di dalam lingkaran, lalu tekan Scan & Simpan." });
                        });
                };
                setTimeout(() => {
                    if (!faceStreaming && videoRef.current?.readyState && videoRef.current.readyState >= 1) {
                        setFaceStreaming(true);
                        setStep("ready");
                        setFaceMessage({ type: "info", text: "Posisikan wajah di dalam lingkaran, lalu tekan Scan & Simpan." });
                    }
                }, 5000);
            }
        } catch (err) {
            const errName = err instanceof Error ? err.name : "UnknownError";
            const errMsg = err instanceof Error ? err.message : String(err);
            log.error("Gagal mengakses kamera", { errorName: errName, error: errMsg });
            setFaceMessage({ type: "error", text: `Gagal akses kamera: ${errName}. Berikan izin kamera pada browser.` });
            setStep(null);
        }
    }, [ensureModelsLoaded, faceStreaming]);

    const stopFaceCamera = useCallback(() => {
        if (videoRef.current?.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
            videoRef.current.srcObject = null;
            videoRef.current.onloadedmetadata = null;
            setFaceStreaming(false);
            setStep(null);
            setFaceMessage(null);
        }
    }, []);

    // ── Capture & Register Face ──
    const registerFace = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current) return;

        const vid = videoRef.current;
        if (vid.videoWidth === 0 || vid.videoHeight === 0) {
            log.warn("Video frame belum siap saat scan registrasi", { readyState: vid.readyState });
        }

        setFaceProcessing(true);
        setStep("detecting");
        setFaceMessage({ type: "info", text: "🔍 Mendeteksi wajah... Tetap diam sebentar." });

        try {
            const { detectFaceDescriptor } = await import("@/lib/faceRecognition");
            const descriptor = await detectFaceDescriptor(vid);

            if (!descriptor) {
                setFaceMessage({ type: "error", text: "Wajah tidak terdeteksi. Pastikan wajah terlihat jelas dan pencahayaan cukup." });
                setStep("ready");
                setFaceProcessing(false);
                return;
            }

            setStep("saving");
            setFaceMessage({ type: "info", text: "💾 Menyimpan data wajah ke server..." });

            const res = await fetch("/api/auth/face", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ descriptor: Array.from(descriptor) }),
            });

            if (res.ok) {
                setStep("done");
                setFaceStatus("registered");
                setFaceMessage({ type: "success", text: "✅ Wajah berhasil didaftarkan!" });
                stopFaceCamera();
            } else {
                const data = await res.json();
                log.error("Server tolak simpan descriptor", { httpStatus: res.status, error: data.error });
                setFaceMessage({ type: "error", text: data.error || "Gagal menyimpan data wajah" });
                setStep("ready");
            }
        } catch (err) {
            log.error("Error saat registrasi wajah", { error: err instanceof Error ? err.message : String(err) });
            setFaceMessage({ type: "error", text: "Terjadi kesalahan saat memproses wajah. Coba lagi." });
            setStep("ready");
        } finally {
            setFaceProcessing(false);
        }
    }, [stopFaceCamera]);

    // ── Delete Face ──
    const deleteFace = useCallback(async () => {
        log.info("Menghapus data wajah...");
        setFaceProcessing(true);
        try {
            const res = await fetch("/api/auth/face", { method: "DELETE" });
            if (res.ok) {
                log.info("Data wajah berhasil dihapus");
                setFaceStatus("not_registered");
                setFaceMessage({ type: "success", text: "Data wajah berhasil dihapus" });
            } else {
                log.error("Server gagal hapus wajah", { status: res.status });
                setFaceMessage({ type: "error", text: "Gagal menghapus data wajah" });
            }
        } catch (err) {
            log.error("Error hapus wajah", { error: String(err) });
            setFaceMessage({ type: "error", text: "Gagal menghapus data wajah" });
        } finally {
            setFaceProcessing(false);
        }
    }, []);

    // ── Password Handlers ──
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (newPassword.length < 8) {
            setMessage({ type: "error", text: "Password baru minimal 8 karakter" });
            return;
        }
        if (newPassword !== confirmPassword) {
            setMessage({ type: "error", text: "Konfirmasi password tidak cocok" });
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();

            if (res.ok) {
                setMessage({ type: "success", text: "Password berhasil diubah!" });
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
            } else {
                setMessage({ type: "error", text: data.error || "Gagal mengubah password" });
            }
        } catch {
            setMessage({ type: "error", text: "Terjadi kesalahan koneksi" });
        }
        setLoading(false);
    };

    const passwordStrength = (pw: string) => {
        if (pw.length === 0) return null;
        if (pw.length < 8) return { label: "Lemah", color: "bg-red-400", width: "w-1/4" };
        if (pw.length < 12) return { label: "Cukup", color: "bg-yellow-400", width: "w-2/4" };
        if (/[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) return { label: "Kuat", color: "bg-green-500", width: "w-full" };
        return { label: "Baik", color: "bg-blue-400", width: "w-3/4" };
    };

    const strength = passwordStrength(newPassword);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease] pb-20 lg:pb-0">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Settings className="w-5 h-5 text-[var(--primary)]" />
                    Pengaturan
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Kelola akun dan keamanan Anda</p>
            </div>

            {/* ═══ Face Registration Card ═══ */}
            <div className="card">
                <div className="p-4 border-b border-[var(--border)]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                <ScanFace className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Registrasi Wajah</h2>
                                <p className="text-xs text-[var(--text-muted)]">Verifikasi identitas saat absensi</p>
                            </div>
                        </div>
                        {faceStatus === "loading" ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
                        ) : (
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                                faceStatus === "registered" ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-600"
                            }`}>
                                {faceStatus === "registered" ? "✅ Terdaftar" : "⚠️ Belum"}
                            </span>
                        )}
                    </div>
                </div>

                <div className="p-4 space-y-4">

                    {/* ── Step Progress Indicator ── */}
                    {step !== null && step !== "done" && (
                        <div className="flex items-center gap-1 text-[10px] font-medium">
                            {(["models", "camera", "ready", "detecting", "saving"] as const).map((s, i) => {
                                const labels: Record<string, string> = {
                                    models: "Muat AI", camera: "Kamera", ready: "Siap", detecting: "Scan", saving: "Simpan"
                                };
                                const steps = ["models", "camera", "ready", "detecting", "saving"];
                                const currentIdx = steps.indexOf(step ?? "");
                                const isDone = i < currentIdx;
                                const isActive = s === step;
                                return (
                                    <>
                                        <div key={s} className={`flex items-center gap-1 px-2 py-1 rounded-full transition-all ${
                                            isActive ? "bg-blue-100 text-blue-700" :
                                            isDone ? "bg-green-100 text-green-700" :
                                            "bg-gray-100 text-gray-400"
                                        }`}>
                                            {isDone ? <CheckCircle className="w-3 h-3" /> :
                                             isActive ? <Loader2 className="w-3 h-3 animate-spin" /> :
                                             <span className="w-3 h-3 rounded-full border border-current inline-block" />}
                                            {labels[s]}
                                        </div>
                                        {i < 4 && <div className={`flex-1 h-px ${ i < currentIdx ? "bg-green-400" : "bg-gray-200" }`} />}
                                    </>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Status Message ── */}
                    {faceMessage && (
                        <div className={`flex items-start gap-2 p-3 rounded-lg text-sm border transition-all ${
                            faceMessage.type === "success" ? "bg-green-50 text-green-700 border-green-200"
                            : faceMessage.type === "error" ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                            {faceMessage.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                : faceMessage.type === "error" ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                : <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" />}
                            <span>{faceMessage.text}</span>
                        </div>
                    )}

                    {/* ── Camera View ── */}
                    {(faceStreaming || step === "models" || step === "camera") && (
                        <div className="relative aspect-[4/3] bg-gray-900 rounded-xl overflow-hidden">
                            {/* Video element — selalu di DOM saat stream aktif */}
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className={`w-full h-full object-cover transition-opacity duration-300 ${
                                    faceStreaming ? "opacity-100" : "opacity-0"
                                }`}
                            />

                            {/* Loading overlay — tampil saat model/kamera belum siap */}
                            {!faceStreaming && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900">
                                    <div className="relative">
                                        <div className="w-16 h-16 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                                        <ScanFace className="w-6 h-6 text-blue-400 absolute inset-0 m-auto" />
                                    </div>
                                    <p className="text-xs text-gray-400">
                                        {step === "models" ? "Memuat model AI deteksi wajah..." : "Mengaktifkan kamera..."}
                                    </p>
                                </div>
                            )}

                            {/* Face oval guide + scan animation */}
                            {faceStreaming && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    {/* Dark overlay with oval cutout */}
                                    <div className="w-44 h-56 rounded-[50%] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] relative">
                                        {/* Animated border */}
                                        <div className={`absolute inset-0 rounded-[50%] border-2 transition-colors duration-500 ${
                                            step === "detecting" ? "border-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.6)]" :
                                            step === "saving" ? "border-green-400 shadow-[0_0_12px_rgba(74,222,128,0.6)]" :
                                            "border-blue-400/70"
                                        }`} />
                                        {/* Scanning line animation */}
                                        {(step === "detecting" || step === "saving") && (
                                            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-yellow-300 to-transparent animate-[scanLine_1.5s_ease-in-out_infinite]" />
                                        )}
                                    </div>
                                    {/* Label below oval */}
                                    <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                                        <span className={`text-[11px] font-semibold px-3 py-1 rounded-full backdrop-blur-sm ${
                                            step === "detecting" ? "bg-yellow-400/20 text-yellow-200" :
                                            step === "saving" ? "bg-green-400/20 text-green-200" :
                                            "bg-black/30 text-white/70"
                                        }`}>
                                            {step === "detecting" ? "🔍 Mendeteksi wajah..." :
                                             step === "saving" ? "💾 Menyimpan..." :
                                             "Posisikan wajah di tengah"}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Hidden canvas for capture */}
                            <canvas ref={canvasRef} className="hidden" />
                        </div>
                    )}

                    {/* ── Action Buttons ── */}
                    <div className="flex gap-2">
                        {faceStatus === "not_registered" && !faceStreaming && step === null && (
                            <button
                                onClick={startFaceCamera}
                                disabled={modelsLoading}
                                className="btn btn-primary flex-1"
                            >
                                <Camera className="w-4 h-4" />
                                Daftarkan Wajah
                            </button>
                        )}

                        {faceStreaming && (
                            <>
                                <button
                                    onClick={registerFace}
                                    disabled={faceProcessing}
                                    className="btn btn-primary flex-1"
                                >
                                    {faceProcessing
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <ScanFace className="w-4 h-4" />}
                                    {step === "detecting" ? "Mendeteksi..." :
                                     step === "saving" ? "Menyimpan..." :
                                     "Scan & Simpan"}
                                </button>
                                <button
                                    onClick={stopFaceCamera}
                                    disabled={faceProcessing}
                                    className="btn btn-secondary"
                                    title="Batalkan"
                                >
                                    Batal
                                </button>
                            </>
                        )}

                        {faceStatus === "registered" && !faceStreaming && step === null && (
                            <div className="flex gap-2 w-full">
                                <button
                                    onClick={startFaceCamera}
                                    disabled={modelsLoading}
                                    className="btn btn-secondary flex-1"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Perbarui Wajah
                                </button>
                                <button
                                    onClick={deleteFace}
                                    disabled={faceProcessing}
                                    className="btn btn-secondary text-red-600 hover:bg-red-50 flex-1"
                                >
                                    {faceProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    Hapus
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── Static info text (idle states) ── */}
                    {faceStatus === "not_registered" && step === null && (
                        <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-lg border border-orange-200">
                            <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-orange-700">
                                Daftarkan wajah Anda untuk meningkatkan keamanan absensi.
                                Pastikan <strong>pencahayaan cukup</strong> dan wajah terlihat jelas di kamera.
                            </p>
                        </div>
                    )}
                    {faceStatus === "registered" && step === null && (
                        <div className="flex items-start gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                            <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-green-700">
                                Wajah Anda telah terdaftar. Sistem akan memverifikasi identitas saat absensi.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ Change Password Card ═══ */}
            <div className="card">
                <div className="p-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                            <ShieldCheck className="w-4 h-4 text-[var(--primary)]" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Ubah Password</h2>
                            <p className="text-xs text-[var(--text-muted)]">Perbarui password akun Anda</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {message && (
                        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${message.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                            {message.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                            {message.text}
                        </div>
                    )}

                    <div className="form-group !mb-0">
                        <label className="form-label">
                            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Password Saat Ini</span>
                        </label>
                        <div className="relative">
                            <input
                                type={showCurrent ? "text" : "password"}
                                className="form-input pr-10"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="Masukkan password saat ini"
                                required
                            />
                            <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label">
                            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Password Baru</span>
                        </label>
                        <div className="relative">
                            <input
                                type={showNew ? "text" : "password"}
                                className="form-input pr-10"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Minimal 8 karakter"
                                required
                                minLength={8}
                            />
                            <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {strength && (
                            <div className="mt-2">
                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${strength.color} ${strength.width} rounded-full transition-all duration-300`} />
                                </div>
                                <p className="text-[10px] text-[var(--text-muted)] mt-1">Kekuatan: {strength.label}</p>
                            </div>
                        )}
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label">
                            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Konfirmasi Password Baru</span>
                        </label>
                        <input
                            type="password"
                            className="form-input"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Ulangi password baru"
                            required
                            minLength={8}
                        />
                        {confirmPassword && newPassword !== confirmPassword && (
                            <p className="text-[10px] text-red-500 mt-1">Password tidak cocok</p>
                        )}
                    </div>

                    <button type="submit" className="btn btn-primary w-full" disabled={loading || !currentPassword || !newPassword || newPassword !== confirmPassword}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Ubah Password
                    </button>
                </form>
            </div>
        </div>
    );
}
