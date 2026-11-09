"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import DataTablePagination from "@/components/ui/DataTablePagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import {
    inputClass,
} from "@/app/ga/equipment/settings/_components/useSettingsData";
import type {
    EquipmentCompanyFilter,
    EquipmentProduct,
    EquipmentUnit,
    ProductChecklist,
    ProductToolRow,
} from "@/app/ga/equipment/settings/_components/useSettingsData";

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
}: ProdukTabProps) {
    const toast = useToast();
    const confirm = useConfirm();

    // ─── Produk & pemetaan alat (per perusahaan) ───
    const [newProductName, setNewProductName] = useState("");
    const [savingProduct, setSavingProduct] = useState(false);
    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [editProductName, setEditProductName] = useState("");
    const [savingProductRename, setSavingProductRename] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [toolQuery, setToolQuery] = useState("");
    const [uncategorizedQuery, setUncategorizedQuery] = useState("");
    const [savingChecklist, setSavingChecklist] = useState(false);
    const [bulkSelected, setBulkSelected] = useState<string[]>([]);
    const [bulkSaving, setBulkSaving] = useState(false);
    const [productQuery, setProductQuery] = useState("");

    const filteredProducts = useMemo(() => {
        const q = productQuery.trim().toLowerCase();
        if (!q) return products;
        return products.filter((p) => p.name.toLowerCase().includes(q));
    }, [products, productQuery]);

    const filteredToolsForPaging = useMemo(() => {
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
    } = useTablePagination({ storageKey: "ga-equipment-products", defaultPageSize: 10, totalItems: filteredProducts.length });

    const {
        currentPage: toolPage,
        pageSize: toolPageSize,
        setPage: setToolPage,
        setPageSize: setToolPageSize,
        resetPage: resetToolPage,
        getSliceIndices: getToolSlice,
    } = useTablePagination({ storageKey: "ga-equipment-product-tools", defaultPageSize: 20, totalItems: filteredToolsForPaging.length });

    useEffect(() => {
        setSelectedProductId(null);
        setChecklist(null);
        setInitialChecked([]);
        setToolQuery("");
        void fetchProducts(productCompany);
    }, [productCompany, fetchProducts, setChecklist, setInitialChecked]);

    // ─── Produk & pemetaan alat ───

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
            toast(err instanceof Error ? err.message : "Gagal.", "error");
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
            toast(err instanceof Error ? err.message : "Gagal.", "error");
            reportClientError("EquipmentSettings", "Product rename failed", err);
        } finally {
            setSavingProductRename(false);
        }
    }, [editingProductId, savingProductRename, editProductName, toast, fetchProducts, productCompany, selectedProductId, setChecklist]);

    const deleteProduct = useCallback(
        (product: EquipmentProduct) => {
            confirm({
                title: `Hapus produk "${product.name}"?`,
                message: "Pemetaan alatnya ikut terhapus. Master alat tidak berubah.",
                confirmLabel: "Ya, hapus",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: () => {
                    void (async () => {
                        try {
                            const res = await fetch(`/api/ga/equipment/products/${product.id}`, { method: "DELETE" });
                            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus produk."));
                            toast("Produk dihapus.", "success");
                            if (selectedProductId === product.id) {
                                setSelectedProductId(null);
                                setChecklist(null);
                                setInitialChecked([]);
                            }
                            await fetchProducts(productCompany);
                        } catch (err) {
                            toast(err instanceof Error ? err.message : "Gagal menghapus.", "error");
                        }
                    })();
                },
            });
        },
        [confirm, toast, fetchProducts, productCompany, selectedProductId, setChecklist, setInitialChecked]
    );

    const toggleToolCheck = useCallback((toolId: string) => {
        setChecklist((prev) =>
            prev ? { ...prev, tools: prev.tools.map((t) => (t.id === toolId ? { ...t, checked: !t.checked } : t)) } : prev
        );
    }, [setChecklist]);

    const saveChecklist = useCallback(async () => {
        if (savingChecklist || !checklist) return;
        setSavingChecklist(true);
        try {
            const res = await fetch(`/api/ga/equipment/products/${checklist.product.id}/tools`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ equipmentUnitIds: checklist.tools.filter((t) => t.checked).map((t) => t.id) }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan pemetaan."));
            const json = await res.json();
            setChecklist(json.data);
            setInitialChecked((json.data.tools ?? []).filter((t: ProductToolRow) => t.checked).map((t: ProductToolRow) => t.id));
            toast("Pemetaan alat disimpan.", "success");
            await fetchProducts(productCompany);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
            reportClientError("EquipmentSettings", "Checklist save failed", err);
        } finally {
            setSavingChecklist(false);
        }
    }, [savingChecklist, checklist, toast, fetchProducts, productCompany, setChecklist, setInitialChecked]);

    const setUnitCompanyQuick = useCallback(
        async (unitId: string, company: EquipmentCompanyFilter) => {
            try {
                const res = await fetch("/api/ga/equipment/units", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: unitId, company }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menetapkan perusahaan."));
                toast(`Alat dikategorikan ke ${company}.`, "success");
                await fetchUnits();
                await fetchProducts(productCompany);
                if (selectedProductId) await fetchChecklist(selectedProductId);
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal.", "error");
            }
        },
        [toast, fetchUnits, fetchProducts, productCompany, selectedProductId, fetchChecklist]
    );

    const bulkSetCompany = useCallback(
        async (company: EquipmentCompanyFilter) => {
            if (bulkSelected.length === 0) {
                toast("Pilih dulu alat yang akan dikategorikan.", "warning");
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
                                body: JSON.stringify({ id, company }),
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
                    fail === 0 ? `${ok} alat dikategorikan ke ${company}.` : `${ok} berhasil, ${fail} gagal.`,
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

    const uncategorizedUnits = units.filter((u) => u.isActive && !u.company);
    const filteredUncategorizedUnits = uncategorizedUnits.filter((u) => {
        const q = uncategorizedQuery.trim().toLowerCase();
        if (!q) return true;
        return `${u.name} ${u.brand ?? ""} ${u.location ?? ""}`.toLowerCase().includes(q);
    });
    const checkedIds = checklist?.tools.filter((t) => t.checked).map((t) => t.id) ?? [];
    const checklistDirty =
        checkedIds.length !== initialChecked.length || checkedIds.some((id) => !initialChecked.includes(id));
    const filteredTools = (checklist?.tools ?? []).filter((t) => {
        const q = toolQuery.trim().toLowerCase();
        if (!q) return true;
        return `${t.name} ${t.brand ?? ""} ${t.location ?? ""}`.toLowerCase().includes(q);
    });
    const [productSliceStart, productSliceEnd] = getProductSlice(filteredProducts.length);
    const paginatedProducts = filteredProducts.slice(productSliceStart, productSliceEnd);
    const productTotalPages = Math.max(1, Math.ceil(filteredProducts.length / productPageSize));
    const [toolSliceStart, toolSliceEnd] = getToolSlice(filteredTools.length);
    const paginatedTools = filteredTools.slice(toolSliceStart, toolSliceEnd);
    const toolTotalPages = Math.max(1, Math.ceil(filteredTools.length / toolPageSize));

    return (
        <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg p-4">
                <h2 className="text-base font-medium mb-1">Alat Belum Berkategori</h2>
                <p className="text-xs text-muted-foreground mb-3">
                    Alat aktif yang belum dikategorikan tidak tampil di checklist produk maupun
                    portal employee. Kategorikan dulu sebelum memetakan.
                </p>
                {uncategorizedUnits.length === 0 ? (
                    <FeedbackMessage variant="success">
                        Semua alat aktif sudah berkategori perusahaan.
                    </FeedbackMessage>
                ) : (
                    <>
                        <div className="mb-3">
                            <EquipmentSearchField
                                id="cari-alat-belum-berkategori"
                                label="Cari alat belum berkategori"
                                value={uncategorizedQuery}
                                onChange={setUncategorizedQuery}
                                placeholder="Cari nama, merek, atau lokasi…"
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
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
                                className="text-xs font-medium text-primary hover:underline min-h-[44px] px-2"
                            >
                                {(() => {
                                    const visible = filteredUncategorizedUnits.length;
                                    const allVisibleSelected =
                                        visible > 0 &&
                                        filteredUncategorizedUnits.every((u) => bulkSelected.includes(u.id));
                                    const isFiltering = uncategorizedQuery.trim().length > 0;
                                    if (allVisibleSelected) return isFiltering ? "Batalkan hasil" : "Batalkan semua";
                                    return isFiltering
                                        ? `Pilih hasil (${visible})`
                                        : `Pilih semua (${uncategorizedUnits.length})`;
                                })()}
                            </button>
                            <button
                                type="button"
                                onClick={() => void bulkSetCompany("WIG")}
                                disabled={bulkSaving || bulkSelected.length === 0}
                                className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
                            >
                                {bulkSaving ? "Menyimpan..." : `Jadikan WIG (${bulkSelected.length})`}
                            </button>
                            <button
                                type="button"
                                onClick={() => void bulkSetCompany("MKI")}
                                disabled={bulkSaving || bulkSelected.length === 0}
                                className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
                            >
                                {bulkSaving ? "Menyimpan..." : `Jadikan MKI (${bulkSelected.length})`}
                            </button>
                        </div>
                        {filteredUncategorizedUnits.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Tidak ada alat yang cocok dengan pencarian.
                            </p>
                        ) : (
                        <ul className="space-y-1 max-h-[320px] overflow-y-auto">
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
                                            <span className="block text-xs text-muted-foreground truncate">
                                                {[u.brand, u.location].filter(Boolean).join(" · ") || "—"}
                                            </span>
                                        </span>
                                    </label>
                                    <span className="flex gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => void setUnitCompanyQuick(u.id, "WIG")}
                                            disabled={bulkSaving}
                                            className="px-2 py-1 text-[11px] font-semibold rounded bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 min-h-[36px]"
                                        >
                                            WIG
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void setUnitCompanyQuick(u.id, "MKI")}
                                            disabled={bulkSaving}
                                            className="px-2 py-1 text-[11px] font-semibold rounded bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50 min-h-[36px]"
                                        >
                                            MKI
                                        </button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                        )}
                    </>
                )}
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
                <h2 className="text-base font-medium mb-1">Produk per Perusahaan</h2>
                <p className="text-xs text-muted-foreground mb-3">
                    Kelola nama produk tiap perusahaan, lalu petakan alat yang dipakai masing-masing produk.
                </p>
                <div className="flex gap-1 mb-3 border-b border-border">
                    {(["WIG", "MKI"] as EquipmentCompanyFilter[]).map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => {
                                setProductCompany(c);
                                resetProductPage();
                            }}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                                productCompany === c
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                    <input
                        type="text"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        placeholder={`Nama produk ${productCompany} baru`}
                        maxLength={200}
                        className={`${inputClass} flex-1`}
                    />
                    <button
                        type="button"
                        onClick={() => void createProduct()}
                        disabled={savingProduct}
                        className="shrink-0 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
                    >
                        {savingProduct ? "Menyimpan..." : "Tambah"}
                    </button>
                </div>
                {productError && (
                    <FeedbackMessage variant="error" className="mb-3">
                        {productError}{" "}
                        <button onClick={() => void fetchProducts(productCompany)} className="underline">
                            Coba lagi
                        </button>
                    </FeedbackMessage>
                )}
                <div className="mb-3">
                    <EquipmentSearchField
                        id="cari-produk"
                        label="Cari produk"
                        value={productQuery}
                        onChange={(v) => {
                            setProductQuery(v);
                            resetProductPage();
                        }}
                        placeholder="Cari nama produk…"
                    />
                </div>
                {products.length === 0 && !productError ? (
                    <p className="text-sm text-muted-foreground">
                        Belum ada produk {productCompany}. Tambahkan produk pertama.
                    </p>
                ) : filteredProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Tidak ada produk yang cocok dengan pencarian.
                    </p>
                ) : (
                    <>
                    <ul className="space-y-2">
                        {paginatedProducts.map((p) => (
                            <li
                                key={p.id}
                                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                                    selectedProductId === p.id ? "border-primary" : "border-border"
                                }`}
                            >
                                {editingProductId === p.id ? (
                                    <div className="min-w-0 flex-1 flex flex-col sm:flex-row gap-2 sm:items-center">
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
                                            className={`${inputClass} flex-1`}
                                        />
                                        <div className="flex gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => void saveProductRename()}
                                                disabled={savingProductRename}
                                                className="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
                                            >
                                                {savingProductRename ? "Menyimpan..." : "Simpan"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingProductId(null);
                                                    setEditProductName("");
                                                }}
                                                className="text-xs text-muted-foreground hover:text-foreground min-h-[44px] px-2"
                                            >
                                                Batal
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
                                            className="min-w-0 text-left flex-1 min-h-[44px]"
                                        >
                                            <span className="block text-sm font-medium truncate">{p.name}</span>
                                            <span className="block text-xs text-muted-foreground">
                                                {p._count.tools} alat terpetakan
                                            </span>
                                        </button>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingProductId(p.id);
                                                    setEditProductName(p.name);
                                                }}
                                                className="p-1 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[36px] inline-flex items-center justify-center"
                                                title="Ubah nama produk"
                                                aria-label={`Ubah nama produk ${p.name}`}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteProduct(p)}
                                                className="shrink-0 text-xs text-destructive hover:text-destructive/80 min-h-[44px] px-2"
                                            >
                                                Hapus
                                            </button>
                                        </div>
                                    </>
                                )}
                            </li>
                        ))}
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

            {selectedProductId && checklist && (
                <div className="bg-card border border-border rounded-lg p-4">
                    <h2 className="text-base font-medium mb-1">Checklist Alat — {checklist.product.name}</h2>
                    <p className="text-xs text-muted-foreground mb-3" aria-live="polite">
                        {checklist.tools.filter((t) => t.checked).length} dari {checklist.totalCount} alat tercentang
                        {checklistDirty ? " · ada perubahan belum disimpan" : ""}
                    </p>
                    <div className="mb-3">
                        <EquipmentSearchField
                            id="cari-alat-produk"
                            label="Cari alat"
                            value={toolQuery}
                            onChange={(v) => {
                                setToolQuery(v);
                                resetToolPage();
                            }}
                            placeholder="Cari nama, merek, atau lokasi…"
                        />
                    </div>
                    {checklistLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : checklistError ? (
                        <FeedbackMessage variant="error">
                            {checklistError}{" "}
                            <button onClick={() => void fetchChecklist(selectedProductId)} className="underline">
                                Coba lagi
                            </button>
                        </FeedbackMessage>
                    ) : checklist.totalCount === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Belum ada alat berkategori {checklist.product.company}. Kategorikan alat dulu di
                            bagian atas atau tab Alat / Unit.
                        </p>
                    ) : filteredTools.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Tidak ada alat yang cocok dengan pencarian.
                        </p>
                    ) : (
                        <>
                        <ul className="space-y-1 max-h-[360px] overflow-y-auto mb-3">
                            {paginatedTools.map((t) => (
                                <li key={t.id}>
                                    <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent/50 min-h-[48px]">
                                        <input
                                            type="checkbox"
                                            checked={t.checked}
                                            onChange={() => toggleToolCheck(t.id)}
                                            className="rounded border-border shrink-0"
                                        />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium truncate">{t.name}</span>
                                            <span className="block text-xs text-muted-foreground truncate">
                                                {[t.brand, t.location].filter(Boolean).join(" · ") || "—"}
                                            </span>
                                        </span>
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
                    {!checklistLoading && !checklistError && checklist.totalCount > 0 && (
                        <button
                            type="button"
                            onClick={() => void saveChecklist()}
                            disabled={savingChecklist || !checklistDirty}
                            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[48px]"
                        >
                            {savingChecklist ? "Menyimpan..." : "Simpan Pemetaan"}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
