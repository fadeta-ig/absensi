"use client";

import { useEffect, useState } from "react";
import { Clock, CalendarOff, Newspaper, ClipboardList, TrendingUp } from "lucide-react";

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
                const approved = data.filter((l: { status: string }) => l.status === "approved").length;
                setLeaveBalance({ total: 12, used: approved });
            }
        });

        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const today = new Date().toISOString().split("T")[0];
    const todayRecord = attendance.find((a) => a.date === today);

    const formatTime = (iso?: string) => {
        if (!iso) return "--:--";
        return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    };

    const getStatusLabel = (s: string) => {
        switch (s) { case "present": return "Hadir"; case "late": return "Terlambat"; default: return s; }
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Welcome */}
            <div className="bg-gradient-to-r from-[var(--primary)] to-[var(--primary-light,#9B1B30)] rounded-xl p-6 text-white shadow-lg">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <p className="text-white/80 text-sm">Selamat datang kembali,</p>
                        <h1 className="text-2xl font-bold mt-1">{user?.name ?? "..."}</h1>
                        <p className="text-white/70 text-xs mt-1">
                            {currentTime.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-3xl font-extrabold font-mono tabular-nums">
                            {currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </p>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card p-5 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                        <p className="text-xs text-[var(--text-muted)]">Status Hari Ini</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">
                            {todayRecord ? getStatusLabel(todayRecord.status) : "Belum Absen"}
                        </p>
                    </div>
                </div>
                <div className="card p-5 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <CalendarOff className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                        <p className="text-xs text-[var(--text-muted)]">Sisa Cuti</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">{leaveBalance.total - leaveBalance.used} hari</p>
                    </div>
                </div>
                <div className="card p-5 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-xs text-[var(--text-muted)]">Total Kehadiran</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">{attendance.length} hari</p>
                    </div>
                </div>
            </div>

            {/* News */}
            <div className="space-y-3">
                <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-[var(--primary)]" />
                    Berita Terbaru
                </h2>
                {news.length === 0 ? (
                    <div className="card p-6 text-center text-sm text-[var(--text-muted)]">Tidak ada berita</div>
                ) : (
                    <div className="space-y-2">
                        {news.slice(0, 3).map((item) => (
                            <div key={item.id} className="card px-4 py-3 hover:shadow-md transition-shadow cursor-pointer">
                                <p className="text-sm font-medium text-[var(--text-primary)]">{item.title}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Recent Attendance */}
            <div className="space-y-3">
                <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-[var(--primary)]" />
                    Riwayat Kehadiran
                </h2>
                <div className="card overflow-hidden">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Tanggal</th>
                                <th>Clock In</th>
                                <th>Clock Out</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {attendance.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-8 text-sm text-[var(--text-muted)]">Belum ada data</td></tr>
                            ) : (
                                attendance.slice(0, 5).map((r, i) => (
                                    <tr key={i}>
                                        <td className="font-medium text-[var(--text-primary)]">{r.date}</td>
                                        <td>{formatTime(r.clockIn)}</td>
                                        <td>{formatTime(r.clockOut)}</td>
                                        <td><span className={`badge badge-${r.status === "present" ? "success" : r.status === "late" ? "warning" : "error"}`}>{getStatusLabel(r.status)}</span></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
