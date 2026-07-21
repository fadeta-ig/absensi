"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Activity, AlertCircle, RefreshCw } from "lucide-react";
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
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage } from "@/lib/clientErrors";
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
    const toast = useToast();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [initialLoading, setInitialLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchAllData = useCallback(async (showToast = false) => {
        setRefreshing(true);
        try {
            const [empRes, attRes, leaveRes, newsRes, analyticsRes] = await Promise.all([
                fetch("/api/employees"),
                fetch("/api/attendance"),
                fetch("/api/leave"),
                fetch("/api/news"),
                fetch("/api/analytics"),
            ]);

            const failedResponse = [empRes, attRes, leaveRes, newsRes, analyticsRes].find((res) => !res.ok);
            if (failedResponse) {
                throw new Error(await getResponseErrorMessage(failedResponse, "Gagal memuat data dashboard."));
            }

            const [empData, attData, leaveData, newsData, analyticsData] = await Promise.all([
                empRes.json(),
                attRes.json(),
                leaveRes.json(),
                newsRes.json(),
                analyticsRes.json(),
            ]);

            if (Array.isArray(empData)) setEmployees(empData);
            if (Array.isArray(attData)) setAttendance(attData);
            if (Array.isArray(leaveData)) setLeaves(leaveData);
            if (Array.isArray(newsData)) setNews(newsData);
            if (analyticsData?.summary) setAnalytics(analyticsData);
            setLoadError(null);
            setLastUpdated(new Date());
            if (showToast) toast("Dashboard berhasil diperbarui.", "success");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Gagal memuat data dashboard.";
            setLoadError(message);
            if (showToast) toast(message, "error");
        } finally {
            setInitialLoading(false);
            setRefreshing(false);
        }
    }, [toast]);

    useEffect(() => {
        const initialFetchTimer = setTimeout(() => void fetchAllData(), 0);

        // Auto-refresh every 30 seconds, skip if tab is inactive
        intervalRef.current = setInterval(() => {
            if (document.visibilityState === "visible") {
                fetchAllData();
            }
        }, 30000);

        return () => {
            clearTimeout(initialFetchTimer);
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchAllData]);

    // ─── Derived State ────────────────────────────────────────
    const today = toWIBDateString();
    const todayAttendance = attendance.filter((a) => a.date === today);
    const activeEmps = employees.filter((e) => e.isActive);
    const pendingLeaves = leaves.filter((l) => l.status === "pending");
    const presentCount = todayAttendance.filter((a) => a.status === "present" || a.status === "late").length;
    const lateCount = todayAttendance.filter((a) => a.status === "late").length;
    const attendanceRate = activeEmps.length > 0 ? Math.round((presentCount / activeEmps.length) * 100) : 0;
    const onLeaveToday = leaves.filter(l =>
        l.status === "approved" && today >= l.startDate && today <= l.endDate
    ).length;

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
                <div className="flex items-center gap-3">
                    <div className="px-3 py-1.5 bg-[var(--primary)]/10 rounded-full flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-[var(--primary)]" />
                        <span className="text-xs font-semibold text-[var(--primary)]">Sistem Aktif</span>
                    </div>
                <button
                        onClick={() => void fetchAllData(true)}
                        disabled={refreshing}
                        className="px-3 py-1.5 bg-[var(--secondary)] rounded-full flex items-center gap-1.5 hover:bg-[var(--border)] transition-colors"
                        title="Refresh sekarang"
                    >
                        <RefreshCw className={`w-3 h-3 text-[var(--text-muted)] ${refreshing ? "animate-spin" : ""}`} />
                        <span className="text-[10px] font-medium text-[var(--text-muted)]">
                            {lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {initialLoading && !analytics ? (
                <div className="space-y-6">
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        <Skeleton className="h-64 w-full lg:col-span-3" />
                        <Skeleton className="h-64 w-full lg:col-span-2" />
                    </div>
                </div>
            ) : analytics ? (
                <>
                    <StatsGrid
                        activeCount={activeEmps.length}
                        totalCount={employees.length}
                        presentCount={presentCount}
                        lateCount={lateCount}
                        attendanceRate={attendanceRate}
                        today={today}
                        onLeaveCount={onLeaveToday}
                    />

                    <PendingBadges
                        pendingLeaves={analytics.summary.pendingLeaves}
                        pendingVisits={analytics.summary.pendingVisits}
                        pendingOvertime={analytics.summary.pendingOvertime}
                    />

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
                        <WeeklyChart weeklyData={analytics.weeklyAttendance || []} />
                        <DepartmentStats departmentStats={analytics.departmentStats || []} />
                    </div>

                    {/* Activity + Pending Leaves */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                        <ActivityFeed activities={analytics.recentActivity || []} />
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
                </>
            ) : (
                <div className="card p-12 text-center">
                    <AlertCircle className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Data dashboard belum dapat dimuat</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Gunakan tombol refresh untuk mencoba memuat ulang.</p>
                </div>
            )}
        </div>
    );
}
