"use client";

import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";

export type NoticeKind = "success" | "error" | "warning" | "info";

const STYLES: Record<NoticeKind, { box: string; icon: typeof Info }> = {
    success: {
        box: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300",
        icon: CheckCircle,
    },
    error: {
        box: "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300",
        icon: AlertCircle,
    },
    warning: {
        box: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300",
        icon: AlertTriangle,
    },
    info: {
        box: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300",
        icon: Info,
    },
};

/**
 * Kotak pesan standar: sukses/gagal/peringatan/info.
 * Selalu bawa varian dark-mode + role aksesibilitas yang benar.
 */
export function NoticeBox({
    kind,
    children,
    className = "",
}: {
    kind: NoticeKind;
    children: ReactNode;
    className?: string;
}) {
    const s = STYLES[kind];
    const Icon = s.icon;
    return (
        <div
            role={kind === "error" ? "alert" : "status"}
            className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${s.box} ${className}`}
        >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="min-w-0">{children}</span>
        </div>
    );
}
