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

    return (
        <div className="w-full max-w-md mx-auto space-y-6 pb-24 pt-2 px-2">
            
            {/* Header section */}
            <div className="flex items-start justify-between px-2">
                <div className="flex items-center gap-3">
                    {user?.avatarUrl ? (
                        <img src={user.avatarUrl} alt="Avatar" className="w-14 h-14 rounded-full object-cover shadow-sm border-2 border-white ring-1 ring-slate-200" />
                    ) : (
                        <div className="w-14 h-14 rounded-full bg-[#800020] text-white flex items-center justify-center text-xl font-bold shadow-sm border-2 border-white ring-1 ring-slate-200">
                            {user?.name?.charAt(0).toUpperCase() ?? "U"}
                        </div>
                    )}
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                            {currentTime.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
                        </p>
                        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 leading-none mb-1">
                            {user?.name?.split(' ')[0] ?? "Sobat"}
                        </h1>
                        <p className="text-[10px] font-semibold text-slate-500 leading-tight">
                            {user?.positionRel?.name ?? "Karyawan"} • {user?.departmentRel?.name ?? "Department"}
                        </p>
                    </div>
                </div>
                <div className="text-right flex flex-col items-end pt-1">
                    <span className="text-xl font-bold font-mono tracking-tighter text-slate-900 leading-none">
                        {currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                </div>
            </div>

            <PushNotificationManager />

            {/* Greeting Card */}
            <div className="bg-white rounded-[20px] p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] border border-slate-100/60">
                <h2 className="text-sm font-bold text-slate-900 mb-2.5">
                    {greeting} <span className="text-slate-400 font-medium italic text-xs ml-1">Happy Shine On You</span>
                </h2>
                <p className="text-[13px] text-slate-500 leading-[1.6] font-medium">
                    {subGreeting}
                </p>
            </div>

            {/* Quick Actions Grid (Horizontal) */}
            <div className="grid grid-cols-4 gap-y-5 gap-x-2 px-1 pt-2">
                {[
                    { href: "/employee/leave", icon: CalendarOff, label: "Cuti" },
                    { href: "/employee/payslip", icon: Receipt, label: "Slip Gaji" },
                    { href: "/employee/overtime", icon: Clock, label: "Lembur" },
                    { href: "/employee/visits", icon: LayoutDashboard, label: "Kunjungan" },
                    { href: "/employee/attendance/correction", icon: ClipboardList, label: "Koreksi" },
                    { href: "/employee/todos", icon: LogIn, label: "To-Do" },
                    { href: "/employee/documents", icon: Newspaper, label: "Dokumen" },
                    { href: "/employee/attendance-history", icon: TrendingUp, label: "Riwayat" },
                ].map((item, i) => (
                    <Link key={i} href={item.href} className="flex flex-col items-center gap-2 group">
                        <div className="w-[56px] h-[56px] rounded-[16px] bg-white flex items-center justify-center transition-transform active:scale-95 group-hover:scale-105 border border-slate-200 shadow-sm">
                            <item.icon className="w-6 h-6 text-slate-700 stroke-[1.5]" />
                        </div>
                        <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">
                            {item.label}
                        </span>
                    </Link>
                ))}
            </div>

            {/* Grid Summary */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-[20px] p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] border border-slate-100/60 relative overflow-hidden">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                        <TrendingUp className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <p className="text-2xl font-extrabold text-slate-900">
                        {attendance.filter(a => a.status === "present" || a.status === "late").length}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-1">Total Kehadiran</p>
                </div>
                <div className="bg-white rounded-[20px] p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] border border-slate-100/60 relative overflow-hidden">
                    <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
                        <CalendarOff className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <p className="text-2xl font-extrabold text-slate-900">
                        {leaveBalance.total - leaveBalance.used}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-1">Sisa Hari Cuti</p>
                    <div className="absolute bottom-4 right-4 w-2 h-2 rounded-full bg-blue-600"></div>
                </div>
            </div>

            {/* Announcements */}
            <div className="bg-white rounded-[20px] shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] border border-slate-100/60 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Bell className="w-3.5 h-3.5" /> Informasi
                    </h2>
                    {news.length > 3 && (
                        <Link href="/employee/news" className="text-[10px] font-bold text-slate-400 hover:text-slate-800 uppercase tracking-wide">
                            Lihat Semua
                        </Link>
                    )}
                </div>
                
                {news.length === 0 ? (
                    <div className="p-6 text-center">
                        <p className="text-sm font-medium text-slate-400">Tidak ada pengaduan/informasi aktif.</p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {news.slice(0, 3).map((item, index) => (
                            <div key={item.id}>
                                <Link href={`/employee/news/${item.id}`} className="block px-5 py-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex gap-4 items-start">
                                        <div className="w-2 h-2 mt-1.5 rounded-full bg-rose-400 shrink-0"></div>
                                        <p className="text-sm font-medium text-slate-800 leading-snug line-clamp-2">{item.title}</p>
                                    </div>
                                </Link>
                                {index !== news.length - 1 && <div className="h-px bg-slate-50 mx-5"></div>}
                            </div>
                        ))}
                    </div>
                )}
            </div>

        </div>
    );
}

