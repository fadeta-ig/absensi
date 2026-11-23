"use client";

import Link from "next/link";
import {
    ArrowLeft,
    ClipboardList,
    Package,
    ShieldCheck,
    UserCheck,
    Users,
    Wrench,
} from "lucide-react";

export type SettingsTab = "templates" | "units" | "produk" | "assignments" | "atasan" | "delegates";

export interface SettingsTabCounts {
    templates: number;
    units: number;
    products: number | null;
    activeAssignments: number;
    delegates?: number;
}

interface SettingsTabsProps {
    activeTab: SettingsTab;
    onChange: (tab: SettingsTab) => void;
    counts: SettingsTabCounts;
    visibleTabs?: SettingsTab[];
    subtitle?: string;
    backHref?: string;
}

const DEFAULT_TABS: SettingsTab[] = ["templates", "units", "produk", "assignments", "atasan"];

const TAB_CONFIG: Record<SettingsTab, { label: string; icon: typeof ClipboardList }> = {
    templates: { label: "Template", icon: ClipboardList },
    units: { label: "Unit Alat", icon: Wrench },
    produk: { label: "Produk", icon: Package },
    assignments: { label: "Penugasan", icon: Users },
    atasan: { label: "Atasan", icon: ShieldCheck },
    delegates: { label: "Delegasi PIC", icon: UserCheck },
};

export default function SettingsTabs({
    activeTab,
    onChange,
    counts,
    visibleTabs = DEFAULT_TABS,
    subtitle = "Atur standar inspeksi, daftar alat, produk, penugasan petugas, dan hak akses.",
    backHref,
}: SettingsTabsProps) {
    const badgeFor = (tab: SettingsTab): string | null => {
        switch (tab) {
            case "templates":
                return String(counts.templates);
            case "units":
                return String(counts.units);
            case "produk":
                return counts.products === null ? null : String(counts.products);
            case "assignments":
                return String(counts.activeAssignments);
            case "atasan":
                return null;
            case "delegates":
                return String(counts.delegates ?? 0);
        }
    };

    return (
        <>
            <div className="mb-4">
                {backHref && (
                    <Link
                        href={backHref}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-2 min-h-[36px]"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Kembali ke Beranda
                    </Link>
                )}
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Pengaturan Peralatan
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
            </div>

            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur -mx-4 px-4 border-b border-border">
                <div
                    role="tablist"
                    aria-label="Bagian Pengaturan Peralatan"
                    className="flex gap-1 overflow-x-auto no-scrollbar -mb-px"
                >
                    {visibleTabs.map((key) => {
                        const cfg = TAB_CONFIG[key];
                        const Icon = cfg.icon;
                        const badge = badgeFor(key);
                        const active = activeTab === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => onChange(key)}
                                className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[44px] ${
                                    active
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                                }`}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span>{cfg.label}</span>
                                {badge !== null && (
                                    <span
                                        className={`px-1.5 py-0.5 text-[11px] font-semibold rounded-full leading-none ${
                                            active
                                                ? "bg-primary/15 text-primary"
                                                : "bg-muted text-muted-foreground"
                                        }`}
                                    >
                                        {badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
