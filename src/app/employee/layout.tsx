"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
    Home, Camera, ClipboardList, FileText, CalendarOff,
    Newspaper, NotebookPen, MapPinned, Clock4, Settings, Users,
} from "lucide-react";
import AppShell, { AppShellLoading, AppShellUser, NavItem } from "@/components/layout/AppShell";

const navItems: NavItem[] = [
    { href: "/employee", icon: Home, label: "Beranda" },
    { href: "/employee/attendance", icon: Camera, label: "Absensi" },
    { href: "/employee/attendance-history", icon: ClipboardList, label: "Riwayat" },
    { href: "/employee/visits", icon: MapPinned, label: "Kunjungan" },
    { href: "/employee/overtime", icon: Clock4, label: "Lembur" },
    { href: "/employee/payslip", icon: FileText, label: "Slip Gaji" },
    { href: "/employee/leave", icon: CalendarOff, label: "Cuti" },
    { href: "/employee/news", icon: Newspaper, label: "Berita" },
    { href: "/employee/todos", icon: NotebookPen, label: "To-Do" },
    { href: "/employee/settings", icon: Settings, label: "Pengaturan" },
];

// Mobile bottom nav — 5 item pertama
function MobileBottomNav({ items, pathname, onNavigate }: {
    items: NavItem[];
    pathname: string;
    onNavigate: (href: string) => void;
}) {
    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border)] flex items-center justify-around py-2 z-50 lg:hidden safe-area-bottom">
            {items.slice(0, 5).map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                    <button
                        key={item.href}
                        onClick={() => onNavigate(item.href!)}
                        className="flex flex-col items-center gap-0.5 py-1 px-2 min-w-[56px]"
                    >
                        <Icon className={`w-5 h-5 ${isActive ? "text-[var(--primary)]" : "text-[var(--text-muted)]"}`} />
                        <span className={`text-[10px] font-medium ${isActive ? "text-[var(--primary)]" : "text-[var(--text-muted)]"}`}>
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
                setUser(data);
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

    // Monitoring Tim hanya untuk level non-STAFF
    const monitoringNav = user.level && user.level !== "STAFF" ? (
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
