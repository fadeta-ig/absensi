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
    Package,
    FileText,
    ShieldAlert,
} from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import AppShell, { AppShellLoading, AppShellUser, NavItem } from "@/components/layout/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/Toast";
import { storeAuthRedirectMessage } from "@/lib/authRedirectMessage";
import { getResponseErrorMessage } from "@/lib/clientErrors";

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
    { href: "/dashboard/audit", icon: ShieldAlert, label: "Audit Trail" },
    { href: "/dashboard/news", icon: Megaphone, label: "WIG News" },
    { href: "/dashboard/letter-requests", icon: FileText, label: "Surat Karyawan" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const toast = useToast();
    const [user, setUser] = useState<AppShellUser | null>(null);
    const [authChecked, setAuthChecked] = useState(false);
    const [categories, setCategories] = useState<{ id: string; name: string; prefix: string }[]>([]);
    const [loggingOut, setLoggingOut] = useState(false);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const checkAuth = async () => {
            try {
                const [meRes, catRes] = await Promise.all([
                    fetch("/api/auth/me", { credentials: "same-origin" }),
                    fetch("/api/assets/categories")
                ]);

                if (!meRes.ok) {
                    storeAuthRedirectMessage("Sesi Anda berakhir atau belum login. Silakan masuk kembali.");
                    router.replace("/");
                    return;
                }
                const data = await meRes.json();
                if (!data.permissions?.includes("hr.manage")) {
                    storeAuthRedirectMessage("Akses dialihkan sesuai role akun Anda.");
                    router.replace(data.permissions?.includes("ga.manage") ? "/ga" : "/employee");
                    return;
                }
                setUser(data);

                if (catRes.ok) {
                    const catData = await catRes.json();
                    setCategories(catData);
                }
            } catch {
                storeAuthRedirectMessage("Sesi tidak dapat diverifikasi. Silakan masuk kembali.");
                router.replace("/");
            } finally {
                setAuthChecked(true);
            }
        };

        checkAuth();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleLogout = useCallback(async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        toast("Memproses logout...", "info");
        try {
            const res = await fetch("/api/auth/logout", { method: "POST" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal logout."));
            router.replace("/");
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal logout.", "error");
            setLoggingOut(false);
        }
    }, [loggingOut, router, toast]);

    if (!authChecked || !user) {
        return <AppShellLoading message="Memuat Dashboard..." />;
    }

    // Susun item menu dinamis
    const dynamicNavItems: NavItem[] = [
        ...navItems,
        ...(user.permissions?.includes("user.manage") ? [{
            href: "/dashboard/users",
            icon: Users,
            label: "User",
        }] : []),
        {
            label: "Aset Perusahaan",
            icon: Package,
            subItems: [
                { href: "/dashboard/assets", label: "Semua Aset" },
                ...categories.map(cat => ({
                    href: `/dashboard/assets?category=${cat.prefix}`,
                    label: cat.name
                }))
            ],
        }
    ];

    return (
        <AppShell
            user={user}
            navItems={dynamicNavItems}
            brandTitle="WIG HR"
            brandSubtitle="Admin Panel"
            mobileTitle="WIG HR"
            storageKey="sidebar-collapsed"
            onLogout={handleLogout}
            logoutLoading={loggingOut}
            mobileHeaderRight={
                <div className="flex items-center gap-1">
                    <ThemeToggle />
                    <NotificationCenter />
                </div>
            }
        >
            {children}
        </AppShell>
    );
}
