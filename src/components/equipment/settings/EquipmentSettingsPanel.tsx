"use client";

import { useMemo, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import SettingsTabs, { type SettingsTab } from "@/components/equipment/settings/SettingsTabs";
import TemplatesTab from "@/components/equipment/settings/TemplatesTab";
import UnitsTab from "@/components/equipment/settings/UnitsTab";
import AssignmentsTab from "@/components/equipment/settings/AssignmentsTab";
import AtasanTab from "@/components/equipment/settings/AtasanTab";
import ProdukTab from "@/components/equipment/settings/ProdukTab";
import DelegatesTab from "@/components/equipment/settings/DelegatesTab";
import { useSettingsData, isAssignmentActive } from "@/components/equipment/settings/useSettingsData";
import {
    EQUIPMENT_SETTINGS_SCOPES,
    type EquipmentSettingsScope,
} from "@/lib/services/equipmentAuth";

interface EquipmentSettingsPanelProps {
    allowedScopes?: readonly EquipmentSettingsScope[];
    canManageDelegates?: boolean;
    mode?: "ga" | "employee";
    backHref?: string;
}

const SCOPE_TO_TAB: Array<{ scope: EquipmentSettingsScope; tab: SettingsTab }> = [
    { scope: "templates", tab: "templates" },
    { scope: "units", tab: "units" },
    { scope: "products", tab: "produk" },
    { scope: "assignments", tab: "assignments" },
    { scope: "atasan", tab: "atasan" },
];

export default function EquipmentSettingsPanel({
    allowedScopes = EQUIPMENT_SETTINGS_SCOPES,
    canManageDelegates = false,
    mode = "ga",
    backHref,
}: EquipmentSettingsPanelProps) {
    const visibleTabs = useMemo<SettingsTab[]>(() => {
        const tabs = SCOPE_TO_TAB.filter((entry) => allowedScopes.includes(entry.scope)).map(
            (entry) => entry.tab
        );
        if (canManageDelegates) tabs.push("delegates");
        return tabs;
    }, [allowedScopes, canManageDelegates]);

    const [selectedTab, setSelectedTab] = useState<SettingsTab>(() => visibleTabs[0] ?? "templates");
    const activeTab: SettingsTab = visibleTabs.includes(selectedTab)
        ? selectedTab
        : (visibleTabs[0] ?? "templates");

    const data = useSettingsData({ allowedScopes, canManageDelegates });

    if (data.loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (data.error) {
        return (
            <div className="max-w-5xl mx-auto px-4 py-6">
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
                    <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
                    <p className="text-destructive text-sm">{data.error}</p>
                    <button
                        type="button"
                        onClick={() => void data.fetchAll()}
                        className="mt-3 text-sm font-medium text-primary hover:underline"
                    >
                        Coba lagi
                    </button>
                </div>
            </div>
        );
    }

    const canEditUnits = allowedScopes.includes("units");
    const subtitle =
        mode === "employee"
            ? "Anda ditunjuk Admin GA untuk mengelola area pengaturan peralatan di bawah."
            : "Atur standar inspeksi, daftar alat, produk, penugasan petugas, dan hak akses.";

    return (
        <div className="max-w-5xl mx-auto px-4 py-6">
            <SettingsTabs
                activeTab={activeTab}
                onChange={setSelectedTab}
                visibleTabs={visibleTabs}
                subtitle={subtitle}
                backHref={backHref}
                counts={{
                    templates: data.templates.length,
                    units: data.units.length,
                    products: data.totalProductsCount,
                    activeAssignments: data.assignments.filter(isAssignmentActive).length,
                    delegates: data.delegates.length,
                }}
            />
            <div className="pt-5">
                {activeTab === "templates" && allowedScopes.includes("templates") && (
                    <TemplatesTab templates={data.templates} fetchTemplates={data.fetchTemplates} />
                )}

                {activeTab === "units" && allowedScopes.includes("units") && (
                    <UnitsTab
                        units={data.units}
                        templates={data.templates}
                        fetchUnits={data.fetchUnits}
                        fetchTemplates={data.fetchTemplates}
                    />
                )}

                {activeTab === "produk" && allowedScopes.includes("products") && (
                    <ProdukTab
                        products={data.products}
                        productError={data.productError}
                        productCompany={data.productCompany}
                        setProductCompany={data.setProductCompany}
                        fetchProducts={data.fetchProducts}
                        units={data.units}
                        fetchUnits={data.fetchUnits}
                        checklist={data.checklist}
                        initialChecked={data.initialChecked}
                        checklistLoading={data.checklistLoading}
                        checklistError={data.checklistError}
                        fetchChecklist={data.fetchChecklist}
                        setChecklist={data.setChecklist}
                        setInitialChecked={data.setInitialChecked}
                        canEditUnits={canEditUnits}
                    />
                )}

                {activeTab === "assignments" && allowedScopes.includes("assignments") && (
                    <AssignmentsTab
                        assignments={data.assignments}
                        units={data.units}
                        fetchAssignments={data.fetchAssignments}
                        fetchUnits={data.fetchUnits}
                        qcMembers={data.qcMembers}
                        qcError={data.qcError}
                        qcCompany={data.qcCompany}
                        setQcCompany={data.setQcCompany}
                        fetchQcMembers={data.fetchQcMembers}
                    />
                )}

                {activeTab === "atasan" && allowedScopes.includes("atasan") && (
                    <AtasanTab
                        topViewers={data.topViewers}
                        topViewerError={data.topViewerError}
                        fetchTopViewers={data.fetchTopViewers}
                        approvers={data.approvers}
                        approverError={data.approverError}
                        approverCompany={data.approverCompany}
                        setApproverCompany={data.setApproverCompany}
                        fetchApprovers={data.fetchApprovers}
                    />
                )}

                {activeTab === "delegates" && canManageDelegates && (
                    <DelegatesTab
                        delegates={data.delegates}
                        delegatesError={data.delegatesError}
                        fetchDelegates={data.fetchDelegates}
                    />
                )}
            </div>
        </div>
    );
}
