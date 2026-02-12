"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, MapPin, Clock, CheckCircle, AlertCircle, Loader2, Video, VideoOff } from "lucide-react";

export default function AttendancePage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [streaming, setStreaming] = useState(false);
    const [photo, setPhoto] = useState<string | null>(null);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
    const [message, setMessage] = useState("");
    const [todayRecord, setTodayRecord] = useState<{ clockIn?: string; clockOut?: string } | null>(null);

    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => setMessage("Gagal mendapatkan lokasi. Aktifkan GPS.")
            );
        }
        fetch("/api/attendance").then((r) => r.json()).then((data) => {
            const today = new Date().toISOString().split("T")[0];
            const found = data.find((a: { date: string }) => a.date === today);
            if (found) setTodayRecord(found);
        });
    }, []);

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
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

    const capturePhoto = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, 640, 480);
            setPhoto(canvas.toDataURL("image/jpeg", 0.8));
            stopCamera();
        }
    }, [stopCamera]);

    const submitAttendance = useCallback(async () => {
        if (!photo || !location) return;
        setStatus("submitting");

        try {
            const res = await fetch("/api/attendance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ photo, location }),
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
    }, [photo, location]);

    const isClockIn = !todayRecord?.clockIn;
    const isClockOut = todayRecord?.clockIn && !todayRecord?.clockOut;
    const isDone = todayRecord?.clockIn && todayRecord?.clockOut;

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Camera className="w-5 h-5 text-[var(--primary)]" />
                    Absensi
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Rekam kehadiran dengan foto dan lokasi</p>
            </div>

            {/* Status Banner */}
            {isDone && (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-green-800">Absensi hari ini selesai</p>
                        <p className="text-xs text-green-600">In: {todayRecord?.clockIn ? new Date(todayRecord.clockIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"} • Out: {todayRecord?.clockOut ? new Date(todayRecord.clockOut).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</p>
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
                        {/* Controls */}
                        <div className="flex gap-2">
                            {streaming ? (
                                <>
                                    <button onClick={capturePhoto} className="btn btn-primary flex-1">
                                        <Camera className="w-4 h-4" /> Ambil Foto
                                    </button>
                                    <button onClick={stopCamera} className="btn btn-secondary">
                                        <VideoOff className="w-4 h-4" />
                                    </button>
                                </>
                            ) : photo ? (
                                <>
                                    <button onClick={() => { setPhoto(null); startCamera(); }} className="btn btn-secondary flex-1">Ulang</button>
                                    <button onClick={submitAttendance} className="btn btn-primary flex-1" disabled={status === "submitting" || !location}>
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
                                {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Mendapatkan lokasi..."}
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
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${status === "success" ? "bg-green-50 text-green-700 border border-green-200" : status === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"}`}>
                    {status === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {message}
                </div>
            )}
        </div>
    );
}
