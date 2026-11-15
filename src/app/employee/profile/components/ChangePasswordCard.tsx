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
            setFormError("Kata sandi baru minimal 8 karakter");
            return;
        }
        if (newPassword !== confirmPassword) {
            setFormError("Konfirmasi kata sandi tidak cocok");
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
                throw new Error(await getResponseErrorMessage(res, "Gagal mengubah kata sandi"));
            }

            const data = await res.json().catch(() => null);
            const successMsg = data?.message || "Anda akan logout terlebih dulu di seluruh perangkat yang sudah login secara otomatis untuk keamanan.";

            setMessage({ type: "success", text: successMsg });
            setIsSuccess(true);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (error) {
            reportClientError("ChangePasswordCard", "Gagal mengubah kata sandi karyawan", error);
            toast(error instanceof Error ? error.message : "Kata sandi belum berubah karena koneksi bermasalah. Periksa internet lalu coba lagi.", "error");
        } finally {
            setLoading(false);
        }
    };

    const passwordStrength = (pw: string) => {
        if (pw.length === 0) return null;
        if (pw.length < 8) return { label: "Lemah", color: "bg-[var(--destructive)]", width: "w-1/4" };
        if (pw.length < 12) return { label: "Cukup", color: "bg-[var(--warning)]", width: "w-2/4" };
        if (/[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) return { label: "Kuat", color: "bg-[var(--success)]", width: "w-full" };
        return { label: "Baik", color: "bg-[var(--info)]", width: "w-3/4" };
    };

    const strength = passwordStrength(newPassword);

    return (
        <SettingCard icon={ShieldCheck} title="Ubah Kata Sandi" subtitle="Perbarui kata sandi akun Anda">

            {isSuccess ? (
                <div className="rounded-2xl bg-[var(--secondary)] p-6 text-center space-y-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--success-bg)] text-[var(--success)] mx-auto flex items-center justify-center">
                        <CheckCircle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Kata Sandi Berhasil Diperbarui</h3>
                        <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto leading-relaxed">
                            {message?.text}
                        </p>
                    </div>
                    <div className="pt-2">
                        <button
                            type="button"
                            onClick={handleRedirectNow}
                            className="btn btn-primary inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold"
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
                            Simpan dulu perubahan profil di atas sebelum ganti kata sandi.
                        </NoticeBox>
                    )}
                    {formError && <NoticeBox kind="error">{formError}</NoticeBox>}

                    <div className="form-group !mb-0">
                        <label className="form-label">
                            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Kata Sandi Saat Ini</span>
                        </label>
                        <div className="relative">
                            <input
                                type={showCurrent ? "text" : "password"}
                                className="form-input pr-10"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="Masukkan kata sandi saat ini"
                                required
                            />
                            <button type="button" onClick={() => setShowCurrent(!showCurrent)} aria-label={showCurrent ? "Sembunyikan kata sandi saat ini" : "Tampilkan kata sandi saat ini"} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label">
                            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Kata Sandi Baru</span>
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
                            <button type="button" onClick={() => setShowNew(!showNew)} aria-label={showNew ? "Sembunyikan kata sandi baru" : "Tampilkan kata sandi baru"} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
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
                            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Konfirmasi Kata Sandi Baru</span>
                        </label>
                        <input
                            type="password"
                            className="form-input"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Ulangi kata sandi baru"
                            required
                            minLength={8}
                        />
                        {confirmPassword && newPassword !== confirmPassword && (
                            <p className="text-[10px] text-[var(--destructive-text)] mt-1">Kata sandi tidak cocok</p>
                        )}
                    </div>

                    <button type="submit" className="btn btn-primary w-full" disabled={loading || locked || !currentPassword || !newPassword || newPassword !== confirmPassword}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Ubah Kata Sandi
                    </button>
                </form>
            )}
        </SettingCard>
    );
}
