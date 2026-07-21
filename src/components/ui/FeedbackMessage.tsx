import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { ReactNode } from "react";

type FeedbackVariant = "success" | "error" | "warning" | "info";

type FeedbackMessageProps = {
    variant?: FeedbackVariant;
    children: ReactNode;
    title?: string;
    className?: string;
    compact?: boolean;
    role?: "alert" | "status";
};

const ICONS = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
};

const STYLES: Record<FeedbackVariant, string> = {
    success: "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]",
    error: "border-[var(--destructive-border)] bg-[var(--destructive-bg)] text-[var(--destructive)]",
    warning: "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]",
    info: "border-[var(--info-border)] bg-[var(--info-bg)] text-[var(--info)]",
};

export default function FeedbackMessage({
    variant = "info",
    children,
    title,
    className = "",
    compact = false,
    role,
}: FeedbackMessageProps) {
    const Icon = ICONS[variant];
    const liveRole = role ?? (variant === "error" || variant === "warning" ? "alert" : "status");
    const ariaLive = variant === "error" || variant === "warning" ? "assertive" : "polite";

    return (
        <div
            role={liveRole}
            aria-live={ariaLive}
            className={`flex items-start gap-2 rounded-lg border ${compact ? "p-2 text-xs" : "p-3 text-sm"} ${STYLES[variant]} ${className}`}
        >
            <Icon className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} mt-0.5 shrink-0`} />
            <div className="min-w-0 flex-1">
                {title && <p className="font-semibold leading-snug">{title}</p>}
                <div className={title ? "mt-0.5 leading-relaxed" : "leading-relaxed"}>{children}</div>
            </div>
        </div>
    );
}
