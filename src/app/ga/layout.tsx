"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Phone, Package } from "lucide-react";
import AppShell, { AppShellLoading, NavItem } from "@/components/layout/AppShell";

const GA_NAV_ITEMS: NavItem[] = [
    { href: "/ga", icon: LayoutDashboard, label: "Dashboard" },
    {
        icon: Package,
        label: "Manajemen Aset",
        subItems: [
            { href: "/ga/assets", label: "Semua Aset" },
            { href: "/ga/assets?category=HANDPHONE", label: "Handphone" },
            { href: "/ga/assets?category=LAPTOP", label: "Laptop" },
            { href: "/ga/assets?category=NOMOR_HP", label: "Nomor Indosat" },
            { href: "/ga/assets?status=AVAILABLE", label: "Stok Tersedia" },
            { href: "/ga/assets?status=MAINTENANCE", label: "Dalam Perbaikan" },
        ],
    },
    { href: "/ga/nomor", icon: Phone, label: "Kartu SIM Expiry" },
];

export default function GaLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string; employeeId: string; role: string } | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSession = async () => {
            try {
                const res = await fetch("/api/auth/me");
                if (!res.ok) { router.push("/"); return; }
                const data = await res.json();
                if (data.role !== "ga") { router.push("/"); return; }
                setUser(data);
            } catch {
                router.push("/");
            } finally {
                setLoading(false);
            }
        };
        fetchSession();
    }, [router]);

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
    };

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
        >
            {children}
        </AppShell>
    );
}
