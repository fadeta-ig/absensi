"use client";

import { useState, useRef, useCallback, useEffect, memo } from "react";
import {
    Camera, MapPin, Clock, CheckCircle2, AlertCircle, Loader2,
    Wifi, WifiOff, FlipHorizontal, RotateCcw, SwitchCamera,
    ArrowRight, VideoOff, RefreshCw, CalendarClock
} from "lucide-react";
import { createClientLogger } from "@/lib/clientLogger";
import { useToast } from "@/components/Toast";
import { useRouter } from "next/navigation";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { useAttendanceServerContext } from "@/hooks/useAttendanceServerContext";

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
    isOffDay?: boolean;
    shiftName?: string | null;
    todaySchedule?: { startTime: string; endTime: string; isOff: boolean } | null;
}

function formatWibTime(value?: string | null): string {
    if (!value) return "--:--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--:--";
    return new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(date);
}

/**
 * Jam live HUD: komponen kecil terisolasi agar tick per detik
 * tidak me-render ulang seluruh halaman (termasuk video kamera).
 */
const HudClock = memo(function HudClock({ serverWibNow }: { serverWibNow?: string | null }) {
    const formatLiveTime = useCallback((milliseconds: number) => new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(new Date(milliseconds)), []);
    const serverMs = serverWibNow ? new Date(serverWibNow).getTime() : Number.NaN;
    const [time, setTime] = useState<string | null>(() => Number.isNaN(serverMs) ? null : formatLiveTime(serverMs));
    useEffect(() => {
        if (Number.isNaN(serverMs)) return;
        const perfMs = performance.now();
        const update = () => {
            const elapsed = Math.max(0, performance.now() - perfMs);
            setTime(formatLiveTime(serverMs + elapsed));
        };
        const timer = window.setInterval(update, 1000);
        return () => window.clearInterval(timer);
    }, [formatLiveTime, serverMs]);
    if (!time) return null;
    return (
        <span className="text-[11px] font-medium text-white/90 flex items-center gap-1">
            <Clock className="w-3 h-3 text-white/60" />
            {time} WIB
        </span>
    );
});

export default function AttendancePage() {
    const toast = useToast();
    const router = useRouter();
    const serverContext = useAttendanceServerContext();
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const facingModeRef = useRef<"user" | "environment">("user");

    // Camera & interaction state
    const [streaming, setStreaming] = useState(false);
    const [isCameraLoading, setIsCameraLoading] = useState(true);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
    const [isMirrored, setIsMirrored] = useState(true);
    const [photo, setPhoto] = useState<string | null>(null);
    // Blob mentah untuk upload multipart 1-step (preview di atas boleh dataURL).
    const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);

    // Verification state (Wi-Fi & GPS)
    const [gpsInfo, setGpsInfo] = useState<GpsInfo | null>(null);
    const [isGpsChecking, setIsGpsChecking] = useState(true);
    const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
    const [isNetworkChecking, setIsNetworkChecking] = useState(true);

    // Off-day attendance reason state
    const [offDayReason, setOffDayReason] = useState("");

    // Submission & attendance record
    const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
    const [message, setMessage] = useState("");
    const [todayRecord, setTodayRecord] = useState<{ clockIn?: string; clockOut?: string } | null>(null);
    const submitLockRef = useRef(false);
    const redirectTimerRef = useRef<number | null>(null);
    const shiftDate = serverContext.context?.shiftDate;

    useEffect(() => {
        if (!serverContext.context) return;
        setNetworkInfo(serverContext.context);
        setIsNetworkChecking(false);
        if (!serverContext.context.isOfficeWifi && !serverContext.context.bypassLocation) {
            log.warn("Karyawan tidak terhubung ke Wi-Fi kantor", { ip: serverContext.context.clientIp });
        }
    }, [serverContext.context]);

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
            setStatus("error");
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

        const mode = modeOverride || facingModeRef.current;
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
                            stream.getTracks().forEach((track) => track.stop());
                            if (streamRef.current === stream) streamRef.current = null;
                            setCameraError("Kamera ditemukan tetapi gagal menampilkan gambar. Tutup aplikasi lain yang memakai kamera lalu coba lagi.");
                            setStreaming(false);
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
    }, []);

    // ── 5. Switch Camera (Front/Back) ──
    const toggleFacingMode = useCallback(() => {
        const nextMode = facingMode === "user" ? "environment" : "user";
        facingModeRef.current = nextMode;
        setFacingMode(nextMode);
        setIsMirrored(nextMode === "user");
        void startCamera(nextMode);
    }, [facingMode, startCamera]);

    useEffect(() => {
        void checkGpsStatus();
    }, [checkGpsStatus]);

    useEffect(() => {
        if (shiftDate || serverContext.loading) return;
        void startCamera();
    }, [serverContext.loading, shiftDate, startCamera]);

    // ── 6. Load the server-selected record & Auto-Start Camera ──
    useEffect(() => {
        if (!shiftDate) return;

        // Fetch the record selected by the authoritative shift date.
        fetch("/api/attendance")
            .then(async (r) => {
                if (!r.ok) throw new Error(await getResponseErrorMessage(r, "Gagal memuat data presensi hari ini."));
                return r.json();
            })
            .then((data) => {
                if (serverContext.context?.activeMode === "ALREADY_COMPLETED") {
                    const found = data.find((a: { date: string }) => a.date === shiftDate);
                    setTodayRecord(found ?? null);
                    stopCamera();
                    return;
                }
                const found = shiftDate
                    ? data.find((a: { date: string }) => a.date === shiftDate)
                    : undefined;
                if (found) {
                    setTodayRecord(found);
                }
                void startCamera();
            })
            .catch((err) => {
                const errMsg = err instanceof Error ? err.message : "Gagal memuat data presensi hari ini.";
                reportClientError("AttendancePage", "Gagal memuat data presensi hari ini", err);
                setMessage(errMsg);
                if (serverContext.context?.activeMode !== "ALREADY_COMPLETED") void startCamera();
            });

    }, [serverContext.context?.activeMode, shiftDate, startCamera, stopCamera]);

    useEffect(() => () => {
        if (redirectTimerRef.current) window.clearTimeout(redirectTimerRef.current);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    }, []);

    // ── 7. Capture Photo (Client-Side Downsampling to 480px) ──
    // Kirim via Blob multipart (toBlob); dataURL hanya untuk preview <img>.
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
        canvas.toBlob((blob) => {
            if (!blob) {
                toast("Gagal mengambil foto dari kamera.", "error");
                return;
            }
            setPhotoBlob(blob);
            // Preview boleh dataURL; yang dikirim ke server adalah Blob di atas.
            setPhoto(canvas.toDataURL("image/jpeg", 0.72));
            stopCamera();
        }, "image/jpeg", 0.72);
    }, [stopCamera, toast]);

    // ── 8. Retake Photo ──
    const retakePhoto = useCallback(() => {
        setPhoto(null);
        setPhotoBlob(null);
        void startCamera();
    }, [startCamera]);

    // ── 9. Submit Attendance ──
    const submitAttendance = useCallback(async () => {
        if (submitLockRef.current) return;
        if (!serverContext.context || !serverContext.isFresh || !serverContext.isOnline) {
            const err = "Waktu server presensi belum segar. Pastikan Anda online lalu coba lagi.";
            setMessage(err);
            setStatus("error");
            toast(err, "warning");
            return;
        }
        if (!photoBlob) {
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

        const isOffDay = networkInfo?.isOffDay ?? serverContext.context.isOffDay;
        const isClockInAction = serverContext.context.activeMode === "CLOCK_IN";

        if (serverContext.context.activeMode === "ALREADY_COMPLETED") {
            const err = "Presensi untuk shift ini sudah tercatat lengkap. Bila ada kesalahan jam, ajukan koreksi di menu Koreksi Presensi.";
            setMessage(err);
            toast(err, "info");
            return;
        }

        if (isClockInAction && isOffDay) {
            if (!offDayReason || offDayReason.trim().length < 3) {
                const err = "Keperluan/alasan presensi hari libur wajib diisi (minimal 3 karakter).";
                setMessage(err);
                toast(err, "error");
                setStatus("idle");
                return;
            }
        }

        submitLockRef.current = true;
        setStatus("submitting");
        setMessage("");
        let keepLockedForNavigation = false;

        try {
            // Kontrak Gel.2a: multipart FormData 1-step, photo = Blob dari canvas.
            const form = new FormData();
            form.append("action", serverContext.context.activeMode);
            form.append("shiftDate", serverContext.context.shiftDate);
            form.append("photo", photoBlob, "selfie.jpg");
            if (gpsInfo) {
                form.append("location", JSON.stringify({ lat: gpsInfo.lat, lng: gpsInfo.lng, accuracyMeters: gpsInfo.accuracy }));
            }
            if (isClockInAction && isOffDay) form.append("offDayReason", offDayReason.trim());
            const res = await fetch("/api/attendance", {
                method: "POST",
                body: form,
            });

            if (!res.ok) {
                const errorMessage = await getResponseErrorMessage(res, "Gagal melakukan presensi");
                setStatus("error");
                if (res.status === 409) {
                    await serverContext.refresh();
                    const conflictMessage = `${errorMessage} Bila ada kesalahan jam, ajukan koreksi di menu Koreksi Presensi.`;
                    toast(conflictMessage, "warning");
                    setMessage(conflictMessage);
                } else {
                    toast(errorMessage, "error");
                    setMessage(errorMessage);
                }
                return;
            }

            const data = await res.json();
            keepLockedForNavigation = true;
            setStatus("success");
            setTodayRecord(data);
            if (data.clockOut) {
                toast("Clock Out berhasil! Selamat beristirahat.", "success");
            } else {
                toast("Clock In berhasil! Selamat bekerja.", "success");
            }
            redirectTimerRef.current = window.setTimeout(() => {
                try {
                    router.push("/employee");
                } catch (err) {
                    // Navigasi gagal: buka kunci agar user bisa submit ulang/refresh manual.
                    reportClientError("AttendancePage", "Navigasi pasca-presensi gagal", err);
                    submitLockRef.current = false;
                    setStatus("idle");
                    setMessage("Presensi tersimpan, tetapi halaman gagal berpindah. Muat ulang halaman.");
                }
            }, 1500);
        } catch (err) {
            reportClientError("AttendancePage", "Koneksi error saat submit presensi", err);
            setStatus("error");
            const errText = "Presensi belum terkirim karena kendala koneksi. Coba lagi.";
            toast(errText, "error");
            setMessage(errText);
        } finally {
            if (!keepLockedForNavigation) submitLockRef.current = false;
        }
    }, [photoBlob, gpsInfo, networkInfo, offDayReason, router, serverContext, toast]);

    const activeMode = serverContext.context?.activeMode;
    const isClockIn = activeMode === "CLOCK_IN";
    const isClockOut = activeMode === "CLOCK_OUT";
    const isDone = activeMode === "ALREADY_COMPLETED";

    const isBypass = networkInfo?.bypassLocation ?? false;
    const isNetworkOk = isBypass || (networkInfo?.isOfficeWifi ?? false);
    const isGpsOk = isBypass || (gpsInfo?.isValid ?? false);
    const isOffDay = networkInfo?.isOffDay ?? serverContext.context?.isOffDay ?? false;
    const isReasonValid = !isClockIn || !isOffDay || offDayReason.trim().length >= 3;
    const canSubmit = Boolean(photoBlob && isNetworkOk && isGpsOk && isReasonValid && serverContext.context && serverContext.isFresh && serverContext.isOnline && activeMode !== "ALREADY_COMPLETED" && status !== "submitting" && status !== "success");

    // Has blocker warning?
    const hasNetworkBlocker = !isNetworkChecking && !isNetworkOk;
    const hasGpsBlocker = !isGpsChecking && !isGpsOk;

    return (
        <div className="w-full max-w-md mx-auto space-y-3 animate-[fadeIn_0.25s_ease]">
            {(!serverContext.isFresh || !serverContext.isOnline) && (
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3 shadow-sm" role="status">
                    <div className="flex items-start gap-2 min-w-0">
                        <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                            {serverContext.isOnline ? "Konteks server kedaluwarsa." : "Perangkat offline."} Jam server terakhir: {serverContext.displayWibTime ?? "belum tersedia"} WIB. Presensi dinonaktifkan.
                        </span>
                    </div>
                    <button type="button" onClick={() => void serverContext.refresh()} className="font-bold text-[var(--primary)] shrink-0">
                        Coba lagi
                    </button>
                </div>
            )}

            {/* ── Tampilan Selesai Jika Kehadiran Sudah Lengkap ── */}
            {isDone ? (
                <div className="card p-6 text-center space-y-5 rounded-3xl shadow-sm border border-[var(--border)] bg-[var(--card)]">
                    <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                        <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[var(--text-primary)]">Presensi Shift Selesai</h2>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            Tanggal shift {serverContext.context?.shiftDate ?? "-"} telah memiliki Clock In dan Clock Out.
                            Bila ada kesalahan jam, ajukan koreksi di menu Koreksi Presensi.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-3.5 bg-[var(--secondary)] rounded-2xl border border-[var(--border)] text-left">
                        <div className="space-y-0.5">
                            <span className="text-[10px] text-[var(--text-muted)] font-medium">Jam Masuk (In)</span>
                            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                {formatWibTime(todayRecord?.clockIn)} WIB
                            </p>
                        </div>
                        <div className="space-y-0.5">
                            <span className="text-[10px] text-[var(--text-muted)] font-medium">Jam Pulang (Out)</span>
                            <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                {formatWibTime(todayRecord?.clockOut)} WIB
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
                    <div className="card px-4 py-3 rounded-2xl flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)]">Tanggal Shift</p>
                            <p className="text-sm font-bold text-[var(--text-primary)]">{serverContext.context?.shiftDate ?? "Menunggu server..."}</p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                {serverContext.context?.shiftName ?? "Jadwal kerja"}
                                {serverContext.context?.todaySchedule
                                    ? ` · ${serverContext.context.todaySchedule.startTime}-${serverContext.context.todaySchedule.endTime} WIB`
                                    : " · Jadwal tidak tersedia"}
                            </p>
                        </div>
                        {serverContext.context?.isOvernight && (
                            <span className="shrink-0 rounded-full bg-indigo-500/10 px-2.5 py-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-300">
                                Lintas Hari H+1
                            </span>
                        )}
                    </div>

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
                                <span className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold text-white shadow-sm tracking-wide ${
                                    isClockIn && isOffDay ? "bg-amber-600" : "bg-[var(--primary)]"
                                }`}>
                                    {serverContext.loading && !activeMode
                                        ? "MEMUAT"
                                        : isClockIn
                                            ? (isOffDay ? "CLOCK IN (HARI LIBUR)" : "CLOCK IN")
                                            : isOffDay ? "CLOCK OUT (HARI LIBUR)" : "CLOCK OUT"}
                                </span>
                                {serverContext.context?.serverWibNow && (
                                    <HudClock key={serverContext.context.serverWibNow} serverWibNow={serverContext.context.serverWibNow} />
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
                                            className="w-[72px] h-[72px] rounded-full border-4 border-white/90 p-1 flex items-center justify-center transition-all duration-200 active:scale-90 shadow-2xl bg-black/40 backdrop-blur-sm cursor-pointer disabled:opacity-40 group"
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
                                            disabled={status === "submitting" || status === "success"}
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
                                                    <span>
                                                        {isClockIn
                                                            ? (isOffDay ? "Presensi Masuk (Hari Libur)" : "Kirim Clock In")
                                                            : isClockOut
                                                                ? "Kirim Clock Out"
                                                                : "Kirim Presensi"}
                                                    </span>
                                                    <ArrowRight className="w-4 h-4" />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Contextual Off-Day Attendance Banner & Reason Input ── */}
                    {isClockIn && isOffDay && (
                        <div className="p-4 rounded-3xl border border-amber-500/30 bg-amber-500/10 text-[var(--text-primary)] space-y-3 shadow-sm">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                                    <CalendarClock className="w-5 h-5" />
                                </div>
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-xs font-bold text-[var(--text-primary)]">Jadwal Hari Libur</h3>
                                        {networkInfo?.shiftName && (
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                                                {networkInfo.shiftName}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                                        Anda terdeteksi masuk di luar jadwal kerja resmi. Masukkan keperluan/alasan penugasan untuk verifikasi HR.
                                    </p>
                                </div>
                            </div>

                            <div className="pt-0.5">
                                <input
                                    type="text"
                                    value={offDayReason}
                                    onChange={(e) => setOffDayReason(e.target.value)}
                                    placeholder="Contoh: Piket darurat pemeliharaan jaringan"
                                    maxLength={500}
                                    className="w-full px-3.5 py-2.5 rounded-2xl border border-amber-500/30 bg-[var(--card)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all shadow-inner"
                                />
                                {offDayReason.length > 0 && offDayReason.trim().length < 3 && (
                                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                                        Alasan kehadiran minimal 3 karakter.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Single Contextual Alert: Hanya Muncul Jika Ada Kendala Validasi ── */}
                    {hasNetworkBlocker && (
                        <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between gap-2 shadow-sm">
                            <div className="flex items-center gap-2 min-w-0">
                                <WifiOff className="w-4 h-4 shrink-0 text-amber-600" />
                                <span className="truncate">Gunakan Wi-Fi kantor WIG untuk presensi</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => void serverContext.refresh()}
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
