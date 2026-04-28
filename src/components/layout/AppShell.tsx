"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import { LucideIcon, LogOut, Menu, X, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────

export interface AppShellUser {
    name: string;
    employeeId: string;
    role: string;
    level?: string;
}

export interface NavSubItem {
    href: string;
    label: string;
}

export interface NavItem {
    href?: string;
    icon: LucideIcon;
    label: string;
    subItems?: NavSubItem[];
}

interface AppShellProps {
    /** Data user yang sudah diverifikasi */
    user: AppShellUser;
    /** Daftar navigasi sidebar */
    navItems: NavItem[];
    /** Judul brand di sidebar (contoh: "WIG HR" / "WIG Portal") */
    brandTitle: string;
    /** Subtitle brand (contoh: "Admin Panel" / "Employee") */
    brandSubtitle: string;
    /** Label nama app di mobile header */
    mobileTitle: string;
    /** localStorage key untuk state collapsed sidebar (agar berbeda antar portal) */
    storageKey: string;
    /** Slot opsional untuk section nav tambahan (misal: Monitoring Tim) */
    extraNav?: React.ReactNode;
    /** Slot opsional untuk area kanan mobile header (contoh: NotificationCenter) */
    mobileHeaderRight?: React.ReactNode;
    /** Mobile bottom nav — jika ada, tampilkan di bawah layar */
    mobileBottomNav?: React.ReactNode;
    /** Callback logout */
    onLogout: () => void;
    children: React.ReactNode;
}

// ─── AppShell Component ───────────────────────────────────────

export default function AppShell({
    user,
    navItems,
    brandTitle,
    brandSubtitle,
    mobileTitle,
    storageKey,
    extraNav,
    mobileHeaderRight,
    mobileBottomNav,
    onLogout,
    children,
}: AppShellProps) {
    const router   = useRouter();
    const pathname  = usePathname();
    const searchParams = useSearchParams();

    /**
     * Cek apakah href (bisa dengan query params) cocok dengan URL saat ini.
     * - Href tanpa query params → cocok hanya jika path sama DAN tidak ada query params.
     * - Href dengan query params → cocok jika path sama DAN semua query params-nya ada di URL.
     */
    const matchesHref = useCallback((href: string): boolean => {
        const [hrefPath, hrefQuery] = href.split("?");
        if (pathname !== hrefPath) return false;
        if (!hrefQuery) {
            // "Semua Aset" atau item tanpa query: aktif hanya jika URL juga kosong
            return searchParams.toString() === "";
        }
        // Cek setiap key-value di href query params harus match
        const hrefParams = new URLSearchParams(hrefQuery);
        for (const [key, val] of hrefParams.entries()) {
            if (searchParams.get(key) !== val) return false;
        }
        return true;
    }, [pathname, searchParams]);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [openMenus, setOpenMenus] = useState<string[]>([]);

    // Restore collapsed state dari localStorage
    useEffect(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved === "true") setSidebarCollapsed(true);
    }, [storageKey]);

    // Auto-expand sub-menu jika sub-item aktif (termasuk URL dengan query params)
    useEffect(() => {
        navItems.forEach((item) => {
            if (item.subItems?.some((sub) => {
                // Bandingkan base path saja (abaikan query params)
                const subBasePath = sub.href.split("?")[0];
                return pathname === subBasePath || pathname.startsWith(subBasePath + "/");
            })) {
                setOpenMenus((prev) =>
                    prev.includes(item.label) ? prev : [...prev, item.label]
                );
            }
        });
    }, [pathname, navItems]);

    const toggleCollapse = useCallback(() => {
        setSidebarCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem(storageKey, String(next));
            return next;
        });
    }, [storageKey]);

    const toggleMenu = (label: string) => {
        setOpenMenus((prev) =>
            prev.includes(label) ? prev.filter((m) => m !== label) : [...prev, label]
        );
    };

    const handleNavClick = (href: string) => {
        router.push(href);
        setSidebarOpen(false);
    };

    return (
        <div className="flex min-h-screen bg-[var(--background)]">

            {/* ── Mobile Header ─────────────────────────────────── */}
            <header className="fixed top-0 left-0 right-0 h-14 bg-white/90 backdrop-blur-md border-b border-[var(--border)] px-4 flex items-center justify-between z-50 lg:hidden">
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[var(--secondary)] transition-colors"
                >
                    <Menu className="w-5 h-5 text-[var(--text-primary)]" />
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 relative">
                        <Image src="/assets/Logo WIG.png" alt="WIG" fill className="object-contain" />
                    </div>
                    <span className="text-sm font-bold text-[var(--primary)]">{mobileTitle}</span>
                </div>
                <div className="flex items-center gap-1">
                    {mobileHeaderRight}
                    <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold">
                        {user.name.charAt(0)}
                    </div>
                </div>
            </header>

            {/* ── Sidebar ───────────────────────────────────────── */}
            <aside className={`fixed left-0 top-0 bottom-0 bg-white border-r border-[var(--border)] flex flex-col z-[200] transition-all duration-300 lg:translate-x-0 ${sidebarCollapsed ? "lg:w-[72px]" : "lg:w-64"} w-64 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>

                {/* Brand */}
                <div className={`p-4 flex items-center border-b border-[var(--border)] min-h-[64px] relative transition-all ${sidebarCollapsed ? "lg:justify-center" : ""}`}>
                    <div className={`flex items-center gap-3 w-full ${sidebarCollapsed ? "lg:hidden" : ""}`}>
                        <div className="w-8 h-8 relative shrink-0">
                            <Image src="/assets/Logo WIG.png" alt="WIG" fill className="object-contain" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-sm font-bold text-[var(--text-primary)] truncate">{brandTitle}</h2>
                            <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest truncate">{brandSubtitle}</p>
                        </div>
                    </div>

                    {/* Icon-only logo saat collapsed */}
                    <div className={`w-8 h-8 relative shrink-0 ${sidebarCollapsed ? "hidden lg:block" : "hidden"}`}>
                        <Image src="/assets/Logo WIG.png" alt="WIG" fill className="object-contain" />
                    </div>

                    {/* Toggle collapse (desktop) - Floating Button */}
                    <button
                        onClick={toggleCollapse}
                        title={sidebarCollapsed ? "Buka Sidebar" : "Tutup Sidebar"}
                        className="hidden lg:flex absolute -right-3 top-5 w-6 h-6 items-center justify-center rounded-full bg-white border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary)] shadow-sm z-[210] transition-colors"
                    >
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-300 ${sidebarCollapsed ? "" : "rotate-180"}`} />
                    </button>

                    {/* Close button (mobile) */}
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md hover:bg-[var(--secondary)] transition-colors"
                    >
                        <X className="w-4 h-4 text-[var(--text-secondary)]" />
                    </button>
                </div>

                {/* User info */}
                <div className={`p-4 border-b border-[var(--border)] transition-all ${sidebarCollapsed ? "lg:p-3 lg:flex lg:justify-center" : ""}`}>
                    <div className={`flex items-center gap-3 w-full ${sidebarCollapsed ? "lg:justify-center" : ""}`}>
                        <div className={`rounded-full bg-[var(--primary)] flex items-center justify-center text-white font-bold shrink-0 transition-all ${sidebarCollapsed ? "w-9 h-9 text-xs" : "w-10 h-10 text-sm"}`}>
                            {user.name.charAt(0)}
                        </div>
                        <div className={`min-w-0 flex-1 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{user.name}</p>
                            <p className="text-xs text-[var(--text-muted)] truncate">{user.employeeId}</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className={`flex-1 p-3 flex flex-col gap-1 overflow-y-auto custom-scrollbar ${sidebarCollapsed ? "lg:items-center" : ""}`}>
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const hasSubItems = item.subItems && item.subItems.length > 0;
                        const isMenuOpen = openMenus.includes(item.label);
                        const isActive = item.href
                            ? matchesHref(item.href)
                            : item.subItems?.some((s) => matchesHref(s.href));

                        return (
                            <div key={item.label} className="flex flex-col gap-1 w-full">
                                <button
                                    title={sidebarCollapsed ? item.label : undefined}
                                    onClick={() => {
                                        if (hasSubItems) {
                                            if (sidebarCollapsed) {
                                                setSidebarCollapsed(false);
                                                localStorage.setItem(storageKey, "false");
                                                setOpenMenus((prev) =>
                                                    prev.includes(item.label) ? prev : [...prev, item.label]
                                                );
                                            } else {
                                                toggleMenu(item.label);
                                            }
                                        } else if (item.href) {
                                            handleNavClick(item.href);
                                        }
                                    }}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 w-full text-left
                                        ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""}
                                        ${isActive && !hasSubItems
                                            ? "bg-[var(--primary)] text-white shadow-sm"
                                            : isActive && hasSubItems
                                                ? "text-[var(--primary)] bg-[var(--secondary)]"
                                                : "text-[var(--text-secondary)] hover:bg-[var(--secondary)] hover:text-[var(--text-primary)]"
                                        }`}
                                >
                                    <Icon className="w-[18px] h-[18px] shrink-0" />
                                    <span className={`flex-1 ${sidebarCollapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                                    {hasSubItems && !sidebarCollapsed ? (
                                        <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isMenuOpen ? "rotate-90" : ""}`} />
                                    ) : (
                                        !sidebarCollapsed && isActive && <ChevronRight className="w-4 h-4 opacity-70" />
                                    )}
                                </button>

                                {/* Sub-items dropdown */}
                                {hasSubItems && isMenuOpen && !sidebarCollapsed && (
                                    <div className="flex flex-col gap-1 ml-9 mt-1 border-l border-[var(--border)] pl-3">
                                        {item.subItems!.map((sub) => {
                                            const isSubActive = matchesHref(sub.href);
                                            return (
                                                <button
                                                    key={sub.href}
                                                    onClick={() => handleNavClick(sub.href)}
                                                    className={`px-3 py-2 rounded-md text-xs font-medium transition-all duration-200 text-left
                                                        ${isSubActive
                                                            ? "text-[var(--primary)] bg-[var(--secondary)]"
                                                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--secondary)]"
                                                        }`}
                                                >
                                                    {sub.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Extra nav slot (contoh: Monitoring Tim) */}
                    {extraNav}
                </nav>

                {/* Logout */}
                <div className={`p-3 border-t border-[var(--border)] ${sidebarCollapsed ? "lg:flex lg:justify-center" : ""}`}>
                    <button
                        onClick={onLogout}
                        title={sidebarCollapsed ? "Keluar" : undefined}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""}`}
                    >
                        <LogOut className="w-[18px] h-[18px] shrink-0" />
                        <span className={sidebarCollapsed ? "lg:hidden" : ""}>Keluar</span>
                    </button>
                </div>
            </aside>

            {/* ── Overlay (mobile) ──────────────────────────────── */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/30 z-[150] lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* ── Main Content ──────────────────────────────────── */}
            <main className={`flex-1 pt-14 lg:pt-0 min-h-screen transition-all duration-300 ${sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-64"} ${mobileBottomNav ? "pb-16 lg:pb-0" : ""}`}>
                <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto">
                    {children}
                </div>
            </main>

            {/* ── Mobile Bottom Nav (opsional) ──────────────────── */}
            {mobileBottomNav}
        </div>
    );
}

// ─── Loading State (shared) ───────────────────────────────────

export function AppShellLoading({ message = "Memuat..." }: { message?: string }) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--background)]">
            <div className="spinner" />
            <p className="text-sm text-[var(--text-muted)]">{message}</p>
        </div>
    );
}
