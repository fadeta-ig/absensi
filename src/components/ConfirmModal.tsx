"use client";

import { useEffect, useState, useCallback, useId, useRef } from "react";
import { AlertTriangle, X, Loader2 } from "lucide-react";

interface ConfirmState {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "info";
    onConfirm: (() => void) | (() => Promise<void>);
}

const INITIAL_STATE: ConfirmState = {
    open: false,
    title: "",
    message: "",
    onConfirm: () => { },
};

type OpenConfirmFn = (opts: Omit<ConfirmState, "open">) => void;

let globalOpen: OpenConfirmFn | null = null;

/**
 * Hook to access the confirm dialog.
 * Returns a function: `confirm({ title, message, onConfirm, ... })`
 */
export function useConfirm(): OpenConfirmFn {
    return useCallback((opts: Omit<ConfirmState, "open">) => {
        if (globalOpen) globalOpen(opts);
    }, []);
}

/**
 * Render this once in your root layout to enable confirm dialogs app-wide.
 */
export default function ConfirmModal() {
    const [state, setState] = useState<ConfirmState>(INITIAL_STATE);
    const [loading, setLoading] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        globalOpen = (opts) => setState({ ...opts, open: true });
        return () => { globalOpen = null; };
    }, []);

    const close = useCallback(() => {
        if (loading) return;
        setState(INITIAL_STATE);
    }, [loading]);

    useEffect(() => {
        if (!state.open) return;

        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusTimer = window.setTimeout(() => cancelRef.current?.focus(), 0);

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                close();
                return;
            }

            if (event.key !== "Tab" || !dialogRef.current) return;

            const focusable = Array.from(
                dialogRef.current.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            );

            if (focusable.length === 0) {
                event.preventDefault();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener("keydown", handleKeyDown);
            previousFocus?.focus();
        };
    }, [close, state.open]);

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await state.onConfirm();
        } finally {
            setLoading(false);
            setState(INITIAL_STATE);
        }
    };

    if (!state.open) return null;

    const variant = state.variant || "danger";
    const variantStyles = {
        danger: {
            icon: "bg-[var(--destructive)]/10 text-[var(--destructive)]",
            btn: "bg-[var(--destructive)] hover:opacity-90 text-[var(--destructive-foreground)]",
        },
        warning: {
            icon: "bg-[var(--warning-bg)] text-[var(--warning)]",
            btn: "bg-[var(--warning)] hover:opacity-90 text-white",
        },
        info: {
            icon: "bg-[var(--info-bg)] text-[var(--info)]",
            btn: "bg-[var(--info)] hover:opacity-90 text-white",
        },
    }[variant];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={close}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.15s_ease]" />

            {/* Dialog */}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="relative bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-[scaleIn_0.2s_ease]"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={close}
                    className="absolute top-3 right-3 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                    disabled={loading}
                    aria-label="Tutup dialog"
                >
                    <X className="w-4 h-4" />
                </button>

                <div className="flex flex-col items-center text-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${variantStyles.icon}`}>
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 id={titleId} className="text-base font-bold text-[var(--text-primary)] mb-1">{state.title}</h3>
                        <p id={descriptionId} className="text-sm text-[var(--text-secondary)] leading-relaxed">{state.message}</p>
                    </div>
                    <div className="flex gap-3 w-full pt-1">
                        <button
                            ref={cancelRef}
                            onClick={close}
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--secondary)] transition-colors disabled:opacity-50"
                        >
                            {state.cancelLabel || "Batal"}
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={loading}
                            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-70 flex items-center justify-center gap-2 ${variantStyles.btn}`}
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {state.confirmLabel || "Ya, Lanjutkan"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
