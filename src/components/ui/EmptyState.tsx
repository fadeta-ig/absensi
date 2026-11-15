import { Inbox, LucideIcon } from "lucide-react";
import { ReactNode } from "react";

type EmptyStateProps = {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
};

/** Empty state kanonik: ikon redup, satu kalimat keadaan, satu langkah berikutnya. */
export default function EmptyState({
    icon: Icon = Inbox,
    title,
    description,
    action,
    className = "",
}: EmptyStateProps) {
    return (
        <div
            role="status"
            className={`emp-surface border-dashed p-6 text-center ${className}`}
        >
            <Icon className="mx-auto mb-2 h-10 w-10 text-[var(--text-muted)] opacity-30" aria-hidden="true" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
            {description && <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-[var(--text-muted)]">{description}</p>}
            {action && <div className="mt-4 flex justify-center">{action}</div>}
        </div>
    );
}
