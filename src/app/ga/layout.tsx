"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Phone, Package, QrCode, Ticket } from "lucide-react";
import AppShell, { AppShellLoading, NavItem } from "@/components/layout/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/Toast";
import { storeAuthRedirectMessage } from "@/lib/authRedirectMessage";
import { getResponseErrorMessage } from "@/lib/clientErrors";

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

    useEffect(() => {
        const fetchSession = async () => {
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
                    router.push(data.permissions?.includes("hr.manage") ? "/dashboard" : "/");
                    return;
                }
                setUser(data);
            } catch {
                storeAuthRedirectMessage("Sesi tidak dapat diverifikasi. Silakan masuk kembali.");
                router.push("/");
            } finally {
                setLoading(false);
            }
        };
        fetchSession();
    }, [router]);

    const handleLogout = useCallback(async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        toast("Memproses logout...", "info");
        try {
            const res = await fetch("/api/auth/logout", { method: "POST" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal logout."));
            router.push("/");
        } catch (error) {
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
