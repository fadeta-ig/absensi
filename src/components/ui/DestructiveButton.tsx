"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Tombol aksi berbahaya standar (logout, hapus).
 * Merah + disabled + varian dark-mode. Label/ikon via children.
 */
export function DestructiveButton({
    children,
    className = "",
    ...props
}: {
    children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            {...props}
            className={`btn w-full min-h-[48px] border border-red-300 text-red-600 font-bold hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40 ${className}`}
        >
            {children}
        </button>
    );
}
