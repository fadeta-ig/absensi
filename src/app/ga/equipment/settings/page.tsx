"use client";

import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import SettingsTabs, { type SettingsTab } from "@/app/ga/equipment/settings/_components/SettingsTabs";
import TemplatesTab from "@/app/ga/equipment/settings/_components/TemplatesTab";
import UnitsTab from "@/app/ga/equipment/settings/_components/UnitsTab";
import AssignmentsTab from "@/app/ga/equipment/settings/_components/AssignmentsTab";
import AtasanTab from "@/app/ga/equipment/settings/_components/AtasanTab";
import ProdukTab from "@/app/ga/equipment/settings/_components/ProdukTab";
import { useSettingsData, isAssignmentActive } from "@/app/ga/equipment/settings/_components/useSettingsData";

export default function EquipmentSettingsPage() {
    const [activeTab, setActiveTab] = useState<SettingsTab>("templates");
    const data = useSettingsData();

    if (data.loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (data.error) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-6">
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
                    <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
                    <p className="text-destructive">{data.error}</p>
                    <button onClick={() => void data.fetchAll()} className="mt-3 text-sm text-primary hover:underline">
                        Coba lagi
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <SettingsTabs
                activeTab={activeTab}
                onChange={setActiveTab}
                counts={{
                    templates: data.templates.length,
                    units: data.units.length,
                    products: data.products.length,
                    activeAssignments: data.assignments.filter(isAssignmentActive).length,
                }}
            />
            <div className="pt-4">
                {activeTab === "templates" && (
                    <TemplatesTab templates={data.templates} fetchTemplates={data.fetchTemplates} />
                )}

                {activeTab === "units" && (
                    <UnitsTab
                        units={data.units}
                        templates={data.templates}
                        fetchUnits={data.fetchUnits}
                        fetchTemplates={data.fetchTemplates}
                    />
                )}

                {activeTab === "produk" && (
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
                    />
                )}

                {activeTab === "assignments" && (
                    <AssignmentsTab
                        assignments={data.assignments}
                        units={data.units}
                        fetchAssignments={data.fetchAssignments}
                        fetchUnits={data.fetchUnits}
                    />
                )}

                {activeTab === "atasan" && (
                    <AtasanTab
                        qcMembers={data.qcMembers}
                        qcError={data.qcError}
                        qcCompany={data.qcCompany}
                        setQcCompany={data.setQcCompany}
                        fetchQcMembers={data.fetchQcMembers}
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
            </div>
        </div>
    );
}
