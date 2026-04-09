"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
    Camera, MapPin, Clock, CheckCircle, AlertCircle, Loader2,
    Video, VideoOff, ShieldCheck, ShieldAlert, ScanFace, AlertTriangle
} from "lucide-react";
import Link from "next/link";
import { createClientLogger } from "@/lib/clientLogger";

const log = createClientLogger("AttendancePage");

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
        log.info("Halaman Absensi dimuat", {
            userAgent: navigator.userAgent,
            url: window.location.href,
        });

        // Fetch GPS with validation
        (async () => {
            log.info("Memulai fetch GPS...");
            try {
                const { getValidatedPosition } = await import("@/lib/gpsValidator");
                const { position, validation } = await getValidatedPosition();
                const gps = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    isValid: validation.isValid,
                    warnings: validation.warnings,
                };
                setGpsInfo(gps);
                if (validation.isValid) {
                    log.info("GPS valid", { lat: gps.lat.toFixed(5), lng: gps.lng.toFixed(5), accuracy: gps.accuracy });
                } else {
                    log.warn("GPS tidak valid", { warnings: validation.warnings });
                }
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                log.error("Gagal mendapatkan lokasi GPS", { error: errMsg });
                setMessage(errMsg || "Gagal mendapatkan lokasi. Aktifkan GPS.");
            }
        })();

        // Fetch today's attendance record
        log.debug("Fetch data absensi hari ini...");
        fetch("/api/attendance")
            .then((r) => r.json())
            .then((data) => {
                const today = new Date().toISOString().split("T")[0];
                const found = data.find((a: { date: string }) => a.date === today);
                if (found) {
                    setTodayRecord(found);
                    log.info("Data absensi hari ini ditemukan", { clockIn: found.clockIn, clockOut: found.clockOut });
                } else {
                    log.info("Belum ada absensi hari ini.");
                }
            })
            .catch((err) => log.error("Gagal fetch data absensi", { error: String(err) }));

        // Fetch registered face descriptor
        log.debug("Fetch registered face descriptor...");
        fetch("/api/auth/face")
            .then((r) => r.json())
            .then((data) => {
                if (data.hasFace && data.descriptor) {
                    setRegisteredDescriptor(data.descriptor);
                    log.info("Face descriptor terdaftar ditemukan", { descriptorLength: data.descriptor.length });
                } else {
                    log.warn("Wajah belum terdaftar untuk user ini", { response: data });
                }
            })
            .catch((err) => log.error("Gagal fetch face descriptor", { error: String(err) }));
    }, []);

    const startCamera = useCallback(async () => {
        log.info("Mencoba mengaktifkan kamera...", {
            mediaDevicesSupported: !!navigator.mediaDevices?.getUserMedia,
            isSecureContext: window.isSecureContext,
            protocol: window.location.protocol,
        });

        if (!navigator.mediaDevices?.getUserMedia) {
            const errMsg = "Browser tidak mendukung camera API atau halaman tidak HTTPS.";
            log.error(errMsg, { protocol: window.location.protocol });
            setMessage(errMsg);
            return;
        }

        try {
            const constraints = { video: { facingMode: "user", width: 640, height: 480 } };
            log.debug("getUserMedia dipanggil", { constraints });

            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            const tracks = stream.getVideoTracks();
            log.info("Stream kamera berhasil diperoleh", {
                trackCount: tracks.length,
                trackLabel: tracks[0]?.label,
                trackState: tracks[0]?.readyState,
                settings: tracks[0]?.getSettings(),
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                log.debug("srcObject di-assign ke video element", {
                    videoReadyState: videoRef.current.readyState,
                    videoWidth: videoRef.current.videoWidth,
                    videoHeight: videoRef.current.videoHeight,
                });

                videoRef.current.onloadedmetadata = () => {
                    log.info("onloadedmetadata terpicu — video metadata siap", {
                        videoWidth: videoRef.current?.videoWidth,
                        videoHeight: videoRef.current?.videoHeight,
                        readyState: videoRef.current?.readyState,
                        duration: videoRef.current?.duration,
                    });

                    videoRef.current?.play()
                        .then(() => {
                            log.info("video.play() berhasil — kamera aktif dan siap ditampilkan");
                            setStreaming(true);
                        })
                        .catch((playErr) => {
                            log.warn("video.play() gagal (mungkin autoplay policy)", {
                                error: String(playErr),
                            });
                            // Tetap tampilkan — user mungkin sudah interact
                            setStreaming(true);
                        });
                };

                // Fallback: jika onloadedmetadata tidak pernah terpicu dalam 5 detik
                setTimeout(() => {
                    if (!streaming && videoRef.current?.readyState && videoRef.current.readyState >= 1) {
                        log.warn("Fallback: onloadedmetadata timeout, force streaming", {
                            readyState: videoRef.current.readyState,
                        });
                        setStreaming(true);
                    }
                }, 5000);
            } else {
                log.error("videoRef.current adalah null setelah getUserMedia berhasil");
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const errName = err instanceof Error ? err.name : "UnknownError";
            log.error("GAGAL mengakses kamera", {
                errorName: errName,
                error: errMsg,
                // DOMException names yang umum:
                // NotAllowedError = user deny permission
                // NotFoundError   = tidak ada kamera
                // NotReadableError= kamera sedang dipakai app lain
                hint: errName === "NotAllowedError" ? "User menolak izin kamera"
                    : errName === "NotFoundError" ? "Tidak ada perangkat kamera ditemukan"
                    : errName === "NotReadableError" ? "Kamera sedang digunakan app lain"
                    : "Error tidak dikenal",
            });
            setMessage(`Gagal mengakses kamera: ${errName}. Berikan izin kamera.`);
        }
    }, [streaming]);

    const stopCamera = useCallback(() => {
        if (videoRef.current?.srcObject) {
            const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
            log.info("Menghentikan kamera", { trackCount: tracks.length });
            tracks.forEach((t) => {
                t.stop();
                log.debug("Track dihentikan", { label: t.label, kind: t.kind });
            });
            videoRef.current.srcObject = null;
            videoRef.current.onloadedmetadata = null;
            setStreaming(false);
            log.info("Kamera berhasil dihentikan");
        } else {
            log.debug("stopCamera dipanggil tapi srcObject sudah null");
        }
    }, []);

    const captureAndVerify = useCallback(async () => {
        log.info("captureAndVerify dipanggil");

        if (!videoRef.current) {
            log.error("videoRef.current adalah null — tidak bisa capture");
            return;
        }
        if (!canvasRef.current) {
            log.error("canvasRef.current adalah null — tidak bisa capture");
            return;
        }

        // Log state video sebelum capture
        const vid = videoRef.current;
        log.info("State video saat capture", {
            videoWidth: vid.videoWidth,
            videoHeight: vid.videoHeight,
            readyState: vid.readyState,   // 4 = HAVE_ENOUGH_DATA
            paused: vid.paused,
            srcObjectNull: vid.srcObject === null,
            currentTime: vid.currentTime,
        });

        if (vid.videoWidth === 0 || vid.videoHeight === 0) {
            log.warn("Video width/height adalah 0 — frame mungkin belum siap", {
                readyState: vid.readyState,
            });
        }

        const canvas = canvasRef.current;
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            log.error("Gagal mendapatkan 2D context dari canvas");
            return;
        }

        ctx.drawImage(vid, 0, 0, 640, 480);
        const photoData = canvas.toDataURL("image/jpeg", 0.8);
        const photoSizeKB = Math.round(photoData.length * 0.75 / 1024);
        log.info("Frame berhasil di-capture dari video", {
            canvasW: canvas.width,
            canvasH: canvas.height,
            photoSizeKB,
        });

        // If no face registered, skip verification
        if (!registeredDescriptor) {
            log.warn("Tidak ada descriptor wajah terdaftar — skip verifikasi");
            setPhoto(photoData);
            setFaceVerification({ status: "not_registered", message: "Wajah belum terdaftar. Daftarkan di Pengaturan." });
            stopCamera();
            return;
        }

        log.info("Memulai proses verifikasi wajah...", {
            registeredDescriptorLength: registeredDescriptor.length,
        });
        setFaceVerification({ status: "checking", message: "Memverifikasi wajah..." });

        try {
            log.debug("Dynamic import faceRecognition...");
            const { loadFaceModels, detectFaceDescriptor, compareFaces } = await import("@/lib/faceRecognition");
            log.debug("loadFaceModels dipanggil...");
            await loadFaceModels();

            log.debug("detectFaceDescriptor dipanggil pada canvas...");
            const descriptor = await detectFaceDescriptor(canvas);

            if (!descriptor) {
                log.warn("Tidak ada wajah terdeteksi dalam frame yang di-capture");
                setFaceVerification({ status: "no_face", message: "Wajah tidak terdeteksi. Coba ambil foto ulang." });
                return;
            }

            const result = compareFaces(descriptor, registeredDescriptor);

            if (result.match) {
                log.info("Verifikasi wajah BERHASIL", {
                    distance: result.distance.toFixed(4),
                    similarityPct: `${((1 - result.distance) * 100).toFixed(1)}%`,
                });
                setPhoto(photoData);
                setFaceVerification({
                    status: "match",
                    distance: result.distance,
                    message: `Identitas terverifikasi (${((1 - result.distance) * 100).toFixed(0)}% match)`,
                });
                stopCamera();
            } else {
                log.warn("Verifikasi wajah GAGAL — wajah tidak cocok", {
                    distance: result.distance.toFixed(4),
                    threshold: 0.45,
                });
                setFaceVerification({
                    status: "mismatch",
                    distance: result.distance,
                    message: "Wajah tidak cocok dengan data terdaftar. Silakan coba lagi.",
                });
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            log.error("ERROR saat proses verifikasi wajah", {
                error: errMsg,
                stack: err instanceof Error ? err.stack : undefined,
            });
            setFaceVerification({ status: "error", message: "Gagal memverifikasi wajah. Coba lagi." });
        }
    }, [registeredDescriptor, stopCamera]);

    const submitAttendance = useCallback(async () => {
        log.info("submitAttendance dipanggil", {
            faceStatus: faceVerification.status,
            hasPhoto: !!photo,
            gpsValid: gpsInfo?.isValid,
            isClockIn: !todayRecord?.clockIn,
        });

        if (!photo || !gpsInfo) {
            log.warn("Submit diabaikan — foto atau GPS tidak tersedia", {
                hasPhoto: !!photo,
                hasGps: !!gpsInfo,
            });
            return;
        }

        if (faceVerification.status === "mismatch") {
            log.warn("Submit diblokir — verifikasi wajah gagal");
            setMessage("Verifikasi wajah gagal. Tidak dapat melakukan absensi.");
            return;
        }

        if (!gpsInfo.isValid) {
            log.warn("Submit diblokir — GPS tidak valid", { warnings: gpsInfo.warnings });
            setMessage("Lokasi GPS tidak valid. Pastikan GPS aktif dan tidak menggunakan lokasi palsu.");
            return;
        }

        setStatus("submitting");
        log.info("Mengirim data absensi ke server...", {
            lat: gpsInfo.lat.toFixed(5),
            lng: gpsInfo.lng.toFixed(5),
        });

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
                log.info("Submit absensi berhasil", {
                    type: data.clockOut ? "Clock Out" : "Clock In",
                    clockIn: data.clockIn,
                    clockOut: data.clockOut,
                });
                setStatus("success");
                setMessage(data.clockOut ? "Clock Out berhasil!" : "Clock In berhasil!");
                setTodayRecord(data);
            } else {
                log.error("Submit absensi ditolak server", {
                    httpStatus: res.status,
                    error: data.error,
                });
                setStatus("error");
                setMessage(data.error || "Gagal submit absensi");
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            log.error("Koneksi error saat submit absensi", { error: errMsg });
            setStatus("error");
            setMessage("Terjadi kesalahan koneksi");
        }
    }, [photo, gpsInfo, faceVerification.status, todayRecord]);

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
