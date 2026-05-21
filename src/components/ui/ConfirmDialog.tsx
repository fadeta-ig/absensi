"use client";

import { AlertTriangle, X } from "lucide-react";

type ConfirmDialogProps = {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "default";
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

const VARIANT_STYLES = {
    danger: { icon: "text-red-600 bg-red-50 border-red-100", btn: "bg-red-600 hover:bg-red-700" },
    warning: { icon: "text-amber-600 bg-amber-50 border-amber-100", btn: "bg-amber-600 hover:bg-amber-700" },
    default: { icon: "text-[var(--text-secondary)] bg-[var(--secondary)] border-[var(--border)]", btn: "bg-[var(--foreground)] text-[var(--background)] hover:bg-[var(--primary-light)]" },
};

export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = "Konfirmasi",
    cancelLabel = "Batal",
    variant = "default",
    loading = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!open) return null;

    const styles = VARIANT_STYLES[variant];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-[var(--card)] rounded-xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 ${styles.icon}`}>
                        <AlertTriangle size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
                        <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">{message}</p>
                    </div>
                    <button onClick={onCancel} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0">
                        <X size={16} />
                    </button>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="px-4 py-2 border border-[var(--border)] bg-[var(--card)] rounded-lg text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--secondary)] disabled:opacity-50"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${styles.btn}`}
                    >
                        {loading ? "Memproses..." : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
