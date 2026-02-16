"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Users, ClipboardList, CalendarOff, FileText, TrendingUp, ArrowRight,
    Clock, Wallet, Megaphone, Activity, UserCheck, UserX, AlertCircle,
    MapPinned, Clock4, BarChart3
} from "lucide-react";
import LeaveCalendar from "@/components/LeaveCalendar";

interface AnalyticsData {
    summary: {
        totalEmployees: number;
        activeToday: number;
        lateToday: number;
        pendingLeaves: number;
        pendingVisits: number;
        pendingOvertime: number;
    };
    weeklyAttendance: { date: string; present: number; late: number; absent: number }[];
    departmentStats: { department: string; total: number; presentToday: number }[];
    recentActivity: { type: string; message: string; time: string }[];
}

interface Employee { id: string; employeeId: string; name: string; department: string; position: string; isActive: boolean; }
interface AttendanceRecord { employeeId: string; date: string; status: string; clockIn?: string; clockOut?: string; }
interface LeaveRequest { id: string; employeeId: string; type: string; startDate: string; endDate: string; status: string; }
interface NewsItem { id: string; title: string; category: string; createdAt: string; }

export default function DashboardPage() {
    const router = useRouter();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

    useEffect(() => {
        fetch("/api/employees").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setEmployees(d); });
        fetch("/api/attendance").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setAttendance(d); });
        fetch("/api/leave").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setLeaves(d); });
        fetch("/api/news").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setNews(d); });
        fetch("/api/analytics").then((r) => r.json()).then((d) => { if (d?.summary) setAnalytics(d); }).catch(() => { });
    }, []);

    const today = new Date().toISOString().split("T")[0];
    const todayAttendance = attendance.filter((a) => a.date === today);
    const activeEmps = employees.filter((e) => e.isActive);
    const pendingLeaves = leaves.filter((l) => l.status === "pending");
    const presentCount = todayAttendance.filter((a) => a.status === "present" || a.status === "late").length;
    const lateCount = todayAttendance.filter((a) => a.status === "late").length;
    const attendanceRate = activeEmps.length > 0 ? Math.round((presentCount / activeEmps.length) * 100) : 0;

    const now = new Date();
    const greeting = now.getHours() < 12 ? "Selamat Pagi" : now.getHours() < 17 ? "Selamat Siang" : "Selamat Malam";

    const stats = [
        { label: "Total Karyawan", value: activeEmps.length, sub: `${employees.length - activeEmps.length} nonaktif`, icon: Users, color: "text-[var(--primary)]", bg: "bg-[var(--primary)]/10" },
        { label: "Hadir Hari Ini", value: presentCount, sub: `dari ${activeEmps.length} aktif`, icon: UserCheck, color: "text-green-600", bg: "bg-green-500/10" },
        { label: "Terlambat", value: lateCount, sub: "hari ini", icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-500/10" },
        { label: "Tingkat Kehadiran", value: `${attendanceRate}%`, sub: today, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-500/10" },
    ];

    const menuItems = [
        { label: "Karyawan", desc: "Kelola data karyawan", href: "/dashboard/employees", icon: Users, count: employees.length },
        { label: "Absensi", desc: "Monitor kehadiran", href: "/dashboard/attendance", icon: ClipboardList, count: todayAttendance.length },
        { label: "Kunjungan", desc: "Kelola kunjungan", href: "/dashboard/visits", icon: MapPinned },
        { label: "Lembur", desc: "Kelola lembur", href: "/dashboard/overtime", icon: Clock4 },
        { label: "Payroll", desc: "Buat slip gaji", href: "/dashboard/payroll", icon: Wallet },
        { label: "Cuti", desc: "Kelola pengajuan", href: "/dashboard/leave", icon: CalendarOff, count: pendingLeaves.length },
        { label: "Jam Kerja", desc: "Atur shift", href: "/dashboard/shifts", icon: Clock },
        { label: "Laporan", desc: "Export data", href: "/dashboard/reports", icon: FileText },
        { label: "WIG News", desc: "Pengumuman", href: "/dashboard/news", icon: Megaphone, count: news.length },
    ];

    const getEmployeeName = (empId: string) => {
        const emp = employees.find((e) => e.employeeId === empId);
        return emp?.name || empId;
    };

    // Chart helpers
    const weeklyData = analytics?.weeklyAttendance || [];
    const maxChartVal = Math.max(...weeklyData.map((d) => d.present + d.late + d.absent), 1);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
                <div>
                    <p className="text-sm text-[var(--text-muted)]">{greeting} 👋</p>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-1">HR Dashboard</h1>
                    <p className="text-sm text-[var(--text-muted)] mt-0.5">
                        {now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="px-3 py-1.5 bg-[var(--primary)]/10 rounded-full flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-[var(--primary)]" />
                        <span className="text-xs font-semibold text-[var(--primary)]">Sistem Aktif</span>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((s, i) => {
                    const Icon = s.icon;
                    return (
                        <div key={i} className="card p-5 flex items-start gap-4">
                            <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-6 h-6 ${s.color}`} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-2xl font-extrabold text-[var(--text-primary)]">{s.value}</p>
                                <p className="text-xs font-medium text-[var(--text-secondary)] mt-0.5">{s.label}</p>
                                <p className="text-[10px] text-[var(--text-muted)]">{s.sub}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Pending Badges */}
            {analytics && (analytics.summary.pendingLeaves > 0 || analytics.summary.pendingVisits > 0 || analytics.summary.pendingOvertime > 0) && (
                <div className="flex flex-wrap gap-2">
                    {analytics.summary.pendingLeaves > 0 && (
                        <button onClick={() => router.push("/dashboard/leave")} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-xs font-medium text-orange-700 hover:bg-orange-100 transition-colors">
                            <CalendarOff className="w-3.5 h-3.5" /> {analytics.summary.pendingLeaves} cuti menunggu
                        </button>
                    )}
                    {analytics.summary.pendingVisits > 0 && (
                        <button onClick={() => router.push("/dashboard/visits")} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                            <MapPinned className="w-3.5 h-3.5" /> {analytics.summary.pendingVisits} kunjungan menunggu
                        </button>
                    )}
                    {analytics.summary.pendingOvertime > 0 && (
                        <button onClick={() => router.push("/dashboard/overtime")} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors">
                            <Clock4 className="w-3.5 h-3.5" /> {analytics.summary.pendingOvertime} lembur menunggu
                        </button>
                    )}
                </div>
            )}

            {/* Quick Menu */}
            <div className="space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">Menu Utama</h2>
                <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-9 gap-3">
                    {menuItems.map((m) => {
                        const Icon = m.icon;
                        return (
                            <button key={m.href} onClick={() => router.push(m.href)} className="card p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all group cursor-pointer relative">
                                {m.count !== undefined && m.count > 0 && (
                                    <span className="absolute top-2 right-2 w-5 h-5 bg-[var(--primary)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">{m.count}</span>
                                )}
                                <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center group-hover:bg-[var(--primary)] transition-colors">
                                    <Icon className="w-5 h-5 text-[var(--primary)] group-hover:text-white transition-colors" />
                                </div>
                                <div className="text-center">
                                    <p className="text-xs font-semibold text-[var(--text-primary)]">{m.label}</p>
                                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5 hidden sm:block">{m.desc}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Leave Calendar Section */}
            <div className="space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                    <CalendarOff className="w-4 h-4 text-[var(--primary)]" /> Monitoring Cuti Karyawan
                </h2>
                <LeaveCalendar leaves={leaves} />
            </div>

            {/* Weekly Attendance Chart + Department Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Weekly Attendance Chart */}
                <div className="lg:col-span-3 space-y-3">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-[var(--primary)]" /> Kehadiran 7 Hari Terakhir
                    </h2>
                    <div className="card p-5">
                        {weeklyData.length === 0 ? (
                            <div className="p-8 text-center">
                                <BarChart3 className="w-8 h-8 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)]">Memuat data chart...</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-end gap-1.5 h-[160px]">
                                    {weeklyData.map((d, i) => {
                                        const total = d.present + d.late + d.absent;
                                        const pctPresent = total > 0 ? (d.present / maxChartVal) * 100 : 0;
                                        const pctLate = total > 0 ? (d.late / maxChartVal) * 100 : 0;
                                        const dayLabel = new Date(d.date).toLocaleDateString("id-ID", { weekday: "short" });
                                        return (
                                            <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                                                <div className="relative w-full flex flex-col justify-end" style={{ height: "130px" }}>
                                                    {/* Tooltip */}
                                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--text-primary)] text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                                                        H:{d.present} T:{d.late} A:{d.absent}
                                                    </div>
                                                    <div className="w-full rounded-t bg-green-400 transition-all duration-500" style={{ height: `${pctPresent}%`, minHeight: d.present > 0 ? "4px" : "0" }} />
                                                    <div className="w-full bg-orange-400 transition-all duration-500" style={{ height: `${pctLate}%`, minHeight: d.late > 0 ? "4px" : "0" }} />
                                                </div>
                                                <span className="text-[10px] text-[var(--text-muted)] font-medium">{dayLabel}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex items-center justify-center gap-4 mt-4">
                                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-400" /><span className="text-[10px] text-[var(--text-muted)]">Hadir</span></div>
                                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-orange-400" /><span className="text-[10px] text-[var(--text-muted)]">Terlambat</span></div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Department Stats */}
                <div className="lg:col-span-2 space-y-3">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                        <Users className="w-4 h-4 text-[var(--primary)]" /> Per Departemen
                    </h2>
                    <div className="card divide-y divide-[var(--border)]">
                        {!analytics?.departmentStats?.length ? (
                            <div className="p-8 text-center">
                                <Users className="w-8 h-8 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)]">Memuat data...</p>
                            </div>
                        ) : (
                            analytics.departmentStats.map((dept) => {
                                const pct = dept.total > 0 ? Math.round((dept.presentToday / dept.total) * 100) : 0;
                                return (
                                    <div key={dept.department} className="p-3">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs font-semibold text-[var(--text-primary)]">{dept.department}</span>
                                            <span className="text-[10px] text-[var(--text-muted)]">{dept.presentToday}/{dept.total} ({pct}%)</span>
                                        </div>
                                        <div className="w-full bg-[var(--secondary)] rounded-full h-2">
                                            <div className="bg-[var(--primary)] h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Activity Feed */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                            <Activity className="w-4 h-4 text-[var(--primary)]" /> Aktivitas Terbaru
                        </h2>
                    </div>
                    <div className="card overflow-hidden">
                        {!analytics?.recentActivity?.length ? (
                            <div className="p-8 text-center">
                                <Activity className="w-8 h-8 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)]">Belum ada aktivitas</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--border)]">
                                {analytics.recentActivity.map((act, i) => (
                                    <div key={i} className="p-3 flex items-start gap-3">
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${act.type === "leave" ? "bg-orange-100 text-orange-600" : act.type === "visit" ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"}`}>
                                            {act.type === "leave" ? <CalendarOff className="w-3.5 h-3.5" /> : act.type === "visit" ? <MapPinned className="w-3.5 h-3.5" /> : <Clock4 className="w-3.5 h-3.5" />}
                                        </div>
                                        <div>
                                            <p className="text-xs text-[var(--text-secondary)]">{act.message}</p>
                                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{new Date(act.time).toLocaleDateString("id-ID")}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Pending Leave Requests */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                            <CalendarOff className="w-4 h-4 text-orange-500" /> Pengajuan Cuti Pending
                        </h2>
                        <button onClick={() => router.push("/dashboard/leave")} className="text-xs font-medium text-[var(--primary)] flex items-center gap-1 hover:underline">
                            Kelola <ArrowRight className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="card overflow-hidden">
                        {pendingLeaves.length === 0 ? (
                            <div className="p-8 text-center">
                                <CalendarOff className="w-8 h-8 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)]">Tidak ada pengajuan cuti pending</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--border)]">
                                {pendingLeaves.slice(0, 5).map((l) => (
                                    <div key={l.id} className="p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-xs font-bold">
                                                {getEmployeeName(l.employeeId).charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-[var(--text-primary)]">{getEmployeeName(l.employeeId)}</p>
                                                <p className="text-[10px] text-[var(--text-muted)]">{l.type} • {l.startDate} — {l.endDate}</p>
                                            </div>
                                        </div>
                                        <span className="badge badge-warning">Pending</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Today's Attendance */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-green-500" /> Absensi Hari Ini
                        </h2>
                        <button onClick={() => router.push("/dashboard/attendance")} className="text-xs font-medium text-[var(--primary)] flex items-center gap-1 hover:underline">
                            Detail <ArrowRight className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="card overflow-hidden">
                        {todayAttendance.length === 0 ? (
                            <div className="p-8 text-center">
                                <ClipboardList className="w-8 h-8 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)]">Belum ada kehadiran hari ini</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--border)]">
                                {todayAttendance.slice(0, 5).map((a, i) => (
                                    <div key={i} className="p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${a.status === "present" ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"}`}>
                                                {getEmployeeName(a.employeeId).charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-[var(--text-primary)]">{getEmployeeName(a.employeeId)}</p>
                                                <p className="text-[10px] text-[var(--text-muted)]">
                                                    Masuk: {a.clockIn ? new Date(a.clockIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                                                    {a.clockOut && ` • Pulang: ${new Date(a.clockOut).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`}
                                                </p>
                                            </div>
                                        </div>
                                        <span className={`badge ${a.status === "present" ? "badge-success" : "badge-warning"}`}>
                                            {a.status === "present" ? "Hadir" : "Terlambat"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Not Yet Present */}
                <div className="space-y-3">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                        <UserX className="w-4 h-4 text-red-500" /> Belum Hadir Hari Ini
                    </h2>
                    <div className="card">
                        {(() => {
                            const presentIds = new Set(todayAttendance.map((a) => a.employeeId));
                            const absent = activeEmps.filter((e) => !presentIds.has(e.employeeId));
                            if (absent.length === 0) return (
                                <div className="p-8 text-center">
                                    <UserCheck className="w-8 h-8 text-green-500 opacity-30 mx-auto mb-2" />
                                    <p className="text-xs text-[var(--text-muted)]">Semua karyawan sudah hadir 🎉</p>
                                </div>
                            );
                            return (
                                <div className="divide-y divide-[var(--border)]">
                                    {absent.slice(0, 5).map((e) => (
                                        <div key={e.id} className="p-3 flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold">
                                                {e.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-[var(--text-primary)]">{e.name}</p>
                                                <p className="text-[10px] text-[var(--text-muted)]">{e.department} • {e.position}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {absent.length > 5 && <p className="text-xs text-center py-2 text-[var(--text-muted)]">+{absent.length - 5} lainnya</p>}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {/* Recent News & Employee Table */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent News */}
                <div className="space-y-3">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                        <Megaphone className="w-4 h-4 text-[var(--primary)]" /> Berita Terbaru
                    </h2>
                    <div className="card divide-y divide-[var(--border)]">
                        {news.length === 0 ? (
                            <div className="p-8 text-center">
                                <Megaphone className="w-8 h-8 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)]">Belum ada berita</p>
                            </div>
                        ) : (
                            news.slice(0, 3).map((n) => (
                                <div key={n.id} className="p-3">
                                    <p className="text-sm font-medium text-[var(--text-primary)]">{n.title}</p>
                                    <p className="text-[10px] text-[var(--text-muted)] mt-1">{n.category} • {new Date(n.createdAt).toLocaleDateString("id-ID")}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Employee Overview (compact) */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                            <Users className="w-4 h-4 text-[var(--primary)]" /> Data Karyawan
                        </h2>
                        <button onClick={() => router.push("/dashboard/employees")} className="text-xs font-medium text-[var(--primary)] flex items-center gap-1 hover:underline">
                            Lihat Semua <ArrowRight className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Nama</th>
                                        <th className="hidden sm:table-cell">Departemen</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-8 text-sm text-[var(--text-muted)]">Belum ada data</td></tr>
                                    ) : (
                                        employees.slice(0, 5).map((e) => (
                                            <tr key={e.id}>
                                                <td className="font-mono text-xs">{e.employeeId}</td>
                                                <td className="font-medium text-[var(--text-primary)]">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">{e.name.charAt(0)}</div>
                                                        {e.name}
                                                    </div>
                                                </td>
                                                <td className="hidden sm:table-cell">{e.department}</td>
                                                <td><span className={`badge ${e.isActive ? "badge-success" : "badge-error"}`}>{e.isActive ? "Aktif" : "Nonaktif"}</span></td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
}
