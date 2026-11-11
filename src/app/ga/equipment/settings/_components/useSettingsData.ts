"use client";

import { useCallback, useEffect, useState } from "react";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";

export interface TemplateItem {
    id: string;
    name: string;
    sortOrder: number;
    requirePhoto: boolean;
    isActive: boolean;
}

export interface EquipmentTemplate {
    id: string;
    name: string;
    isActive: boolean;
    items: TemplateItem[];
    _count: { units: number };
}

export interface EquipmentUnit {
    id: string;
    name: string;
    brand: string | null;
    location: string | null;
    company: "WIG" | "MKI" | null;
    isSharedBoth?: boolean;
    companies?: Array<"WIG" | "MKI">;
    isActive: boolean;
    templateId: string;
    template: { id: string; name: string };
    _count: { assignments: number; inspections: number };
}

export interface QcMember {
    employeeId: string;
    name: string;
    isActive: boolean;
    email?: string | null;
}

export interface TopViewer {
    employeeId: string;
    name: string;
    isActive: boolean;
    email?: string | null;
}

export interface EquipmentAssignment {
    id: string;
    unitId: string | null;
    startsOnWibDate: string;
    endsOnWibDate: string | null;
    unit: {
        id: string;
        name: string;
        company: "WIG" | "MKI" | null;
        isSharedBoth?: boolean;
        companies?: Array<"WIG" | "MKI">;
    } | null;
    user: { id: string; employeeId: string | null; displayName: string };
}

export interface EquipmentProduct {
    id: string;
    company: "WIG" | "MKI";
    name: string;
    isActive: boolean;
    _count: { tools: number };
}

export interface ProductToolRow {
    id: string;
    name: string;
    brand: string | null;
    location: string | null;
    company?: "WIG" | "MKI" | null;
    isSharedBoth?: boolean;
    companies?: Array<"WIG" | "MKI">;
    checked: boolean;
}

export interface ProductChecklist {
    product: { id: string; company: "WIG" | "MKI"; name: string };
    tools: ProductToolRow[];
    checkedCount: number;
    totalCount: number;
}

export type EquipmentCompanyFilter = "WIG" | "MKI";

export const inputClass =
    "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm";

/** Tanggal WIB hari ini (YYYY-MM-DD). Jangan pakai toISOString (UTC, meleset ±1 hari). */
export function wibTodayStr(): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

/** Aktif bila belum ada tanggal selesai, atau tanggal selesai masih di depan hari ini (eksklusif). */
export function isAssignmentActive(a: { endsOnWibDate: string | null }): boolean {
    return !a.endsOnWibDate || a.endsOnWibDate > wibTodayStr();
}

export interface SettingsData {
    templates: EquipmentTemplate[];
    units: EquipmentUnit[];
    assignments: EquipmentAssignment[];
    qcMembers: QcMember[];
    qcError: string | null;
    qcCompany: EquipmentCompanyFilter;
    setQcCompany: React.Dispatch<React.SetStateAction<EquipmentCompanyFilter>>;
    topViewers: TopViewer[];
    topViewerError: string | null;
    approvers: Array<{ employeeId: string; name: string | null; isActive: boolean }>;
    approverError: string | null;
    approverCompany: EquipmentCompanyFilter;
    setApproverCompany: React.Dispatch<React.SetStateAction<EquipmentCompanyFilter>>;
    products: EquipmentProduct[];
    productError: string | null;
    productCompany: EquipmentCompanyFilter;
    setProductCompany: React.Dispatch<React.SetStateAction<EquipmentCompanyFilter>>;
    checklist: ProductChecklist | null;
    initialChecked: string[];
    checklistLoading: boolean;
    checklistError: string | null;
    loading: boolean;
    error: string | null;
    fetchTemplates: () => Promise<void>;
    fetchUnits: () => Promise<void>;
    fetchAssignments: () => Promise<void>;
    fetchTopViewers: () => Promise<void>;
    fetchQcMembers: (company: EquipmentCompanyFilter) => Promise<void>;
    fetchApprovers: (company: EquipmentCompanyFilter) => Promise<void>;
    fetchProducts: (company: EquipmentCompanyFilter) => Promise<void>;
    fetchChecklist: (productId: string) => Promise<void>;
    fetchAll: () => Promise<void>;
    setChecklist: React.Dispatch<React.SetStateAction<ProductChecklist | null>>;
    setInitialChecked: React.Dispatch<React.SetStateAction<string[]>>;
}

export function useSettingsData(): SettingsData {
    const [templates, setTemplates] = useState<EquipmentTemplate[]>([]);
    const [units, setUnits] = useState<EquipmentUnit[]>([]);
    const [assignments, setAssignments] = useState<EquipmentAssignment[]>([]);
    const [qcMembers, setQcMembers] = useState<QcMember[]>([]);
    const [qcError, setQcError] = useState<string | null>(null);
    const [qcCompany, setQcCompany] = useState<EquipmentCompanyFilter>("WIG");
    const [topViewers, setTopViewers] = useState<TopViewer[]>([]);
    const [topViewerError, setTopViewerError] = useState<string | null>(null);
    const [approvers, setApprovers] = useState<Array<{ employeeId: string; name: string | null; isActive: boolean }>>([]);
    const [approverError, setApproverError] = useState<string | null>(null);
    const [approverCompany, setApproverCompany] = useState<EquipmentCompanyFilter>("WIG");
    const [products, setProducts] = useState<EquipmentProduct[]>([]);
    const [productError, setProductError] = useState<string | null>(null);
    const [productCompany, setProductCompany] = useState<EquipmentCompanyFilter>("WIG");
    const [checklist, setChecklist] = useState<ProductChecklist | null>(null);
    const [initialChecked, setInitialChecked] = useState<string[]>([]);
    const [checklistLoading, setChecklistLoading] = useState(false);
    const [checklistError, setChecklistError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTemplates = useCallback(async () => {
        try {
            const res = await fetch("/api/ga/equipment/templates");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat template."));
            const json = await res.json();
            setTemplates(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat template.";
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const fetchUnits = useCallback(async () => {
        try {
            const res = await fetch("/api/ga/equipment/units");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat unit alat."));
            const json = await res.json();
            setUnits(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat unit alat.";
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const fetchAssignments = useCallback(async () => {
        try {
            const res = await fetch("/api/ga/equipment/assignments");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat penugasan."));
            const json = await res.json();
            setAssignments(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat penugasan.";
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const fetchTopViewers = useCallback(async () => {
        setTopViewerError(null);
        try {
            const res = await fetch("/api/ga/equipment/settings/top-viewers");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat top reviewer."));
            const json = await res.json();
            setTopViewers(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat top reviewer.";
            setTopViewerError(msg);
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const fetchQcMembers = useCallback(async (company: EquipmentCompanyFilter) => {
        setQcError(null);
        try {
            const res = await fetch(`/api/ga/equipment/qc-members?company=${company}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat anggota QC."));
            const json = await res.json();
            setQcMembers(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat anggota QC.";
            setQcError(msg);
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const fetchApprovers = useCallback(async (company: EquipmentCompanyFilter) => {
        setApproverError(null);
        try {
            const res = await fetch(`/api/ga/equipment/settings/approver?company=${company}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat approver."));
            const json = await res.json();
            setApprovers(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat approver.";
            setApproverError(msg);
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const fetchProducts = useCallback(async (company: EquipmentCompanyFilter) => {
        setProductError(null);
        try {
            const res = await fetch(`/api/ga/equipment/products?company=${company}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat produk."));
            const json = await res.json();
            setProducts(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat produk.";
            setProductError(msg);
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const fetchChecklist = useCallback(async (productId: string) => {
        setChecklistLoading(true);
        setChecklistError(null);
        try {
            const res = await fetch(`/api/ga/equipment/products/${productId}/tools`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat checklist alat."));
            const json = await res.json();
            setChecklist(json.data);
            setInitialChecked((json.data.tools ?? []).filter((t: ProductToolRow) => t.checked).map((t: ProductToolRow) => t.id));
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat checklist.";
            setChecklistError(msg);
            reportClientError("EquipmentSettings", msg, err);
        } finally {
            setChecklistLoading(false);
        }
    }, []);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [tplRes, unitRes, assignRes] = await Promise.all([
                fetch("/api/ga/equipment/templates"),
                fetch("/api/ga/equipment/units"),
                fetch("/api/ga/equipment/assignments"),
            ]);
            if (!tplRes.ok) throw new Error(await getResponseErrorMessage(tplRes, "Gagal memuat template."));
            if (!unitRes.ok) throw new Error(await getResponseErrorMessage(unitRes, "Gagal memuat unit alat."));
            if (!assignRes.ok) throw new Error(await getResponseErrorMessage(assignRes, "Gagal memuat penugasan."));
            const [tplJson, unitJson, assignJson] = await Promise.all([tplRes.json(), unitRes.json(), assignRes.json()]);
            setTemplates(tplJson.data ?? []);
            setUnits(unitJson.data ?? []);
            setAssignments(assignJson.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat data.";
            setError(msg);
            reportClientError("EquipmentSettings", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchAll();
        void fetchTopViewers();
    }, [fetchAll, fetchTopViewers]);

    return {
        templates,
        units,
        assignments,
        qcMembers,
        qcError,
        qcCompany,
        setQcCompany,
        topViewers,
        topViewerError,
        approvers,
        approverError,
        approverCompany,
        setApproverCompany,
        products,
        productError,
        productCompany,
        setProductCompany,
        checklist,
        initialChecked,
        checklistLoading,
        checklistError,
        loading,
        error,
        fetchTemplates,
        fetchUnits,
        fetchAssignments,
        fetchTopViewers,
        fetchQcMembers,
        fetchApprovers,
        fetchProducts,
        fetchChecklist,
        fetchAll,
        setChecklist,
        setInitialChecked,
    };
}
