"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import styles from "./attendance.module.css";

export default function AttendancePage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [streaming, setStreaming] = useState(false);
    const [photo, setPhoto] = useState<string | null>(null);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [locationName, setLocationName] = useState("Mengambil lokasi...");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ type: string; message: string } | null>(null);
    const [todayStatus, setTodayStatus] = useState<string | null>(null);

    useEffect(() => {
        // Get location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    setLocation(loc);
                    setLocationName(`${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`);
                },
                () => setLocationName("Gagal mengambil lokasi")
            );
        }

        // Check today's status
        fetch("/api/attendance")
            .then((r) => r.json())
            .then((data) => {
                const today = new Date().toISOString().split("T")[0];
                const todayRec = data.find((a: { date: string }) => a.date === today);
                if (todayRec) {
                    if (todayRec.clockOut) {
                        setTodayStatus("completed");
                    } else {
                        setTodayStatus("clocked-in");
                    }
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
            setResult({ type: "error", message: "Gagal mengakses kamera. Pastikan izin kamera diberikan." });
        }
    }, []);

    const capturePhoto = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext("2d");
        if (!ctx) return;

        canvasRef.current.width = 640;
        canvasRef.current.height = 480;
        ctx.drawImage(videoRef.current, 0, 0, 640, 480);

        const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.8);
        setPhoto(dataUrl);

        // Stop camera
        const stream = videoRef.current.srcObject as MediaStream;
        stream?.getTracks().forEach((track) => track.stop());
        setStreaming(false);
    }, []);

    const submitAttendance = useCallback(async () => {
        if (!photo) {
            setResult({ type: "error", message: "Silakan ambil foto terlebih dahulu" });
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/attendance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ photo, location }),
            });

            const data = await res.json();

            if (!res.ok) {
                setResult({ type: "error", message: data.error });
            } else {
                const isClockOut = !!data.clockOut;
                setResult({
                    type: "success",
                    message: isClockOut
                        ? `Clock Out berhasil pada ${new Date(data.clockOut).toLocaleTimeString("id-ID")}`
                        : `Clock In berhasil pada ${new Date(data.clockIn).toLocaleTimeString("id-ID")} — Status: ${data.status === "late" ? "Terlambat" : "Tepat Waktu"}`,
                });
                setTodayStatus(isClockOut ? "completed" : "clocked-in");
                setPhoto(null);
            }
        } catch {
            setResult({ type: "error", message: "Terjadi kesalahan" });
        }
        setLoading(false);
    }, [photo, location]);

    const retakePhoto = useCallback(() => {
        setPhoto(null);
        startCamera();
    }, [startCamera]);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>📸 Absensi Face Recognition</h1>
                <p className={styles.subtitle}>Absen dengan foto wajah dan lokasi GPS</p>
            </div>

            {/* Status Banner */}
            {todayStatus && (
                <div className={`${styles.statusBanner} ${todayStatus === "completed" ? styles.statusCompleted : styles.statusActive}`}>
                    <span className={styles.statusIcon}>
                        {todayStatus === "completed" ? "✅" : "⏰"}
                    </span>
                    <span>
                        {todayStatus === "completed"
                            ? "Anda sudah menyelesaikan absensi hari ini"
                            : "Anda sudah Clock In. Silakan Clock Out saat selesai kerja"}
                    </span>
                </div>
            )}

            <div className={styles.content}>
                {/* Camera Section */}
                <div className={`glass-card ${styles.cameraSection}`}>
                    <h2 className={styles.sectionTitle}>Kamera</h2>

                    <div className={styles.cameraBox}>
                        {!streaming && !photo && (
                            <div className={styles.cameraPlaceholder}>
                                <span className={styles.cameraEmoji}>📷</span>
                                <p>Tekan tombol di bawah untuk mulai</p>
                                <button className="btn btn-primary" onClick={startCamera}>
                                    Buka Kamera
                                </button>
                            </div>
                        )}

                        {streaming && (
                            <div className={styles.videoWrap}>
                                <video ref={videoRef} autoPlay playsInline className={styles.video} />
                                <div className={styles.faceGuide}>
                                    <div className={styles.faceOval}></div>
                                </div>
                                <button className={styles.captureBtn} onClick={capturePhoto}>
                                    <div className={styles.captureBtnInner}></div>
                                </button>
                            </div>
                        )}

                        {photo && (
                            <div className={styles.photoPreview}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={photo} alt="Captured" className={styles.previewImg} />
                                <button className={styles.retakeBtn} onClick={retakePhoto}>
                                    🔄 Ulangi
                                </button>
                            </div>
                        )}
                    </div>

                    <canvas ref={canvasRef} style={{ display: "none" }} />
                </div>

                {/* Info Section */}
                <div className={styles.infoSection}>
                    {/* Location Card */}
                    <div className={`glass-card ${styles.infoCard}`}>
                        <div className={styles.infoCardIcon}>📍</div>
                        <div>
                            <p className={styles.infoCardLabel}>Lokasi Anda</p>
                            <p className={styles.infoCardValue}>{locationName}</p>
                        </div>
                    </div>

                    {/* Time Card */}
                    <div className={`glass-card ${styles.infoCard}`}>
                        <div className={styles.infoCardIcon}>🕐</div>
                        <div>
                            <p className={styles.infoCardLabel}>Waktu Saat Ini</p>
                            <p className={styles.infoCardValue}>
                                {new Date().toLocaleTimeString("id-ID", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </p>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        className={`btn btn-primary btn-lg ${styles.submitBtn}`}
                        onClick={submitAttendance}
                        disabled={!photo || loading || todayStatus === "completed"}
                    >
                        {loading ? (
                            <span className="spinner" style={{ width: 20, height: 20 }}></span>
                        ) : todayStatus === "clocked-in" ? (
                            "🏁 Clock Out"
                        ) : todayStatus === "completed" ? (
                            "✅ Sudah Selesai"
                        ) : (
                            "📸 Clock In"
                        )}
                    </button>

                    {/* Result */}
                    {result && (
                        <div className={`${styles.resultBanner} ${result.type === "success" ? styles.resultSuccess : styles.resultError}`}>
                            {result.message}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
