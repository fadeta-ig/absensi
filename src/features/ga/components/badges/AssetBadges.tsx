import { User, UserX, Users, Building2, Archive } from "lucide-react";
import React from "react";

export function KondisiBadge({ kondisi }: { kondisi: string }) {
    const map: Record<string, { label: string; color: string; bg: string }> = {
        BAIK: { label: "Baik", color: "#10b981", bg: "#d1fae5" },
        KURANG_BAIK: { label: "Kurang Baik", color: "#f59e0b", bg: "#fef3c7" },
        RUSAK: { label: "Rusak", color: "#ef4444", bg: "#fee2e2" },
    };
    const c = map[kondisi] ?? { label: kondisi, color: "#6b7280", bg: "#f3f4f6" };
    return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: c.color, backgroundColor: c.bg }}>
            {c.label}
        </span>
    );
}

export function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { label: string; color: string; bg: string }> = {
        AVAILABLE: { label: "Tersedia", color: "#10b981", bg: "#d1fae5" },
        IN_USE: { label: "Digunakan", color: "#3b82f6", bg: "#dbeafe" },
        MAINTENANCE: { label: "Perbaikan", color: "#f59e0b", bg: "#fef3c7" },
        RETIRED: { label: "Retired", color: "#6b7280", bg: "#f3f4f6" },
        COMPANY_OWNED: { label: "Perusahaan", color: "#8b5cf6", bg: "#ede9fe" },
    };
    const c = map[status] ?? { label: status, color: "#6b7280", bg: "#f3f4f6" };
    return (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: c.color, backgroundColor: c.bg }}>
            {c.label}
        </span>
    );
}

export function HolderIcon({ holderType }: { holderType: string }) {
    const icons: Record<string, React.ReactNode> = {
        EMPLOYEE: <User size={13} color="#3b82f6" />,
        FORMER_EMPLOYEE: <UserX size={13} color="#ef4444" />,
        TEAM: <Users size={13} color="#8b5cf6" />,
        GA_POOL: <Building2 size={13} color="#10b981" />,
        COMPANY_OWNED: <Archive size={13} color="#6b7280" />,
    };
    return <span className="inline-flex items-center">{icons[holderType]}</span>;
}

export function CategoryBadge({ prefix, name }: { prefix?: string; name: string }) {
    // Generate deterministic color based on name for dynamic categories
    const colors = [
        { c: "#6366f1", bg: "#eef2ff" }, // indigo
        { c: "#0ea5e9", bg: "#e0f2fe" }, // sky
        { c: "#10b981", bg: "#d1fae5" }, // emerald
        { c: "#f59e0b", bg: "#fef3c7" }, // amber
        { c: "#8b5cf6", bg: "#ede9fe" }, // violet
        { c: "#ec4899", bg: "#fce7f3" }, // pink
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
