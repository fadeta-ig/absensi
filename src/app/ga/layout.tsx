"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Phone, Package, QrCode, Ticket } from "lucide-react";
import AppShell, { AppShellLoading, NavItem } from "@/components/layout/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/Toast";
import { storeAuthRedirectMessage } from "@/lib/authRedirectMessage";
import { notifyAuthChanged, subscribeAuthChanged } from "@/lib/authEvents";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

const GA_NAV_ITEMS: NavItem[] = [
    { href: "/ga", icon: LayoutDashboard, label: "Dashboard" },
    {
        icon: Package,
        label: "Data Master",
        subItems: [
            { href: "/ga/categories", label: "Master Kategori" },
            { href: "/ga/assets", label: "Master Aset" },
        ],
    },
    {
        icon: QrCode,
        label: "Operasional QR",
        subItems: [
            { href: "/ga/scan", label: "Scan / Pindai QR" },
            { href: "/ga/assets/print", label: "Cetak Label QR" },
        ],
    },
    { href: "/ga/tickets", icon: Ticket, label: "Ticketing Aset" },
    { href: "/ga/sim", icon: Phone, label: "Manajemen SIM" },
];

export default function GaLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const toast = useToast();
    const [user, setUser] = useState<{ name: string; employeeId: string | null; username: string; permissions: string[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [loggingOut, setLoggingOut] = useState(false);
    const fetchedRef = useRef(false);

    const checkAuth = useCallback(async () => {
        setLoading(true);
        setUser(null);

        try {
            const res = await fetch("/api/auth/me");
            if (!res.ok) {
                storeAuthRedirectMessage("Sesi Anda berakhir atau belum login. Silakan masuk kembali.");
                router.push("/");
                return;
            }
            const data = await res.json();
            if (!data.permissions?.includes("ga.manage")) {
                storeAuthRedirectMessage("Akses dialihkan sesuai role akun Anda.");
                router.push(
                    data.permissions?.includes("hr.manage")
                        ? "/dashboard"
                        : data.employeeId && data.permissions?.includes("employee.self")
                            ? "/employee"
                            : "/"
                );
                return;
            }
            setUser(data);
        } catch (error) {
            reportClientError("GaLayout", "Gagal memverifikasi sesi GA", error);
            storeAuthRedirectMessage("Sesi tidak dapat diverifikasi. Silakan masuk kembali.");
            router.push("/");
        } finally {
            setLoading(false);
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
            setLoading(false);
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
            router.push("/");
        } catch (error) {
            reportClientError("GaLayout", "Logout GA gagal", error);
            toast(error instanceof Error ? error.message : "Gagal logout.", "error");
            setLoggingOut(false);
        }
    }, [loggingOut, router, toast]);

    if (loading || !user) return <AppShellLoading message="Memuat portal GA..." />;

    return (
        <AppShell
            user={user}
            navItems={GA_NAV_ITEMS}
            brandTitle="WIG GA"
            brandSubtitle="General Affairs"
            mobileTitle="WIG GA"
            storageKey="ga-sidebar-collapsed"
            onLogout={handleLogout}
            logoutLoading={loggingOut}
            mobileHeaderRight={<ThemeToggle />}
        >
            {children}
        </AppShell>
    );
}
