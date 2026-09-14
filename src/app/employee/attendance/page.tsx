"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
    Camera, MapPin, Clock, CheckCircle2, AlertCircle, Loader2,
    Wifi, WifiOff, FlipHorizontal, RotateCcw, SwitchCamera,
    ArrowRight, VideoOff, RefreshCw
} from "lucide-react";
import { createClientLogger } from "@/lib/clientLogger";
import { useToast } from "@/components/Toast";
import { useRouter } from "next/navigation";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

const log = createClientLogger("AttendancePage");

interface GpsInfo {
    lat: number;
    lng: number;
    accuracy: number;
    isValid: boolean;
    warnings: string[];
}

interface NetworkInfo {
    isOfficeWifi: boolean;
    clientIp: string;
    bypassLocation: boolean;
    networkName: string;
}

export default function AttendancePage() {
    const toast = useToast();
    const router = useRouter();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Camera & interaction state
    const [streaming, setStreaming] = useState(false);
    const [isCameraLoading, setIsCameraLoading] = useState(true);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
    const [isMirrored, setIsMirrored] = useState(true);
    const [photo, setPhoto] = useState<string | null>(null);

    // Verification state (Wi-Fi & GPS)
    const [gpsInfo, setGpsInfo] = useState<GpsInfo | null>(null);
    const [isGpsChecking, setIsGpsChecking] = useState(true);
    const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
    const [isNetworkChecking, setIsNetworkChecking] = useState(true);

    // Submission & attendance record
    const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
    const [message, setMessage] = useState("");
    const [todayRecord, setTodayRecord] = useState<{ clockIn?: string; clockOut?: string } | null>(null);
    const [currentTime, setCurrentTime] = useState<string>("");

    // Live WIB Clock
    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        };
        updateClock();
        const interval = setInterval(updateClock, 1000);
        return () => clearInterval(interval);
    }, []);

    // ── 1. Fetch Network Status (Wi-Fi Kantor) ──
    const checkNetworkStatus = useCallback(async () => {
        setIsNetworkChecking(true);
        try {
            const res = await fetch("/api/attendance/network");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memeriksa status jaringan"));
            const data: NetworkInfo = await res.json();
            setNetworkInfo(data);
            if (!data.isOfficeWifi && !data.bypassLocation) {
                log.warn("Karyawan tidak terhubung ke Wi-Fi kantor", { ip: data.clientIp });
            }
        } catch (err) {
            reportClientError("AttendancePage", "Gagal memeriksa status jaringan", err);
        } finally {
            setIsNetworkChecking(false);
        }
    }, []);

    // ── 2. Fetch GPS with Validation ──
    const checkGpsStatus = useCallback(async () => {
        setIsGpsChecking(true);
        try {
            const { getValidatedPosition } = await import("@/lib/gpsValidator");
            const { position, validation } = await getValidatedPosition();
            setGpsInfo({
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
                isValid: validation.isValid,
                warnings: validation.warnings,
            });
            if (!validation.isValid) {
                log.warn("GPS tidak valid", { warnings: validation.warnings });
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            reportClientError("AttendancePage", "Gagal mendapatkan lokasi GPS", err);
            setMessage(errMsg || "Gagal mendapatkan lokasi. Aktifkan GPS pada perangkat Anda.");
        } finally {
            setIsGpsChecking(false);
        }
    }, []);

    // ── 3. Stop Active Camera Stream ──
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
            videoRef.current.onloadedmetadata = null;
        }
        setStreaming(false);
        setIsCameraLoading(false);
    }, []);

    // ── 4. Start Camera Stream (Auto-start) ──
    const startCamera = useCallback(async (modeOverride?: "user" | "environment") => {
        if (!navigator.mediaDevices?.getUserMedia) {
            const errMsg = "Browser tidak mendukung Camera API atau belum menggunakan protokol HTTPS.";
            log.error(errMsg, { protocol: window.location.protocol });
            setCameraError(errMsg);
            setIsCameraLoading(false);
            return;
        }

        const mode = modeOverride || facingMode;
        setIsCameraLoading(true);
        setCameraError(null);

        // Stop existing tracks first
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: mode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            });

            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play()
                        .then(() => {
                            setStreaming(true);
                            setIsCameraLoading(false);
                        })
                        .catch(() => {
                            setStreaming(true);
                            setIsCameraLoading(false);
                        });
                };
            }
        } catch (err) {
            const errName = err instanceof Error ? err.name : "CameraError";
            reportClientError("AttendancePage", "Gagal mengakses kamera", err, { errorName: errName });
            if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
                setCameraError("Akses kamera ditolak. Berikan izin akses kamera di browser Anda.");
            } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
                setCameraError("Kamera tidak ditemukan pada perangkat ini.");
            } else {
                setCameraError("Gagal membuka kamera perangkat. Pastikan kamera tidak sedang dipakai aplikasi lain.");
            }
            setStreaming(false);
            setIsCameraLoading(false);
        }
    }, [facingMode]);

    // ── 5. Switch Camera (Front/Back) ──
    const toggleFacingMode = useCallback(() => {
        const nextMode = facingMode === "user" ? "environment" : "user";
        setFacingMode(nextMode);
        setIsMirrored(nextMode === "user");
        void startCamera(nextMode);
    }, [facingMode, startCamera]);

    // ── 6. Initial Mount: Load Record, Network, GPS, & Auto-Start Camera ──
    useEffect(() => {
        void checkNetworkStatus();
        void checkGpsStatus();

        // Fetch today's attendance record
        fetch("/api/attendance")
            .then(async (r) => {
                if (!r.ok) throw new Error(await getResponseErrorMessage(r, "Gagal memuat data presensi hari ini."));
                return r.json();
            })
            .then((data) => {
                const today = new Date().toISOString().split("T")[0];
                const found = data.find((a: { date: string }) => a.date === today);
                if (found) {
                    setTodayRecord(found);
                    if (found.clockIn && found.clockOut) {
                        return; // Done for today
                    }
                }
                void startCamera();
            })
            .catch((err) => {
                const errMsg = err instanceof Error ? err.message : "Gagal memuat data presensi hari ini.";
                reportClientError("AttendancePage", "Gagal memuat data presensi hari ini", err);
                setMessage(errMsg);
                void startCamera();
            });

        // Cleanup: stop tracks when leaving page
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
            }
        };
    }, [checkNetworkStatus, checkGpsStatus, startCamera]);

    // ── 7. Capture Photo (Client-Side Downsampling to 480px) ──
    const capturePhoto = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const vid = videoRef.current;
        const canvas = canvasRef.current;

        const srcWidth = vid.videoWidth || 640;
        const srcHeight = vid.videoHeight || 480;
        const maxDim = 480;

        let targetWidth = srcWidth;
        let targetHeight = srcHeight;
        if (srcWidth > maxDim || srcHeight > maxDim) {
            if (srcWidth > srcHeight) {
                targetWidth = maxDim;
                targetHeight = Math.round((srcHeight * maxDim) / srcWidth);
            } else {
                targetHeight = maxDim;
                targetWidth = Math.round((srcWidth * maxDim) / srcHeight);
            }
        }

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            toast("Gagal mengambil foto dari kamera.", "error");
            return;
        }

        ctx.drawImage(vid, 0, 0, targetWidth, targetHeight);
        const photoData = canvas.toDataURL("image/jpeg", 0.72);
        setPhoto(photoData);
        stopCamera();
    }, [stopCamera, toast]);

    // ── 8. Retake Photo ──
    const retakePhoto = useCallback(() => {
        setPhoto(null);
        void startCamera();
    }, [startCamera]);

    // ── 9. Submit Attendance ──
    const submitAttendance = useCallback(async () => {
        if (!photo) {
            setMessage("Silakan ambil foto bukti presensi terlebih dahulu.");
            return;
        }

        const isBypass = networkInfo?.bypassLocation ?? false;

        // Validasi Wi-Fi Kantor
        if (!isBypass && (!networkInfo || !networkInfo.isOfficeWifi)) {
            const err = `Anda wajib terhubung ke Wi-Fi resmi kantor WIG (IP: ${networkInfo?.clientIp || "tidak terdeteksi"}).`;
            setMessage(err);
            toast(err, "error");
            return;
        }

        // Validasi GPS
        if (!isBypass && (!gpsInfo || !gpsInfo.isValid)) {
            const err = "Lokasi GPS tidak valid. Pastikan GPS aktif dan berada di radius kantor.";
            setMessage(err);
            toast(err, "error");
            return;
        }

        setStatus("submitting");
        setMessage("");

        try {
            const res = await fetch("/api/attendance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    photo,
                    location: gpsInfo ? { lat: gpsInfo.lat, lng: gpsInfo.lng } : undefined,
                }),
            });

            if (!res.ok) {
                const errorMessage = await getResponseErrorMessage(res, "Gagal melakukan presensi");
                setStatus("error");
                toast(errorMessage, "error");
                setMessage(errorMessage);
                return;
            }

            const data = await res.json();
            setStatus("success");
            setTodayRecord(data);
            if (data.clockOut) {
                toast("Clock Out berhasil! Selamat beristirahat.", "success");
            } else {
                toast("Clock In berhasil! Selamat bekerja.", "success");
            }
            setTimeout(() => router.push("/employee"), 1500);
        } catch (err) {
            reportClientError("AttendancePage", "Koneksi error saat submit presensi", err);
            setStatus("error");
            const errText = "Presensi belum terkirim karena kendala koneksi. Coba lagi.";
            toast(errText, "error");
            setMessage(errText);
        }
    }, [photo, gpsInfo, networkInfo, router, toast]);

    const isClockIn = !todayRecord?.clockIn;
    const isClockOut = Boolean(todayRecord?.clockIn && !todayRecord?.clockOut);
    const isDone = Boolean(todayRecord?.clockIn && todayRecord?.clockOut);

    const isBypass = networkInfo?.bypassLocation ?? false;
    const isNetworkOk = isBypass || (networkInfo?.isOfficeWifi ?? false);
    const isGpsOk = isBypass || (gpsInfo?.isValid ?? false);
    const canSubmit = Boolean(photo && isNetworkOk && isGpsOk && status !== "submitting");

    // Has blocker warning?
    const hasNetworkBlocker = !isNetworkChecking && !isNetworkOk;
    const hasGpsBlocker = !isGpsChecking && !isGpsOk;

    return (
        <div className="w-full max-w-md mx-auto space-y-3 animate-[fadeIn_0.25s_ease]">
            {/* ── Tampilan Selesai Jika Kehadiran Sudah Lengkap ── */}
            {isDone ? (
                <div className="card p-6 text-center space-y-5 rounded-3xl shadow-sm border border-[var(--border)] bg-[var(--card)]">
                    <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                        <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[var(--text-primary)]">Presensi Hari Ini Selesai</h2>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            Anda telah menyelesaikan Clock In dan Clock Out untuk hari ini.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-[var(--secondary)] rounded-2xl border border-[var(--border)] text-left">
                        <div className="space-y-0.5">
                            <span className="text-[10px] text-[var(--text-muted)] font-medium">Jam Masuk (In)</span>
                            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                {todayRecord?.clockIn
                                    ? new Date(todayRecord.clockIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
                                    : "-"} WIB
                            </p>
                        </div>
                        <div className="space-y-0.5">
                            <span className="text-[10px] text-[var(--text-muted)] font-medium">Jam Pulang (Out)</span>
                            <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                {todayRecord?.clockOut
                                    ? new Date(todayRecord.clockOut).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
                                    : "-"} WIB
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => router.push("/employee/attendance-history")}
                            className="btn btn-secondary flex-1 py-3 text-xs font-semibold rounded-2xl"
                        >
                            Lihat Riwayat
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push("/employee")}
                            className="btn btn-primary flex-1 py-3 text-xs font-bold rounded-2xl"
                        >
                            Ke Beranda
                        </button>
                    </div>
                </div>
            ) : (
                /* ── Layar Utama Presensi (Kamera Bersih, Tanpa Biometrik Palsu, Satu Layar Penuh) ── */
                <div className="space-y-2.5">
                    {/* Viewfinder Card */}
                    <div className="relative w-full aspect-[3/4] sm:aspect-[4/5] rounded-3xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-2xl flex flex-col justify-between select-none">
                        
                        {/* Video Live Stream (Clean, Unobstructed) */}
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                                streaming && !photo ? "opacity-100" : "opacity-0"
                            }`}
                            style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
                        />

                        {/* Foto Hasil Jepretan (Preview) */}
                        {photo && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={photo}
                                alt="Foto Presensi"
                                className="absolute inset-0 w-full h-full object-cover"
                                style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
                            />
                        )}

                        {/* Subtle Corner Framing Markers (Clean Camera Framing) */}
                        {streaming && !photo && (
                            <div className="absolute inset-4 pointer-events-none z-10">
                                <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-white/40 rounded-tl-lg" />
                                <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-white/40 rounded-tr-lg" />
                                <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-white/40 rounded-bl-lg" />
                                <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-white/40 rounded-br-lg" />
                            </div>
                        )}

                        {/* Loading Spinner saat Kamera Menyiapkan Stream */}
                        {isCameraLoading && !photo && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-white/80 p-4 text-center z-20 bg-zinc-950/80 backdrop-blur-sm">
                                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
                                <p className="text-xs font-semibold text-white tracking-wide">Menyiapkan Kamera...</p>
                            </div>
                        )}

                        {/* Fallback jika Kamera Gagal / Izin Ditolak */}
                        {cameraError && !streaming && !photo && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white p-6 text-center z-20 bg-zinc-950/95">
                                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                                    <VideoOff className="w-6 h-6" />
                                </div>
                                <div className="max-w-xs space-y-1">
                                    <p className="text-sm font-bold text-white">Kamera Tidak Tersedia</p>
                                    <p className="text-xs text-zinc-400 leading-relaxed">{cameraError}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void startCamera()}
                                    className="btn btn-primary text-xs py-2.5 px-5 font-bold rounded-2xl shadow-lg flex items-center gap-2"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Coba Lagi
                                </button>
                            </div>
                        )}

                        {/* ── 1. Smart Integrated Top HUD Bar ── */}
                        <div className="relative z-20 m-3 p-2 px-3 rounded-2xl bg-black/45 backdrop-blur-md border border-white/10 flex items-center justify-between shadow-lg">
                            {/* Kiri: Action Badge (Clock In / Clock Out) & Waktu Live */}
                            <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-xl text-[11px] font-extrabold bg-[var(--primary)] text-white shadow-sm tracking-wide">
                                    {isClockIn ? "CLOCK IN" : "CLOCK OUT"}
                                </span>
                                {currentTime && (
                                    <span className="text-[11px] font-medium text-white/90 flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-white/60" />
                                        {currentTime}
                                    </span>
                                )}
                            </div>

                            {/* Kanan: Live Status Chips (Wi-Fi & GPS) */}
                            <div className="flex items-center gap-1.5">
                                {/* Wi-Fi Chip */}
                                <div
                                    title={isNetworkOk ? "Terhubung ke jaringan resmi" : "Belum terhubung ke Wi-Fi kantor"}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-semibold border ${
                                        isNetworkChecking
                                            ? "bg-white/10 text-zinc-300 border-white/10"
                                            : isNetworkOk
                                                ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                                                : "bg-rose-950/80 text-rose-300 border-rose-500/40"
                                    }`}
                                >
                                    {isNetworkChecking ? (
                                        <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                                    ) : isNetworkOk ? (
                                        <Wifi className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                        <WifiOff className="w-3 h-3 text-rose-400" />
                                    )}
                                    <span>{isNetworkOk ? "Wi-Fi" : "No Wi-Fi"}</span>
                                </div>

                                {/* GPS Chip */}
                                <div
                                    title={isGpsOk ? `Akurasi GPS: ±${Math.round(gpsInfo?.accuracy || 0)}m` : "GPS di luar area"}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-semibold border ${
                                        isGpsChecking
                                            ? "bg-white/10 text-zinc-300 border-white/10"
                                            : isGpsOk
                                                ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                                                : "bg-rose-950/80 text-rose-300 border-rose-500/40"
                                    }`}
                                >
                                    {isGpsChecking ? (
                                        <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                                    ) : isGpsOk ? (
                                        <MapPin className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                        <AlertCircle className="w-3 h-3 text-rose-400" />
                                    )}
                                    <span>{isGpsOk ? "GPS" : "No GPS"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Hidden Canvas untuk Kompresi Foto */}
                        <canvas ref={canvasRef} className="hidden" />

                        {/* ── 2. Bottom Floating Control Deck ── */}
                        <div className="relative z-20 bg-gradient-to-t from-black/85 via-black/45 to-transparent pt-6 pb-4 px-4">
                            {!photo ? (
                                /* Live Camera Controls: Swap Camera + Shutter + Mirror */
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-full flex items-center justify-around px-4">
                                        {/* Swap Camera Depan/Belakang (Thumb Accessible) */}
                                        <button
                                            type="button"
                                            onClick={toggleFacingMode}
                                            disabled={isCameraLoading}
                                            className="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white flex items-center justify-center backdrop-blur-md border border-white/20 shadow-md transition-all cursor-pointer"
                                            title="Putar Kamera (Depan/Belakang)"
                                        >
                                            <SwitchCamera className="w-5 h-5" />
                                        </button>

                                        {/* Large Shutter Button */}
                                        <button
                                            type="button"
                                            onClick={capturePhoto}
                                            disabled={!streaming}
                                            className="w-18 h-18 rounded-full border-4 border-white/90 p-1 flex items-center justify-center transition-all duration-200 active:scale-90 shadow-2xl bg-black/40 backdrop-blur-sm cursor-pointer disabled:opacity-40 group"
                                            title="Jepret Foto"
                                        >
                                            <div className="w-full h-full rounded-full bg-[var(--primary)] group-hover:brightness-110 flex items-center justify-center text-white transition-all shadow-inner">
                                                <Camera className="w-7 h-7 drop-shadow" />
                                            </div>
                                        </button>

                                        {/* Mirror Toggle */}
                                        <button
                                            type="button"
                                            onClick={() => setIsMirrored((prev) => !prev)}
                                            disabled={facingMode !== "user"}
                                            className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${
                                                facingMode === "user"
                                                    ? "bg-white/15 hover:bg-white/25 active:scale-95 text-white border-white/20 shadow-md cursor-pointer"
                                                    : "bg-white/5 text-white/30 border-white/10 cursor-not-allowed"
                                            }`}
                                            title="Balik Cermin"
                                        >
                                            <FlipHorizontal className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <span className="text-[10px] text-white/70 font-medium tracking-wide">
                                        {facingMode === "user" ? "Foto selfie atau putar kamera untuk foto lokasi" : "Foto lokasi kerja"}
                                    </span>
                                </div>
                            ) : (
                                /* Post-Capture Action Bar (Ulang & Kirim) */
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={retakePhoto}
                                            disabled={status === "submitting"}
                                            className="btn btn-secondary py-3 px-4 text-xs font-semibold rounded-2xl flex items-center justify-center gap-1.5 bg-white/20 hover:bg-white/30 text-white border border-white/25 backdrop-blur-md active:scale-95 transition-all"
                                        >
                                            <RotateCcw className="w-4 h-4" />
                                            <span>Foto Ulang</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={submitAttendance}
                                            disabled={!canSubmit}
                                            className={`btn btn-primary flex-1 py-3 px-4 text-xs font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all ${
                                                !canSubmit ? "opacity-50 cursor-not-allowed" : "hover:brightness-105 active:scale-98"
                                            }`}
                                        >
                                            {status === "submitting" ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    <span>Mengirim...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span>{isClockIn ? "Kirim Clock In" : isClockOut ? "Kirim Clock Out" : "Kirim Presensi"}</span>
                                                    <ArrowRight className="w-4 h-4" />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Single Contextual Alert: Hanya Muncul Jika Ada Kendala Validasi ── */}
                    {hasNetworkBlocker && (
                        <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2 shadow-sm">
                            <div className="flex items-center gap-2 min-w-0">
                                <WifiOff className="w-4 h-4 shrink-0 text-amber-600" />
                                <span className="truncate">Gunakan Wi-Fi kantor WIG untuk presensi</span>
                            </div>
                            <button
                                type="button"
                                onClick={checkNetworkStatus}
                                className="text-[11px] font-bold text-[var(--primary)] hover:underline shrink-0 flex items-center gap-1"
                            >
                                <RefreshCw className="w-3 h-3" /> Cek
                            </button>
                        </div>
                    )}

                    {!hasNetworkBlocker && hasGpsBlocker && (
                        <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 text-xs text-red-800 dark:text-red-300 flex items-center justify-between gap-2 shadow-sm">
                            <div className="flex items-center gap-2 min-w-0">
                                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                                <span className="truncate">Lokasi GPS belum sesuai radius kantor</span>
                            </div>
                            <button
                                type="button"
                                onClick={checkGpsStatus}
                                className="text-[11px] font-bold text-[var(--primary)] hover:underline shrink-0 flex items-center gap-1"
                            >
                                <RefreshCw className="w-3 h-3" /> Cek
                            </button>
                        </div>
                    )}

                    {/* Error Feedback Message jika request gagal */}
                    {message && status === "error" && (
                        <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 text-xs text-red-800 dark:text-red-300 flex items-center gap-2 shadow-sm">
                            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                            <span className="flex-1">{message}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
