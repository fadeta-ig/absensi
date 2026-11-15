import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

type PageHeaderProps = {
    title: string;
    subtitle?: string;
    icon?: LucideIcon;
    action?: ReactNode;
    className?: string;
};

/**
 * Header tunggal untuk halaman portal employee.
 * Mengikuti header beranda: judul 20 px extrabold, metadata kecil, tanpa margin internal.
 */
export default function PageHeader({
    title,
    subtitle,
    icon: Icon,
    action,
    className = "",
}: PageHeaderProps) {
    return (
        <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
            <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-xl font-extrabold leading-none tracking-tight text-[var(--text-primary)]">
                    {Icon && <Icon className="h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />}
                    <span className="truncate">{title}</span>
                </h1>
                {subtitle && (
                    <p className="mt-1 text-[11px] font-medium leading-tight text-[var(--text-secondary)]">{subtitle}</p>
                )}
            </div>
            {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
        </div>
    );
}
