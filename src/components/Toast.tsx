"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastState {
    id: number;
    message: string;
    variant: ToastVariant;
}

let globalToast: ((message: string, variant?: ToastVariant) => void) | null = null;
let toastCounter = 0;

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

    useEffect(() => {
        globalToast = (message, variant = "info") => {
            const id = ++toastCounter;
            setToasts((prev) => [...prev, { id, message, variant }]);
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, 4000);
        };
        return () => { globalToast = null; };
    }, []);

    const dismiss = (id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const icons: Record<ToastVariant, typeof CheckCircle> = {
        success: CheckCircle,
        error: XCircle,
        warning: AlertTriangle,
        info: Info,
    };

    const styles: Record<ToastVariant, string> = {
        success: "bg-emerald-600",
        error: "bg-red-600",
        warning: "bg-amber-500",
        info: "bg-blue-600",
    };

    return (
        <div className="fixed top-4 right-4 z-[9998] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
            {toasts.map((t) => {
                const Icon = icons[t.variant];
                return (
                    <div
                        key={t.id}
                        className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl text-white shadow-lg animate-[slideIn_0.3s_ease] ${styles[t.variant]}`}
                    >
                        <Icon className="w-5 h-5 shrink-0" />
                        <p className="text-sm font-medium flex-1">{t.message}</p>
                        <button onClick={() => dismiss(t.id)} className="text-white/70 hover:text-white shrink-0">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
