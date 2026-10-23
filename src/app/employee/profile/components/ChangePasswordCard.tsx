import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Eye, EyeOff, Loader2, Lock, ShieldCheck, LogIn } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { useToast } from "@/components/Toast";
import { notifyAuthChanged } from "@/lib/authEvents";
import { SettingCard } from "@/components/ui/SettingCard";
import { NoticeBox } from "@/components/ui/NoticeBox";

export function ChangePasswordCard({ locked = false }: { locked?: boolean }) {
    const router = useRouter();
    const toast = useToast();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [countdown, setCountdown] = useState(3);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        if (!isSuccess) return;
        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    notifyAuthChanged("logout");
                    router.replace("/");
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [isSuccess, router]);

    const handleRedirectNow = () => {
        notifyAuthChanged("logout");
        router.replace("/");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setFormError(null);

        if (newPassword.length < 8) {
            setFormError("Password baru minimal 8 karakter");
            return;
        }
        if (newPassword !== confirmPassword) {
            setFormError("Konfirmasi password tidak cocok");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal mengubah password"));
            }

            const data = await res.json().catch(() => null);
            const successMsg = data?.message || "Anda akan logout terlebih dulu di seluruh perangkat yang sudah login secara otomatis untuk keamanan.";

            setMessage({ type: "success", text: successMsg });
            setIsSuccess(true);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (error) {
            reportClientError("ChangePasswordCard", "Gagal mengubah password karyawan", error);
            toast(error instanceof Error ? error.message : "Password belum berubah karena koneksi bermasalah. Periksa internet lalu coba lagi.", "error");
        } finally {
            setLoading(false);
        }
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
        <SettingCard icon={ShieldCheck} title="Ubah Password" subtitle="Perbarui password akun Anda">

            {isSuccess ? (
                <div className="p-6 text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 mx-auto flex items-center justify-center">
                        <CheckCircle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-base font-bold text-[var(--text-primary)]">Kata Sandi Berhasil Diperbarui</h3>
                        <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto leading-relaxed">
                            {message?.text}
                        </p>
                    </div>
                    <div className="pt-2">
                        <button
                            type="button"
                            onClick={handleRedirectNow}
                            className="btn btn-primary inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold shadow-sm"
                        >
                            <LogIn className="w-4 h-4" />
                            Masuk Sekarang ({countdown}s)
                        </button>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    {locked && (
                        <NoticeBox kind="warning">
                            Simpan dulu perubahan profil di atas sebelum ganti password.
                        </NoticeBox>
                    )}
                    {formError && <NoticeBox kind="error">{formError}</NoticeBox>}

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
                                <div className="w-full h-1.5 bg-[var(--secondary)] rounded-full overflow-hidden">
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

                    <button type="submit" className="btn btn-primary w-full" disabled={loading || locked || !currentPassword || !newPassword || newPassword !== confirmPassword}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Ubah Password
                    </button>
                </form>
            )}
        </SettingCard>
    );
}
