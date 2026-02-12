"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import styles from "./employee.module.css";

interface User {
    id: string;
    employeeId: string;
    name: string;
    department: string;
    position: string;
    role: string;
}

export default function EmployeeLayout({
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
            .then(setUser)
            .catch(() => router.push("/"));
    }, [router]);

    const handleLogout = useCallback(async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
    }, [router]);

    const navItems = [
        { href: "/employee", icon: "🏠", label: "Beranda" },
        { href: "/employee/attendance", icon: "📸", label: "Absensi" },
        { href: "/employee/payslip", icon: "💰", label: "Slip Gaji" },
        { href: "/employee/leave", icon: "🏖️", label: "Cuti" },
        { href: "/employee/news", icon: "📢", label: "WIG News" },
        { href: "/employee/todos", icon: "📝", label: "Catatan" },
    ];

    if (!user) {
        return (
            <div className={styles.loadingScreen}>
                <div className="spinner"></div>
                <p>Memuat...</p>
            </div>
        );
    }

    return (
        <div className={styles.layout}>
            {/* Mobile Header */}
            <header className={styles.mobileHeader}>
                <button
                    className={styles.menuBtn}
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                    ☰
                </button>
                <span className={styles.headerTitle}>WIG Attendance</span>
                <div className={styles.headerAvatar}>
                    {user.name.charAt(0)}
                </div>
            </header>

            {/* Sidebar */}
            <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
                <div className={styles.sidebarHeader}>
                    <div className={styles.sidebarLogo}>
                        <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
                            <rect width="40" height="40" rx="10" fill="url(#sgrad)" />
                            <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="16" fontWeight="bold">W</text>
                            <defs>
                                <linearGradient id="sgrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#6366f1" />
                                    <stop offset="1" stopColor="#06b6d4" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div>
                            <h2 className={styles.sidebarBrand}>WIG</h2>
                            <p className={styles.sidebarSub}>Attendance</p>
                        </div>
                    </div>
                    <button
                        className={styles.closeSidebar}
                        onClick={() => setSidebarOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                <div className={styles.userCard}>
                    <div className={styles.userAvatar}>{user.name.charAt(0)}</div>
                    <div>
                        <p className={styles.userName}>{user.name}</p>
                        <p className={styles.userRole}>{user.position}</p>
                    </div>
                </div>

                <nav className={styles.nav}>
                    {navItems.map((item) => (
                        <button
                            key={item.href}
                            className={`${styles.navItem} ${pathname === item.href ? styles.navActive : ""}`}
                            onClick={() => {
                                router.push(item.href);
                                setSidebarOpen(false);
                            }}
                        >
                            <span className={styles.navIcon}>{item.icon}</span>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className={styles.sidebarFooter}>
                    <button className={styles.logoutBtn} onClick={handleLogout}>
                        🚪 Keluar
                    </button>
                </div>
            </aside>

            {/* Overlay */}
            {sidebarOpen && (
                <div
                    className={styles.overlay}
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Main Content */}
            <main className={styles.main}>{children}</main>

            {/* Mobile Bottom Nav */}
            <nav className={styles.bottomNav}>
                {navItems.slice(0, 5).map((item) => (
                    <button
                        key={item.href}
                        className={`${styles.bottomNavItem} ${pathname === item.href ? styles.bottomNavActive : ""}`}
                        onClick={() => router.push(item.href)}
                    >
                        <span className={styles.bottomNavIcon}>{item.icon}</span>
                        <span className={styles.bottomNavLabel}>{item.label}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
}
