"use client";

import { useCallback, useState } from "react";
import { Plus, Pencil, ChevronDown, ChevronRight, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
import { inputClass } from "@/app/ga/equipment/settings/_components/useSettingsData";
import type {
    EquipmentTemplate,
    TemplateItem,
} from "@/app/ga/equipment/settings/_components/useSettingsData";

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
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
    const [showItemForm, setShowItemForm] = useState<string | null>(null);
    const [editingItem, setEditingItem] = useState<TemplateItem | null>(null);
    const [itemName, setItemName] = useState("");
    const [itemRequirePhoto, setItemRequirePhoto] = useState(true);
    const [savingItem, setSavingItem] = useState(false);

    // ─── Template CRUD ───

    const saveTemplate = useCallback(async () => {
        if (savingTemplate || !templateName.trim()) return;
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
            toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
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
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status."));
                toast(tpl.isActive ? "Template dinonaktifkan." : "Template diaktifkan.", "success");
                await fetchTemplates();
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal mengubah status.", "error");
            }
        },
        [toast, fetchTemplates]
    );

    // ─── Item CRUD ───

    const openItemForm = useCallback((templateId: string, item?: TemplateItem) => {
        setShowItemForm(templateId);
        setEditingItem(item ?? null);
        setItemName(item?.name ?? "");
        setItemRequirePhoto(item?.requirePhoto ?? true);
    }, []);

    const saveItem = useCallback(
        async (templateId: string) => {
            if (savingItem || !itemName.trim()) return;
            setSavingItem(true);
            try {
                if (editingItem) {
                    const res = await fetch("/api/ga/equipment/template-items", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: editingItem.id, name: itemName.trim(), requirePhoto: itemRequirePhoto }),
                    });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memperbarui item."));
                    toast("Item diperbarui.", "success");
                } else {
                    const res = await fetch("/api/ga/equipment/template-items", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ templateId, name: itemName.trim(), requirePhoto: itemRequirePhoto }),
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
                toast(err instanceof Error ? err.message : "Gagal menyimpan item.", "error");
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
                toast(err instanceof Error ? err.message : "Gagal.", "error");
            }
        },
        [toast, fetchTemplates]
    );

    const deleteItem = useCallback(
        (item: TemplateItem) => {
            confirm({
                title: `Hapus item "${item.name}"?`,
                message: "Item yang dihapus tidak bisa dikembalikan. Riwayat inspeksi lama tetap tersimpan sebagai snapshot.",
                confirmLabel: "Ya, hapus",
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
                            toast(err instanceof Error ? err.message : "Gagal menghapus.", "error");
                        }
                    })();
                },
            });
        },
        [confirm, toast, fetchTemplates]
    );

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium">Template Checklist</h2>
                <button
                    onClick={() => {
                        setShowTemplateForm(true);
                        setEditingTemplate(null);
                        setTemplateName("");
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
                >
                    <Plus className="h-4 w-4" /> Tambah
                </button>
            </div>

            <div className="space-y-2">
                {templates.map((tpl) => (
                    <div key={tpl.id} className="bg-card border border-border rounded-lg">
                        <div className="flex items-center justify-between p-3">
                            <button
                                onClick={() => setExpandedTemplate(expandedTemplate === tpl.id ? null : tpl.id)}
                                className="flex items-center gap-2 text-left flex-1"
                            >
                                {expandedTemplate === tpl.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                <span className="font-medium text-sm">{tpl.name}</span>
                                <span
                                    className={`text-xs px-1.5 py-0.5 rounded ${tpl.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}
                                >
                                    {tpl.isActive ? "Aktif" : "Nonaktif"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {tpl._count.units} unit, {tpl.items.length} item
                                </span>
                            </button>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        setShowTemplateForm(true);
                                        setEditingTemplate(tpl);
                                        setTemplateName(tpl.name);
                                    }}
                                    className="p-1 text-muted-foreground hover:text-foreground"
                                    title="Edit"
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    onClick={() => void toggleTemplateActive(tpl)}
                                    className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
                                >
                                    {tpl.isActive ? "Nonaktifkan" : "Aktifkan"}
                                </button>
                            </div>
                        </div>

                        {expandedTemplate === tpl.id && (
                            <div className="border-t border-border px-3 pb-3 pt-2">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-muted-foreground uppercase">Item</span>
                                    <button
                                        onClick={() => openItemForm(tpl.id)}
                                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                                    >
                                        <Plus className="h-3 w-3" /> Tambah Item
                                    </button>
                                </div>

                                {tpl.items.length === 0 ? (
                                    <p className="text-xs text-muted-foreground py-2">Belum ada item.</p>
                                ) : (
                                    <div className="space-y-1">
                                        {tpl.items.map((item, idx) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between py-1 px-2 text-sm rounded hover:bg-accent/50"
                                            >
                                                <span className={item.isActive ? "text-foreground" : "text-muted-foreground line-through"}>
                                                    {idx + 1}. {item.name}
                                                    {item.requirePhoto && (
                                                        <span className="ml-1.5 text-[10px] px-1 py-px rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                                            Wajib foto
                                                        </span>
                                                    )}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => openItemForm(tpl.id, item)}
                                                        className="p-1 text-muted-foreground hover:text-foreground"
                                                        title="Edit item"
                                                    >
                                                        <Pencil className="h-3 w-3" />
                                                    </button>
                                                    <button
                                                        onClick={() => void toggleItemActive(item)}
                                                        className="text-xs text-muted-foreground hover:text-foreground"
                                                    >
                                                        {item.isActive ? "Nonaktifkan" : "Aktifkan"}
                                                    </button>
                                                    <button
                                                        onClick={() => deleteItem(item)}
                                                        className="text-xs text-destructive hover:text-destructive/80"
                                                        title="Hapus item"
                                                    >
                                                        Hapus
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {templates.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">Belum ada template. Buat template pertama.</p>
                )}
            </div>

            {showTemplateForm && (
                <AccessibleModal
                    ariaLabel={editingTemplate ? "Edit Template" : "Tambah Template"}
                    onClose={() => {
                        setShowTemplateForm(false);
                        setEditingTemplate(null);
                    }}
                >
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">{editingTemplate ? "Edit Template" : "Template Baru"}</h2>
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => {
                                setShowTemplateForm(false);
                                setEditingTemplate(null);
                            }}
                            aria-label="Tutup modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium">Nama template</label>
                            <input
                                type="text"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                placeholder="Nama template"
                                className={`${inputClass} mt-1`}
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => void saveTemplate()}
                                disabled={savingTemplate}
                                className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                            >
                                {savingTemplate ? "Menyimpan..." : "Simpan"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowTemplateForm(false);
                                    setEditingTemplate(null);
                                }}
                                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                            >
                                Batal
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}

            {showItemForm && (
                <AccessibleModal
                    ariaLabel={editingItem ? "Edit Item Template" : "Tambah Item Template"}
                    onClose={() => {
                        setShowItemForm(null);
                        setEditingItem(null);
                    }}
                >
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">{editingItem ? "Edit Item" : "Item Baru"}</h2>
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => {
                                setShowItemForm(null);
                                setEditingItem(null);
                            }}
                            aria-label="Tutup modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium">Nama item</label>
                            <input
                                type="text"
                                value={itemName}
                                onChange={(e) => setItemName(e.target.value)}
                                placeholder="Nama item"
                                className={`${inputClass} mt-1`}
                            />
                        </div>
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                                type="checkbox"
                                checked={itemRequirePhoto}
                                onChange={(e) => setItemRequirePhoto(e.target.checked)}
                                className="rounded border-border"
                            />
                            Wajib foto bukti
                        </label>
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => void saveItem(showItemForm)}
                                disabled={savingItem}
                                className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                            >
                                {savingItem ? "Menyimpan..." : editingItem ? "Perbarui" : "Simpan"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowItemForm(null);
                                    setEditingItem(null);
                                }}
                                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                            >
                                Batal
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
