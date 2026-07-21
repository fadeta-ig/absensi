import { User, UserX, Users, Building2, Archive } from "lucide-react";
import React from "react";

export function KondisiBadge({ kondisi }: { kondisi: string }) {
    const map: Record<string, { label: string; color: string; bg: string }> = {
        BAIK: { label: "Baik", color: "var(--success)", bg: "var(--success-bg)" },
        KURANG_BAIK: { label: "Kurang Baik", color: "var(--warning)", bg: "var(--warning-bg)" },
        RUSAK: { label: "Rusak", color: "var(--destructive)", bg: "var(--destructive-bg)" },
    };
    const c = map[kondisi] ?? { label: kondisi, color: "var(--neutral)", bg: "var(--neutral-bg)" };
    return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: c.color, backgroundColor: c.bg }}>
            {c.label}
        </span>
    );
}

export function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { label: string; color: string; bg: string }> = {
        AVAILABLE: { label: "Tersedia", color: "var(--success)", bg: "var(--success-bg)" },
        IN_USE: { label: "Digunakan", color: "var(--info)", bg: "var(--info-bg)" },
        MAINTENANCE: { label: "Perbaikan", color: "var(--warning)", bg: "var(--warning-bg)" },
        RETIRED: { label: "Retired", color: "var(--neutral)", bg: "var(--neutral-bg)" },
        COMPANY_OWNED: { label: "Perusahaan", color: "var(--status-company)", bg: "var(--status-company-bg)" },
    };
    const c = map[status] ?? { label: status, color: "var(--neutral)", bg: "var(--neutral-bg)" };
    return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: c.color, backgroundColor: c.bg }}>
            {c.label}
        </span>
    );
}

export function HolderIcon({ holderType }: { holderType: string }) {
    const icons: Record<string, React.ReactNode> = {
        EMPLOYEE: <User size={13} color="var(--info)" />,
        FORMER_EMPLOYEE: <UserX size={13} color="var(--destructive)" />,
        TEAM: <Users size={13} color="var(--status-company)" />,
        GA_POOL: <Building2 size={13} color="var(--success)" />,
        COMPANY_OWNED: <Archive size={13} color="var(--neutral)" />,
    };
    return <span className="inline-flex items-center">{icons[holderType]}</span>;
}

export function CategoryBadge({ prefix, name }: { prefix?: string; name: string }) {
    // Generate deterministic color based on name for dynamic categories
    const colors = [
        { c: "var(--category-1)", bg: "var(--category-1-bg)" },
        { c: "var(--category-2)", bg: "var(--category-2-bg)" },
        { c: "var(--category-3)", bg: "var(--category-3-bg)" },
        { c: "var(--category-4)", bg: "var(--category-4-bg)" },
        { c: "var(--category-5)", bg: "var(--category-5-bg)" },
        { c: "var(--category-6)", bg: "var(--category-6-bg)" },
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const colorTheme = colors[Math.abs(hash) % colors.length];

    return (
        <span 
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ color: colorTheme.c, backgroundColor: colorTheme.bg }}
            title={name}
        >
            {prefix && <span className="opacity-70">[{prefix}]</span>}
            {name}
        </span>
    );
}
