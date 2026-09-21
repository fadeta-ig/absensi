"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SprayCan } from "lucide-react";
import AppShell, { AppShellLoading, NavItem } from "@/components/layout/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/Toast";
import { storeAuthRedirectMessage } from "@/lib/authRedirectMessage";
import { notifyAuthChanged, subscribeAuthChanged } from "@/lib/authEvents";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

const CLEANING_NAV_ITEMS: NavItem[] = [
    { href: "/cleaning", icon: SprayCan, label: "Checklist Hari Ini" },
];

export default function CleaningLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const toast = useToast();
    const [user, setUser] = useState<{ name: string; employeeId: string | null; username: string; roles: string[]; permissions: string[] } | null>(null);
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
                router.replace("/");
                return;
            }
            const data = await res.json();
            if (!data.roles?.includes("CLEANING_WORKER") || !data.permissions?.includes("cleaning.execute")) {
                storeAuthRedirectMessage("Akses dialihkan sesuai role akun Anda.");
                router.replace(
                    data.permissions?.includes("hr.manage")
                        ? "/dashboard"
                        : data.permissions?.includes("ga.manage")
                            ? "/ga"
                            : data.employeeId && data.permissions?.includes("employee.self")
                                ? "/employee"
                                : "/"
                );
                return;
            }
            setUser(data);
        } catch (error) {
            reportClientError("CleaningLayout", "Gagal memverifikasi sesi petugas kebersihan", error);
            storeAuthRedirectMessage("Sesi tidak dapat diverifikasi. Silakan masuk kembali.");
            router.replace("/");
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
            router.replace("/");
        } catch (error) {
            reportClientError("CleaningLayout", "Logout petugas gagal", error);
            toast(error instanceof Error ? error.message : "Gagal logout.", "error");
            setLoggingOut(false);
        }
    }, [loggingOut, router, toast]);

    if (loading || !user) return <AppShellLoading message="Memuat portal kebersihan..." />;

    return (
        <AppShell
            user={user}
            navItems={CLEANING_NAV_ITEMS}
            brandTitle="WIG Cleaning"
            brandSubtitle="Checklist Kebersihan"
            mobileTitle="Kebersihan"
            storageKey="cleaning-sidebar-collapsed"
            onLogout={handleLogout}
            logoutLoading={loggingOut}
            mobileHeaderRight={<ThemeToggle />}
        >
            {children}
        </AppShell>
    );
}
