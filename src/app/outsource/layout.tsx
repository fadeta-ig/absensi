"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    CheckCircle2,
    Eye,
    FileCheck2,
    Home,
    SprayCan,
    Wrench,
} from "lucide-react";
import AppShell, { AppShellLoading, type NavItem } from "@/components/layout/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/Toast";
import { EmployeeDraftProvider } from "@/components/employee/EmployeeDraftContext";
import { storeAuthRedirectMessage } from "@/lib/authRedirectMessage";
import { notifyAuthChanged, subscribeAuthChanged } from "@/lib/authEvents";
import { unsubscribePush } from "@/lib/pushClient";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface OutsourceCaps {
    canExecuteCleaning: boolean;
    cleaningRoomsCount: number;
    canOverviewCleaning: boolean;
    canExecuteEquipment: boolean;
    hasEquipmentExecutePerm: boolean;
    canQcEquipment: boolean;
    hasEquipmentQcPerm: boolean;
    canApproveEquipment: boolean;
    hasEquipmentApprovePerm: boolean;
    canOverviewEquipment: boolean;
}

export default function OutsourceLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const toast = useToast();
    const [user, setUser] = useState<{
        userId: string;
        name: string;
        employeeId: string | null;
        username: string;
        roles: string[];
        permissions: string[];
    } | null>(null);
    const [caps, setCaps] = useState<OutsourceCaps | null>(null);
    const [loading, setLoading] = useState(true);
    const [loggingOut, setLoggingOut] = useState(false);
    const fetchedRef = useRef(false);

    const checkAuth = useCallback(async () => {
        setLoading(true);
        setUser(null);
        setCaps(null);

        try {
            const res = await fetch("/api/auth/me");
            if (!res.ok) {
                storeAuthRedirectMessage("Sesi Anda berakhir atau belum login. Silakan masuk kembali.");
                router.replace("/");
                return;
            }
            const data = await res.json();
            if (!data.permissions?.includes("outsource.portal")) {
                storeAuthRedirectMessage("Akses dialihkan sesuai role akun Anda.");
                router.replace(
                    data.permissions?.includes("hr.manage")
                        ? "/dashboard"
                        : data.permissions?.includes("ga.manage")
                            ? "/ga"
                            : data.permissions?.includes("cleaning.execute")
                                ? "/cleaning"
                                : data.employeeId && data.permissions?.includes("employee.self")
                                    ? "/employee"
                                    : "/"
                );
                return;
            }
            setUser(data);
            const capRes = await fetch("/api/outsource/capabilities");
            if (capRes.ok) {
                const capJson = await capRes.json();
                setCaps(capJson?.data ?? null);
            }
        } catch (error) {
            reportClientError("OutsourceLayout", "Gagal memverifikasi sesi outsource", error);
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

    useEffect(
        () =>
            subscribeAuthChanged((event) => {
                if (event.reason === "logout") {
                    setUser(null);
                    setCaps(null);
                    setLoading(false);
                    router.replace("/");
                    return;
                }
                void checkAuth();
            }),
        [checkAuth, router]
    );

    const handleLogout = useCallback(async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        toast("Memproses logout...", "info");
        try {
            void unsubscribePush();
            const res = await fetch("/api/auth/logout", { method: "POST" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal logout."));
            notifyAuthChanged("logout");
            router.replace("/");
        } catch (error) {
            reportClientError("OutsourceLayout", "Logout outsource gagal", error);
            toast(error instanceof Error ? error.message : "Gagal logout.", "error");
            setLoggingOut(false);
        }
    }, [loggingOut, router, toast]);

    const navItems = useMemo<NavItem[]>(() => {
        const items: NavItem[] = [{ href: "/outsource", icon: Home, label: "Beranda" }];
        if (!user) return items;
        const perms = user.permissions ?? [];
        if (perms.includes("cleaning.execute")) {
            items.push({ href: "/outsource/cleaning", icon: SprayCan, label: "Checklist Kebersihan" });
        }
        if (perms.includes("cleaning.overview")) {
            items.push({ href: "/outsource/cleaning/overview", icon: Eye, label: "Pantau Kebersihan" });
        }
        if (perms.includes("equipment.execute")) {
            items.push({ href: "/outsource/equipment", icon: Wrench, label: "Inspeksi Alat" });
        }
        if (perms.includes("equipment.qc") && (caps === null || caps.canQcEquipment || caps.hasEquipmentQcPerm)) {
            items.push({ href: "/outsource/equipment/approvals", icon: FileCheck2, label: "Antrean QC Alat" });
        }
        if (
            perms.includes("equipment.approve") &&
            (caps === null || caps.canApproveEquipment || caps.hasEquipmentApprovePerm)
        ) {
            items.push({
                href: "/outsource/equipment/approval-queue",
                icon: CheckCircle2,
                label: "Approval Final Alat",
            });
        }
        if (perms.includes("equipment.overview")) {
            items.push({ href: "/outsource/equipment/overview", icon: Eye, label: "Pantau Rekap Alat" });
        }
        return items;
    }, [user, caps]);

    if (loading || !user) return <AppShellLoading message="Memuat portal E-Checklist Outsource..." />;

    return (
        <EmployeeDraftProvider userId={user.userId} employeeId={null}>
            <AppShell
                user={user}
                navItems={navItems}
                brandTitle="WITS Outsource"
                brandSubtitle="Portal E-Checklist"
                mobileTitle="E-Checklist OS"
                storageKey="outsource-sidebar-collapsed"
                onLogout={handleLogout}
                logoutLoading={loggingOut}
                mobileHeaderRight={<ThemeToggle />}
            >
                <div className="max-w-3xl mx-auto">{children}</div>
            </AppShell>
        </EmployeeDraftProvider>
    );
}
