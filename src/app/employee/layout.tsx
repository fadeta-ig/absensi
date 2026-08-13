"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
    Home, Camera, ClipboardList, FileText, CalendarOff,
    Newspaper, NotebookPen, MapPinned, Clock4, Settings, Users, Monitor
} from "lucide-react";
import AppShell, { AppShellLoading, AppShellUser, NavItem } from "@/components/layout/AppShell";
import { EmployeeNotificationPanel } from "@/components/layout/EmployeeNotificationPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/Toast";
import { storeAuthRedirectMessage } from "@/lib/authRedirectMessage";
import { notifyAuthChanged, subscribeAuthChanged } from "@/lib/authEvents";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";


const navItems: NavItem[] = [
    { href: "/employee", icon: Home, label: "Beranda" },
    { href: "/employee/attendance", icon: Camera, label: "Absensi" },
    { href: "/employee/attendance-history", icon: ClipboardList, label: "Riwayat" },
    { href: "/employee/attendance/correction", icon: FileText, label: "Koreksi" },
    { href: "/employee/visits", icon: MapPinned, label: "Kunjungan" },
    { href: "/employee/overtime", icon: Clock4, label: "Lembur" },
    { href: "/employee/payslip", icon: FileText, label: "Slip Gaji" },
    { href: "/employee/leave", icon: CalendarOff, label: "Cuti" },
    { href: "/employee/documents", icon: FileText, label: "Dokumen" },
    { href: "/employee/assets", icon: Monitor, label: "Aset Saya" },
    { href: "/employee/news", icon: Newspaper, label: "Berita" },
    { href: "/employee/todos", icon: NotebookPen, label: "To-Do" },
    { href: "/employee/profile", icon: Settings, label: "Profil" },
    { href: "/employee/settings", icon: Settings, label: "Pengaturan" },
];

function MobileBottomNav({ items, pathname, onNavigate }: {
    items: NavItem[];
    pathname: string;
    onNavigate: (href: string) => void;
}) {
    // Custom mobile order: Beranda, Riwayat, Absensi (tengah), Koreksi, Kunjungan
    const mobileItems = [
        items.find(i => i.href === "/employee"),
        items.find(i => i.href === "/employee/attendance-history"),
        items.find(i => i.href === "/employee/attendance"),
        items.find(i => i.href === "/employee/attendance/correction"),
        items.find(i => i.href === "/employee/visits"),
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden safe-area-bottom pointer-events-none px-4 pb-6">
            <nav className="pointer-events-auto bg-white/60 dark:bg-[#121212]/60 backdrop-blur-2xl backdrop-saturate-[1.8] border border-white/40 dark:border-white/10 rounded-[2rem] flex items-center justify-around pb-2 pt-2 px-2 shadow-[0_8px_32px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.6)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)] relative">
                
                {/* Ambient liquid glow behind the nav */}
                <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-r from-primary/10 via-transparent to-accent/10 blur-xl -z-10" />

                {mobileItems.map((item, i) => {
                    if (!item) return null;
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    const isCenter = i === 2; // Absensi

                    if (isCenter) {
                        return (
                            <div key={item.href} className="relative -top-7">
                                {/* Glowing liquid aura for center button */}
                                <div className="absolute inset-0 bg-primary/40 blur-xl rounded-full scale-125 animate-pulse" />
                                <button
                                    onClick={() => onNavigate(item.href!)}
                                    className="relative flex flex-col items-center justify-center w-[68px] h-[68px] rounded-full bg-gradient-to-tr from-primary-700 via-primary to-primary-light text-white shadow-[0_8px_20px_rgba(128,0,32,0.4),inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.2)] border border-white/20 transition-all duration-300 active:scale-95 hover:scale-105"
                                >
                                    <Icon className="w-8 h-8 drop-shadow-md" />
                                </button>
                            </div>
                        );
                    }

                    return (
                        <button
                            key={item.href}
                            onClick={() => onNavigate(item.href!)}
                            className="group relative flex flex-col items-center gap-1.5 py-2 px-3 min-w-[64px] transition-all duration-300"
                        >
                            {/* Active pill glassmorphism background */}
                            {isActive && (
                                <div className="absolute inset-0 bg-primary/10 dark:bg-primary/20 rounded-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] transition-opacity duration-300" />
                            )}
                            
                            {/* Icon with 3D lift on active/hover */}
                            <div className="relative z-10 transition-transform duration-300 ease-out group-hover:-translate-y-1">
                                <Icon className={`w-5 h-5 transition-colors duration-300 ${isActive ? "text-primary drop-shadow-sm" : "text-gray-500 dark:text-gray-400 group-hover:text-primary/70"}`} />
                            </div>
                            
                            <span className={`text-[10px] font-semibold relative z-10 transition-colors duration-300 ${isActive ? "text-primary" : "text-gray-500 dark:text-gray-400"}`}>
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const toast = useToast();
    const [user, setUser] = useState<AppShellUser | null>(null);
    const [authChecked, setAuthChecked] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const fetchedRef = useRef(false);

    const checkAuth = useCallback(async () => {
        setAuthChecked(false);
        setUser(null);

        try {
            const res = await fetch("/api/auth/me", { credentials: "same-origin" });
            if (!res.ok) {
                storeAuthRedirectMessage("Sesi Anda berakhir atau belum login. Silakan masuk kembali.");
                router.replace("/");
                return;
            }
            const data = await res.json();
            if (!data.employeeId || !data.permissions?.includes("employee.self")) {
                storeAuthRedirectMessage("Akses dialihkan sesuai role akun Anda.");
                router.replace(data.permissions?.includes("hr.manage") ? "/dashboard" : data.permissions?.includes("ga.manage") ? "/ga" : "/");
                return;
            }
            setUser({
                ...data,
                hasSubordinates: Array.isArray(data.subordinates) && data.subordinates.length > 0,
            });
        } catch (error) {
            reportClientError("EmployeeLayout", "Gagal memverifikasi sesi employee", error);
            storeAuthRedirectMessage("Sesi tidak dapat diverifikasi. Silakan masuk kembali.");
            router.replace("/");
        } finally {
            setAuthChecked(true);
        }
    }, [router]);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;
        void checkAuth();
    }, [checkAuth]);

    useEffect(() => subscribeAuthChanged((event) => {
        if (event.reason === "logout") {
            setUser(null);
            setAuthChecked(true);
            router.replace("/");
            return;
        }

        void checkAuth();
    }), [checkAuth, router]);

    const handleLogout = useCallback(async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        toast("Memproses logout...", "info");
        try {
            const res = await fetch("/api/auth/logout", { method: "POST" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal logout."));
            notifyAuthChanged("logout");
            router.replace("/");
        } catch (error) {
            reportClientError("EmployeeLayout", "Logout employee gagal", error);
            toast(error instanceof Error ? error.message : "Gagal logout.", "error");
            setLoggingOut(false);
        }
    }, [loggingOut, router, toast]);

    const handleNavigate = useCallback((href: string) => {
        router.push(href);
    }, [router]);

    const handleNotificationAccessDenied = useCallback(() => {
        void checkAuth();
    }, [checkAuth]);

    if (!authChecked || !user) {
        return <AppShellLoading message="Memuat..." />;
    }

    // Monitoring Tim hanya untuk karyawan yang punya bawahan (berdasarkan pohon managerId)
    const monitoringNav = user.hasSubordinates ? (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <p className="text-[10px] font-bold text-[var(--text-muted)] px-3 mb-2 uppercase tracking-widest">
                Management
            </p>
            <button
                onClick={() => router.push("/employee/monitoring")}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full text-left ${pathname === "/employee/monitoring"
                    ? "bg-[var(--primary)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:bg-[var(--secondary)] hover:text-[var(--text-primary)]"
                    }`}
            >
                <Users className="w-[18px] h-[18px] shrink-0" />
                <span>Monitoring Tim</span>
            </button>
        </div>
    ) : null;

    return (
        <AppShell
            user={user}
            navItems={navItems}
            brandTitle="WIG Portal"
            brandSubtitle="Employee"
            mobileTitle="WIG"
            storageKey="employee-sidebar-collapsed"
            onLogout={handleLogout}
            logoutLoading={loggingOut}
            extraNav={monitoringNav}
            mobileHeaderRight={
                <div className="flex items-center gap-1">
                    <ThemeToggle />
                    <EmployeeNotificationPanel
                        enabled={Boolean(user.employeeId && user.permissions?.includes("employee.self"))}
                        onAccessDenied={handleNotificationAccessDenied}
                    />
                </div>
            }
            mobileBottomNav={
                <MobileBottomNav
                    items={navItems}
                    pathname={pathname}
                    onNavigate={handleNavigate}
                />
            }
        >
            {children}
        </AppShell>
    );
}
