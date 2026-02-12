"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import styles from "./dashboard.module.css";

interface User {
    name: string;
    employeeId: string;
    role: string;
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        fetch("/api/auth/me")
            .then((r) => {
                if (!r.ok) throw new Error();
                return r.json();
            })
            .then((data) => {
                if (data.role !== "hr") {
                    router.push("/employee");
                    return;
                }
                setUser(data);
            })
            .catch(() => router.push("/"));
    }, [router]);

    const handleLogout = useCallback(async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
    }, [router]);

    const navItems = [
        { href: "/dashboard", icon: "📊", label: "Dashboard" },
        { href: "/dashboard/employees", icon: "👥", label: "Karyawan" },
        { href: "/dashboard/attendance", icon: "📋", label: "Absensi" },
        { href: "/dashboard/payroll", icon: "💰", label: "Payroll" },
        { href: "/dashboard/leave", icon: "🏖️", label: "Cuti" },
        { href: "/dashboard/news", icon: "📢", label: "WIG News" },
    ];

    if (!user) {
        return (
            <div className={styles.loadingScreen}>
                <div className="spinner"></div>
                <p>Memuat Dashboard...</p>
            </div>
        );
    }

    return (
        <div className={styles.layout}>
            <header className={styles.mobileHeader}>
                <button className={styles.menuBtn} onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
                <span className={styles.headerTitle}>HR Dashboard</span>
                <div className={styles.headerAvatar}>{user.name.charAt(0)}</div>
            </header>

            <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
                <div className={styles.sidebarHeader}>
                    <div className={styles.sidebarLogo}>
                        <div className={styles.logoMark}>
                            <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
                                <rect width="40" height="40" rx="10" fill="url(#hgrad)" />
                                <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="14" fontWeight="bold">HR</text>
                                <defs>
                                    <linearGradient id="hgrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#6366f1" />
                                        <stop offset="1" stopColor="#06b6d4" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                        <div>
                            <h2 className={styles.sidebarBrand}>WIG HR</h2>
                            <p className={styles.sidebarSub}>Admin Panel</p>
                        </div>
                    </div>
                    <button className={styles.closeSidebar} onClick={() => setSidebarOpen(false)}>✕</button>
                </div>

                <div className={styles.userCard}>
                    <div className={styles.userAvatar}>{user.name.charAt(0)}</div>
                    <div>
                        <p className={styles.userName}>{user.name}</p>
                        <p className={styles.userRole}>HR Administrator</p>
                    </div>
                </div>

                <nav className={styles.nav}>
                    {navItems.map((item) => (
                        <button
                            key={item.href}
                            className={`${styles.navItem} ${pathname === item.href ? styles.navActive : ""}`}
                            onClick={() => { router.push(item.href); setSidebarOpen(false); }}
                        >
                            <span className={styles.navIcon}>{item.icon}</span>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className={styles.sidebarFooter}>
                    <button className={styles.logoutBtn} onClick={handleLogout}>🚪 Keluar</button>
                </div>
            </aside>

            {sidebarOpen && <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />}
            <main className={styles.main}>{children}</main>
        </div>
    );
}
