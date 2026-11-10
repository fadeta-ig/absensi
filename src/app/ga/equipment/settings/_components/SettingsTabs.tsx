"use client";

export type SettingsTab = "templates" | "units" | "assignments" | "atasan" | "produk";

export interface SettingsTabCounts {
    templates: number;
    units: number;
    products: number;
    activeAssignments: number;
}

interface SettingsTabsProps {
    activeTab: SettingsTab;
    onChange: (tab: SettingsTab) => void;
    counts: SettingsTabCounts;
}

export default function SettingsTabs({ activeTab, onChange, counts }: SettingsTabsProps) {
    return (
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur -mx-4 px-4 pt-2 pb-2 border-b border-border/60">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Pengaturan Peralatan</h1>
            <p className="text-sm text-muted-foreground mb-3">
                Kelola template checklist, unit alat, produk, penugasan, dan anggota QC.
            </p>

            <div className="flex gap-1 overflow-x-auto border-b border-border">
                {(
                    [
                        ["templates", `Template & Item (${counts.templates})`],
                        ["units", `Alat / Unit (${counts.units})`],
                        ["produk", `Produk (${counts.products})`],
                        ["assignments", `Penugasan (${counts.activeAssignments} aktif)`],
                        ["atasan", "Atasan"],
                    ] as [SettingsTab, string][]
                ).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => onChange(key)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                            activeTab === key
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
}
