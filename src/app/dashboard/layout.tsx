"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import {
    LayoutDashboard,
    Users,
    ClipboardList,
    Wallet,
    CalendarOff,
    Megaphone,
    Clock,
    Clock4,
    MapPinned,
    FileDown,
    Database,
    Settings2,
    LogOut,
    Menu,
    X,
    ChevronRight,
} from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";

interface User {
    name: string;
    employeeId: string;
    role: string;
}

const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/dashboard/employees", icon: Users, label: "Karyawan" },
    { href: "/dashboard/attendance", icon: ClipboardList, label: "Absensi" },
    { href: "/dashboard/visits", icon: MapPinned, label: "Kunjungan" },
    { href: "/dashboard/overtime", icon: Clock4, label: "Lembur" },
    { href: "/dashboard/payroll", icon: Wallet, label: "Payroll" },
    { href: "/dashboard/leave", icon: CalendarOff, label: "Cuti" },
    { href: "/dashboard/shifts", icon: Clock, label: "Jam Kerja" },
    { href: "/dashboard/master-data", icon: Database, label: "Master Data" },
    { href: "/dashboard/master-payroll", icon: Settings2, label: "Master Payroll" },
    { href: "/dashboard/reports", icon: FileDown, label: "Laporan" },
    { href: "/dashboard/news", icon: Megaphone, label: "WIG News" },
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [authChecked, setAuthChecked] = useState(false);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const checkAuth = async () => {
            try {
                const res = await fetch("/api/auth/me", { credentials: "same-origin" });
                if (!res.ok) {
                    router.replace("/");
                    return;
                }
                const data = await res.json();
                if (data.role !== "hr") {
                    router.replace("/employee");
                    return;
                }
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

    if (!authChecked || !user) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--background)]">
                <div className="spinner" />
                <p className="text-sm text-[var(--text-muted)]">Memuat Dashboard...</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-[var(--background)]">
            {/* Mobile Header */}
            <header className="fixed top-0 left-0 right-0 h-14 bg-white/90 backdrop-blur-md border-b border-[var(--border)] px-4 flex items-center justify-between z-50 lg:hidden">
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[var(--secondary)] transition-colors">
                    <Menu className="w-5 h-5 text-[var(--text-primary)]" />
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 relative">
                        <Image src="/assets/Logo WIG.png" alt="WIG" fill className="object-contain" />
                    </div>
                    <span className="text-sm font-bold text-[var(--primary)]">WIG HR</span>
                </div>
                <div className="flex items-center gap-1">
                    <NotificationCenter />
                    <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold">
                        {user.name.charAt(0)}
                    </div>
                </div>
            </header>

            {/* Sidebar */}
            <aside className={`fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-[var(--border)] flex flex-col z-[200] transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
                <div className="p-5 flex items-center justify-between border-b border-[var(--border)]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 relative">
                            <Image src="/assets/Logo WIG.png" alt="WIG" fill className="object-contain" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-[var(--text-primary)]">WIG HR</h2>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Admin Panel</p>
                        </div>
                    </div>
                    <button onClick={() => setSidebarOpen(false)} className="lg:hidden w-8 h-8 flex items-center justify-center rounded-md hover:bg-[var(--secondary)] transition-colors">
                        <X className="w-4 h-4 text-[var(--text-secondary)]" />
                    </button>
                </div>

                <div className="p-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-sm font-bold shrink-0">
                            {user.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{user.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">HR Administrator</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.href}
                                onClick={() => { router.push(item.href); setSidebarOpen(false); }}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full text-left ${isActive
                                    ? "bg-[var(--primary)] text-white shadow-sm"
                                    : "text-[var(--text-secondary)] hover:bg-[var(--secondary)] hover:text-[var(--text-primary)]"
                                    }`}
                            >
                                <Icon className="w-[18px] h-[18px] shrink-0" />
                                <span className="flex-1">{item.label}</span>
                                {isActive && <ChevronRight className="w-4 h-4 opacity-70" />}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-3 border-t border-[var(--border)]">
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                        <LogOut className="w-[18px] h-[18px]" />
                        <span>Keluar</span>
                    </button>
                </div>
            </aside>

            {/* Overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 bg-black/30 z-[150] lg:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Main Content */}
            <main className="flex-1 lg:ml-64 pt-14 lg:pt-0 min-h-screen">
                <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
