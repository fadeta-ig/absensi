"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
    Home, Camera, ClipboardList, FileText, CalendarOff,
    Newspaper, NotebookPen, MapPinned, Clock4, Settings, Users,
} from "lucide-react";
import AppShell, { AppShellLoading, AppShellUser, NavItem } from "@/components/layout/AppShell";
import { EmployeeNotificationPanel } from "@/components/layout/EmployeeNotificationPanel";


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
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border)] flex items-end justify-around pb-2 pt-1 z-50 lg:hidden safe-area-bottom px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
            {mobileItems.map((item, i) => {
                if (!item) return null;
                const isActive = pathname === item.href;
                const Icon = item.icon;
                const isCenter = i === 2; // Absensi

                if (isCenter) {
                    return (
                        <div key={item.href} className="relative -top-5">
                            <button
                                onClick={() => onNavigate(item.href!)}
                                className="flex flex-col items-center justify-center w-14 h-14 rounded-full bg-[#800020] text-white shadow-lg shadow-[#800020]/30 border-4 border-white transition-transform active:scale-95"
                            >
                                <Icon className="w-6 h-6" />
                            </button>
                        </div>
                    );
                }

                return (
                    <button
                        key={item.href}
                        onClick={() => onNavigate(item.href!)}
                        className="flex flex-col items-center gap-1 py-1 px-1 min-w-[64px]"
                    >
                        <Icon className={`w-5 h-5 ${isActive ? "text-[#800020]" : "text-gray-400"}`} />
                        <span className={`text-[10px] font-semibold ${isActive ? "text-[#800020]" : "text-gray-400"}`}>
                            {item.label}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<AppShellUser | null>(null);
    const [authChecked, setAuthChecked] = useState(false);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const checkAuth = async () => {
            try {
                const res = await fetch("/api/auth/me", { credentials: "same-origin" });
                if (!res.ok) { router.replace("/"); return; }
                const data = await res.json();
                if (data.role === "hr") { router.replace("/dashboard"); return; }
                setUser({
                    ...data,
                    hasSubordinates: Array.isArray(data.subordinates) && data.subordinates.length > 0,
                });
            } catch {
                router.replace("/");
            } finally {
                setAuthChecked(true);
            }
        };

        checkAuth();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleLogout = useCallback(async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/");
    }, [router]);

    const handleNavigate = useCallback((href: string) => {
        router.push(href);
    }, [router]);

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
            extraNav={monitoringNav}
            mobileHeaderRight={<EmployeeNotificationPanel />}
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
