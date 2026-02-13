"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarOff, MapPinned, Clock4, UserX } from "lucide-react";

interface Notification {
    id: string;
    type: "leave" | "visit" | "overtime" | "absent";
    title: string;
    message: string;
    href: string;
    time: string;
}

const TYPE_ICON = {
    leave: CalendarOff,
    visit: MapPinned,
    overtime: Clock4,
    absent: UserX,
};

const TYPE_COLOR = {
    leave: "text-orange-500 bg-orange-50",
    visit: "text-blue-500 bg-blue-50",
    overtime: "text-purple-500 bg-purple-50",
    absent: "text-red-500 bg-red-50",
};

export default function NotificationCenter() {
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [count, setCount] = useState(0);
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await fetch("/api/notifications");
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
                setCount(data.count || 0);
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

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

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setOpen(!open)}
                className="relative w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[var(--secondary)] transition-colors"
            >
                <Bell className="w-5 h-5 text-[var(--text-secondary)]" />
                {count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {count > 99 ? "99+" : count}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-xl border border-[var(--border)] z-[300] overflow-hidden animate-[fadeIn_0.15s_ease]">
                    <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Notifikasi</h3>
                        <span className="text-xs text-[var(--text-muted)]">{count} item</span>
                    </div>

                    <div className="max-h-[360px] overflow-y-auto">
                        {notifications.length === 0 ? (
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
