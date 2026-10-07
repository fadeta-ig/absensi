"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastState {
    id: number;
    message: string;
    variant: ToastVariant;
}

let globalToast: ((message: string, variant?: ToastVariant) => void) | null = null;
let toastCounter = 0;

/** Auto-dismiss per varian: error/warning lebih lama agar kebaca di mobile. */
const DISMISS_MS: Record<ToastVariant, number> = {
    success: 4000,
    info: 4000,
    warning: 6000,
    error: 6000,
};

const MAX_STACK = 3;

/**
 * Hook to show toast notifications.
 * Returns `toast(message, variant?)` — variant defaults to "info".
 */
export function useToast() {
    return useCallback((message: string, variant: ToastVariant = "info") => {
        if (globalToast) globalToast(message, variant);
    }, []);
}

/**
 * Render this once in your root layout to enable toasts app-wide.
 */
export default function ToastContainer() {
    const [toasts, setToasts] = useState<ToastState[]>([]);
    const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

    useEffect(() => {
        const activeTimers = timers.current;
        globalToast = (message, variant = "info") => {
            const id = ++toastCounter;
            // Batasi tumpukan agar tidak menutup layar HP; yang lama dibuang.
            setToasts((prev) => [...prev, { id, message, variant }].slice(-MAX_STACK));
            const timer = setTimeout(() => {
                timers.current.delete(id);
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, DISMISS_MS[variant]);
            timers.current.set(id, timer);
        };
        return () => {
            globalToast = null;
            for (const timer of activeTimers.values()) clearTimeout(timer);
            activeTimers.clear();
        };
    }, []);

    const dismiss = useCallback((id: number) => {
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const icons: Record<ToastVariant, typeof CheckCircle> = {
        success: CheckCircle,
        error: XCircle,
        warning: AlertTriangle,
        info: Info,
    };

    const styles: Record<ToastVariant, string> = {
        success: "bg-[var(--success)]",
        error: "bg-[var(--destructive)]",
        warning: "bg-[var(--warning)]",
        info: "bg-[var(--info)]",
    };

    return (
        <div
            className="fixed left-4 right-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-[10000] flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm pointer-events-none"
            aria-live="polite"
            aria-relevant="additions text"
        >
            {toasts.map((t) => {
                const Icon = icons[t.variant];
                return (
                    <div
                        key={t.id}
                        role={t.variant === "error" || t.variant === "warning" ? "alert" : "status"}
                        aria-live={t.variant === "error" || t.variant === "warning" ? "assertive" : "polite"}
                        className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl text-white shadow-lg animate-[slideIn_0.3s_ease] max-h-[40vh] overflow-y-auto ${styles[t.variant]}`}
                    >
                        <Icon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                        <p className="text-sm font-medium flex-1 min-w-0 break-words [overflow-wrap:anywhere]">{t.message}</p>
                        <button
                            onClick={() => dismiss(t.id)}
                            className="text-white/70 hover:text-white shrink-0 min-w-11 min-h-11 -m-2 flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                            aria-label="Tutup notifikasi"
                        >
                            <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
