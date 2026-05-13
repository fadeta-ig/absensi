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
    const [user, setUser] = useState<{ name: string; employeeId: string } | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [news, setNews] = useState<NewsItem[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [leaveBalance, setLeaveBalance] = useState({ total: 0, used: 0 });

    useEffect(() => {
        fetch("/api/auth/me").then((r) => r.json()).then(setUser);
        fetch("/api/news").then((r) => r.json()).then(setNews);
        fetch("/api/attendance").then((r) => r.json()).then(setAttendance);
        fetch("/api/leave").then((r) => r.json()).then((data) => {
            if (Array.isArray(data)) {
                const approvedLeaves = data.filter((l: { status: string; type: string }) => l.status === "approved" && l.type === "annual");
                let usedDays = 0;
                approvedLeaves.forEach((l: { startDate: string; endDate: string }) => {
                    const s = new Date(l.startDate);
                    const e = new Date(l.endDate);
                    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    usedDays += diff;
                });
                setLeaveBalance({ total: 12, used: usedDays });
            }
        });

        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const today = new Date().toISOString().split("T")[0];
    const todayRecord = attendance.find((a) => a.date === today);

    const getStatusLabel = (s: string) => {
        switch (s) { case "present": return "Hadir Tepat Waktu"; case "late": return "Terlambat"; default: return s; }
    };

    return (
        <div className="w-full max-w-md mx-auto space-y-6 pb-12 pt-4 px-2">
            
            {/* Header section */}
            <div className="flex items-end justify-between px-2">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                        {currentTime.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        {user?.name?.split(' ')[0] ?? "Sobat"}
                    </h1>
                </div>
                <div className="text-right flex flex-col items-end">
                    <span className="text-2xl font-bold font-mono tracking-tighter text-slate-900 leading-none">
                        {currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                </div>
            </div>

            <PushNotificationManager />

            {/* Quick Record CTA */}
            <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100 flex items-center justify-between transition-transform active:scale-[0.98]">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${todayRecord ? "bg-slate-50 text-slate-400" : "bg-black text-white"}`}>
                        <Clock className="w-6 h-6 stroke-[2]" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-900">
                            {todayRecord ? getStatusLabel(todayRecord.status) : "Belum Absen"}
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-1">
                            {todayRecord?.clockIn 
                                ? `Masuk: ${new Date(todayRecord.clockIn).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}` 
                                : "Ketuk untuk lapor kehadiran"}
                        </p>
                    </div>
                </div>
                {!todayRecord?.clockOut && (
                    <Link href="/employee/attendance" className="flex items-center justify-center w-10 h-10 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors">
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                    </Link>
                )}
            </div>

            {/* Grid Summary */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                        <TrendingUp className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">
                        {attendance.filter(a => a.status === "present" || a.status === "late").length}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-1">Total Kehadiran</p>
                </div>
                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
                        <CalendarOff className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">
                        {leaveBalance.total - leaveBalance.used}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-1">Sisa Hari Cuti</p>
                </div>
            </div>

            {/* Quick Actions Menu */}
            <div className="bg-white rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden">
                <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-5 pt-5 pb-2">
                    Jalan Pintas
                </h2>
                <div className="flex flex-col">
                    <Link href="/employee/leave" className="flex items-center justify-between px-5 py-4 hover:bg-slate-50/80 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                                <LogIn className="w-4 h-4 text-indigo-600" />
                            </div>
                            <span className="text-sm font-semibold text-slate-800">Pengajuan Cuti</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                    </Link>
                    <div className="h-px bg-slate-50 mx-5"></div>
                    <Link href="/employee/payslip" className="flex items-center justify-between px-5 py-4 hover:bg-slate-50/80 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center">
                                <Receipt className="w-4 h-4 text-teal-600" />
                            </div>
                            <span className="text-sm font-semibold text-slate-800">Slip Gaji</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                    </Link>
                    <div className="h-px bg-slate-50 mx-5"></div>
                    <Link href="/employee/attendance-history" className="flex items-center justify-between px-5 py-4 hover:bg-slate-50/80 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-sky-50 flex items-center justify-center">
                                <ClipboardList className="w-4 h-4 text-sky-600" />
                            </div>
                            <span className="text-sm font-semibold text-slate-800">Riwayat Terakhir</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                    </Link>
                </div>
            </div>

            {/* Announcements */}
            <div className="bg-white rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden flex flex-col">
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

