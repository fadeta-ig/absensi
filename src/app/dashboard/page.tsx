"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { CalendarOff } from "lucide-react";
import LeaveCalendar from "@/components/LeaveCalendar";
import StatsGrid from "@/components/dashboard/StatsGrid";
import PendingBadges from "@/components/dashboard/PendingBadges";
import QuickMenu from "@/components/dashboard/QuickMenu";
import WeeklyChart from "@/components/dashboard/WeeklyChart";
import DepartmentStats from "@/components/dashboard/DepartmentStats";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import PendingLeaveList from "@/components/dashboard/PendingLeaveList";
import TodayAttendance from "@/components/dashboard/TodayAttendance";
import { toWIBDateString } from "@/lib/timezone";

// ─── Types ────────────────────────────────────────────────────
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

// ─── Page ─────────────────────────────────────────────────────
export default function DashboardPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

    useEffect(() => {
        fetch("/api/employees").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setEmployees(d); }).catch(() => { });
        fetch("/api/attendance").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setAttendance(d); }).catch(() => { });
        fetch("/api/leave").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setLeaves(d); }).catch(() => { });
        fetch("/api/news").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setNews(d); }).catch(() => { });
        fetch("/api/analytics").then((r) => r.json()).then((d) => { if (d?.summary) setAnalytics(d); }).catch(() => { });
    }, []);

    // ─── Derived State ────────────────────────────────────────
    const today = toWIBDateString();
    const todayAttendance = attendance.filter((a) => a.date === today);
    const activeEmps = employees.filter((e) => e.isActive);
    const pendingLeaves = leaves.filter((l) => l.status === "pending");
    const presentCount = todayAttendance.filter((a) => a.status === "present" || a.status === "late").length;
    const lateCount = todayAttendance.filter((a) => a.status === "late").length;
    const attendanceRate = activeEmps.length > 0 ? Math.round((presentCount / activeEmps.length) * 100) : 0;

    const now = new Date();
    const greeting = now.getHours() < 12 ? "Selamat Pagi" : now.getHours() < 17 ? "Selamat Siang" : "Selamat Malam";

    const getEmployeeName = (empId: string) => {
        const emp = employees.find((e) => e.employeeId === empId);
        return emp?.name || empId;
    };

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

            <StatsGrid
                activeCount={activeEmps.length}
                totalCount={employees.length}
                presentCount={presentCount}
                lateCount={lateCount}
                attendanceRate={attendanceRate}
                today={today}
            />

            {analytics && (
                <PendingBadges
                    pendingLeaves={analytics.summary.pendingLeaves}
                    pendingVisits={analytics.summary.pendingVisits}
                    pendingOvertime={analytics.summary.pendingOvertime}
                />
            )}

            <QuickMenu
                employeeCount={employees.length}
                todayAttendanceCount={todayAttendance.length}
                pendingLeaveCount={pendingLeaves.length}
                newsCount={news.length}
            />

            {/* Leave Calendar */}
            <div className="space-y-3">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                    <CalendarOff className="w-4 h-4 text-[var(--primary)]" /> Monitoring Cuti Karyawan
                </h2>
                <LeaveCalendar leaves={leaves} />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
                <WeeklyChart weeklyData={analytics?.weeklyAttendance || []} />
                <DepartmentStats departmentStats={analytics?.departmentStats || []} />
            </div>

            {/* Activity + Pending Leaves */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                <ActivityFeed activities={analytics?.recentActivity || []} />
                <PendingLeaveList leaves={pendingLeaves} getEmployeeName={getEmployeeName} />
            </div>

            {/* Bottom sections */}
            <TodayAttendance
                todayAttendance={todayAttendance}
                activeEmployees={activeEmps}
                employees={employees}
                news={news}
                getEmployeeName={getEmployeeName}
            />
        </div>
    );
}
