"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
    Camera, MapPin, Clock, CheckCircle, AlertCircle, Loader2,
    Video, VideoOff, ShieldCheck, ShieldAlert, ScanFace, AlertTriangle
} from "lucide-react";
import Link from "next/link";

interface FaceVerification {
    status: "idle" | "checking" | "match" | "mismatch" | "no_face" | "not_registered" | "error";
    distance?: number;
    message?: string;
}

interface GpsInfo {
    lat: number;
    lng: number;
    accuracy: number;
    isValid: boolean;
    warnings: string[];
}

export default function AttendancePage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [streaming, setStreaming] = useState(false);
    const [photo, setPhoto] = useState<string | null>(null);
    const [gpsInfo, setGpsInfo] = useState<GpsInfo | null>(null);
    const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
    const [message, setMessage] = useState("");
    const [todayRecord, setTodayRecord] = useState<{ clockIn?: string; clockOut?: string } | null>(null);

    // Face verification state
    const [faceVerification, setFaceVerification] = useState<FaceVerification>({ status: "idle" });
    const [registeredDescriptor, setRegisteredDescriptor] = useState<number[] | null>(null);

    useEffect(() => {
        // Fetch GPS with validation
        (async () => {
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
            } catch (err) {
                setMessage(err instanceof Error ? err.message : "Gagal mendapatkan lokasi. Aktifkan GPS.");
            }
        })();

        // Fetch today's attendance record
        fetch("/api/attendance")
            .then((r) => r.json())
            .then((data) => {
                const today = new Date().toISOString().split("T")[0];
                const found = data.find((a: { date: string }) => a.date === today);
                if (found) setTodayRecord(found);
            });

        // Fetch registered face descriptor
        fetch("/api/auth/face")
            .then((r) => r.json())
            .then((data) => {
                if (data.hasFace && data.descriptor) {
                    setRegisteredDescriptor(data.descriptor);
                }
            });
    }, []);

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: 640, height: 480 },
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setStreaming(true);
            }
        } catch {
            setMessage("Gagal mengakses kamera. Berikan izin kamera.");
        }
    }, []);

    const stopCamera = useCallback(() => {
        if (videoRef.current?.srcObject) {
            const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
            tracks.forEach((t) => t.stop());
            videoRef.current.srcObject = null;
            setStreaming(false);
        }
    }, []);

    const captureAndVerify = useCallback(async () => {
        if (!videoRef.current || !canvasRef.current) return;

        const canvas = canvasRef.current;
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(videoRef.current, 0, 0, 640, 480);
        const photoData = canvas.toDataURL("image/jpeg", 0.8);

        // If no face registered, skip verification
        if (!registeredDescriptor) {
            setPhoto(photoData);
            setFaceVerification({ status: "not_registered", message: "Wajah belum terdaftar. Daftarkan di Pengaturan." });
            stopCamera();
            return;
        }

        // Verify face
        setFaceVerification({ status: "checking", message: "Memverifikasi wajah..." });

        try {
            const { loadFaceModels, detectFaceDescriptor, compareFaces } = await import("@/lib/faceRecognition");
            await loadFaceModels();

            const descriptor = await detectFaceDescriptor(canvas);

            if (!descriptor) {
                setFaceVerification({ status: "no_face", message: "Wajah tidak terdeteksi. Coba ambil foto ulang." });
                return;
            }

            const result = compareFaces(descriptor, registeredDescriptor);

            if (result.match) {
                setPhoto(photoData);
                setFaceVerification({
                    status: "match",
                    distance: result.distance,
                    message: `Identitas terverifikasi (${((1 - result.distance) * 100).toFixed(0)}% match)`,
                });
                stopCamera();
            } else {
                setFaceVerification({
                    status: "mismatch",
                    distance: result.distance,
                    message: "Wajah tidak cocok dengan data terdaftar. Silakan coba lagi.",
                });
            }
        } catch {
            setFaceVerification({ status: "error", message: "Gagal memverifikasi wajah. Coba lagi." });
        }
    }, [registeredDescriptor, stopCamera]);

    const submitAttendance = useCallback(async () => {
        if (!photo || !gpsInfo) return;

        // Block if face is mismatched
        if (faceVerification.status === "mismatch") {
            setMessage("Verifikasi wajah gagal. Tidak dapat melakukan absensi.");
            return;
        }

        // Block if GPS is invalid
        if (!gpsInfo.isValid) {
            setMessage("Lokasi GPS tidak valid. Pastikan GPS aktif dan tidak menggunakan lokasi palsu.");
            return;
        }

        setStatus("submitting");

        try {
            const res = await fetch("/api/attendance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    photo,
                    location: { lat: gpsInfo.lat, lng: gpsInfo.lng },
                }),
            });
            const data = await res.json();

            if (res.ok) {
                setStatus("success");
                setMessage(data.clockOut ? "Clock Out berhasil!" : "Clock In berhasil!");
                setTodayRecord(data);
            } else {
                setStatus("error");
                setMessage(data.error || "Gagal submit absensi");
            }
        } catch {
            setStatus("error");
            setMessage("Terjadi kesalahan koneksi");
        }
    }, [photo, gpsInfo, faceVerification.status]);

    const isClockIn = !todayRecord?.clockIn;
    const isClockOut = todayRecord?.clockIn && !todayRecord?.clockOut;
    const isDone = todayRecord?.clockIn && todayRecord?.clockOut;

    /** Can submit: photo taken, GPS valid, face not mismatched */
    const canSubmit = photo && gpsInfo?.isValid && faceVerification.status !== "mismatch" && status !== "submitting";

    return (
        <div className="space-y-4 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Camera className="w-5 h-5 text-[var(--primary)]" />
                    Absensi
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Rekam kehadiran dengan foto, lokasi, dan verifikasi wajah</p>
            </div>

            {/* Security Status Bar */}
            <div className="grid grid-cols-2 gap-2">
                {/* GPS Status */}
                <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium border ${!gpsInfo ? "bg-gray-50 text-gray-500 border-gray-200"
                        : gpsInfo.isValid ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-red-50 text-red-700 border-red-200"
                    }`}>
                    {!gpsInfo ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        : gpsInfo.isValid ? <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            : <ShieldAlert className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">
                        {!gpsInfo ? "Mencari GPS..."
                            : gpsInfo.isValid ? `GPS Valid (±${Math.round(gpsInfo.accuracy)}m)`
                                : "GPS Tidak Valid"}
                    </span>
                </div>

                {/* Face Status */}
                <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium border ${faceVerification.status === "idle" ? "bg-gray-50 text-gray-500 border-gray-200"
                        : faceVerification.status === "match" ? "bg-green-50 text-green-700 border-green-200"
                            : faceVerification.status === "checking" ? "bg-blue-50 text-blue-600 border-blue-200"
                                : faceVerification.status === "not_registered" ? "bg-orange-50 text-orange-600 border-orange-200"
                                    : faceVerification.status === "mismatch" ? "bg-red-50 text-red-700 border-red-200"
                                        : "bg-gray-50 text-gray-500 border-gray-200"
                    }`}>
                    {faceVerification.status === "checking" ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        : faceVerification.status === "match" ? <ScanFace className="w-3.5 h-3.5 shrink-0" />
                            : faceVerification.status === "mismatch" ? <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                : faceVerification.status === "not_registered" ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    : <ScanFace className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">
                        {faceVerification.status === "idle" ? "Menunggu foto"
                            : faceVerification.status === "match" ? "Wajah Cocok"
                                : faceVerification.status === "checking" ? "Memverifikasi..."
                                    : faceVerification.status === "not_registered" ? "Belum Daftar"
                                        : faceVerification.status === "mismatch" ? "Tidak Cocok"
                                            : faceVerification.status === "no_face" ? "Tidak Terdeteksi"
                                                : "Error"}
                    </span>
                </div>
            </div>

            {/* GPS Warnings */}
            {gpsInfo && gpsInfo.warnings.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-1">
                    {gpsInfo.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            {w}
                        </p>
                    ))}
                </div>
            )}

            {/* Status Banner */}
            {isDone && (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-green-800">Absensi hari ini selesai</p>
                        <p className="text-xs text-green-600">
                            In: {todayRecord?.clockIn ? new Date(todayRecord.clockIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                            {" • "}
                            Out: {todayRecord?.clockOut ? new Date(todayRecord.clockOut).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                        </p>
                    </div>
                </div>
            )}

            {/* Camera */}
            {!isDone && (
                <div className="card overflow-hidden">
                    <div className="relative aspect-[4/3] bg-gray-100">
                        <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${streaming ? "block" : "hidden"}`} />
                        {!streaming && !photo && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
                                <Video className="w-12 h-12 opacity-30" />
                                <p className="text-sm">Kamera belum aktif</p>
                                <button onClick={startCamera} className="btn btn-primary btn-sm">
                                    <Camera className="w-4 h-4" /> Aktifkan Kamera
                                </button>
                            </div>
                        )}
                        {photo && (
                            <img src={photo} alt="Captured" className="w-full h-full object-cover" />
                        )}
                        {streaming && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-40 h-52 border-2 border-[var(--primary)]/60 rounded-[50%] shadow-[0_0_0_9999px_rgba(0,0,0,0.15)]" />
                            </div>
                        )}
                        <canvas ref={canvasRef} className="hidden" />
                    </div>

                    <div className="p-4 space-y-3">
                        {/* Face verification message */}
                        {faceVerification.status !== "idle" && faceVerification.message && (
                            <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium border ${faceVerification.status === "match" ? "bg-green-50 text-green-700 border-green-200"
                                    : faceVerification.status === "checking" ? "bg-blue-50 text-blue-600 border-blue-200"
                                        : faceVerification.status === "not_registered" ? "bg-orange-50 text-orange-600 border-orange-200"
                                            : "bg-red-50 text-red-700 border-red-200"
                                }`}>
                                {faceVerification.status === "checking" ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                    : faceVerification.status === "match" ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                        : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                                <span>{faceVerification.message}</span>
                                {faceVerification.status === "not_registered" && (
                                    <Link href="/employee/settings" className="ml-auto text-[var(--primary)] underline font-semibold whitespace-nowrap">
                                        Daftar →
                                    </Link>
                                )}
                            </div>
                        )}

                        {/* Controls */}
                        <div className="flex gap-2">
                            {streaming ? (
                                <>
                                    <button onClick={captureAndVerify} className="btn btn-primary flex-1" disabled={faceVerification.status === "checking"}>
                                        {faceVerification.status === "checking"
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <Camera className="w-4 h-4" />}
                                        Ambil Foto
                                    </button>
                                    <button onClick={stopCamera} className="btn btn-secondary">
                                        <VideoOff className="w-4 h-4" />
                                    </button>
                                </>
                            ) : photo ? (
                                <>
                                    <button onClick={() => { setPhoto(null); setFaceVerification({ status: "idle" }); startCamera(); }} className="btn btn-secondary flex-1">Ulang</button>
                                    <button onClick={submitAttendance} className="btn btn-primary flex-1" disabled={!canSubmit}>
                                        {status === "submitting" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                        {isClockIn ? "Clock In" : isClockOut ? "Clock Out" : "Submit"}
                                    </button>
                                </>
                            ) : null}
                        </div>

                        {/* Info */}
                        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                            <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5" />
                                {gpsInfo ? `${gpsInfo.lat.toFixed(4)}, ${gpsInfo.lng.toFixed(4)}` : "Mendapatkan lokasi..."}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                {new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Message */}
            {message && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${status === "success" ? "bg-green-50 text-green-700 border border-green-200"
                        : status === "error" ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-yellow-50 text-yellow-700 border border-yellow-200"
                    }`}>
                    {status === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {message}
                </div>
            )}
        </div>
    );
}
