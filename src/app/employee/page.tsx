"use client";

import { useEffect, useState } from "react";
import { 
    Clock, CalendarOff, Newspaper, ClipboardList, TrendingUp, 
    ChevronRight, LogIn, Receipt, Bell, LayoutDashboard
} from "lucide-react";
import Link from "next/link";
import PushNotificationManager from "@/components/PushNotificationManager";

interface NewsItem { id: string; title: string; }
interface AttendanceRecord { date: string; clockIn?: string; clockOut?: string; status: string; }

export default function EmployeeHomePage() {
    const [user, setUser] = useState<{ 
        name: string; 
        employeeId: string; 
        avatarUrl?: string;
        departmentRel?: { name: string };
        divisionRel?: { name: string };
        positionRel?: { name: string };
    } | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [news, setNews] = useState<NewsItem[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [leaveBalance, setLeaveBalance] = useState({ total: 0, used: 0 });

    useEffect(() => {
        fetch("/api/auth/me").then((r) => r.json()).then((data) => {
            setUser(data);
            if (data?.totalLeave !== undefined && data?.usedLeave !== undefined) {
                setLeaveBalance({ total: data.totalLeave, used: data.usedLeave });
            }
        });
        fetch("/api/news").then((r) => r.json()).then(setNews);
        fetch("/api/attendance").then((r) => r.json()).then(setAttendance);

        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const today = new Date().toISOString().split("T")[0];
    const todayRecord = attendance.find((a) => a.date === today);

    const getStatusLabel = (s: string) => {
        switch (s) { case "present": return "Hadir Tepat Waktu"; case "late": return "Terlambat"; default: return s; }
    };

    const hour = currentTime.getHours();
    let greeting = "Selamat Malam!";
    let subGreeting = "Waktunya istirahat dan persiapkan diri untuk hari esok yang lebih baik.";
    if (hour >= 5 && hour < 11) {
        greeting = "Selamat Pagi!";
        subGreeting = "Awali hari dengan semangat dan senyuman. Siap untuk mencapai target hari ini!";
    } else if (hour >= 11 && hour < 15) {
        greeting = "Selamat Siang!";
        subGreeting = "Tetap fokus dan produktif di tengah hari. Jangan lupa luangkan waktu sejenak untuk istirahat.";
    } else if (hour >= 15 && hour < 18) {
        greeting = "Selamat Sore!";
        subGreeting = "Terus melangkah walau lelah mulai terasa. Selesaikan tugas hari ini dengan standar kualitas tertinggi dan dedikasi penuh!";
    }

    const presentTotal = attendance.filter(a => a.status === "present" || a.status === "late").length;
    const remainingLeave = leaveBalance.total - leaveBalance.used;

    return (
        <div className="w-full max-w-md mx-auto space-y-5 pb-24 pt-2 px-3">
            
            {/* ─── Header ──────────────────────────────────────── */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    {user?.avatarUrl ? (
                        <img src={user.avatarUrl} alt="Avatar" className="w-12 h-12 rounded-full object-cover border-2 border-[var(--card)] ring-1 ring-[var(--border)]" />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-lg font-bold border-2 border-[var(--card)] ring-1 ring-[var(--border)]">
                            {user?.name?.charAt(0).toUpperCase() ?? "U"}
                        </div>
                    )}
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-0.5">
                            {currentTime.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
                        </p>
                        <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)] leading-none">
                            {user?.name?.split(" ")[0] ?? "Sobat"}
                        </h1>
                        <p className="text-[10px] font-semibold text-[var(--text-secondary)] mt-0.5 leading-tight">
                            {user?.positionRel?.name ?? "Karyawan"} – {user?.departmentRel?.name ?? "Department"}
                        </p>
                    </div>
                </div>
                <span className="text-lg font-bold font-mono tracking-tighter text-[var(--text-primary)] pt-0.5">
                    {currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
            </div>

            <PushNotificationManager />

            {/* ─── Greeting ────────────────────────────────────── */}
            <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] px-5 py-4">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                    {greeting}{" "}
                    <span className="text-[var(--text-muted)] font-medium italic text-[11px] ml-1">Happy Shine On You</span>
                </h2>
                <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed mt-1.5">{subGreeting}</p>
            </div>

            {/* ─── Quick Actions ───────────────────────────────── */}
            <div className="grid grid-cols-4 gap-y-4 gap-x-2">
                {[
                    { href: "/employee/leave", icon: CalendarOff, label: "Cuti", bg: "bg-rose-50", color: "text-rose-600" },
                    { href: "/employee/payslip", icon: Receipt, label: "Slip Gaji", bg: "bg-amber-50", color: "text-amber-600" },
                    { href: "/employee/overtime", icon: Clock, label: "Lembur", bg: "bg-sky-50", color: "text-sky-600" },
                    { href: "/employee/visits", icon: LayoutDashboard, label: "Kunjungan", bg: "bg-indigo-50", color: "text-indigo-600" },
                    { href: "/employee/attendance/correction", icon: ClipboardList, label: "Koreksi", bg: "bg-teal-50", color: "text-teal-600" },
                    { href: "/employee/todos", icon: LogIn, label: "To-Do", bg: "bg-violet-50", color: "text-violet-600" },
                    { href: "/employee/documents", icon: Newspaper, label: "Dokumen", bg: "bg-orange-50", color: "text-orange-600" },
                    { href: "/employee/attendance-history", icon: TrendingUp, label: "Riwayat", bg: "bg-emerald-50", color: "text-emerald-600" },
                ].map((item, i) => (
                    <Link key={i} href={item.href} className="flex flex-col items-center gap-1.5 group">
                        <div className={`w-[52px] h-[52px] rounded-2xl ${item.bg} border border-[var(--border)] flex items-center justify-center transition-all duration-200 active:scale-95 group-hover:border-[var(--primary)]`}>
                            <item.icon className={`w-[22px] h-[22px] ${item.color} stroke-[1.6]`} />
                        </div>
                        <span className="text-[10px] font-semibold text-[var(--text-secondary)] text-center leading-tight">
                            {item.label}
                        </span>
                    </Link>
                ))}
            </div>

            {/* ─── Stats Row (Compact) ─────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
                {/* Total Kehadiran */}
                <div className="flex items-center gap-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl px-4 py-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <TrendingUp className="w-[18px] h-[18px] text-emerald-600 stroke-[2]" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xl font-extrabold text-[var(--text-primary)] leading-none">{presentTotal}</p>
                        <p className="text-[10px] font-semibold text-[var(--text-muted)] mt-0.5 truncate">Total Kehadiran</p>
                    </div>
                </div>

                {/* Sisa Cuti */}
                <div className="flex items-center gap-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl px-4 py-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                        <CalendarOff className="w-[18px] h-[18px] text-amber-600 stroke-[2]" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xl font-extrabold text-[var(--text-primary)] leading-none">{remainingLeave}</p>
                        <p className="text-[10px] font-semibold text-[var(--text-muted)] mt-0.5 truncate">Sisa Hari Cuti</p>
                    </div>
                </div>
            </div>

            {/* ─── Informasi / Pengumuman ──────────────────────── */}
            <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <h2 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5" /> Informasi
                    </h2>
                    {news.length > 3 && (
                        <Link href="/employee/news" className="text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-secondary)] uppercase tracking-wide transition-colors">
                            Lihat Semua
                        </Link>
                    )}
                </div>

                {news.length === 0 ? (
                    <div className="px-4 pb-5 pt-3 text-center">
                        <p className="text-xs font-medium text-[var(--text-muted)]">Tidak ada informasi aktif.</p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {news.slice(0, 3).map((item, index) => (
                            <div key={item.id}>
                                <Link href={`/employee/news/${item.id}`} className="block px-4 py-3.5 hover:bg-[var(--secondary)]/60 transition-colors">
                                    <div className="flex gap-3 items-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#800020]/60 shrink-0" />
                                        <p className="text-[13px] font-medium text-[var(--text-secondary)] leading-snug line-clamp-2">{item.title}</p>
                                        <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 ml-auto" />
                                    </div>
                                </Link>
                                {index < Math.min(news.length, 3) - 1 && <div className="h-px bg-[var(--secondary)] mx-4" />}
                            </div>
                        ))}
                    </div>
                )}
            </div>

        </div>
    );
}

