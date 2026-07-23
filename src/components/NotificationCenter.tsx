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

export default function NotificationCenter({ enabled = true, onAccessDenied }: NotificationCenterProps) {
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [count, setCount] = useState(0);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
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
                setCount(0);
                setLoadError(null);
                setOpen(false);
                onAccessDenied?.();
                return;
            }
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat notifikasi."));
            const data = await res.json();
            setNotifications(data.notifications || []);
            setCount(data.count || 0);
            setLoadError(null);
        } catch (error) {
            reportClientError("NotificationCenter", "Gagal memuat notifikasi", error);
            setLoadError(error instanceof Error ? error.message : "Gagal memuat notifikasi.");
        } finally {
            setLoading(false);
        }
    }, [authBlocked, enabled, onAccessDenied]);

    useEffect(() => {
        if (enabled) {
            setAuthBlocked(false);
            return;
        }

        setOpen(false);
        setNotifications([]);
        setCount(0);
        setLoadError(null);
    }, [enabled]);

    useEffect(() => {
        if (!enabled || authBlocked) return;

        const initialFetchTimer = setTimeout(() => void fetchNotifications(), 0);
        const interval = setInterval(fetchNotifications, 60000);
        return () => {
            clearTimeout(initialFetchTimer);
            clearInterval(interval);
        };
    }, [authBlocked, enabled, fetchNotifications]);

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

    const handleClick = (href: string) => {
        setOpen(false);
        router.push(href);
    };

    if (!enabled || authBlocked) return null;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setOpen(!open)}
                className="relative w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[var(--secondary)] transition-colors"
                aria-label="Buka notifikasi"
            >
                <Bell className="w-5 h-5 text-[var(--text-secondary)]" />
                {count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {count > 99 ? "99+" : count}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-12 w-80 bg-[var(--card)] rounded-xl shadow-xl border border-[var(--border)] z-[300] overflow-hidden animate-[fadeIn_0.15s_ease]">
                    <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Notifikasi</h3>
                        <span className="text-xs text-[var(--text-muted)]">{loading ? "Memuat..." : `${count} item`}</span>
                    </div>

                    <div className="max-h-[360px] overflow-y-auto">
                        {loadError ? (
                            <div className="p-4">
                                <FeedbackMessage variant="error" compact title="Notifikasi belum dapat dimuat">
                                    <p>{loadError}</p>
                                    <button
                                        type="button"
                                        onClick={() => void fetchNotifications()}
                                        disabled={loading}
                                        className="mt-3 inline-flex items-center gap-1 rounded-md bg-[var(--destructive)] px-3 py-1.5 text-[10px] font-semibold text-[var(--destructive-foreground)] disabled:opacity-60"
                                    >
                                        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                                        {loading ? "Memuat ulang..." : "Coba lagi"}
                                    </button>
                                </FeedbackMessage>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <Bell className="w-8 h-8 text-[var(--text-muted)] opacity-20 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)]">Tidak ada notifikasi</p>
                            </div>
                        ) : (
                            notifications.map((n) => {
                                const Icon = TYPE_ICON[n.type];
                                const color = TYPE_COLOR[n.type];
                                return (
                                    <button
                                        key={n.id}
                                        onClick={() => handleClick(n.href)}
                                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[var(--secondary)] transition-colors text-left border-b border-[var(--border)] last:border-b-0"
                                    >
                                        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center shrink-0 mt-0.5`}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold text-[var(--text-primary)]">{n.title}</p>
                                            <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 mt-0.5">{n.message}</p>
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
