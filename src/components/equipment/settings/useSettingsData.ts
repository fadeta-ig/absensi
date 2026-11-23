"use client";

import { useCallback, useEffect, useState } from "react";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import {
    formatWIBDateTime,
    isValidCalendarDate,
    toWIBDateString,
    wibDateTimeToDate,
} from "@/lib/timezone";
import {
    EQUIPMENT_SETTINGS_SCOPES,
    type EquipmentSettingsScope,
} from "@/lib/services/equipmentAuth";

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
    isOutsource?: boolean;
    username?: string | null;
}

export interface ApproverMember {
    employeeId: string;
    name: string | null;
    isActive: boolean;
    isOutsource?: boolean;
    username?: string | null;
}

export interface TopViewer {
    employeeId: string;
    name: string;
    isActive: boolean;
    email?: string | null;
}

export interface SettingsDelegateRow {
    employeeId: string;
    name: string | null;
    isActive: boolean;
    scopes: EquipmentSettingsScope[];
    expiresOnWibDate: string | null;
    isExpired: boolean;
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
    user: { id: string; username?: string; employeeId: string | null; displayName: string };
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

/** Tanggal WIB hari ini (YYYY-MM-DD) memakai helper timezone global. */
export function wibTodayStr(): string {
    return toWIBDateString();
}

/** Format YYYY-MM-DD ke format ringkas Indonesia WIB (contoh: "12 Okt 2026"). */
export function formatShortWibDate(wibDate: string): string {
    if (!isValidCalendarDate(wibDate)) return wibDate;
    try {
        return formatWIBDateTime(wibDateTimeToDate(wibDate), {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    } catch {
        return wibDate;
    }
}

/** Aktif bila belum ada tanggal selesai, atau tanggal selesai masih di depan hari ini (eksklusif). */
export function isAssignmentActive(a: { endsOnWibDate: string | null }): boolean {
    return !a.endsOnWibDate || a.endsOnWibDate > wibTodayStr();
}

export interface UseSettingsDataOptions {
    allowedScopes?: readonly EquipmentSettingsScope[];
    canManageDelegates?: boolean;
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
    approvers: ApproverMember[];
    approverError: string | null;
    approverCompany: EquipmentCompanyFilter;
    setApproverCompany: React.Dispatch<React.SetStateAction<EquipmentCompanyFilter>>;
    delegates: SettingsDelegateRow[];
    delegatesError: string | null;
    products: EquipmentProduct[];
    totalProductsCount: number | null;
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
    fetchDelegates: () => Promise<void>;
    fetchProducts: (company: EquipmentCompanyFilter) => Promise<void>;
    fetchChecklist: (productId: string) => Promise<void>;
    fetchAll: () => Promise<void>;
    setChecklist: React.Dispatch<React.SetStateAction<ProductChecklist | null>>;
    setInitialChecked: React.Dispatch<React.SetStateAction<string[]>>;
}

export function useSettingsData(options: UseSettingsDataOptions = {}): SettingsData {
    const allowedScopes = options.allowedScopes ?? EQUIPMENT_SETTINGS_SCOPES;
    const canManageDelegates = options.canManageDelegates === true;

    // Stabilkan ketergantungan fetch berdasarkan scope agar tidak re-fetch saat array literal baru dirender.
    const needTemplates = allowedScopes.includes("templates") || allowedScopes.includes("units");
    const needUnits =
        allowedScopes.includes("units") ||
        allowedScopes.includes("products") ||
        allowedScopes.includes("assignments");
    const needAssignments = allowedScopes.includes("assignments");
    const needProducts = allowedScopes.includes("products");
    const needAtasan = allowedScopes.includes("atasan");

    const [templates, setTemplates] = useState<EquipmentTemplate[]>([]);
    const [units, setUnits] = useState<EquipmentUnit[]>([]);
    const [assignments, setAssignments] = useState<EquipmentAssignment[]>([]);
    const [qcMembers, setQcMembers] = useState<QcMember[]>([]);
    const [qcError, setQcError] = useState<string | null>(null);
    const [qcCompany, setQcCompany] = useState<EquipmentCompanyFilter>("WIG");
    const [topViewers, setTopViewers] = useState<TopViewer[]>([]);
    const [topViewerError, setTopViewerError] = useState<string | null>(null);
    const [approvers, setApprovers] = useState<ApproverMember[]>([]);
    const [approverError, setApproverError] = useState<string | null>(null);
    const [approverCompany, setApproverCompany] = useState<EquipmentCompanyFilter>("WIG");
    const [delegates, setDelegates] = useState<SettingsDelegateRow[]>([]);
    const [delegatesError, setDelegatesError] = useState<string | null>(null);
    const [products, setProducts] = useState<EquipmentProduct[]>([]);
    const [productCountByCompany, setProductCountByCompany] = useState<{ WIG: number | null; MKI: number | null }>({
        WIG: null,
        MKI: null,
    });
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
            const msg = getFriendlyClientErrorMessage(err, "Gagal memuat top reviewer. Periksa koneksi Anda lalu coba lagi.");
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
            const msg = getFriendlyClientErrorMessage(err, "Gagal memuat anggota QC. Periksa koneksi Anda lalu coba lagi.");
            setQcError(msg);
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const fetchApprovers = useCallback(async (company: EquipmentCompanyFilter) => {
        setApproverError(null);
        try {
            const res = await fetch(`/api/ga/equipment/settings/approver?company=${company}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat pemberi persetujuan."));
            const json = await res.json();
            setApprovers(json.data ?? []);
        } catch (err) {
            const msg = getFriendlyClientErrorMessage(err, "Gagal memuat pemberi persetujuan. Periksa koneksi Anda lalu coba lagi.");
            setApproverError(msg);
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const fetchDelegates = useCallback(async () => {
        setDelegatesError(null);
        try {
            const res = await fetch("/api/ga/equipment/settings/delegates");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat PIC delegasi."));
            const json = await res.json();
            setDelegates(json.data ?? []);
        } catch (err) {
            const msg = getFriendlyClientErrorMessage(err, "Gagal memuat PIC delegasi. Periksa koneksi Anda lalu coba lagi.");
            setDelegatesError(msg);
            reportClientError("EquipmentSettings", msg, err);
        }
    }, []);

    const fetchProducts = useCallback(async (company: EquipmentCompanyFilter) => {
        setProductError(null);
        try {
            const res = await fetch(`/api/ga/equipment/products?company=${company}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat daftar produk."));
            const json = await res.json();
            const list = (json.data ?? []) as EquipmentProduct[];
            setProducts(list);
            setProductCountByCompany((prev) => ({ ...prev, [company]: list.length }));
        } catch (err) {
            const msg = getFriendlyClientErrorMessage(err, "Gagal memuat daftar produk. Periksa koneksi Anda lalu coba lagi.");
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
            const msg = getFriendlyClientErrorMessage(err, "Gagal memuat checklist alat. Periksa koneksi Anda lalu coba lagi.");
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
            const tasks: Array<Promise<void>> = [];
            if (needTemplates) {
                tasks.push(
                    fetch("/api/ga/equipment/templates").then(async (res) => {
                        if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat template."));
                        const json = await res.json();
                        setTemplates(json.data ?? []);
                    })
                );
            }
            if (needUnits) {
                tasks.push(
                    fetch("/api/ga/equipment/units").then(async (res) => {
                        if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat unit alat."));
                        const json = await res.json();
                        setUnits(json.data ?? []);
                    })
                );
            }
            if (needAssignments) {
                tasks.push(
                    fetch("/api/ga/equipment/assignments").then(async (res) => {
                        if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat penugasan."));
                        const json = await res.json();
                        setAssignments(json.data ?? []);
                    })
                );
            }
            await Promise.all(tasks);
        } catch (err) {
            const msg = getFriendlyClientErrorMessage(err, "Gagal memuat pengaturan. Periksa koneksi Anda lalu coba lagi.");
            setError(msg);
            reportClientError("EquipmentSettings", msg, err);
        } finally {
            setLoading(false);
        }
    }, [needTemplates, needUnits, needAssignments]);

    useEffect(() => {
        void fetchAll();
        if (needAtasan) void fetchTopViewers();
        if (canManageDelegates) void fetchDelegates();
        if (needProducts) {
            void Promise.all(
                (["WIG", "MKI"] as const).map(async (c) => {
                    try {
                        const res = await fetch(`/api/ga/equipment/products?company=${c}`);
                        if (!res.ok) return null;
                        const json = await res.json();
                        return [c, Array.isArray(json.data) ? json.data.length : 0] as const;
                    } catch {
                        return null;
                    }
                })
            ).then((entries) => {
                setProductCountByCompany((prev) => {
                    const next = { ...prev };
                    for (const item of entries) {
                        if (item) next[item[0]] = item[1];
                    }
                    return next;
                });
            });
        }
    }, [fetchAll, needAtasan, fetchTopViewers, canManageDelegates, fetchDelegates, needProducts]);

    const totalProductsCount =
        productCountByCompany.WIG === null && productCountByCompany.MKI === null
            ? null
            : (productCountByCompany.WIG ?? 0) + (productCountByCompany.MKI ?? 0);

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
        delegates,
        delegatesError,
        products,
        totalProductsCount,
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
        fetchDelegates,
        fetchProducts,
        fetchChecklist,
        fetchAll,
        setChecklist,
        setInitialChecked,
    };
}
