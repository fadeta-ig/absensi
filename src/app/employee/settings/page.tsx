"use client";

import { useState } from "react";
import { Settings, Lock, Eye, EyeOff, Loader2, CheckCircle, AlertCircle, ShieldCheck } from "lucide-react";

export default function SettingsPage() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

            {/* Change Password Card */}
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
