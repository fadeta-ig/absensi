"use client";

import { useEffect, useState, useCallback } from "react";
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

    useEffect(() => {
        globalOpen = (opts) => setState({ ...opts, open: true });
        return () => { globalOpen = null; };
    }, []);

    const close = () => {
        if (loading) return;
        setState(INITIAL_STATE);
    };

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
        danger: { icon: "bg-red-100 text-red-600", btn: "bg-red-600 hover:bg-red-700 text-white" },
        warning: { icon: "bg-amber-100 text-amber-600", btn: "bg-amber-600 hover:bg-amber-700 text-white" },
        info: { icon: "bg-blue-100 text-blue-600", btn: "bg-blue-600 hover:bg-blue-700 text-white" },
    }[variant];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={close}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.15s_ease]" />

            {/* Dialog */}
            <div
                className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-[scaleIn_0.2s_ease]"
                onClick={(e) => e.stopPropagation()}
            >
                <button onClick={close} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors" disabled={loading}>
                    <X className="w-4 h-4" />
                </button>

                <div className="flex flex-col items-center text-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${variantStyles.icon}`}>
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-gray-900 mb-1">{state.title}</h3>
                        <p className="text-sm text-gray-500 leading-relaxed">{state.message}</p>
                    </div>
                    <div className="flex gap-3 w-full pt-1">
                        <button
                            onClick={close}
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
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
