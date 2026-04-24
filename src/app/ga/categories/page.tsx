"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, RefreshCw, Layers, Archive, Trash2, Edit2, X, Check } from "lucide-react";
import { AssetCategory } from "@/lib/types/asset";

export default function CategoriesPage() {
    const [categories, setCategories] = useState<AssetCategory[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Form state
    const [name, setName] = useState("");
    const [prefix, setPrefix] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPrefix, setEditPrefix] = useState("");

    const fetchCategories = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/assets/categories`);
            if (res.ok) {
                const data = await res.json();
                setCategories(data);
            }
        } catch (error) {
            console.error("Gagal mengambil data kategori", error);
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
            fetchCategories();
        } catch (err: unknown) {
            if (err instanceof Error) setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (cat: AssetCategory) => {
        const hasAssets = (cat._count?.assets ?? 0) > 0;
        
        if (hasAssets) {
            const confirmed = window.confirm(`PERINGATAN: Kategori "${cat.name}" masih terhubung dengan ${cat._count?.assets} aset aktif. Jika dilanjutkan, sistem mungkin akan menolak penghapusan ini. Lanjutkan validasi?`);
            if (!confirmed) return;
        } else {
            const confirmed = window.confirm(`Hapus kategori "${cat.name}" secara permanen?`);
            if (!confirmed) return;
        }

        try {
            const res = await fetch(`/api/assets/categories/${cat.id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) {
                alert(data.error || "Gagal menghapus kategori");
                return;
            }
            fetchCategories();
        } catch (err: unknown) {
            alert("Terjadi kesalahan jaringan saat menghapus.");
        }
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
        try {
            const res = await fetch(`/api/assets/categories/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: editName, prefix: editPrefix.toUpperCase() })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.error || "Gagal memperbarui kategori");
                return;
            }
            setEditingId(null);
            fetchCategories();
        } catch (err: unknown) {
            alert("Kesalahan jaringan saat memperbarui.");
        }
    };

    return (
        <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6 min-h-screen">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-800">Master Data Kategori</h1>
                <p className="text-sm text-slate-500 mt-1">Kelola jenis kategori aset dan prefix kode penomoran otomatis.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                {/* Form Tambah Kategori */}
                <div className="bg-white border rounded-xl p-5 shadow-sm md:col-span-1">
                    <div className="flex items-center gap-2 mb-4 text-slate-800 font-semibold">
                        <Plus size={18} className="text-emerald-500" />
                        Tambah Kategori Baru
                    </div>
                    
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100 flex items-start gap-2">
                            <span className="font-semibold shrink-0">!</span> {error}
                        </div>
                    )}
                    
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 shrink-0">Nama Kategori</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Cth: Monitor, Tablet..."
                                required
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 transition-shadow"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 shrink-0">Prefix Kode</label>
                            <input
                                type="text"
                                value={prefix}
                                onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                                placeholder="Cth: MN, TAB..."
                                required
                                maxLength={5}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-slate-800 transition-shadow"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">Akan menghasilkan kode seperti: MN-001</p>
                        </div>
                        
                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50 mt-2"
                        >
                            {saving ? "Menyimpan..." : "Simpan Kategori"}
                        </button>
                    </form>
                </div>

                {/* List Kategori */}
                <div className="bg-white border rounded-xl overflow-hidden shadow-sm md:col-span-2">
                    <div className="px-5 py-4 border-b flex justify-between items-center bg-slate-50/50">
                        <div className="flex items-center gap-2 font-semibold text-slate-800">
                            <Layers size={18} className="text-blue-500" />
                            Daftar Kategori
                        </div>
                        <button onClick={fetchCategories} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 transition-colors">
                            <RefreshCw size={16} className={loading && categories.length > 0 ? "animate-spin" : ""} />
                        </button>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 border-b text-slate-500 text-xs uppercase tracking-wider">
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
                                        <td colSpan={4} className="px-5 py-10 text-center text-slate-400">Memuat kategori...</td>
                                    </tr>
                                ) : categories.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-10 text-center text-slate-400">Tidak ada kategori data.</td>
                                    </tr>
                                ) : (
                                    categories.map((cat) => (
                                        <tr key={cat.id} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-5 py-3 font-medium text-slate-800 flex items-center gap-2">
                                                <Archive size={14} className="text-slate-400" />
                                                {editingId === cat.id ? (
                                                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="px-2 py-1 border rounded focus:ring-2 focus:outline-none focus:ring-slate-800 text-sm w-32" />
                                                ) : cat.name}
                                            </td>
                                            <td className="px-5 py-3">
                                                {editingId === cat.id ? (
                                                    <input type="text" value={editPrefix} maxLength={5} onChange={e => setEditPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} className="px-2 py-1 border rounded focus:ring-2 focus:outline-none focus:ring-slate-800 text-sm font-mono w-20 uppercase" />
                                                ) : (
                                                    <span className="font-mono text-xs font-semibold text-indigo-600 bg-indigo-50/50 px-2 rounded py-0.5">{cat.prefix}</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-slate-500 text-center">
                                                <span className="bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full text-xs">
                                                    {cat._count?.assets ?? 0} Aset
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                {editingId === cat.id ? (
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={cancelEdit} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><X size={16} /></button>
                                                        <button onClick={() => handleSaveEdit(cat.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Check size={16} /></button>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => startEdit(cat)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button onClick={() => handleDelete(cat)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Hapus">
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
