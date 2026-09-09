"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Camera,
    ClipboardList,
    FileText,
    MapPinned,
    Clock4,
    CalendarOff,
    Receipt,
    Newspaper,
    Monitor,
    NotebookPen,
    User,
    Settings,
    Users,
    LogOut,
    X,
    ChevronRight,
    LucideIcon,
} from "lucide-react";
import { notifyAuthChanged } from "@/lib/authEvents";
import { useToast } from "@/components/Toast";

interface MenuItem {
    href: string;
    label: string;
    description: string;
    icon: LucideIcon;
    bg: string;
    color: string;
}

interface MenuCategory {
    title: string;
    items: MenuItem[];
}

interface AllMenusSheetProps {
    isOpen: boolean;
    onClose: () => void;
    hasSubordinates?: boolean;
}

export default function AllMenusSheet({
    isOpen,
    onClose,
    hasSubordinates = false,
}: AllMenusSheetProps) {
    const router = useRouter();
    const toast = useToast();

    // Tutup dengan tombol Escape & kunci scroll latar belakang saat sheet terbuka
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        window.addEventListener("keydown", handleKeyDown);
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen, onClose]);

    const handleNavigate = useCallback((href: string) => {
        onClose();
        router.push(href);
    }, [onClose, router]);

    const handleLogout = useCallback(async () => {
        onClose();
        toast("Memproses logout...", "info");
        try {
            const res = await fetch("/api/auth/logout", { method: "POST" });
            if (res.ok) {
                notifyAuthChanged("logout");
                router.replace("/");
            } else {
                toast("Gagal memproses logout. Coba lagi.", "error");
            }
        } catch {
            toast("Terjadi kesalahan jaringan saat logout.", "error");
        }
    }, [onClose, router, toast]);

    if (!isOpen) return null;

    const categories: MenuCategory[] = [
        {
            title: "Presensi & Kehadiran",
            items: [
                {
                    href: "/employee/attendance",
                    label: "Presensi Harian",
                    description: "Clock In & Clock Out dengan verifikasi lokasi",
                    icon: Camera,
                    bg: "bg-emerald-50 dark:bg-emerald-950/40",
                    color: "text-emerald-600 dark:text-emerald-400",
                },
                {
                    href: "/employee/attendance-history",
                    label: "Riwayat Presensi",
                    description: "Catatan log jam kerja dan absensi harian",
                    icon: ClipboardList,
                    bg: "bg-blue-50 dark:bg-blue-950/40",
                    color: "text-blue-600 dark:text-blue-400",
                },
                {
                    href: "/employee/attendance/correction",
                    label: "Koreksi Presensi",
                    description: "Pengajuan perbaikan jam hadir yang terlewat",
                    icon: FileText,
                    bg: "bg-teal-50 dark:bg-teal-950/40",
                    color: "text-teal-600 dark:text-teal-400",
                },
                {
                    href: "/employee/visits",
                    label: "Kunjungan Dinas",
                    description: "Presensi kegiatan kerja dan meeting luar kantor",
                    icon: MapPinned,
                    bg: "bg-indigo-50 dark:bg-indigo-950/40",
                    color: "text-indigo-600 dark:text-indigo-400",
                },
                {
                    href: "/employee/overtime",
                    label: "Pengajuan Lembur",
                    description: "Formulir lembur dan persetujuan jam tambahan",
                    icon: Clock4,
                    bg: "bg-sky-50 dark:bg-sky-950/40",
                    color: "text-sky-600 dark:text-sky-400",
                },
            ],
        },
        {
            title: "Kepegawaian & Finansial",
            items: [
                {
                    href: "/employee/leave",
                    label: "Pengajuan Cuti",
                    description: "Pengecekan saldo cuti dan pengajuan izin",
                    icon: CalendarOff,
                    bg: "bg-rose-50 dark:bg-rose-950/40",
                    color: "text-rose-600 dark:text-rose-400",
                },
                {
                    href: "/employee/payslip",
                    label: "Slip Gaji",
                    description: "Rincian pendapatan bulanan dan arsip gaji",
                    icon: Receipt,
                    bg: "bg-amber-50 dark:bg-amber-950/40",
                    color: "text-amber-600 dark:text-amber-400",
                },
                {
                    href: "/employee/documents",
                    label: "Dokumen Karyawan",
                    description: "Berkas kontrak, formulir, dan surat resmi",
                    icon: FileText,
                    bg: "bg-orange-50 dark:bg-orange-950/40",
                    color: "text-orange-600 dark:text-orange-400",
                },
                {
                    href: "/employee/assets",
                    label: "Aset Saya",
                    description: "Daftar inventaris dan perangkat kerja terdaftar",
                    icon: Monitor,
                    bg: "bg-purple-50 dark:bg-purple-950/40",
                    color: "text-purple-600 dark:text-purple-400",
                },
            ],
        },
        {
            title: "Produktivitas & Informasi",
            items: [
                {
                    href: "/employee/news",
                    label: "Berita & Pengumuman",
                    description: "Informasi internal dan edaran resmi WIG",
                    icon: Newspaper,
                    bg: "bg-amber-50 dark:bg-amber-950/40",
                    color: "text-amber-600 dark:text-amber-400",
                },
                {
                    href: "/employee/todos",
                    label: "To-Do List",
                    description: "Daftar tugas kerja dan catatan aktivitas harian",
                    icon: NotebookPen,
                    bg: "bg-violet-50 dark:bg-violet-950/40",
                    color: "text-violet-600 dark:text-violet-400",
                },
                ...(hasSubordinates ? [{
                    href: "/employee/monitoring",
                    label: "Monitoring Tim",
                    description: "Pantau kehadiran dan status tim bawahan langsung",
                    icon: Users,
                    bg: "bg-cyan-50 dark:bg-cyan-950/40",
                    color: "text-cyan-600 dark:text-cyan-400",
                }] : []),
            ],
        },
        {
            title: "Akun & Preferensi",
            items: [
                {
                    href: "/employee/profile",
                    label: "Profil Saya",
                    description: "Data identitas pribadi, divisi, dan jabatan",
                    icon: User,
                    bg: "bg-slate-100 dark:bg-slate-800",
                    color: "text-slate-700 dark:text-slate-300",
                },
                {
                    href: "/employee/settings",
                    label: "Pengaturan Akun",
                    description: "Pembaruan kata sandi dan keamanan akses",
                    icon: Settings,
                    bg: "bg-zinc-100 dark:bg-zinc-800",
                    color: "text-zinc-700 dark:text-zinc-300",
                },
            ],
        },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end lg:justify-center items-center">
            {/* Backdrop */}
            <div
                onClick={onClose}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            />

            {/* Bottom Sheet Modal Container */}
            <div className="relative w-full max-w-lg max-h-[85vh] bg-[var(--card)] border border-[var(--border)] rounded-t-[2rem] lg:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden z-10 animate-in slide-in-from-bottom duration-300">
                {/* Visual Drag Handle (Mobile) */}
                <div className="pt-3 pb-1 flex justify-center lg:hidden">
                    <div className="w-12 h-1.5 rounded-full bg-[var(--border)]" />
                </div>

                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-[var(--text-primary)]">
                            Menu Presensi & Layanan HRIS
                        </h2>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            Daftar lengkap seluruh fitur portal karyawan
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[var(--secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        aria-label="Tutup menu"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content List per Category */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 custom-scrollbar">
                    {categories.map((cat, idx) => (
                        <div key={idx} className="space-y-2.5">
                            <h3 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider pl-1">
                                {cat.title}
                            </h3>
                            <div className="grid grid-cols-1 gap-2">
                                {cat.items.map((item, itemIdx) => {
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={itemIdx}
                                            onClick={() => handleNavigate(item.href)}
                                            className="w-full flex items-center gap-3.5 p-3 rounded-xl bg-[var(--secondary)]/40 hover:bg-[var(--secondary)] border border-transparent hover:border-[var(--border)] transition-all duration-150 text-left group"
                                        >
                                            <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
                                                <Icon className={`w-5 h-5 ${item.color} stroke-[1.8]`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--primary)] transition-colors leading-snug truncate">
                                                    {item.label}
                                                </p>
                                                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                                                    {item.description}
                                                </p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--primary)] group-hover:translate-x-0.5 transition-all shrink-0" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Sesi Logout */}
                    <div className="pt-2 pb-4">
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
                        >
                            <LogOut className="w-4 h-4 stroke-[2]" />
                            <span>Keluar dari Akun</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
