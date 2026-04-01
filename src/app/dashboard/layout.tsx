"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    LayoutDashboard,
    Users,
    ClipboardList,
    Wallet,
    CalendarOff,
    Megaphone,
    Clock4,
    MapPinned,
    FileDown,
    Database,
    Settings2,
} from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import AppShell, { AppShellLoading, AppShellUser, NavItem } from "@/components/layout/AppShell";

const navItems: NavItem[] = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/dashboard/attendance", icon: ClipboardList, label: "Absensi" },
    { href: "/dashboard/visits", icon: MapPinned, label: "Kunjungan" },
    { href: "/dashboard/leave", icon: CalendarOff, label: "Cuti" },
    {
        label: "Master Data",
        icon: Database,
        subItems: [
            { href: "/dashboard/employees", label: "Karyawan" },
            { href: "/dashboard/shifts", label: "Jam Kerja" },
            { href: "/dashboard/master-data", label: "Pengaturan Data" },
        ],
    },
    {
        label: "Master Payroll",
        icon: Settings2,
        subItems: [
            { href: "/dashboard/overtime", label: "Lembur" },
            { href: "/dashboard/payroll", label: "Payroll" },
            { href: "/dashboard/master-payroll", label: "Pengaturan Payroll" },
            { href: "/dashboard/pph21-calculator", label: "Kalkulator PPh 21" },
            { href: "/dashboard/bpjs-calculator", label: "Kalkulator BPJS" },
            { href: "/dashboard/overtime-calculator", label: "Kalkulator Lembur" },
        ],
    },
    { href: "/dashboard/reports", icon: FileDown, label: "Laporan" },
    { href: "/dashboard/news", icon: Megaphone, label: "WIG News" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
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
                if (data.role !== "hr") { router.replace("/employee"); return; }
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
        return <AppShellLoading message="Memuat Dashboard..." />;
    }

    return (
        <AppShell
            user={user}
            navItems={navItems}
            brandTitle="WIG HR"
            brandSubtitle="Admin Panel"
            mobileTitle="WIG HR"
            storageKey="sidebar-collapsed"
            onLogout={handleLogout}
            mobileHeaderRight={<NotificationCenter />}
        >
            {children}
        </AppShell>
    );
}
