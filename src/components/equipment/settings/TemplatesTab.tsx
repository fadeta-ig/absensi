"use client";

import { useCallback, useState } from "react";
import { Plus, Pencil, ChevronDown, ChevronRight, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
import { inputClass } from "@/components/equipment/settings/useSettingsData";
import type {
    EquipmentTemplate,
    TemplateItem,
} from "@/components/equipment/settings/useSettingsData";

interface TemplatesTabProps {
    templates: EquipmentTemplate[];
    fetchTemplates: () => Promise<void>;
}

export default function TemplatesTab({ templates, fetchTemplates }: TemplatesTabProps) {
    const toast = useToast();
    const confirm = useConfirm();

    // ─── Template form ───
    const [showTemplateForm, setShowTemplateForm] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<EquipmentTemplate | null>(null);
    const [templateName, setTemplateName] = useState("");
    const [savingTemplate, setSavingTemplate] = useState(false);

    // ─── Item form ───
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>(
        () => (templates.length > 0 && templates.length <= 3 ? templates[0].id : null)
    );
    const [showItemForm, setShowItemForm] = useState<string | null>(null);
    const [editingItem, setEditingItem] = useState<TemplateItem | null>(null);
    const [itemName, setItemName] = useState("");
    const [itemRequirePhoto, setItemRequirePhoto] = useState(true);
    const [savingItem, setSavingItem] = useState(false);

    const saveTemplate = useCallback(async () => {
        if (savingTemplate || !templateName.trim()) {
            if (!templateName.trim()) toast("Nama template wajib diisi.", "warning");
            return;
        }
        setSavingTemplate(true);
        try {
            const isEdit = !!editingTemplate;
            const res = await fetch("/api/ga/equipment/templates", {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    isEdit ? { id: editingTemplate.id, name: templateName.trim() } : { name: templateName.trim() }
                ),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan template."));
            toast(isEdit ? "Template diperbarui." : "Template dibuat.", "success");
            setShowTemplateForm(false);
            setEditingTemplate(null);
            setTemplateName("");
            await fetchTemplates();
        } catch (err) {
            toast(
                getFriendlyClientErrorMessage(err, "Gagal menyimpan template. Periksa koneksi Anda lalu coba lagi."),
                "error"
            );
            reportClientError("EquipmentSettings", "Template save failed", err);
        } finally {
            setSavingTemplate(false);
        }
    }, [savingTemplate, templateName, editingTemplate, toast, fetchTemplates]);

    const toggleTemplateActive = useCallback(
        async (tpl: EquipmentTemplate) => {
            try {
                const res = await fetch("/api/ga/equipment/templates", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: tpl.id, isActive: !tpl.isActive }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status template."));
                toast(tpl.isActive ? "Template dinonaktifkan." : "Template diaktifkan.", "success");
                await fetchTemplates();
            } catch (err) {
                toast(
                    getFriendlyClientErrorMessage(
                        err,
                        "Gagal mengubah status template. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
            }
        },
        [toast, fetchTemplates]
    );

    const openItemForm = useCallback((templateId: string, item?: TemplateItem) => {
        setShowItemForm(templateId);
        setEditingItem(item ?? null);
        setItemName(item?.name ?? "");
        setItemRequirePhoto(item?.requirePhoto ?? true);
    }, []);

    const saveItem = useCallback(
        async (templateId: string) => {
            if (savingItem || !itemName.trim()) {
                if (!itemName.trim()) toast("Nama item wajib diisi.", "warning");
                return;
            }
            setSavingItem(true);
            try {
                if (editingItem) {
                    const res = await fetch("/api/ga/equipment/template-items", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            id: editingItem.id,
                            name: itemName.trim(),
                            requirePhoto: itemRequirePhoto,
                        }),
                    });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memperbarui item."));
                    toast("Item diperbarui.", "success");
                } else {
                    const res = await fetch("/api/ga/equipment/template-items", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            templateId,
                            name: itemName.trim(),
                            requirePhoto: itemRequirePhoto,
                        }),
                    });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menambah item."));
                    toast("Item ditambahkan.", "success");
                }
                setShowItemForm(null);
                setEditingItem(null);
                setItemName("");
                setItemRequirePhoto(true);
                await fetchTemplates();
            } catch (err) {
                toast(
                    getFriendlyClientErrorMessage(err, "Gagal menyimpan item. Periksa koneksi Anda lalu coba lagi."),
                    "error"
                );
            } finally {
                setSavingItem(false);
            }
        },
        [savingItem, itemName, itemRequirePhoto, editingItem, toast, fetchTemplates]
    );

    const toggleItemActive = useCallback(
        async (item: TemplateItem) => {
            try {
                const res = await fetch("/api/ga/equipment/template-items", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: item.id, isActive: !item.isActive }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status item."));
                toast(item.isActive ? "Item dinonaktifkan." : "Item diaktifkan.", "success");
                await fetchTemplates();
            } catch (err) {
                toast(
                    getFriendlyClientErrorMessage(
                        err,
                        "Gagal mengubah status item. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
            }
        },
        [toast, fetchTemplates]
    );

    const deleteItem = useCallback(
        (item: TemplateItem) => {
            confirm({
                title: `Hapus item "${item.name}"?`,
                message: "Item yang dihapus tidak bisa dikembalikan. Riwayat inspeksi lama tetap tersimpan.",
                confirmLabel: "Hapus",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: () => {
                    void (async () => {
                        try {
                            const res = await fetch(
                                `/api/ga/equipment/template-items?id=${encodeURIComponent(item.id)}`,
                                { method: "DELETE" }
                            );
                            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus item."));
                            toast("Item dihapus.", "success");
                            await fetchTemplates();
                        } catch (err) {
                            toast(
                                getFriendlyClientErrorMessage(
                                    err,
                                    "Gagal menghapus item. Periksa koneksi Anda lalu coba lagi."
                                ),
                                "error"
                            );
                        }
                    })();
                },
            });
        },
        [confirm, toast, fetchTemplates]
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                    Template menentukan daftar poin pemeriksaan yang diisi operator pada setiap unit alat.
                </p>
                <button
                    type="button"
                    onClick={() => {
                        setShowTemplateForm(true);
                        setEditingTemplate(null);
                        setTemplateName("");
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 shrink-0 min-h-[42px]"
                >
                    <Plus className="h-4 w-4" />
                    Tambah Template
                </button>
            </div>

            {templates.length === 0 ? (
                <div className="bg-card border border-dashed border-border rounded-xl py-10 text-center space-y-1">
                    <p className="text-sm font-medium text-foreground">Belum ada template checklist.</p>
                    <p className="text-xs text-muted-foreground">Klik Tambah Template untuk membuat standar pertama.</p>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {templates.map((tpl) => {
                        const expanded = expandedTemplate === tpl.id;
                        const activeItemCount = tpl.items.filter((i) => i.isActive).length;
                        return (
                            <section key={tpl.id} className="bg-card border border-border rounded-xl overflow-hidden">
                                <div className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-accent/20 transition-colors">
                                    <button
                                        type="button"
                                        onClick={() => setExpandedTemplate(expanded ? null : tpl.id)}
                                        aria-expanded={expanded}
                                        className="flex items-center gap-2.5 text-left flex-1 min-w-0 min-h-[36px]"
                                    >
                                        {expanded ? (
                                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                        )}
                                        <span className="font-semibold text-sm text-foreground truncate">
                                            {tpl.name}
                                        </span>
                                        <span
                                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                                                tpl.isActive
                                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                    : "bg-muted text-muted-foreground"
                                            }`}
                                        >
                                            {tpl.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                        <span className="text-xs text-muted-foreground shrink-0">
                                            {tpl._count.units} unit · {activeItemCount}/{tpl.items.length} item aktif
                                        </span>
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowTemplateForm(true);
                                                setEditingTemplate(tpl);
                                                setTemplateName(tpl.name);
                                            }}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted min-h-[36px]"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                            Ubah
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void toggleTemplateActive(tpl)}
                                            className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md min-h-[36px]"
                                        >
                                            {tpl.isActive ? "Nonaktifkan" : "Aktifkan"}
                                        </button>
                                    </div>
                                </div>

                                {expanded && (
                                    <div className="border-t border-border px-4 py-3 bg-muted/15 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                Daftar Item Pemeriksaan
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => openItemForm(tpl.id)}
                                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline min-h-[32px]"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                Tambah Item
                                            </button>
                                        </div>

                                        {tpl.items.length === 0 ? (
                                            <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
                                                Belum ada item pemeriksaan.
                                            </p>
                                        ) : (
                                            <ul className="divide-y divide-border/70 rounded-lg border border-border bg-card">
                                                {tpl.items.map((item, idx) => (
                                                    <li
                                                        key={item.id}
                                                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                                                    >
                                                        <span
                                                            className={`min-w-0 flex-1 ${
                                                                item.isActive
                                                                    ? "text-foreground"
                                                                    : "text-muted-foreground line-through"
                                                            }`}
                                                        >
                                                            <span className="text-muted-foreground mr-1.5">
                                                                {idx + 1}.
                                                            </span>
                                                            {item.name}
                                                            {item.requirePhoto && (
                                                                <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                                                    Wajib foto
                                                                </span>
                                                            )}
                                                        </span>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => openItemForm(tpl.id, item)}
                                                                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md min-h-[32px]"
                                                                title="Ubah item"
                                                                aria-label={`Ubah item ${item.name}`}
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => void toggleItemActive(item)}
                                                                className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md min-h-[32px]"
                                                            >
                                                                {item.isActive ? "Nonaktifkan" : "Aktifkan"}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => deleteItem(item)}
                                                                className="px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded-md min-h-[32px]"
                                                            >
                                                                Hapus
                                                            </button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}

            {showTemplateForm && (
                <AccessibleModal
                    ariaLabel={editingTemplate ? "Ubah Template" : "Tambah Template"}
                    onClose={() => {
                        setShowTemplateForm(false);
                        setEditingTemplate(null);
                    }}
                >
                    <div className="modal-header !mb-4 pb-3 border-b border-[var(--border)]">
                        <h2 className="modal-title">{editingTemplate ? "Ubah Template" : "Template Baru"}</h2>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => {
                                setShowTemplateForm(false);
                                setEditingTemplate(null);
                            }}
                            aria-label="Tutup jendela"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="tpl-name" className="text-xs font-medium">
                                Nama template
                            </label>
                            <input
                                id="tpl-name"
                                type="text"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="Contoh: Inspeksi Alat Produksi"
                                className={`${inputClass} mt-1`}
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowTemplateForm(false);
                                    setEditingTemplate(null);
                                }}
                                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted min-h-[42px]"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={() => void saveTemplate()}
                                disabled={savingTemplate}
                                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[42px]"
                            >
                                {savingTemplate ? "Menyimpan..." : "Simpan"}
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}

            {showItemForm && (
                <AccessibleModal
                    ariaLabel={editingItem ? "Ubah Item Pemeriksaan" : "Tambah Item Pemeriksaan"}
                    onClose={() => {
                        setShowItemForm(null);
                        setEditingItem(null);
                    }}
                >
                    <div className="modal-header !mb-4 pb-3 border-b border-[var(--border)]">
                        <h2 className="modal-title">
                            {editingItem ? "Ubah Item Pemeriksaan" : "Item Pemeriksaan Baru"}
                        </h2>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => {
                                setShowItemForm(null);
                                setEditingItem(null);
                            }}
                            aria-label="Tutup jendela"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="tpl-item-name" className="text-xs font-medium">
                                Nama item
                            </label>
                            <input
                                id="tpl-item-name"
                                type="text"
                                value={itemName}
                                onChange={(e) => setItemName(e.target.value)}
                                placeholder="Contoh: Kebersihan permukaan alat"
                                className={`${inputClass} mt-1`}
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                                type="checkbox"
                                checked={itemRequirePhoto}
                                onChange={(e) => setItemRequirePhoto(e.target.checked)}
                                className="rounded border-border"
                            />
                            Wajib unggah foto bukti saat inspeksi
                        </label>
                        <div className="flex justify-end gap-2 pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowItemForm(null);
                                    setEditingItem(null);
                                }}
                                className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted min-h-[42px]"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={() => void saveItem(showItemForm)}
                                disabled={savingItem}
                                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[42px]"
                            >
                                {savingItem ? "Menyimpan..." : editingItem ? "Simpan Perubahan" : "Simpan"}
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
