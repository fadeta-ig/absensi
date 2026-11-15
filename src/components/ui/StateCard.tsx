import { AlertCircle, Loader2 } from "lucide-react";
import { ReactNode } from "react";

type StateCardProps = {
    variant?: "loading" | "error";
    title?: string;
    description?: string;
    action?: ReactNode;
    className?: string;
};

/** Kartu keadaan untuk satu blok konten: memuat atau gagal. */
export default function StateCard({
    variant = "loading",
    title,
    description,
    action,
    className = "",
}: StateCardProps) {
    const isLoading = variant === "loading";

    return (
        <div
            role={isLoading ? "status" : "alert"}
            aria-live={isLoading ? "polite" : "assertive"}
            className={`emp-surface flex flex-col items-center justify-center gap-3 p-6 text-center ${className}`}
        >
            {isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" aria-hidden="true" />
            ) : (
                <AlertCircle className="h-6 w-6 text-[var(--destructive-text)]" aria-hidden="true" />
            )}
            {title && <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>}
            {description && <p className="max-w-sm text-[11px] leading-relaxed text-[var(--text-muted)]">{description}</p>}
            {action}
        </div>
    );
}
