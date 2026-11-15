import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

export type StatusTone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";

const TONES: Record<StatusTone, string> = {
    neutral: "border-[var(--neutral-border)] bg-[var(--neutral-bg)] text-[var(--neutral)]",
    info: "border-[var(--info-border)] bg-[var(--info-bg)] text-[var(--info)]",
    progress: "border-[var(--info-border)] bg-[var(--info-bg)] text-[var(--info)]",
    success: "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]",
    warning: "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]",
    danger: "border-[var(--destructive-border)] bg-[var(--destructive-bg)] text-[var(--destructive-text)]",
};

type StatusBadgeProps = {
    tone?: StatusTone;
    icon?: LucideIcon;
    children: ReactNode;
    title?: string;
    className?: string;
};

/**
 * Badge status kanonik. Sentence case, satu tone = satu arti.
 * Palet mentah tidak dipakai di sini; semua lewat token warna.
 */
export default function StatusBadge({
    tone = "neutral",
    icon: Icon,
    children,
    title,
    className = "",
}: StatusBadgeProps) {
    return (
        <span
            title={title}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TONES[tone]} ${className}`}
        >
            {Icon ? (
                <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : tone === "progress" ? (
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current" aria-hidden="true" />
            ) : null}
            {children}
        </span>
    );
}
