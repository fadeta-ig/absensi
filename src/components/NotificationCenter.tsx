"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarOff, MapPinned, Clock4, UserX, FileText, Loader2 } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";

interface Notification {
    id: string;
    type: "leave" | "visit" | "overtime" | "absent" | "letter";
    title: string;
    message: string;
    href: string;
    time: string;
    isRead: boolean;
}

interface NotificationCenterProps {
    enabled?: boolean;
    onAccessDenied?: () => void;
}

const TYPE_ICON = {
    leave: CalendarOff,
    visit: MapPinned,
    overtime: Clock4,
    absent: UserX,
    letter: FileText,
};

const TYPE_COLOR = {
    leave: "text-orange-500 bg-orange-50",
    visit: "text-blue-500 bg-blue-50",
    overtime: "text-purple-500 bg-purple-50",
    absent: "text-red-500 bg-red-50",
    letter: "text-teal-500 bg-teal-50",
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

export default function NotificationCenter({ enabled = true, onAccessDenied }: NotificationCenterProps) {
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unread, setUnread] = useState(0);
    const [tab, setTab] = useState<Tab>("unread");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [markingAll, setMarkingAll] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [authBlocked, setAuthBlocked] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = useCallback(async () => {
        if (!enabled || authBlocked) return;

        setLoading(true);
        try {
            const res = await fetch("/api/notifications");
            if (res.status === 401 || res.status === 403) {
                setAuthBlocked(true);
                setNotifications([]);
                setUnread(0);
                setLoadError(null);
                setOpen(false);
                onAccessDenied?.();
                return;
            }
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat notifikasi."));
            const data = await res.json();
            setNotifications(data.notifications || []);
            setUnread(data.unread ?? 0);
            setLoadError(null);
        } catch (error) {
            reportClientError("NotificationCenter", "Gagal memuat notifikasi", error);
            setLoadError(error instanceof Error ? error.message : "Gagal memuat notifikasi.");
        } finally {
            setLoading(false);
        }
    }, [authBlocked, enabled, onAccessDenied]);

    const fetchBadgeCount = useCallback(async () => {
        if (!enabled || authBlocked) return;
        try {
            const res = await fetch("/api/notifications?countOnly=1");
            if (res.status === 401 || res.status === 403) {
                setAuthBlocked(true);
                setNotifications([]);
                setUnread(0);
                setOpen(false);
                onAccessDenied?.();
                return;
            }
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat notifikasi."));
            const data = await res.json();
            setUnread(data.unread ?? 0);
        } catch (error) {
            reportClientError("NotificationCenter", "Gagal memuat badge notifikasi", error);
        }
    }, [authBlocked, enabled, onAccessDenied]);

    const markRead = useCallback(async (id: string) => {
        try {
            await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [id] }),
            });
        } catch (error) {
            reportClientError("NotificationCenter", "Gagal menandai dibaca", error, { id });
        } finally {
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
            setUnread((prev) => Math.max(0, prev - 1));
        }
    }, []);

    const markAllRead = useCallback(async () => {
        const ids = notifications.filter((n) => !n.isRead).map((n) => n.id);
        if (ids.length === 0 || markingAll) return;
        setMarkingAll(true);
        try {
            const res = await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ all: true, allIds: ids }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menandai semua dibaca."));
            const markedIds = new Set(ids);
            setNotifications((prev) => prev.map((n) => (markedIds.has(n.id) ? { ...n, isRead: true } : n)));
            setUnread(0);
            setTab("history");
            setLoadError(null);
        } catch (error) {
            reportClientError("NotificationCenter", "Gagal menandai semua dibaca", error);
            setLoadError(error instanceof Error ? error.message : "Gagal menandai semua dibaca.");
        } finally {
            setMarkingAll(false);
        }
    }, [markingAll, notifications]);

    useEffect(() => {
        if (enabled) {
            setAuthBlocked(false);
            return;
        }

        setOpen(false);
        setNotifications([]);
        setUnread(0);
        setLoadError(null);
        setTab("unread");
    }, [enabled]);

    useEffect(() => {
        if (!enabled || authBlocked) return;

        void fetchBadgeCount();
        const interval = setInterval(fetchBadgeCount, 60000);
        return () => clearInterval(interval);
    }, [authBlocked, enabled, fetchBadgeCount]);

    useEffect(() => {
        if (enabled && !authBlocked && open) {
            void fetchNotifications();
        }
    }, [authBlocked, enabled, open, fetchNotifications]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const handleClick = (id: string, href: string, isRead: boolean) => {
        if (!isRead) void markRead(id);
        setOpen(false);
        router.push(href);
    };

    if (!enabled || authBlocked) return null;

    const unreadList = notifications.filter((n) => !n.isRead);
    const readList = notifications.filter((n) => n.isRead);
    const shown = tab === "unread" ? unreadList : readList;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setOpen(!open)}
                className="relative w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[var(--secondary)] transition-colors"
                aria-label="Buka notifikasi"
            >
                <Bell className="w-5 h-5 text-[var(--text-secondary)]" />
                {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {unread > 99 ? "99+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-12 w-80 bg-[var(--card)] rounded-xl shadow-xl border border-[var(--border)] z-[300] overflow-hidden animate-[fadeIn_0.15s_ease]">
                    <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Notifikasi</h3>
                        {unread > 0 ? (
                            <button
                                onClick={() => { void markAllRead(); }}
                                disabled={markingAll}
                                className="text-[11px] font-semibold text-[var(--primary)] hover:underline disabled:opacity-60"
                            >
                                {markingAll ? "Menyimpan…" : "Tandai Semua Dibaca"}
                            </button>
                        ) : (
                            <span className="text-xs text-[var(--text-muted)]">{loading ? "Memuat..." : `${notifications.length} item`}</span>
                        )}
                    </div>

                    <div className="flex gap-1.5 px-4 pt-3" role="tablist" aria-label="Filter notifikasi" onKeyDown={(e) => {
                        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                        e.preventDefault();
                        setTab((t) => (t === "unread" ? "history" : "unread"));
                    }}>
                        {(
                            [
                                { key: "unread", label: `Belum Dibaca${unread > 0 ? ` (${unread})` : ""}` },
                                { key: "history", label: `Riwayat (${readList.length})` },
                            ] as const
                        ).map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                role="tab"
                                id={`tab-hrnotif-${t.key}`}
                                aria-selected={tab === t.key}
                                aria-controls="panel-hrnotif"
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

                    <div className="max-h-[360px] overflow-y-auto" role="tabpanel" id="panel-hrnotif" aria-labelledby={`tab-hrnotif-${tab}`}>
                        {loadError ? (
                            <div className="p-4">
                                <FeedbackMessage variant="error" compact title="Notifikasi belum dapat dimuat">
                                    <p>{loadError}</p>
                                    <button
                                        type="button"
                                        onClick={() => { void fetchNotifications(); void fetchBadgeCount(); }}
                                        disabled={loading}
                                        className="mt-3 inline-flex items-center gap-1 rounded-md bg-[var(--destructive)] px-3 py-1.5 text-[10px] font-semibold text-[var(--destructive-foreground)] disabled:opacity-60"
                                    >
                                        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                                        {loading ? "Memuat ulang..." : "Coba lagi"}
                                    </button>
                                </FeedbackMessage>
                            </div>
                        ) : shown.length === 0 ? (
                            <div className="p-8 text-center">
                                <Bell className="w-8 h-8 text-[var(--text-muted)] opacity-20 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)]">{tab === "unread" ? "Tidak ada notifikasi baru" : "Belum ada riwayat"}</p>
                            </div>
                        ) : (
                            shown.map((n) => {
                                const Icon = TYPE_ICON[n.type];
                                const color = TYPE_COLOR[n.type];
                                return (
                                    <button
                                        key={n.id}
                                        onClick={() => handleClick(n.id, n.href, n.isRead)}
                                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[var(--secondary)] transition-colors text-left border-b border-[var(--border)] last:border-b-0"
                                    >
                                        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center shrink-0 mt-0.5`}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-1">
                                                <p className="text-xs font-semibold text-[var(--text-primary)]">{n.title}</p>
                                                {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] shrink-0 mt-1" />}
                                            </div>
                                            <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 mt-0.5">{n.message}</p>
                                            <p className="text-[9px] text-[var(--text-muted)] mt-1 font-medium">{fmtRelativeTime(n.time)}</p>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
