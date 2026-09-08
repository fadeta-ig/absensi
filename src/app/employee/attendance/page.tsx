"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
    Camera, MapPin, Clock, CheckCircle, AlertCircle, Loader2,
    Video, VideoOff, ShieldCheck, ShieldAlert, Wifi, WifiOff, FlipHorizontal, RefreshCw, SwitchCamera
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

    const [streaming, setStreaming] = useState(false);
    const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
    const [isMirrored, setIsMirrored] = useState(true);
    const [photo, setPhoto] = useState<string | null>(null);
    const [gpsInfo, setGpsInfo] = useState<GpsInfo | null>(null);
    const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
    const [isNetworkChecking, setIsNetworkChecking] = useState(true);
    const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
    const [message, setMessage] = useState("");
    const [todayRecord, setTodayRecord] = useState<{ clockIn?: string; clockOut?: string } | null>(null);

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
        }
    }, []);

    useEffect(() => {
        void checkNetworkStatus();
        void checkGpsStatus();

        // Fetch today's attendance record
        fetch("/api/attendance")
            .then(async (r) => {
                if (!r.ok) throw new Error(await getResponseErrorMessage(r, "Gagal memuat data absensi hari ini."));
                return r.json();
            })
            .then((data) => {
                const today = new Date().toISOString().split("T")[0];
                const found = data.find((a: { date: string }) => a.date === today);
                if (found) setTodayRecord(found);
            })
            .catch((err) => {
                const message = err instanceof Error ? err.message : "Gagal memuat data absensi hari ini.";
                reportClientError("AttendancePage", "Gagal memuat data absensi hari ini", err);
                setStatus("error");
                setMessage(message);
                toast(message, "error");
            });
    }, [toast, checkNetworkStatus, checkGpsStatus]);

    const startCamera = useCallback(async (modeOverride?: "user" | "environment") => {
        if (!navigator.mediaDevices?.getUserMedia) {
            const errMsg = "Browser tidak mendukung camera API atau halaman tidak menggunakan HTTPS.";
            log.error(errMsg, { protocol: window.location.protocol });
            setMessage(errMsg);
            return;
        }

        const mode = (typeof modeOverride === "string") ? modeOverride : facingMode;

        try {
            if (videoRef.current?.srcObject) {
                (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play()
                        .then(() => setStreaming(true))
                        .catch(() => setStreaming(true));
                };
                setTimeout(() => {
                    if (!streaming && videoRef.current?.readyState && videoRef.current.readyState >= 1) {
                        setStreaming(true);
                    }
                }, 5000);
            }
        } catch (err) {
            const errName = err instanceof Error ? err.name : "UnknownError";
            reportClientError("AttendancePage", "Gagal mengakses kamera", err, { errorName: errName });
            setMessage(`Gagal mengakses kamera: ${errName}. Berikan izin akses kamera.`);
        }
    }, [facingMode, streaming]);

    const toggleFacingMode = useCallback(() => {
        const nextMode = facingMode === "user" ? "environment" : "user";
        setFacingMode(nextMode);
        setIsMirrored(nextMode === "user");
        void startCamera(nextMode);
    }, [facingMode, startCamera]);

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
        const vid = videoRef.current;
        const canvas = canvasRef.current;

        // Downsample ke max dimensi 480px untuk menghemat storage 92% (~30KB per foto)
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

    const submitAttendance = useCallback(async () => {
        if (!photo) {
            setMessage("Silakan ambil foto selfie kehadiran terlebih dahulu.");
            return;
        }

        const isBypass = networkInfo?.bypassLocation ?? false;

        // Validasi Wi-Fi Kantor
        if (!isBypass && (!networkInfo || !networkInfo.isOfficeWifi)) {
            const err = `Anda harus terhubung ke Wi-Fi resmi kantor WIG (IP saat ini: ${networkInfo?.clientIp || "unknown"}).`;
            setMessage(err);
            toast(err, "error");
            return;
        }

        // Validasi GPS
        if (!isBypass && (!gpsInfo || !gpsInfo.isValid)) {
            const err = "Lokasi GPS tidak valid. Pastikan GPS aktif dan berada di area kantor.";
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
                const errorMessage = await getResponseErrorMessage(res, "Gagal melakukan absensi");
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
            reportClientError("AttendancePage", "Koneksi error saat submit absensi", err);
            setStatus("error");
            const errText = "Absensi belum terkirim karena kendala koneksi. Coba lagi.";
            toast(errText, "error");
            setMessage(errText);
        }
    }, [photo, gpsInfo, networkInfo, router, toast]);

    const isClockIn = !todayRecord?.clockIn;
    const isClockOut = todayRecord?.clockIn && !todayRecord?.clockOut;
    const isDone = todayRecord?.clockIn && todayRecord?.clockOut;

    const isBypass = networkInfo?.bypassLocation ?? false;
    const isNetworkOk = isBypass || (networkInfo?.isOfficeWifi ?? false);
    const isGpsOk = isBypass || (gpsInfo?.isValid ?? false);
    const canSubmit = photo && isNetworkOk && isGpsOk && status !== "submitting";

    return (
        <div className="space-y-4 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Camera className="w-5 h-5 text-[var(--primary)]" />
                    Absensi Kehadiran
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Verifikasi kehadiran via Wi-Fi Kantor & GPS</p>
            </div>

            {/* ── Status Bar: Wi-Fi Kantor & GPS ── */}
            <div className="grid grid-cols-2 gap-2.5">
                {/* Wi-Fi Status */}
                <div className={`flex items-center gap-2 p-3 rounded-2xl text-xs font-semibold border transition-all ${
                    isNetworkChecking
                        ? "bg-[var(--secondary)] text-[var(--text-secondary)] border-[var(--border)]"
                        : isNetworkOk
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800"
                            : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800"
                }`}>
                    {isNetworkChecking ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0 text-[var(--primary)]" />
                    ) : isNetworkOk ? (
                        <Wifi className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                        <WifiOff className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <div className="min-w-0 flex-1">
                        <span className="block truncate">
                            {isNetworkChecking
                                ? "Memeriksa Wi-Fi..."
                                : isNetworkOk
                                    ? isBypass ? "Bypass Jaringan Aktif" : "Wi-Fi Kantor WIG"
                                    : "Bukan Wi-Fi Kantor"}
                        </span>
                        {!isNetworkChecking && (
                            <span className="text-[10px] opacity-75 block truncate">
                                {networkInfo?.clientIp || "IP tidak terdeteksi"}
                            </span>
                        )}
                    </div>
                </div>

                {/* GPS Status */}
                <div className={`flex items-center gap-2 p-3 rounded-2xl text-xs font-semibold border transition-all ${
                    !gpsInfo
                        ? "bg-[var(--secondary)] text-[var(--text-secondary)] border-[var(--border)]"
                        : isGpsOk
                            ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800"
                            : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800"
                }`}>
                    {!gpsInfo ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0 text-[var(--primary)]" />
                    ) : isGpsOk ? (
                        <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                        <ShieldAlert className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <div className="min-w-0 flex-1">
                        <span className="block truncate">
                            {!gpsInfo
                                ? "Mencari GPS..."
                                : isGpsOk
                                    ? isBypass ? "Bypass GPS Aktif" : `GPS Valid (±${Math.round(gpsInfo.accuracy)}m)`
                                    : "GPS Tidak Valid"}
                        </span>
                        {gpsInfo && (
                            <span className="text-[10px] opacity-75 block truncate">
                                {`${gpsInfo.lat.toFixed(4)}, ${gpsInfo.lng.toFixed(4)}`}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Warning jika bukan Wi-Fi Kantor */}
            {!isNetworkChecking && !isNetworkOk && (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                    <div className="flex items-center justify-between">
                        <p className="font-bold flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                            Gunakan Wi-Fi Kantor WIG
                        </p>
                        <button
                            type="button"
                            onClick={checkNetworkStatus}
                            className="text-[11px] font-bold text-[var(--primary)] hover:underline flex items-center gap-1"
                        >
                            <RefreshCw className="w-3 h-3" /> Cek Ulang
                        </button>
                    </div>
                    <p className="text-[11px] leading-relaxed opacity-90">
                        Perangkat Anda terdeteksi menggunakan paket data seluler atau jaringan luar (IP: {networkInfo?.clientIp || "-"}). Hubungkan HP Anda ke Wi-Fi kantor WIG untuk dapat melakukan absensi.
                    </p>
                </div>
            )}

            {/* GPS Warnings */}
            {gpsInfo && gpsInfo.warnings.length > 0 && (
                <div className={`p-3 rounded-2xl space-y-1 border text-xs ${
                    gpsInfo.isValid
                        ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
                        : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                }`}>
                    {gpsInfo.warnings.map((w, i) => (
                        <p key={i} className="flex items-start gap-1.5 leading-relaxed">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            {w}
                        </p>
                    ))}
                </div>
            )}

            {/* ── Status Banner Selesai ── */}
            {isDone && (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl">
                    <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Absensi Hari Ini Selesai</p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                            Clock In: {todayRecord?.clockIn ? new Date(todayRecord.clockIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                            {" • "}
                            Clock Out: {todayRecord?.clockOut ? new Date(todayRecord.clockOut).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                        </p>
                    </div>
                </div>
            )}

            {/* ── Kamera & Form Absensi ── */}
            {!isDone && (
                <div className="card overflow-hidden">
                    <div className="relative w-full aspect-[4/3] sm:aspect-video bg-black text-white rounded-t-2xl overflow-hidden">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover ${streaming ? "block" : "hidden"}`}
                            style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
                        />

                        {streaming && (
                            <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={toggleFacingMode}
                                    className="px-2.5 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 text-white text-[11px] font-medium flex items-center gap-1.5 backdrop-blur-md transition-all border border-white/20 shadow-sm"
                                    title="Ganti Kamera Depan / Belakang"
                                >
                                    <SwitchCamera className="w-3.5 h-3.5" />
                                    <span>{facingMode === "user" ? "Kamera Depan" : "Kamera Belakang"}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsMirrored((prev) => !prev)}
                                    className="p-1.5 rounded-xl bg-black/60 hover:bg-black/80 text-white text-[11px] font-medium flex items-center backdrop-blur-md transition-all border border-white/20 shadow-sm"
                                    title="Klik untuk membalik cermin kamera"
                                >
                                    <FlipHorizontal className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}

                        {!streaming && !photo && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/60 p-4 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                                    <Camera className="w-7 h-7 text-white/80" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white">Kamera Belum Aktif</p>
                                    <p className="text-xs text-white/60 mt-0.5">Aktifkan kamera untuk mengambil foto selfie kehadiran</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void startCamera()}
                                    className="btn btn-primary text-xs py-2.5 px-4 font-bold shadow-lg"
                                >
                                    <Camera className="w-4 h-4" /> Buka Kamera
                                </button>
                            </div>
                        )}

                        {photo && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={photo}
                                alt="Foto Absensi"
                                className="w-full h-full object-cover"
                                style={{ transform: isMirrored ? "scaleX(-1)" : "none" }}
                            />
                        )}

                        {streaming && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                                <div className="w-48 h-64 border-2 border-white/40 rounded-[50%] shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
                            </div>
                        )}

                        <canvas ref={canvasRef} className="hidden" />
                    </div>

                    <div className="p-4 space-y-3">
                        {/* Tombol Kontrol Kamera */}
                        <div className="flex gap-2">
                            {streaming ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={capturePhoto}
                                        className="btn btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold shadow-md"
                                    >
                                        <Camera className="w-4 h-4" />
                                        Jepret Foto
                                    </button>
                                    <button
                                        type="button"
                                        onClick={stopCamera}
                                        className="btn btn-secondary px-3.5 py-3"
                                        title="Tutup Kamera"
                                    >
                                        <VideoOff className="w-4 h-4" />
                                    </button>
                                </>
                            ) : photo ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => { setPhoto(null); void startCamera(); }}
                                        disabled={status === "submitting"}
                                        className="btn btn-secondary flex-1 py-3 text-xs font-semibold"
                                    >
                                        Foto Ulang
                                    </button>
                                    <button
                                        type="button"
                                        onClick={submitAttendance}
                                        disabled={!canSubmit}
                                        className={`btn btn-primary flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold shadow-md ${
                                            !canSubmit ? "opacity-60 cursor-not-allowed" : ""
                                        }`}
                                    >
                                        {status === "submitting" ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Mengirim...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="w-4 h-4" />
                                                {isClockIn ? "Kirim Clock In" : isClockOut ? "Kirim Clock Out" : "Kirim Absensi"}
                                            </>
                                        )}
                                    </button>
                                </>
                            ) : null}
                        </div>

                        {/* Info Footer Waktu & Koordinat */}
                        <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pt-1 border-t border-[var(--border)]">
                            <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5" />
                                {gpsInfo ? `${gpsInfo.lat.toFixed(4)}, ${gpsInfo.lng.toFixed(4)}` : "Mencari GPS..."}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Notifikasi / Error Message */}
            {message && (
                <div className={`flex items-start gap-2.5 p-3.5 rounded-2xl text-xs leading-relaxed border ${
                    status === "success"
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                        : status === "error"
                            ? "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800"
                            : "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                }`}>
                    {status === "success" ? (
                        <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                    ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                    )}
                    <span>{message}</span>
                </div>
            )}
        </div>
    );
}
