"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AlertCircle, Bell, X, CalendarOff, Clock4, FileEdit, Newspaper, FileText, Loader2, CalendarClock, ListChecks } from "lucide-react";
import Link from "next/link";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

// ─── Types ──────────────────────────────────────────────────────────────────

type NotifType = "leave" | "overtime" | "correction" | "news" | "letter" | "appointment" | "task";

interface EmployeeNotification {
    id: string;
    type: NotifType;
    title: string;
    message: string;
    href: string;
    time: string;
    isRead: boolean;
}

interface NotifResponse {
    notifications?: EmployeeNotification[];
    total?: number;
    unread?: number;
}

interface EmployeeNotificationPanelProps {
    enabled?: boolean;
    onAccessDenied?: () => void;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<NotifType, { icon: typeof Bell; color: string; bg: string }> = {
    leave:      { icon: CalendarOff, color: "text-blue-600",   bg: "bg-blue-50" },
    overtime:   { icon: Clock4,      color: "text-orange-500", bg: "bg-orange-50" },
    correction: { icon: FileEdit,    color: "text-purple-600", bg: "bg-purple-50" },
    news:       { icon: Newspaper,   color: "text-green-600",  bg: "bg-green-50" },
    letter:     { icon: FileText,    color: "text-pink-500",   bg: "bg-pink-50" },
    appointment:{ icon: CalendarClock, color: "text-teal-600", bg: "bg-teal-50" },
    task:       { icon: ListChecks,  color: "text-amber-600", bg: "bg-amber-50" },
};

type Tab = "unread" | "history";

function fmtRelativeTime(isoStr: string): string {
    const diff = Date.now() - new Date(isoStr).getTime();
    if (diff < 0) {
        const mins = Math.ceil(-diff / 60000);
        if (mins < 60) return `dalam ${mins} mnt`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `dalam ${hours} jam`;
        return `dalam ${Math.floor(hours / 24)} hari`;
    }
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Baru saja";
    if (minutes < 60) return `${minutes} menit lalu`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} jam lalu`;
    return `${Math.floor(hours / 24)} hari lalu`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function EmployeeNotificationPanel({ enabled = true, onAccessDenied }: EmployeeNotificationPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [tab, setTab] = useState<Tab>("unread");
    const [notifications, setNotifications] = useState<EmployeeNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [markingAll, setMarkingAll] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [authBlocked, setAuthBlocked] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const stopForAuthChange = useCallback(() => {
        setAuthBlocked(true);
        setIsOpen(false);
        setNotifications([]);
        setUnreadCount(0);
        setLoadError(null);
        onAccessDenied?.();
    }, [onAccessDenied]);

    const fetchBadgeCount = useCallback(async () => {
        if (!enabled || authBlocked) return;
        try {
            const res = await fetch("/api/notifications/employee?countOnly=1");
            if (res.status === 401 || res.status === 403) {
                stopForAuthChange();
                return;
            }
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat notifikasi."));
            const data = await res.json() as NotifResponse;
            setUnreadCount(data.unread ?? 0);
        } catch (error) {
            reportClientError("EmployeeNotificationPanel", "Gagal memuat badge notifikasi employee", error);
        }
    }, [authBlocked, enabled, stopForAuthChange]);

    const fetchNotifications = useCallback(async () => {
        if (!enabled || authBlocked) return;
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch("/api/notifications/employee");
            if (res.status === 401 || res.status === 403) {
                stopForAuthChange();
                return;
            }
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat notifikasi."));
            const data = await res.json() as NotifResponse;
            setNotifications(data.notifications ?? []);
            setUnreadCount(data.unread ?? 0);
        } catch (error) {
            reportClientError("EmployeeNotificationPanel", "Gagal memuat notifikasi employee", error);
            setLoadError(error instanceof Error ? error.message : "Gagal memuat notifikasi.");
        } finally {
            setLoading(false);
        }
    }, [authBlocked, enabled, stopForAuthChange]);

    const markRead = useCallback(async (id: string) => {
        try {
            await fetch("/api/notifications/employee", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [id] }),
            });
        } catch (error) {
            reportClientError("EmployeeNotificationPanel", "Gagal menandai dibaca", error, { id });
        } finally {
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
            setUnreadCount((prev) => Math.max(0, prev - 1));
        }
    }, []);

    const markAllRead = useCallback(async () => {
        const ids = notifications.filter((n) => !n.isRead).map((n) => n.id);
        if (ids.length === 0 || markingAll) return;
        setMarkingAll(true);
        try {
            const res = await fetch("/api/notifications/employee", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ all: true, allIds: ids }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menandai semua dibaca."));
            const markedIds = new Set(ids);
            setNotifications((prev) => prev.map((n) => (markedIds.has(n.id) ? { ...n, isRead: true } : n)));
            setUnreadCount(0);
            setTab("history");
        } catch (error) {
            reportClientError("EmployeeNotificationPanel", "Gagal menandai semua dibaca", error);
            setLoadError(error instanceof Error ? error.message : "Gagal menandai semua dibaca.");
        } finally {
            setMarkingAll(false);
        }
    }, [markingAll, notifications]);

    useEffect(() => {
        if (!enabled) {
            setIsOpen(false);
            setNotifications([]);
            setUnreadCount(0);
            setLoadError(null);
            setTab("unread");
            return;
        }
        setAuthBlocked(false);
    }, [enabled]);

    // Fetch daftar saat dibuka
    useEffect(() => {
        if (enabled && !authBlocked && isOpen) {
            void fetchNotifications();
        }
    }, [authBlocked, enabled, isOpen, fetchNotifications]);

    // Badge: saat mount + polling ringan tiap 2 menit
    useEffect(() => {
        if (!enabled || authBlocked) return;
        void fetchBadgeCount();
        const timer = setInterval(() => { void fetchBadgeCount(); }, 120000);
        return () => clearInterval(timer);
    }, [authBlocked, enabled, fetchBadgeCount]);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isOpen]);

    if (!enabled || authBlocked) return null;

    const unreadList = notifications.filter((n) => !n.isRead);
    const readList = notifications.filter((n) => n.isRead);
    const shown = tab === "unread" ? unreadList : readList;

    return (
        <div className="relative" ref={panelRef}>
            {/* ── Bell Button ───────────────────────────────────────────────── */}
            <button
                onClick={() => setIsOpen((p) => !p)}
                className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[var(--secondary)] transition-colors"
                aria-label="Notifikasi"
            >
                <Bell className="w-5 h-5 text-[var(--text-secondary)]" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            {/* ── Dropdown Panel ───────────────────────────────────────────── */}
            {isOpen && (
                <div className="absolute right-0 top-11 w-80 bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] z-50 animate-[fadeIn_0.15s_ease] overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--secondary)]/50">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">
                            Notifikasi
                        </h3>
                        <div className="flex items-center gap-2">
                            {unreadCount > 0 && (
                                <button
                                    onClick={() => { void markAllRead(); }}
                                    disabled={markingAll}
                                    className="text-[10px] font-semibold text-[var(--primary)] hover:underline disabled:opacity-60"
                                >
                                    {markingAll ? "Menyimpan…" : "Tandai Semua Dibaca"}
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-[var(--border)] transition-colors"
                                aria-label="Tutup notifikasi"
                            >
                                <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1.5 px-4 pt-3" role="tablist" aria-label="Filter notifikasi" onKeyDown={(e) => {
                        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                        e.preventDefault();
                        setTab((t) => (t === "unread" ? "history" : "unread"));
                    }}>
                        {(
                            [
                                { key: "unread", label: `Belum Dibaca${unreadCount > 0 ? ` (${unreadCount})` : ""}` },
                                { key: "history", label: `Riwayat (${readList.length})` },
                            ] as const
                        ).map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                role="tab"
                                id={`tab-empnotif-${t.key}`}
                                aria-selected={tab === t.key}
                                aria-controls="panel-empnotif"
                                tabIndex={tab === t.key ? 0 : -1}
                                onClick={() => setTab(t.key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold min-h-9 ${
                                    tab === t.key
                                        ? "bg-[var(--primary)] text-white"
                                        : "bg-[var(--secondary)] text-[var(--text-secondary)]"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Body */}
                    <div className="max-h-80 overflow-y-auto" role="tabpanel" id="panel-empnotif" aria-labelledby={`tab-empnotif-${tab}`}>
                        {loading ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)] opacity-50" />
                            </div>
                        ) : loadError ? (
                            <div className="py-10 text-center px-6">
                                <AlertCircle className="w-8 h-8 text-[var(--destructive)] opacity-70 mx-auto mb-2" />
                                <p className="text-xs text-[var(--destructive)] font-medium">
                                    {loadError}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => { void fetchNotifications(); void fetchBadgeCount(); }}
                                    className="text-[10px] font-semibold text-[var(--primary)] hover:underline mt-2"
                                >
                                    Coba lagi
                                </button>
                            </div>
                        ) : shown.length === 0 ? (
                            <div className="py-10 text-center">
                                <Bell className="w-8 h-8 text-[var(--text-muted)] opacity-20 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)] font-medium">
                                    {tab === "unread" ? "Tidak ada notifikasi baru" : "Belum ada riwayat"}
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--border)]">
                                {shown.map((notif) => {
                                    const cfg = TYPE_ICON[notif.type];
                                    const Icon = cfg.icon;

                                    return (
                                        <Link
                                            key={notif.id}
                                            href={notif.href}
                                            onClick={() => { if (!notif.isRead) void markRead(notif.id); setIsOpen(false); }}
                                            className={`flex items-start gap-3 px-4 py-3 hover:bg-[var(--secondary)]/50 transition-colors ${
                                                !notif.isRead ? "bg-[var(--primary)]/3" : ""
                                            }`}
                                        >
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg}`}>
                                                <Icon className={`w-4 h-4 ${cfg.color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-1">
                                                    <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">
                                                        {notif.title}
                                                    </p>
                                                    {!notif.isRead && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] shrink-0 mt-1" />
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed line-clamp-2">
                                                    {notif.message}
                                                </p>
                                                <p className="text-[9px] text-[var(--text-muted)] mt-1 font-medium">
                                                    {fmtRelativeTime(notif.time)}
                                                </p>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {(notifications.length > 0 || loadError) && (
                        <div className="px-4 py-2.5 border-t border-[var(--border)] bg-[var(--secondary)]/30">
                            <button
                                onClick={() => { void fetchNotifications(); void fetchBadgeCount(); }}
                                className="text-[10px] font-semibold text-[var(--primary)] hover:underline flex items-center gap-1"
                            >
                                {loading
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : null
                                }
                                Refresh notifikasi
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
