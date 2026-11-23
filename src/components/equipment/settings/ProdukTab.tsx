"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Package, Pencil } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import DataTablePagination from "@/components/ui/DataTablePagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { EquipmentCompanyBadge, resolveDisplayCompanies } from "@/components/equipment/EquipmentStatusBadge";
import { inputClass } from "@/components/equipment/settings/useSettingsData";
import type {
    EquipmentCompanyFilter,
    EquipmentProduct,
    EquipmentUnit,
    ProductChecklist,
    ProductToolRow,
} from "@/components/equipment/settings/useSettingsData";

interface ProdukTabProps {
    products: EquipmentProduct[];
    productError: string | null;
    productCompany: EquipmentCompanyFilter;
    setProductCompany: React.Dispatch<React.SetStateAction<EquipmentCompanyFilter>>;
    fetchProducts: (company: EquipmentCompanyFilter) => Promise<void>;
    units: EquipmentUnit[];
    fetchUnits: () => Promise<void>;
    checklist: ProductChecklist | null;
    initialChecked: string[];
    checklistLoading: boolean;
    checklistError: string | null;
    fetchChecklist: (productId: string) => Promise<void>;
    setChecklist: React.Dispatch<React.SetStateAction<ProductChecklist | null>>;
    setInitialChecked: React.Dispatch<React.SetStateAction<string[]>>;
    canEditUnits?: boolean;
}

export default function ProdukTab({
    products,
    productError,
    productCompany,
    setProductCompany,
    fetchProducts,
    units,
    fetchUnits,
    checklist,
    initialChecked,
    checklistLoading,
    checklistError,
    fetchChecklist,
    setChecklist,
    setInitialChecked,
    canEditUnits = true,
}: ProdukTabProps) {
    const toast = useToast();
    const confirm = useConfirm();

    const [newProductName, setNewProductName] = useState("");
    const [savingProduct, setSavingProduct] = useState(false);
    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [editProductName, setEditProductName] = useState("");
    const [savingProductRename, setSavingProductRename] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [toolQuery, setToolQuery] = useState("");
    const [uncategorizedQuery, setUncategorizedQuery] = useState("");
    const [showUncategorized, setShowUncategorized] = useState(false);
    const [savingChecklist, setSavingChecklist] = useState(false);
    const [bulkSelected, setBulkSelected] = useState<string[]>([]);
    const [bulkSaving, setBulkSaving] = useState(false);
    const [productQuery, setProductQuery] = useState("");

    const filteredProducts = useMemo(() => {
        const q = productQuery.trim().toLowerCase();
        if (!q) return products;
        return products.filter((p) => p.name.toLowerCase().includes(q));
    }, [products, productQuery]);

    const filteredTools = useMemo(() => {
        const tools = checklist?.tools ?? [];
        const q = toolQuery.trim().toLowerCase();
        if (!q) return tools;
        return tools.filter((t) => `${t.name} ${t.brand ?? ""} ${t.location ?? ""}`.toLowerCase().includes(q));
    }, [checklist, toolQuery]);

    const {
        currentPage: productPage,
        pageSize: productPageSize,
        setPage: setProductPage,
        setPageSize: setProductPageSize,
        resetPage: resetProductPage,
        getSliceIndices: getProductSlice,
    } = useTablePagination({
        storageKey: "ga-equipment-products",
        defaultPageSize: 10,
        totalItems: filteredProducts.length,
    });

    const {
        currentPage: toolPage,
        pageSize: toolPageSize,
        setPage: setToolPage,
        setPageSize: setToolPageSize,
        resetPage: resetToolPage,
        getSliceIndices: getToolSlice,
    } = useTablePagination({
        storageKey: "ga-equipment-product-tools",
        defaultPageSize: 20,
        totalItems: filteredTools.length,
    });

    useEffect(() => {
        setSelectedProductId(null);
        setChecklist(null);
        setInitialChecked([]);
        setToolQuery("");
        void fetchProducts(productCompany);
    }, [productCompany, fetchProducts, setChecklist, setInitialChecked]);

    const createProduct = useCallback(async () => {
        if (savingProduct || !newProductName.trim()) {
            if (!newProductName.trim()) toast("Nama produk wajib diisi.", "warning");
            return;
        }
        setSavingProduct(true);
        try {
            const res = await fetch("/api/ga/equipment/products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ company: productCompany, name: newProductName.trim() }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menambah produk."));
            toast("Produk ditambahkan.", "success");
            setNewProductName("");
            await fetchProducts(productCompany);
        } catch (err) {
            toast(
                getFriendlyClientErrorMessage(err, "Gagal menambah produk. Periksa koneksi Anda lalu coba lagi."),
                "error"
            );
            reportClientError("EquipmentSettings", "Product create failed", err);
        } finally {
            setSavingProduct(false);
        }
    }, [savingProduct, newProductName, productCompany, toast, fetchProducts]);

    const saveProductRename = useCallback(async () => {
        if (!editingProductId || savingProductRename) return;
        const trimmed = editProductName.trim();
        if (!trimmed) {
            toast("Nama produk wajib diisi.", "warning");
            return;
        }
        setSavingProductRename(true);
        try {
            const res = await fetch(`/api/ga/equipment/products/${editingProductId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah nama produk."));
            toast("Nama produk diperbarui.", "success");
            setEditingProductId(null);
            setEditProductName("");
            await fetchProducts(productCompany);
            if (selectedProductId === editingProductId) {
                setChecklist((prev) =>
                    prev ? { ...prev, product: { ...prev.product, name: trimmed } } : prev
                );
            }
        } catch (err) {
            toast(
                getFriendlyClientErrorMessage(err, "Gagal mengubah nama produk. Periksa koneksi Anda lalu coba lagi."),
                "error"
            );
            reportClientError("EquipmentSettings", "Product rename failed", err);
        } finally {
            setSavingProductRename(false);
        }
    }, [
        editingProductId,
        savingProductRename,
        editProductName,
        toast,
        fetchProducts,
        productCompany,
        selectedProductId,
        setChecklist,
    ]);

    const deleteProduct = useCallback(
        (product: EquipmentProduct) => {
            confirm({
                title: `Hapus produk "${product.name}"?`,
                message: "Pemetaan alat untuk produk ini ikut terhapus. Data master alat tetap utuh.",
                confirmLabel: "Hapus",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: () => {
                    void (async () => {
                        try {
                            const res = await fetch(`/api/ga/equipment/products/${product.id}`, {
                                method: "DELETE",
                            });
                            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus produk."));
                            toast("Produk dihapus.", "success");
                            if (selectedProductId === product.id) {
                                setSelectedProductId(null);
                                setChecklist(null);
                                setInitialChecked([]);
                            }
                            await fetchProducts(productCompany);
                        } catch (err) {
                            toast(
                                getFriendlyClientErrorMessage(
                                    err,
                                    "Gagal menghapus produk. Periksa koneksi Anda lalu coba lagi."
                                ),
                                "error"
                            );
                        }
                    })();
                },
            });
        },
        [confirm, toast, fetchProducts, productCompany, selectedProductId, setChecklist, setInitialChecked]
    );

    const toggleToolCheck = useCallback(
        (toolId: string) => {
            setChecklist((prev) =>
                prev
                    ? { ...prev, tools: prev.tools.map((t) => (t.id === toolId ? { ...t, checked: !t.checked } : t)) }
                    : prev
            );
        },
        [setChecklist]
    );

    const saveChecklist = useCallback(async () => {
        if (savingChecklist || !checklist) return;
        setSavingChecklist(true);
        try {
            const res = await fetch(`/api/ga/equipment/products/${checklist.product.id}/tools`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    equipmentUnitIds: checklist.tools.filter((t) => t.checked).map((t) => t.id),
                }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan pemetaan."));
            const json = await res.json();
            setChecklist(json.data);
            setInitialChecked(
                (json.data.tools ?? []).filter((t: ProductToolRow) => t.checked).map((t: ProductToolRow) => t.id)
            );
            toast("Pemetaan alat disimpan.", "success");
            await fetchProducts(productCompany);
        } catch (err) {
            toast(
                getFriendlyClientErrorMessage(err, "Gagal menyimpan pemetaan. Periksa koneksi Anda lalu coba lagi."),
                "error"
            );
            reportClientError("EquipmentSettings", "Checklist save failed", err);
        } finally {
            setSavingChecklist(false);
        }
    }, [savingChecklist, checklist, toast, fetchProducts, productCompany, setChecklist, setInitialChecked]);

    const setUnitCompanyQuick = useCallback(
        async (unitId: string, companies: Array<"WIG" | "MKI">) => {
            try {
                const res = await fetch("/api/ga/equipment/units", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: unitId, companies }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menetapkan perusahaan."));
                toast(`Alat dikategorikan ke ${companies.join(" & ")}.`, "success");
                await fetchUnits();
                await fetchProducts(productCompany);
                if (selectedProductId) await fetchChecklist(selectedProductId);
            } catch (err) {
                toast(
                    getFriendlyClientErrorMessage(
                        err,
                        "Gagal menetapkan perusahaan. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
            }
        },
        [toast, fetchUnits, fetchProducts, productCompany, selectedProductId, fetchChecklist]
    );

    const bulkSetCompany = useCallback(
        async (companies: Array<"WIG" | "MKI">) => {
            if (bulkSelected.length === 0) {
                toast("Pilih alat yang akan dikategorikan terlebih dahulu.", "warning");
                return;
            }
            setBulkSaving(true);
            try {
                const results = await Promise.all(
                    bulkSelected.map(async (id) => {
                        try {
                            const res = await fetch("/api/ga/equipment/units", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id, companies }),
                            });
                            return res.ok;
                        } catch {
                            return false;
                        }
                    })
                );
                const ok = results.filter(Boolean).length;
                const fail = results.length - ok;
                toast(
                    fail === 0
                        ? `${ok} alat dikategorikan ke ${companies.join(" & ")}.`
                        : `${ok} berhasil, ${fail} gagal.`,
                    fail === 0 ? "success" : "warning"
                );
                setBulkSelected([]);
                await fetchUnits();
                await fetchProducts(productCompany);
                if (selectedProductId) await fetchChecklist(selectedProductId);
            } finally {
                setBulkSaving(false);
            }
        },
        [bulkSelected, toast, fetchUnits, fetchProducts, productCompany, selectedProductId, fetchChecklist]
    );

    const uncategorizedUnits = units.filter((u) => u.isActive && resolveDisplayCompanies(u).length === 0);
    const filteredUncategorizedUnits = uncategorizedUnits.filter((u) => {
        const q = uncategorizedQuery.trim().toLowerCase();
        if (!q) return true;
        return `${u.name} ${u.brand ?? ""} ${u.location ?? ""}`.toLowerCase().includes(q);
    });
    const checkedIds = checklist?.tools.filter((t) => t.checked).map((t) => t.id) ?? [];
    const checklistDirty =
        checkedIds.length !== initialChecked.length || checkedIds.some((id) => !initialChecked.includes(id));

    const [productSliceStart, productSliceEnd] = getProductSlice(filteredProducts.length);
    const paginatedProducts = filteredProducts.slice(productSliceStart, productSliceEnd);
    const productTotalPages = Math.max(1, Math.ceil(filteredProducts.length / productPageSize));
    const [toolSliceStart, toolSliceEnd] = getToolSlice(filteredTools.length);
    const paginatedTools = filteredTools.slice(toolSliceStart, toolSliceEnd);
    const toolTotalPages = Math.max(1, Math.ceil(filteredTools.length / toolPageSize));

    return (
        <div className="space-y-4">
            {/* Panel alat belum berkategori: hanya muncul jika benar-benar ada */}
            {uncategorizedUnits.length > 0 && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            <p className="text-xs sm:text-sm text-amber-900 dark:text-amber-200">
                                <strong>{uncategorizedUnits.length} unit alat aktif</strong> belum memiliki perusahaan
                                (tidak bisa dipetakan ke produk).
                            </p>
                        </div>
                        {canEditUnits && (
                            <button
                                type="button"
                                onClick={() => setShowUncategorized((v) => !v)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-200 hover:underline shrink-0"
                            >
                                {showUncategorized ? (
                                    <>
                                        <ChevronDown className="h-3.5 w-3.5" /> Tutup
                                    </>
                                ) : (
                                    <>
                                        <ChevronRight className="h-3.5 w-3.5" /> Kategorikan sekarang
                                    </>
                                )}
                            </button>
                        )}
                    </div>

                    {canEditUnits && showUncategorized && (
                        <div className="border-t border-amber-200 dark:border-amber-800/60 bg-card p-4 space-y-3">
                            <EquipmentSearchField
                                id="cari-alat-belum-berkategori"
                                label="Cari alat belum berkategori"
                                value={uncategorizedQuery}
                                onChange={setUncategorizedQuery}
                                placeholder="Cari nama, merek, atau lokasi..."
                            />
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const ids = filteredUncategorizedUnits.map((u) => u.id);
                                        const allVisibleSelected =
                                            ids.length > 0 && ids.every((id) => bulkSelected.includes(id));
                                        setBulkSelected((prev) =>
                                            allVisibleSelected
                                                ? prev.filter((id) => !ids.includes(id))
                                                : [...new Set([...prev, ...ids])]
                                        );
                                    }}
                                    className="text-xs font-medium text-primary hover:underline px-2 min-h-[36px]"
                                >
                                    {filteredUncategorizedUnits.length > 0 &&
                                    filteredUncategorizedUnits.every((u) => bulkSelected.includes(u.id))
                                        ? "Batalkan semua"
                                        : `Pilih semua (${filteredUncategorizedUnits.length})`}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void bulkSetCompany(["WIG"])}
                                    disabled={bulkSaving || bulkSelected.length === 0}
                                    className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[36px]"
                                >
                                    Jadikan WIG ({bulkSelected.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void bulkSetCompany(["MKI"])}
                                    disabled={bulkSaving || bulkSelected.length === 0}
                                    className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[36px]"
                                >
                                    Jadikan MKI ({bulkSelected.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void bulkSetCompany(["WIG", "MKI"])}
                                    disabled={bulkSaving || bulkSelected.length === 0}
                                    className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[36px]"
                                >
                                    Jadikan WIG &amp; MKI ({bulkSelected.length})
                                </button>
                            </div>
                            {filteredUncategorizedUnits.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Tidak ada alat yang cocok.</p>
                            ) : (
                                <ul className="space-y-1 max-h-[260px] overflow-y-auto">
                                    {filteredUncategorizedUnits.map((u) => (
                                        <li
                                            key={u.id}
                                            className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                                        >
                                            <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={bulkSelected.includes(u.id)}
                                                    onChange={(e) =>
                                                        setBulkSelected((prev) =>
                                                            e.target.checked
                                                                ? [...prev, u.id]
                                                                : prev.filter((id) => id !== u.id)
                                                        )
                                                    }
                                                    className="rounded border-border shrink-0"
                                                />
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-medium truncate">{u.name}</span>
                                                    {(u.brand || u.location) && (
                                                        <span className="block text-xs text-muted-foreground truncate">
                                                            {[u.brand, u.location].filter(Boolean).join(" · ")}
                                                        </span>
                                                    )}
                                                </span>
                                            </label>
                                            <span className="flex gap-1 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => void setUnitCompanyQuick(u.id, ["WIG"])}
                                                    disabled={bulkSaving}
                                                    className="px-2 py-1 text-[11px] font-semibold rounded bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 min-h-[32px]"
                                                >
                                                    WIG
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void setUnitCompanyQuick(u.id, ["MKI"])}
                                                    disabled={bulkSaving}
                                                    className="px-2 py-1 text-[11px] font-semibold rounded bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50 min-h-[32px]"
                                                >
                                                    MKI
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void setUnitCompanyQuick(u.id, ["WIG", "MKI"])}
                                                    disabled={bulkSaving}
                                                    className="px-2 py-1 text-[11px] font-semibold rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50 min-h-[32px]"
                                                >
                                                    WIG &amp; MKI
                                                </button>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Master-Detail 2 kolom di desktop: Kiri Daftar Produk, Kanan Checklist Alat */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* Kiri: Daftar Produk */}
                <div className="lg:col-span-5 bg-card border border-border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-base font-semibold text-foreground">Daftar Produk</h2>
                        <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs">
                            {(["WIG", "MKI"] as EquipmentCompanyFilter[]).map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => {
                                        setProductCompany(c);
                                        resetProductPage();
                                    }}
                                    className={`px-3 py-1 rounded font-semibold min-h-[32px] transition-colors ${
                                        productCompany === c
                                            ? "bg-background text-primary shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newProductName}
                            onChange={(e) => setNewProductName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void createProduct();
                            }}
                            placeholder={`Tambah produk ${productCompany}...`}
                            maxLength={200}
                            className={`${inputClass} flex-1`}
                        />
                        <button
                            type="button"
                            onClick={() => void createProduct()}
                            disabled={savingProduct}
                            className="shrink-0 px-3.5 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[40px]"
                        >
                            {savingProduct ? "..." : "Tambah"}
                        </button>
                    </div>

                    {productError && (
                        <FeedbackMessage variant="error">
                            {productError}{" "}
                            <button
                                type="button"
                                onClick={() => void fetchProducts(productCompany)}
                                className="underline ml-1 font-medium"
                            >
                                Coba lagi
                            </button>
                        </FeedbackMessage>
                    )}

                    {products.length > 0 && (
                        <EquipmentSearchField
                            id="cari-produk"
                            label="Cari produk"
                            value={productQuery}
                            onChange={(v) => {
                                setProductQuery(v);
                                resetProductPage();
                            }}
                            placeholder="Cari nama produk..."
                        />
                    )}

                    {products.length === 0 && !productError ? (
                        <p className="text-xs text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">
                            Belum ada produk {productCompany}. Tambahkan produk di atas.
                        </p>
                    ) : filteredProducts.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-6">
                            Tidak ada produk yang cocok.
                        </p>
                    ) : (
                        <>
                            <ul className="space-y-1.5">
                                {paginatedProducts.map((p) => {
                                    const selected = selectedProductId === p.id;
                                    return (
                                        <li
                                            key={p.id}
                                            className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-colors ${
                                                selected
                                                    ? "border-primary bg-primary/5"
                                                    : "border-border hover:bg-accent/30"
                                            }`}
                                        >
                                            {editingProductId === p.id ? (
                                                <div className="min-w-0 flex-1 flex flex-col gap-2">
                                                    <input
                                                        type="text"
                                                        value={editProductName}
                                                        onChange={(e) => setEditProductName(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") void saveProductRename();
                                                            if (e.key === "Escape") {
                                                                setEditingProductId(null);
                                                                setEditProductName("");
                                                            }
                                                        }}
                                                        maxLength={200}
                                                        placeholder="Nama produk"
                                                        autoFocus
                                                        className={inputClass}
                                                    />
                                                    <div className="flex justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingProductId(null);
                                                                setEditProductName("");
                                                            }}
                                                            className="px-2.5 py-1 text-xs rounded-md border border-border hover:bg-muted min-h-[32px]"
                                                        >
                                                            Batal
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void saveProductRename()}
                                                            disabled={savingProductRename}
                                                            className="px-2.5 py-1 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[32px]"
                                                        >
                                                            {savingProductRename ? "..." : "Simpan"}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedProductId(p.id);
                                                            setToolQuery("");
                                                            resetToolPage();
                                                            void fetchChecklist(p.id);
                                                        }}
                                                        className="min-w-0 text-left flex-1 min-h-[36px]"
                                                    >
                                                        <span className="block text-sm font-medium text-foreground truncate">
                                                            {p.name}
                                                        </span>
                                                        <span className="block text-xs text-muted-foreground">
                                                            {p._count.tools} alat terpetakan
                                                        </span>
                                                    </button>
                                                    <div className="flex items-center gap-0.5 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingProductId(p.id);
                                                                setEditProductName(p.name);
                                                            }}
                                                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md min-h-[32px]"
                                                            title="Ubah nama produk"
                                                            aria-label={`Ubah nama produk ${p.name}`}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteProduct(p)}
                                                            className="px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded-md min-h-[32px]"
                                                        >
                                                            Hapus
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                            <DataTablePagination
                                currentPage={productPage}
                                totalPages={productTotalPages}
                                totalItems={filteredProducts.length}
                                pageSize={productPageSize}
                                onPageChange={setProductPage}
                                onPageSizeChange={setProductPageSize}
                                itemLabel="produk"
                            />
                        </>
                    )}
                </div>

                {/* Kanan: Pemetaan Alat untuk Produk Terpilih */}
                <div className="lg:col-span-7 bg-card border border-border rounded-xl p-4">
                    {!selectedProductId ? (
                        <div className="py-16 text-center space-y-2">
                            <Package className="h-8 w-8 text-muted-foreground/50 mx-auto" />
                            <p className="text-sm font-medium text-foreground">Pemetaan Alat per Produk</p>
                            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                                Pilih salah satu produk di sebelah kiri untuk mencentang alat yang digunakan produk
                                tersebut.
                            </p>
                        </div>
                    ) : checklistLoading || !checklist ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-border">
                                <div>
                                    <h2 className="text-base font-semibold text-foreground">
                                        {checklist.product.name}
                                    </h2>
                                    <p className="text-xs text-muted-foreground" aria-live="polite">
                                        {checkedIds.length} dari {checklist.totalCount} alat dipilih
                                        {checklistDirty ? " · belum disimpan" : ""}
                                    </p>
                                </div>
                                {checklist.totalCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => void saveChecklist()}
                                        disabled={savingChecklist || !checklistDirty}
                                        className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[40px] shrink-0"
                                    >
                                        {savingChecklist ? "Menyimpan..." : "Simpan Pemetaan"}
                                    </button>
                                )}
                            </div>

                            {checklistError ? (
                                <FeedbackMessage variant="error">
                                    {checklistError}{" "}
                                    <button
                                        type="button"
                                        onClick={() => void fetchChecklist(selectedProductId)}
                                        className="underline ml-1 font-medium"
                                    >
                                        Coba lagi
                                    </button>
                                </FeedbackMessage>
                            ) : checklist.totalCount === 0 ? (
                                <p className="text-sm text-muted-foreground py-8 text-center">
                                    Belum ada alat berkategori {checklist.product.company}. Kategorikan alat terlebih
                                    dahulu di tab Unit Alat.
                                </p>
                            ) : (
                                <>
                                    <EquipmentSearchField
                                        id="cari-alat-produk"
                                        label="Cari alat"
                                        value={toolQuery}
                                        onChange={(v) => {
                                            setToolQuery(v);
                                            resetToolPage();
                                        }}
                                        placeholder="Cari nama alat, merek, atau lokasi..."
                                    />

                                    {filteredTools.length === 0 ? (
                                        <p className="text-sm text-muted-foreground py-6 text-center">
                                            Tidak ada alat yang cocok dengan pencarian.
                                        </p>
                                    ) : (
                                        <>
                                            <ul className="space-y-1 max-h-[420px] overflow-y-auto pr-0.5">
                                                {paginatedTools.map((t) => (
                                                    <li key={t.id}>
                                                        <label
                                                            className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                                                                t.checked
                                                                    ? "border-primary/50 bg-primary/5"
                                                                    : "border-border hover:bg-accent/40"
                                                            }`}
                                                        >
                                                            <span className="flex items-center gap-2.5 min-w-0">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={t.checked}
                                                                    onChange={() => toggleToolCheck(t.id)}
                                                                    className="rounded border-border shrink-0"
                                                                />
                                                                <span className="min-w-0">
                                                                    <span className="block text-sm font-medium truncate">
                                                                        {t.name}
                                                                    </span>
                                                                    {(t.brand || t.location) && (
                                                                        <span className="block text-xs text-muted-foreground truncate">
                                                                            {[t.brand, t.location]
                                                                                .filter(Boolean)
                                                                                .join(" · ")}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </span>
                                                            <EquipmentCompanyBadge
                                                                company={t.company}
                                                                isSharedBoth={t.isSharedBoth}
                                                                companies={t.companies}
                                                            />
                                                        </label>
                                                    </li>
                                                ))}
                                            </ul>
                                            <DataTablePagination
                                                currentPage={toolPage}
                                                totalPages={toolTotalPages}
                                                totalItems={filteredTools.length}
                                                pageSize={toolPageSize}
                                                onPageChange={setToolPage}
                                                onPageSizeChange={setToolPageSize}
                                                itemLabel="alat"
                                            />
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
