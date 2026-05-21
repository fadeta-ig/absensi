"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, X, CalendarOff, Clock4, FileEdit, Newspaper, FileText, Loader2 } from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotifType = "leave" | "overtime" | "correction" | "news" | "letter";

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
    notifications: EmployeeNotification[];
    total: number;
    unread: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<NotifType, { icon: typeof Bell; color: string; bg: string }> = {
    leave:      { icon: CalendarOff, color: "text-blue-600",   bg: "bg-blue-50" },
    overtime:   { icon: Clock4,      color: "text-orange-500", bg: "bg-orange-50" },
    correction: { icon: FileEdit,    color: "text-purple-600", bg: "bg-purple-50" },
    news:       { icon: Newspaper,   color: "text-green-600",  bg: "bg-green-50" },
    letter:     { icon: FileText,    color: "text-pink-500",   bg: "bg-pink-50" },
};

function fmtRelativeTime(isoStr: string): string {
    const diff = Date.now() - new Date(isoStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Baru saja";
    if (minutes < 60) return `${minutes} menit lalu`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} jam lalu`;
    const days = Math.floor(hours / 24);
    return `${days} hari lalu`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmployeeNotificationPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<EmployeeNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [readIds, setReadIds] = useState<Set<string>>(new Set());
    const panelRef = useRef<HTMLDivElement>(null);
    const hasFetched = useRef(false);

    const fetchNotifications = useCallback(async () => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await fetch("/api/notifications/employee");
            if (!res.ok) return;
            const data = await res.json() as NotifResponse;
            setNotifications(data.notifications ?? []);
            setUnreadCount(data.unread ?? 0);
        } catch {
            // silently ignore — notif panel is non-critical
        } finally {
            setLoading(false);
        }
    }, [loading]);

    // Auto-fetch saat pertama kali dibuka
    useEffect(() => {
        if (isOpen && !hasFetched.current) {
            hasFetched.current = true;
            fetchNotifications();
        }
    }, [isOpen, fetchNotifications]);

    // Fetch badge count saat mount (background)
    useEffect(() => {
        fetch("/api/notifications/employee")
            .then((r) => r.json())
            .then((data: NotifResponse) => setUnreadCount(data.unread ?? 0))
            .catch(() => {/* silently ignore */});
    }, []);

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [isOpen]);

    const markAllRead = () => {
        const allIds = new Set(notifications.map((n) => n.id));
        setReadIds(allIds);
        setUnreadCount(0);
    };

    const markRead = (id: string) => {
        setReadIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
        setUnreadCount((prev) => Math.max(0, prev - 1));
    };

    const displayUnread = Math.max(0, unreadCount - readIds.size);

    return (
        <div className="relative" ref={panelRef}>
            {/* ── Bell Button ───────────────────────────────────────────────── */}
            <button
                onClick={() => setIsOpen((p) => !p)}
                className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[var(--secondary)] transition-colors"
                aria-label="Notifikasi"
            >
                <Bell className="w-5 h-5 text-[var(--text-secondary)]" />
                {displayUnread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
                        {displayUnread > 9 ? "9+" : displayUnread}
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
                            {displayUnread > 0 && (
                                <button
                                    onClick={markAllRead}
                                    className="text-[10px] font-semibold text-[var(--primary)] hover:underline"
                                >
                                    Tandai semua dibaca
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-[var(--border)] transition-colors"
                            >
                                <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="max-h-80 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)] opacity-50" />
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="py-10 text-center">
                                <Bell className="w-8 h-8 text-[var(--text-muted)] opacity-20 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)] font-medium">
                                    Tidak ada notifikasi terbaru
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--border)]">
                                {notifications.map((notif) => {
                                    const cfg = TYPE_ICON[notif.type];
                                    const Icon = cfg.icon;
                                    const isRead = readIds.has(notif.id);

                                    return (
                                        <Link
                                            key={notif.id}
                                            href={notif.href}
                                            onClick={() => { markRead(notif.id); setIsOpen(false); }}
                                            className={`flex items-start gap-3 px-4 py-3 hover:bg-[var(--secondary)]/50 transition-colors ${
                                                !isRead ? "bg-[var(--primary)]/3" : ""
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
                                                    {!isRead && (
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
                    {notifications.length > 0 && (
                        <div className="px-4 py-2.5 border-t border-[var(--border)] bg-[var(--secondary)]/30">
                            <button
                                onClick={fetchNotifications}
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
