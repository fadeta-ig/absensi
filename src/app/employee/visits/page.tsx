"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
    MapPinned, Plus, Camera, MapPin, Loader2, CheckCircle,
    AlertCircle, X, Building2, Navigation, FileText, Clock,
    Video, VideoOff, Filter
} from "lucide-react";

interface VisitReport {
    id: string;
    employeeId: string;
    date: string;
    clientName: string;
    clientAddress: string;
    purpose: string;
    result?: string | null;
    location?: { lat: number; lng: number } | null;
    photo?: string | null;
    status: "pending" | "approved" | "rejected";
    notes?: string | null;
    createdAt: string;
}

const STATUS_CONFIG = {
    pending: { label: "Menunggu", class: "badge-warning", color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
    approved: { label: "Disetujui", class: "badge-success", color: "text-green-700 bg-green-50 border-green-200" },
    rejected: { label: "Ditolak", class: "badge-error", color: "text-red-700 bg-red-50 border-red-200" },
};

export default function VisitsPage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [visits, setVisits] = useState<VisitReport[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const [photo, setPhoto] = useState<string | null>(null);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>("all");

    const [form, setForm] = useState({
        clientName: "",
        clientAddress: "",
        purpose: "",
        result: "",
        notes: "",
    });

    useEffect(() => {
        fetch("/api/visits").then((r) => r.json()).then(setVisits);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => setMessage({ type: "error", text: "Gagal mendapatkan lokasi. Aktifkan GPS." })
            );
        }
    }, []);

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: 640, height: 480 },
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setStreaming(true);
            }
        } catch {
            setMessage({ type: "error", text: "Gagal mengakses kamera." });
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

    const resetForm = () => {
        setForm({ clientName: "", clientAddress: "", purpose: "", result: "", notes: "" });
        setPhoto(null);
        stopCamera();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.clientName || !form.clientAddress || !form.purpose) return;
        setLoading(true);
        setMessage(null);

        try {
            const res = await fetch("/api/visits", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    photo,
                    location,
                }),
            });
            const data = await res.json();

            if (res.ok) {
                setVisits((prev) => [data, ...prev]);
                setShowForm(false);
                resetForm();
                setMessage({ type: "success", text: "Laporan kunjungan berhasil dikirim!" });
            } else {
                setMessage({ type: "error", text: data.error || "Gagal mengirim laporan" });
            }
        } catch {
            setMessage({ type: "error", text: "Terjadi kesalahan koneksi" });
        }
        setLoading(false);
    };

    const filtered = filterStatus === "all" ? visits : visits.filter((v) => v.status === filterStatus);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease] pb-20 lg:pb-0">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <MapPinned className="w-5 h-5 text-[var(--primary)]" />
                        Kunjungan Dinas
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Laporan kunjungan dinas luar</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowForm(true); resetForm(); }}>
                    <Plus className="w-4 h-4" /> Buat Laporan
                </button>
            </div>

            {/* Message */}
            {message && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${message.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {message.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {message.text}
                </div>
            )}

            {/* Filter */}
            <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[var(--text-muted)]" />
                {["all", "pending", "approved", "rejected"].map((s) => (
                    <button
                        key={s}
                        onClick={() => setFilterStatus(s)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filterStatus === s
                            ? "bg-[var(--primary)] text-white"
                            : "bg-[var(--secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                            }`}
                    >
                        {s === "all" ? "Semua" : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].label}
                    </button>
                ))}
            </div>

            {/* Visit List */}
            {filtered.length === 0 ? (
                <div className="card p-8 text-center">
                    <MapPinned className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm text-[var(--text-muted)]">Belum ada laporan kunjungan</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((visit) => {
                        const cfg = STATUS_CONFIG[visit.status];
                        return (
                            <div key={visit.id} className="card p-4 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Building2 className="w-4 h-4 text-[var(--primary)] shrink-0" />
                                            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{visit.clientName}</h3>
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)] mb-2 line-clamp-1">
                                            <Navigation className="w-3 h-3 inline mr-1" />{visit.clientAddress}
                                        </p>
                                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                                            <FileText className="w-3 h-3 inline mr-1" />{visit.purpose}
                                        </p>
                                        {visit.result && (
                                            <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-1">Hasil: {visit.result}</p>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <span className={`badge ${cfg.class}`}>{cfg.label}</span>
                                        <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                                            <Clock className="w-3 h-3" />{visit.date}
                                        </span>
                                    </div>
                                </div>
                                {visit.photo && (
                                    <div className="mt-3 rounded-lg overflow-hidden border border-[var(--border)]">
                                        <img src={visit.photo} alt="Bukti kunjungan" className="w-full h-32 object-cover" />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => { setShowForm(false); stopCamera(); }}>
                    <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Laporan Kunjungan Baru</h2>
                            <button className="modal-close" onClick={() => { setShowForm(false); stopCamera(); }}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="form-group !mb-0">
                                <label className="form-label">
                                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> Nama Klien / Perusahaan</span>
                                </label>
                                <input className="form-input" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="PT Contoh Sukses" required />
                            </div>

                            <div className="form-group !mb-0">
                                <label className="form-label">
                                    <span className="flex items-center gap-1"><Navigation className="w-3 h-3" /> Alamat Kunjungan</span>
                                </label>
                                <textarea className="form-input min-h-[60px] resize-none" value={form.clientAddress} onChange={(e) => setForm({ ...form, clientAddress: e.target.value })} placeholder="Jl. Contoh No. 123, Jakarta" required />
                            </div>

                            <div className="form-group !mb-0">
                                <label className="form-label">
                                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Tujuan Kunjungan</span>
                                </label>
                                <textarea className="form-input min-h-[60px] resize-none" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Meeting pembahasan project..." required />
                            </div>

                            <div className="form-group !mb-0">
                                <label className="form-label">Hasil Kunjungan (Opsional)</label>
                                <textarea className="form-input min-h-[60px] resize-none" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} placeholder="Deal approved, follow-up minggu depan..." />
                            </div>

                            <div className="form-group !mb-0">
                                <label className="form-label">Catatan (Opsional)</label>
                                <input className="form-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Catatan tambahan..." />
                            </div>

                            {/* Photo */}
                            <div className="form-group !mb-0">
                                <label className="form-label">
                                    <span className="flex items-center gap-1"><Camera className="w-3 h-3" /> Foto Bukti (Opsional)</span>
                                </label>
                                <div className="relative aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden border border-[var(--border)]">
                                    <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${streaming ? "block" : "hidden"}`} />
                                    {!streaming && !photo && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                                            <Video className="w-8 h-8 opacity-30" />
                                            <button type="button" onClick={startCamera} className="btn btn-secondary btn-sm">
                                                <Camera className="w-3.5 h-3.5" /> Aktifkan Kamera
                                            </button>
                                        </div>
                                    )}
                                    {photo && <img src={photo} alt="Captured" className="w-full h-full object-cover" />}
                                    <canvas ref={canvasRef} className="hidden" />
                                </div>
                                <div className="flex gap-2 mt-2">
                                    {streaming && (
                                        <>
                                            <button type="button" onClick={capturePhoto} className="btn btn-primary btn-sm flex-1">
                                                <Camera className="w-3.5 h-3.5" /> Ambil Foto
                                            </button>
                                            <button type="button" onClick={stopCamera} className="btn btn-secondary btn-sm">
                                                <VideoOff className="w-3.5 h-3.5" />
                                            </button>
                                        </>
                                    )}
                                    {photo && (
                                        <button type="button" onClick={() => { setPhoto(null); startCamera(); }} className="btn btn-secondary btn-sm">
                                            Ulangi
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Location Info */}
                            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                                <MapPin className="w-3.5 h-3.5" />
                                {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Mendapatkan lokasi..."}
                            </div>

                            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPinned className="w-4 h-4" />}
                                Kirim Laporan
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
