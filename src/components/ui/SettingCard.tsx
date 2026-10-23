"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Kartu pengaturan standar portal employee.
 * Satu pola header (kotak ikon + judul + subjudul + divider) + body.
 * Dipakai kartu keamanan profil dan kartu berikutnya agar seragam.
 */
export function SettingCard({
    icon: Icon,
    title,
    subtitle,
    children,
    id,
}: {
    icon: LucideIcon;
    title: string;
    subtitle?: string;
    children: ReactNode;
    id?: string;
}) {
    return (
        <div className="card" id={id}>
            <div className="p-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-[var(--primary)]" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
                        {subtitle && <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>}
                    </div>
                </div>
            </div>
            <div className="p-4 space-y-4">{children}</div>
        </div>
    );
}
