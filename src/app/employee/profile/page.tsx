"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    User, Phone, Mail, Briefcase, Building2, Calendar,
    Camera, Save, Loader2, CheckCircle, AlertCircle,
    Shield, Lock, IdCard, Users, ChevronDown, LogOut, ShieldCheck,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { useEmployeeLogout } from "@/hooks/useEmployeeLogout";
import Image from "next/image";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { ChangePasswordCard } from "./components/ChangePasswordCard";
import PasskeyCard from "./components/PasskeyCard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
    id: string;
    employeeId: string;
    name: string;
    email: string;
    phone: string;
    gender: string;
    joinDate: string;
    isActive: boolean;
    avatarUrl: string | null;
    role: string;
    totalLeave: number;
    usedLeave: number;
    department: string;
    division: string;
    position: string;
    shift: string | null;
    managerName: string | null;
    managerId: string | null;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function calcTenure(joinDate: string): string {
    const join = new Date(joinDate);
    const now = new Date();
    const months =
        (now.getFullYear() - join.getFullYear()) * 12 +
        (now.getMonth() - join.getMonth());
    if (months < 1) return "Baru bergabung";
    if (months < 12) return `${months} bulan`;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    return rem > 0 ? `${years} thn ${rem} bln` : `${years} tahun`;
}

const ROLE_LABELS: Record<string, string> = {
    employee: "Karyawan",
    hr: "HR / Admin",
    ga: "GA",
    EMPLOYEE_USER: "Karyawan",
    HR_ADMIN: "Admin HR",
    GA_ADMIN: "Admin GA",
    SUPER_ADMIN: "Super Admin HR",
};

// ─── Collapsible section ──────────────────────────────────────────────────────

function HubSection({
    id,
    icon: Icon,
    title,
    subtitle,
    open,
    onToggle,
    children,
}: {
    id: string;
    icon: typeof User;
    title: string;
    subtitle?: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <section id={id} className="scroll-mt-28">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="card p-4 w-full flex items-center justify-between gap-2 text-left"
            >
                <span className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 text-[var(--primary)] shrink-0" />
                    <span className="min-w-0">
                        <span className="block text-sm font-bold text-[var(--text-primary)]">{title}</span>
                        {subtitle && (
                            <span className="block text-[11px] text-[var(--text-muted)] truncate">{subtitle}</span>
                        )}
                    </span>
                </span>
                <ChevronDown
                    className={`w-4 h-4 text-[var(--text-muted)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>
            {open && <div className="mt-3 space-y-4">{children}</div>}
        </section>
    );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
    const toast = useToast();
    const confirm = useConfirm();
    const { logout, loggingOut } = useEmployeeLogout();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    // Editable fields
    const [phone, setPhone] = useState("");
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [avatarBase64, setAvatarBase64] = useState<string | null>(null);

    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // Hub sections (collapsible, default tertutup)
    const [dataOpen, setDataOpen] = useState(false);
    const [secOpen, setSecOpen] = useState(false);

    // ── Fetch Profile ──────────────────────────────────────────────────────────
    useEffect(() => {
        async function loadProfile() {
            try {
                const response = await fetch("/api/auth/profile");
                if (!response.ok) {
                    throw new Error(await getResponseErrorMessage(response, "Gagal memuat profil"));
                }

                const data = await response.json() as UserProfile;
                setProfile(data);
                setPhone(data.phone ?? "");
                setAvatarPreview(data.avatarUrl ?? null);
            } catch (error) {
                reportClientError("EmployeeProfilePage", "Gagal memuat profil karyawan", error);
                toast("Gagal memuat profil", "error");
            } finally {
                setLoading(false);
            }
        }

        void loadProfile();
    }, [toast]);

    // ── Deep-link #keamanan (mis. dari PasskeyPrompt) ───────────────────────────
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (window.location.hash === "#keamanan") {
            setSecOpen(true);
            requestAnimationFrame(() => {
                document.getElementById("keamanan")?.scrollIntoView({ block: "start" });
            });
        }
    }, []);

    // ── Phone Change Handler ───────────────────────────────────────────────────
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPhone(e.target.value);
        setIsDirty(true);
    };

    // ── Avatar Upload Handler ──────────────────────────────────────────────────
    const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 1 * 1024 * 1024) {
            toast("Ukuran foto maksimal 1MB", "warning");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            setAvatarPreview(base64);
            setAvatarBase64(base64);
            setIsDirty(true);
        };
        reader.onerror = () => {
            reportClientError("EmployeeProfilePage", "Gagal membaca file foto profil", reader.error ?? "FileReader error");
            toast("Gagal membaca file foto", "error");
        };
        reader.readAsDataURL(file);
    }, [toast]);

    // ── Save Handler ───────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!isDirty) return;
        setSaving(true);

        try {
            const res = await fetch("/api/auth/profile", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone: phone || undefined,
                    avatarUrl: avatarBase64 ?? undefined,
                }),
            });

            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan profil"));
            }

            const data = await res.json() as { success?: boolean; error?: string };

            if (data.success) {
                setIsDirty(false);
                setAvatarBase64(null);
                toast("Profil berhasil disimpan!", "success");
                // Update local state tanpa refetch
                if (profile) {
                    setProfile({ ...profile, phone, avatarUrl: avatarPreview });
                }
            } else {
                toast(data.error ?? "Gagal menyimpan profil", "error");
            }
        } catch (error) {
            reportClientError("EmployeeProfilePage", "Gagal menyimpan profil karyawan", error);
            toast(error instanceof Error ? error.message : "Profil belum tersimpan karena koneksi bermasalah. Periksa internet lalu coba lagi.", "error");
        } finally {
            setSaving(false);
        }
    };

    // ── Logout ─────────────────────────────────────────────────────────────────
    const handleLogoutClick = () => {
        confirm({
            title: "Keluar dari akun?",
            message: "Anda harus login ulang untuk mengakses portal karyawan.",
            confirmLabel: "Ya, Keluar",
            variant: "danger",
            onConfirm: () => {
                void logout();
            },
        });
    };

    // ── Loading ────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)] opacity-50" />
            </div>
        );
    }

    const leaveRemaining = profile ? profile.totalLeave - profile.usedLeave : 0;

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <User className="w-5 h-5 text-[var(--primary)]" />
                        Profil Saya
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Akun, data pribadi, dan keamanan
                    </p>
                </div>

                {isDirty && profile && (
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn btn-primary"
                    >
                        {saving
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Save className="w-4 h-4" />
                        }
                        {saving ? "Menyimpan..." : "Simpan Perubahan"}
                    </button>
                )}
            </div>

            {!profile ? (
                <div className="card p-8 text-center">
                    <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Gagal memuat profil</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                        Bagian keamanan di bawah tetap dapat digunakan.
                    </p>
                </div>
            ) : (
                <>
                    {/* ── Avatar + Nama ──────────────────────────────────────────── */}
                    <div className="card p-5">
                        <div className="flex items-start gap-5">
                            {/* Avatar with upload trigger */}
                            <div className="relative shrink-0">
                                <div className="w-20 h-20 rounded-2xl bg-[var(--primary)]/10 overflow-hidden flex items-center justify-center">
                                    {avatarPreview
                                        ? <Image src={avatarPreview} alt="Avatar" width={80} height={80} className="w-20 h-20 object-cover" unoptimized />
                                        : <span className="text-3xl font-bold text-[var(--primary)]">
                                            {profile.name.charAt(0).toUpperCase()}
                                        </span>
                                    }
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-[var(--primary)] text-white rounded-full flex items-center justify-center shadow-md hover:bg-[var(--primary)]/90 transition-colors"
                                    title="Ganti foto profil"
                                    aria-label="Ganti foto profil"
                                >
                                    <Camera className="w-3.5 h-3.5" />
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={handleAvatarChange}
                                />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <h2 className="text-lg font-bold text-[var(--text-primary)] truncate">{profile.name}</h2>
                                <p className="text-sm text-[var(--text-muted)]">{profile.position} • {profile.department}</p>

                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
                                        {ROLE_LABELS[profile.role] ?? profile.role}
                                    </span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        profile.isActive
                                            ? "bg-green-50 text-green-700"
                                            : "bg-red-50 text-red-700"
                                    }`}>
                                        {profile.isActive ? "Aktif" : "Non-Aktif"}
                                    </span>
                                </div>
                                <p className="text-xs text-[var(--text-muted)] mt-1.5">
                                    Foto maks 1MB (JPG/PNG/WebP)
                                </p>
                            </div>
                        </div>

                        {/* Leave Balance */}
                        <div className="mt-4 grid grid-cols-3 gap-3">
                            {[
                                { label: "Total Cuti", value: profile.totalLeave, color: "text-[var(--primary)]" },
                                { label: "Terpakai", value: profile.usedLeave, color: "text-orange-500" },
                                { label: "Sisa", value: leaveRemaining, color: leaveRemaining > 0 ? "text-green-600" : "text-red-500" },
                            ].map(({ label, value, color }) => (
                                <div key={label} className="bg-[var(--secondary)] rounded-xl p-3 text-center">
                                    <p className={`text-xl font-extrabold ${color}`}>{value}</p>
                                    <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase mt-0.5">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Data Pribadi (collapsible) ───────────────────────────── */}
                    <HubSection
                        id="data-pribadi"
                        icon={IdCard}
                        title="Data Pribadi"
                        subtitle="Nomor HP dan informasi kepegawaian"
                        open={dataOpen}
                        onToggle={() => setDataOpen((v) => !v)}
                    >
                        {/* ── Editable Fields ──────────────────────────────────── */}
                        <div className="card p-5 space-y-4">
                            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                <Phone className="w-4 h-4 text-[var(--primary)]" />
                                Informasi yang Dapat Diubah
                            </h3>

                            <div className="form-group !mb-0">
                                <label className="form-label flex items-center gap-1">
                                    <Phone className="w-3 h-3" /> Nomor HP
                                </label>
                                <input
                                    type="tel"
                                    className="form-input"
                                    value={phone}
                                    onChange={handlePhoneChange}
                                    placeholder="Contoh: 08123456789"
                                />
                                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                                    Nomor HP digunakan untuk verifikasi dan komunikasi darurat.
                                </p>
                            </div>

                            {isDirty && (
                                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>Ada perubahan yang belum disimpan. Klik <strong>Simpan Perubahan</strong> di atas.</span>
                                </div>
                            )}
                        </div>

                        {/* ── Read-Only Fields ─────────────────────────────────── */}
                        <div className="card p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-[var(--primary)]" />
                                    Informasi Kepegawaian
                                </h3>
                                <span className="text-[10px] font-semibold text-[var(--text-muted)] bg-[var(--secondary)] px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Lock className="w-2.5 h-2.5" /> Read-only
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {[
                                    { icon: IdCard,    label: "ID Karyawan",    value: profile.employeeId },
                                    { icon: Mail,      label: "Email",          value: profile.email },
                                    { icon: Briefcase, label: "Jabatan",        value: profile.position },
                                    { icon: Building2, label: "Department",     value: profile.department },
                                    { icon: Building2, label: "Divisi",         value: profile.division || "-" },
                                    { icon: Users,     label: "Atasan",         value: profile.managerName ?? "Tidak ada" },
                                    { icon: Calendar,  label: "Tanggal Bergabung", value: new Date(profile.joinDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) },
                                    { icon: Calendar,  label: "Masa Kerja",     value: calcTenure(profile.joinDate) },
                                ].map(({ icon: Icon, label, value }) => (
                                    <div key={label} className="flex items-center gap-3 p-3 bg-[var(--secondary)] rounded-xl">
                                        <div className="w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center shrink-0">
                                            <Icon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
                                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </HubSection>
                </>
            )}

            {/* ── Keamanan (collapsible, selalu render) ────────────────────── */}
            <HubSection
                id="keamanan"
                icon={ShieldCheck}
                title="Keamanan"
                subtitle="Kata sandi dan kunci masuk perangkat"
                open={secOpen}
                onToggle={() => setSecOpen((v) => !v)}
            >
                <div id="ganti-password" className="scroll-mt-28">
                    <ChangePasswordCard locked={isDirty} />
                </div>
                <div id="passkey" className="scroll-mt-28">
                    <PasskeyCard />
                </div>
            </HubSection>

            {/* ── Bantuan ──────────────────────────────────────────────────── */}
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <CheckCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-semibold text-blue-800">Perlu mengubah data lainnya?</p>
                    <p className="text-xs text-blue-600 mt-1">
                        Perubahan pada nama, jabatan, department, email, atau data kepegawaian lainnya
                        harus diajukan melalui HR. Hubungi tim HR untuk proses perubahan data.
                    </p>
                </div>
            </div>

            {/* ── Keluar ───────────────────────────────────────────────────── */}
            <button
                type="button"
                onClick={handleLogoutClick}
                disabled={loggingOut}
                className="btn w-full min-h-[48px] border border-red-300 text-red-600 font-bold hover:bg-red-50 disabled:opacity-50"
            >
                {loggingOut
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <LogOut className="w-4 h-4" />
                }
                {loggingOut ? "Keluar..." : "Keluar dari Akun"}
            </button>
        </div>
    );
}
