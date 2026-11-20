"use client";

import { useEffect, useState } from "react";
import { 
    Clock, CalendarOff, Newspaper, ClipboardList, TrendingUp, 
    ChevronRight, LogIn, Receipt, Bell, LayoutDashboard, Loader2,
    Grid, ChevronDown, CalendarClock, ListChecks
} from "lucide-react";
import Link from "next/link";
import PushNotificationManager from "@/components/PushNotificationManager";
import { useToast } from "@/components/Toast";
import { stripGelar } from "@/lib/utils/formatters";
import { FALLBACK_GREETING, resolveGreetingForMoment, type GreetingRuleLike } from "@/lib/greeting";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import AllMenusSheet from "./components/AllMenusSheet";
import { useAttendanceServerContext } from "@/hooks/useAttendanceServerContext";

interface NewsItem { id: string; title: string; audience?: "ALL" | "SELECTED"; }
interface AttendanceRecord { date: string; clockIn?: string; clockOut?: string; status: string; }

export default function EmployeeHomePage() {
    const toast = useToast();
    const serverContext = useAttendanceServerContext();
    const [user, setUser] = useState<{ 
        name: string; 
        employeeId: string; 
        avatarUrl?: string;
        departmentRel?: { name: string };
        divisionRel?: { name: string };
        positionRel?: { name: string };
        hasSubordinates?: boolean;
        subordinates?: unknown[];
    } | null>(null);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [cleaningCaps, setCleaningCaps] = useState<{ isReviewer: boolean; isTopViewer: boolean } | null>(null);
    const [equipmentCaps, setEquipmentCaps] = useState<{ canExecute: boolean; canReview: boolean; canTopView: boolean; canApprove: boolean; canManageSettings: boolean } | null>(null);
    const [canMonitorMeeting, setCanMonitorMeeting] = useState<boolean | null>(null);
    const [loadingData, setLoadingData] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [isAllMenusOpen, setIsAllMenusOpen] = useState(false);
    const [greetingRules, setGreetingRules] = useState<GreetingRuleLike[]>([]);
    const [canEditGreeting, setCanEditGreeting] = useState(false);
    const [, setClockTick] = useState(0);

    // Sapaan mengikuti jendela jam; render ulang tiap menit agar batas jam
    // terasa tepat tanpa menunggu refresh konteks server berikutnya.
    useEffect(() => {
        const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 60_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        const loadHomeData = async () => {
            setLoadingData(true);
            setLoadError("");
            try {
                const [userRes, newsRes, attendanceRes, capsRes, equipCapsRes, monitorCapsRes, greetingRes] = await Promise.all([
                    fetch("/api/auth/me"),
                    fetch("/api/news"),
                    fetch("/api/attendance"),
                    fetch("/api/employee/cleaning/capabilities").catch(() => null),
                    fetch("/api/employee/equipment/capabilities").catch(() => null),
                    fetch("/api/employee/meeting-capabilities").catch(() => null),
                    fetch("/api/employee/greeting", { cache: "no-store" }).catch(() => null),
                ]);

                if (!userRes.ok) throw new Error(await getResponseErrorMessage(userRes, "Gagal memuat data profil."));
                if (!newsRes.ok) throw new Error(await getResponseErrorMessage(newsRes, "Gagal memuat informasi perusahaan."));
                if (!attendanceRes.ok) throw new Error(await getResponseErrorMessage(attendanceRes, "Gagal memuat data kehadiran."));

                const [userData, newsData, attendanceData] = await Promise.all([
                    userRes.json(),
                    newsRes.json(),
                    attendanceRes.json()
                ]);

                setUser(userData);
                try {
                    const capsJson = capsRes && capsRes.ok ? await capsRes.json() : null;
                    const caps = capsJson?.data;
                    setCleaningCaps(
                        caps && typeof caps.isReviewer === "boolean"
                            ? { isReviewer: caps.isReviewer, isTopViewer: Boolean(caps.isTopViewer) }
                            : { isReviewer: true, isTopViewer: true }
                    );
                } catch {
                    setCleaningCaps({ isReviewer: true, isTopViewer: true });
                }
                try {
                    const equipJson = equipCapsRes && equipCapsRes.ok ? await equipCapsRes.json() : null;
                    const equip = equipJson?.data;
                    setEquipmentCaps(
                        equip && typeof equip.canExecute === "boolean"
                            ? {
                                  canExecute: equip.canExecute,
                                  canReview: Boolean(equip.canReview),
                                  canTopView: Boolean(equip.canTopView),
                                  canApprove: Boolean(equip.canApprove),
                                  canManageSettings: Boolean(equip.canManageSettings),
                              }
                            : null
                    );
                } catch {
                    setEquipmentCaps(null);
                }
                try {
                    const monitorJson = monitorCapsRes && monitorCapsRes.ok ? await monitorCapsRes.json() : null;
                    const canMonitor = monitorJson?.data;
                    setCanMonitorMeeting(canMonitor && typeof canMonitor.canMonitor === "boolean" ? canMonitor.canMonitor : false);
                } catch {
                    setCanMonitorMeeting(false);
                }
                try {
                    const greetingJson = greetingRes && greetingRes.ok ? await greetingRes.json() : null;
                    const greetingData = greetingJson?.data;
                    setGreetingRules(Array.isArray(greetingData?.rules) ? (greetingData.rules as GreetingRuleLike[]) : []);
                    setCanEditGreeting(Boolean(greetingData?.canEditGreeting));
                } catch {
                    setGreetingRules([]);
                    setCanEditGreeting(false);
                }
                setNews(Array.isArray(newsData) ? newsData : []);
                setAttendance(Array.isArray(attendanceData) ? attendanceData : []);
            } catch (err) {
                reportClientError("EmployeeHomePage", "Gagal memuat data beranda employee", err);
                const message = err instanceof Error ? err.message : "Gagal memuat data beranda.";
                setLoadError(message);
                toast(message, "error");
            } finally {
                setLoadingData(false);
            }
        };

        void loadHomeData();

    }, [toast]);

    const attendanceDate = serverContext.context?.shiftDate;
    const todayRecord = attendanceDate ? attendance.find((record) => record.date === attendanceDate) : undefined;

    const getStatusLabel = (s: string) => {
        switch (s) { case "present": return "Hadir Tepat Waktu"; case "late": return "Terlambat"; default: return s; }
    };

    const greetingMoment = serverContext.displayWibDate
        && serverContext.displayWibHour !== null
        && serverContext.displayWibMinute !== null
        ? {
            wibDate: serverContext.displayWibDate,
            hour: serverContext.displayWibHour,
            minute: serverContext.displayWibMinute,
        }
        : null;
    const activeGreeting = greetingMoment
        ? resolveGreetingForMoment(greetingRules, greetingMoment)
        : FALLBACK_GREETING;

    return (
        <div className="space-y-5">
            
            {/* ─── Header ──────────────────────────────────────── */}
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    {user?.avatarUrl ? (
                        <img src={user.avatarUrl} alt="Avatar" className="w-12 h-12 rounded-full object-cover border-2 border-[var(--card)] ring-1 ring-[var(--border)] shrink-0" />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-lg font-bold border-2 border-[var(--card)] ring-1 ring-[var(--border)] shrink-0">
                            {user?.name?.charAt(0).toUpperCase() ?? "U"}
                        </div>
                    )}
                    <div className="min-w-0">
                        <h1 className="text-base font-extrabold tracking-tight text-[var(--text-primary)] leading-tight truncate">
                            {stripGelar(user?.name) || "Sobat"}
                        </h1>
                        <p className="text-[11px] font-semibold text-[var(--text-secondary)] leading-tight truncate">
                            {user?.positionRel?.name ?? "Karyawan"}
                        </p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] leading-tight">
                        {serverContext.displayWibDate
                            ? new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${serverContext.displayWibDate}T00:00:00+07:00`))
                            : "Menunggu waktu server"}
                    </p>
                    <p className="text-lg font-bold font-mono tracking-tighter text-[var(--text-primary)] leading-tight mt-0.5">
                        {serverContext.displayWibTime?.slice(0, 5) ?? "--:--"} WIB
                    </p>
                </div>
            </div>

            <PushNotificationManager />

            {loadingData && (
                <div className="emp-surface px-4 py-3 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                    <span>Memuat data beranda...</span>
                </div>
            )}

            {loadError && (
                <FeedbackMessage variant="error">{loadError}</FeedbackMessage>
            )}

            {(!serverContext.isFresh || !serverContext.isOnline) && (
                <FeedbackMessage variant="warning" role="status">
                    <div className="flex items-start justify-between gap-3">
                        <span>
                            {serverContext.isOnline ? "Konteks waktu server belum segar." : "Perangkat offline."} Waktu yang terlihat adalah snapshot server terakhir dan tidak digunakan untuk mengirim presensi.
                        </span>
                        <button type="button" onClick={() => void serverContext.refresh()} className="font-bold underline text-[var(--primary)] shrink-0 min-h-11">Coba lagi</button>
                    </div>
                </FeedbackMessage>
            )}

            {/* ─── Greeting ────────────────────────────────────── */}
            <figure className="border-l-2 border-[var(--primary)] pl-3 py-0.5">
                <blockquote className="text-[13px] font-semibold italic leading-snug text-[var(--text-primary)]">
                    {activeGreeting.greeting}
                </blockquote>
                <figcaption className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                    {activeGreeting.subGreeting}
                </figcaption>
            </figure>

            {/* ─── Quick Actions ───────────────────────────────── */}
            <div className="grid grid-cols-4 gap-y-4 gap-x-2">
                {[
                    { href: "/employee/leave", icon: CalendarOff, label: "Cuti", bg: "bg-rose-50 dark:bg-rose-950/40", color: "text-rose-600 dark:text-rose-400" },
                    { href: "/employee/payslip", icon: Receipt, label: "Slip Gaji", bg: "bg-amber-50 dark:bg-amber-950/40", color: "text-amber-600 dark:text-amber-400" },
                    { href: "/employee/overtime", icon: Clock, label: "Lembur", bg: "bg-sky-50 dark:bg-sky-950/40", color: "text-sky-600 dark:text-sky-400" },
                    { href: "/employee/visits", icon: LayoutDashboard, label: "Kunjungan", bg: "bg-indigo-50 dark:bg-indigo-950/40", color: "text-indigo-600 dark:text-indigo-400" },
                    { href: "/employee/todos", icon: LogIn, label: "To-Do", bg: "bg-violet-50 dark:bg-violet-950/40", color: "text-violet-600 dark:text-violet-400" },
                    { href: "/employee/documents", icon: Newspaper, label: "Dokumen", bg: "bg-orange-50 dark:bg-orange-950/40", color: "text-orange-600 dark:text-orange-400" },
                    { href: "/employee/appointments", icon: CalendarClock, label: "E Meeting", bg: "bg-cyan-50 dark:bg-cyan-950/40", color: "text-cyan-600 dark:text-cyan-400" },
                    { href: "/employee/my-tasks", icon: ListChecks, label: "Tugas Saya", bg: "bg-teal-50 dark:bg-teal-950/40", color: "text-teal-600 dark:text-teal-400" },
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

            {/* ─── Tombol Buka Menu Presensi ───────────────────── */}
            <button
                type="button"
                onClick={() => setIsAllMenusOpen(true)}
                className="w-full py-3 px-4 rounded-2xl bg-[var(--card)] hover:bg-[var(--secondary)] border border-[var(--border)] hover:border-[color-mix(in_srgb,var(--primary)_40%,transparent)] shadow-sm transition-all duration-200 flex items-center justify-between group active:scale-[0.99]"
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)] flex items-center justify-center shrink-0">
                        <Grid className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                        <span className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--primary)] transition-colors block leading-tight">
                            Buka Menu Lainnya
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] block mt-0.5 leading-tight">
                            Akses seluruh menu & layanan WITS
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <ChevronDown className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors" />
                </div>
            </button>

            {/* ─── Informasi / Pengumuman ──────────────────────── */}
            <div className="emp-surface overflow-hidden">
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

                {loadingData ? (
                    <div className="px-4 pb-5 pt-3 text-center">
                        <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)] opacity-60 mx-auto" />
                    </div>
                ) : loadError ? (
                    <div className="px-4 pb-5 pt-3 text-center">
                        <p className="text-xs font-medium text-[var(--destructive-text)]">Informasi belum dapat dimuat.</p>
                    </div>
                ) : news.length === 0 ? (
                    <div className="px-4 pb-5 pt-3 text-center">
                        <p className="text-xs font-medium text-[var(--text-muted)]">Tidak ada informasi aktif.</p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        {news.slice(0, 6).map((item, index) => (
                            <div key={item.id}>
                                <Link href={`/employee/news?id=${item.id}`} className="block px-4 py-3.5 hover:bg-[color-mix(in_srgb,var(--secondary)_60%,transparent)] transition-colors">
                                    <div className="flex gap-3 items-center">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[color-mix(in_srgb,var(--primary)_60%,transparent)] shrink-0" />
                                        <p className="text-[13px] font-medium text-[var(--text-secondary)] leading-snug line-clamp-2">
                                            {item.audience === "SELECTED" && (
                                                <span className="inline-block mr-1.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-1.5 py-px text-[10px] font-bold align-middle">
                                                    Khusus Anda
                                                </span>
                                            )}
                                            {item.title}
                                        </p>
                                        <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 ml-auto" />
                                    </div>
                                </Link>
                                {index < Math.min(news.length, 3) - 1 && <div className="h-px bg-[var(--secondary)] mx-4" />}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ─── All Menus Bottom Sheet ──────────────────────── */}
            <AllMenusSheet
                isOpen={isAllMenusOpen}
                onClose={() => setIsAllMenusOpen(false)}
                hasSubordinates={Boolean(user?.hasSubordinates || (Array.isArray(user?.subordinates) && user.subordinates.length > 0))}
                canReviewCleaning={cleaningCaps ? cleaningCaps.isReviewer : null}
                canTopViewCleaning={cleaningCaps ? cleaningCaps.isTopViewer : null}
                canUseEquipment={equipmentCaps ? equipmentCaps.canExecute || equipmentCaps.canReview || equipmentCaps.canTopView || equipmentCaps.canApprove : null}
                canExecuteEquipment={equipmentCaps ? equipmentCaps.canExecute : null}
                canReviewEquipment={equipmentCaps ? equipmentCaps.canReview : null}
                canTopViewEquipment={equipmentCaps ? equipmentCaps.canTopView : null}
                canApproveEquipment={equipmentCaps ? equipmentCaps.canApprove : null}
                canManageEquipmentSettings={equipmentCaps ? equipmentCaps.canManageSettings : null}
                canMonitorMeeting={canMonitorMeeting}
                canEditGreeting={canEditGreeting}
            />

        </div>
    );
}

