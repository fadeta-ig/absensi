"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, RefreshCw, Layers, Archive, Trash2, Edit2, X, Check, AlertCircle, Loader2 } from "lucide-react";
import { AssetCategory } from "@/lib/types/asset";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { getResponseErrorMessage } from "@/lib/clientErrors";

export default function CategoriesPage() {
    const toast = useToast();
    const confirm = useConfirm();
    const [categories, setCategories] = useState<AssetCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    
    // Form state
    const [name, setName] = useState("");
    const [prefix, setPrefix] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPrefix, setEditPrefix] = useState("");
    const [savingEditId, setSavingEditId] = useState<string | null>(null);

    const fetchCategories = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError("");
            const res = await fetch(`/api/assets/categories`);
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat kategori aset."));
            }
            const data = await res.json();
            setCategories(data);
        } catch (error) {
            console.error("Gagal mengambil data kategori", error);
            setCategories([]);
            setLoadError(error instanceof Error ? error.message : "Gagal memuat kategori aset.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaving(true);
        try {
            const res = await fetch("/api/assets/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, prefix: prefix.toUpperCase() })
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || "Gagal menyimpan kategori");
            
            // Berhasil
            setName("");
            setPrefix("");
            await fetchCategories();
            toast("Kategori berhasil ditambahkan.", "success");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Gagal menyimpan kategori");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (cat: AssetCategory) => {
        const hasAssets = (cat._count?.assets ?? 0) > 0;

        confirm({
            title: hasAssets ? "Kategori masih digunakan" : "Hapus kategori?",
            message: hasAssets
                ? `Kategori "${cat.name}" masih terhubung dengan ${cat._count?.assets} aset aktif. Sistem dapat menolak penghapusan jika relasi masih ada.`
                : `Kategori "${cat.name}" akan dihapus secara permanen.`,
            confirmLabel: hasAssets ? "Lanjutkan Validasi" : "Hapus",
            cancelLabel: "Batal",
            variant: hasAssets ? "warning" : "danger",
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/assets/categories/${cat.id}`, { method: "DELETE" });
                    if (!res.ok) {
                        throw new Error(await getResponseErrorMessage(res, "Gagal menghapus kategori."));
                    }
                    await fetchCategories();
                    toast("Kategori berhasil dihapus.", "success");
                } catch (err: unknown) {
                    toast(err instanceof Error ? err.message : "Kategori belum terhapus karena jaringan bermasalah. Periksa koneksi lalu coba lagi.", "error");
                }
            },
        });
    };

    const startEdit = (cat: AssetCategory) => {
        setEditingId(cat.id);
        setEditName(cat.name);
        setEditPrefix(cat.prefix);
    };

    const cancelEdit = () => {
        setEditingId(null);
    };

    const handleSaveEdit = async (id: string) => {
        setSavingEditId(id);
        try {
            const res = await fetch(`/api/assets/categories/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: editName, prefix: editPrefix.toUpperCase() })
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memperbarui kategori."));
            }
            setEditingId(null);
            await fetchCategories();
            toast("Kategori berhasil diperbarui.", "success");
        } catch (err: unknown) {
            toast(err instanceof Error ? err.message : "Kategori belum diperbarui karena jaringan bermasalah. Periksa koneksi lalu coba lagi.", "error");
        } finally {
            setSavingEditId(null);
        }
    };

    return (
        <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6 min-h-screen">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Master Data Kategori</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">Kelola jenis kategori aset dan prefix kode penomoran otomatis.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                {/* Form Tambah Kategori */}
                <div className="bg-[var(--card)] border rounded-xl p-5 shadow-sm md:col-span-1">
                    <div className="flex items-center gap-2 mb-4 text-[var(--text-primary)] font-semibold">
                        <Plus size={18} className="text-[var(--success)]" />
                        Tambah Kategori Baru
                    </div>
                    
                    {error && (
                        <div className="mb-4 p-3 bg-[var(--destructive-bg)] text-[var(--destructive)] rounded-lg text-sm border border-[var(--destructive-border)] flex items-start gap-2" role="alert">
                            <span className="font-semibold shrink-0">!</span> {error}
                        </div>
                    )}
                    
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 shrink-0">Nama Kategori</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Cth: Monitor, Tablet..."
                                required
                                className="form-input transition-shadow"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 shrink-0">Prefix Kode</label>
                            <input
                                type="text"
                                value={prefix}
                                onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                                placeholder="Cth: MN, TAB..."
                                required
                                maxLength={5}
                                className="form-input uppercase focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition-shadow"
                            />
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">Akan menghasilkan kode seperti: MN-001</p>
                        </div>
                        
                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full py-2 bg-[var(--foreground)] text-[var(--background)] rounded-lg text-sm font-semibold hover:bg-[var(--primary-light)] transition-colors disabled:opacity-50 mt-2"
                        >
                            {saving ? <span className="inline-flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</span> : "Simpan Kategori"}
                        </button>
                    </form>
                </div>

                {/* List Kategori */}
                <div className="bg-[var(--card)] border rounded-xl overflow-hidden shadow-sm md:col-span-2">
                    <div className="px-5 py-4 border-b flex justify-between items-center bg-[var(--secondary)]/50">
                        <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
                            <Layers size={18} className="text-[var(--info)]" />
                            Daftar Kategori
                        </div>
                        <button onClick={fetchCategories} className="p-1.5 hover:bg-[var(--secondary)] rounded text-[var(--text-secondary)] transition-colors">
                            <RefreshCw size={16} className={loading && categories.length > 0 ? "animate-spin" : ""} />
                        </button>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-[var(--secondary)] border-b text-[var(--text-secondary)] text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-5 py-3 font-semibold">Kategori</th>
                                    <th className="px-5 py-3 font-semibold">Prefix</th>
                                    <th className="px-5 py-3 font-semibold text-center">Total Aset</th>
                                    <th className="px-5 py-3 font-semibold text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading && categories.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-10 text-center text-[var(--text-muted)]">Memuat kategori...</td>
                                    </tr>
                                ) : loadError ? (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-10 text-center text-[var(--destructive)]">
                                            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-70" />
                                            <span className="font-semibold">{loadError}</span>
                                        </td>
                                    </tr>
                                ) : categories.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-10 text-center text-[var(--text-muted)]">Tidak ada kategori data.</td>
                                    </tr>
                                ) : (
                                    categories.map((cat) => (
                                        <tr key={cat.id} className="hover:bg-[var(--secondary)]/80 transition-colors">
                                            <td className="px-5 py-3 font-medium text-[var(--text-primary)] flex items-center gap-2">
                                                <Archive size={14} className="text-[var(--text-muted)]" />
                                                {editingId === cat.id ? (
                                                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="px-2 py-1 border rounded focus:ring-2 focus:outline-none focus:ring-[var(--ring)] text-sm w-32" />
                                                ) : cat.name}
                                            </td>
                                            <td className="px-5 py-3">
                                                {editingId === cat.id ? (
                                                    <input type="text" value={editPrefix} maxLength={5} onChange={e => setEditPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} className="px-2 py-1 border rounded focus:ring-2 focus:outline-none focus:ring-[var(--ring)] text-sm font-mono w-20 uppercase" />
                                                ) : (
                                                    <span className="font-mono text-xs font-semibold text-[var(--category-1)] bg-[var(--category-1-bg)] px-2 rounded py-0.5">{cat.prefix}</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-[var(--text-secondary)] text-center">
                                                <span className="bg-[var(--secondary)] text-[var(--text-secondary)] font-semibold px-2 py-0.5 rounded-full text-xs">
                                                    {cat._count?.assets ?? 0} Aset
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                {editingId === cat.id ? (
                                                    <div className="flex justify-end gap-2">
                                                        <button disabled={savingEditId === cat.id} onClick={cancelEdit} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--secondary)] rounded-lg transition-colors disabled:opacity-50"><X size={16} /></button>
                                                        <button disabled={savingEditId === cat.id} onClick={() => handleSaveEdit(cat.id)} className="p-1.5 text-[var(--success)] hover:bg-[var(--success-bg)] rounded-lg transition-colors disabled:opacity-50">
                                                            {savingEditId === cat.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => startEdit(cat)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--info)] hover:bg-[var(--info-bg)] rounded-lg transition-colors" title="Edit">
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button onClick={() => handleDelete(cat)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-bg)] rounded-lg transition-colors" title="Hapus">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

