import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

type SectionCardProps = {
    title?: string;
    description?: string;
    icon?: LucideIcon;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
    bodyClassName?: string;
    ariaLabel?: string;
};

/**
 * Kartu section dengan heading seragam.
 * Heading memakai eyebrow 10 px seperti section "Informasi" di beranda.
 */
export default function SectionCard({
    title,
    description,
    icon: Icon,
    action,
    children,
    className = "",
    bodyClassName = "",
    ariaLabel,
}: SectionCardProps) {
    const hasHeader = Boolean(title || description || action);

    return (
        <section className={`emp-surface p-4 ${className}`} aria-label={ariaLabel}>
            {hasHeader && (
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        {title && (
                            <h2 className="emp-eyebrow flex items-center gap-1.5">
                                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                                {title}
                            </h2>
                        )}
                        {description && <p className="mt-1 text-[11px] text-[var(--text-muted)]">{description}</p>}
                    </div>
                    {action && <div className="shrink-0">{action}</div>}
                </div>
            )}
            <div className={bodyClassName}>{children}</div>
        </section>
    );
}
