"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export type SettingsTab = "templates" | "units" | "produk" | "assignments" | "atasan" | "delegates";

export interface SettingsTabCounts {
    templates: number;
    units: number;
    products: number;
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

export default function SettingsTabs({
    activeTab,
    onChange,
    counts,
    visibleTabs = DEFAULT_TABS,
    subtitle = "Kelola template checklist, unit alat, produk, penugasan, dan anggota QC.",
    backHref,
}: SettingsTabsProps) {
    const labelFor = (tab: SettingsTab): string => {
        switch (tab) {
            case "templates":
                return `Template & Item (${counts.templates})`;
            case "units":
                return `Alat / Unit (${counts.units})`;
            case "produk":
                return `Produk (${counts.products})`;
            case "assignments":
                return `Penugasan (${counts.activeAssignments} aktif)`;
            case "atasan":
                return "Atasan";
            case "delegates":
                return `Delegasi PIC (${counts.delegates ?? 0})`;
        }
    };

    return (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur -mx-4 px-4 pt-2 pb-2 border-b border-border/60">
            {backHref && (
                <Link
                    href={backHref}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-2 min-h-[36px]"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Kembali ke Beranda
                </Link>
            )}
            <h1 className="text-2xl font-semibold text-foreground mb-1">Pengaturan Peralatan</h1>
            <p className="text-sm text-muted-foreground mb-3">{subtitle}</p>

            <div className="flex gap-1 overflow-x-auto border-b border-border">
                {visibleTabs.map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[44px] ${
                            activeTab === key
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {labelFor(key)}
                    </button>
                ))}
            </div>
        </div>
    );
}
