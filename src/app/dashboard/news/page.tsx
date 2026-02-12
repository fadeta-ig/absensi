"use client";

import { useEffect, useState } from "react";
import { Megaphone, Plus, Pencil, Trash2, Pin, X, Loader2 } from "lucide-react";

interface NewsItem {
    id: string; title: string; content: string;
    category: string; author: string; createdAt: string; isPinned: boolean;
}

const INIT_FORM = { title: "", content: "", category: "announcement", isPinned: false };

export default function NewsManagementPage() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState(INIT_FORM);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch("/api/news").then((r) => r.json()).then(setNews);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const method = editId ? "PUT" : "POST";
        const body = editId ? { ...form, id: editId, author: "Admin HR", createdAt: new Date().toISOString() } : { ...form, author: "Admin HR", createdAt: new Date().toISOString() };
        const res = await fetch("/api/news", {
            method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (res.ok) {
            const data = await res.json();
            if (editId) setNews((prev) => prev.map((n) => (n.id === editId ? data : n)));
            else setNews((prev) => [data, ...prev]);
            setShowForm(false);
            setEditId(null);
            setForm(INIT_FORM);
        }
        setLoading(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Yakin ingin menghapus berita ini?")) return;
        const res = await fetch(`/api/news?id=${id}`, { method: "DELETE" });
        if (res.ok) setNews((prev) => prev.filter((n) => n.id !== id));
    };

    const togglePin = async (item: NewsItem) => {
        const res = await fetch("/api/news", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id, isPinned: !item.isPinned }),
        });
        if (res.ok) setNews((prev) => prev.map((n) => (n.id === item.id ? { ...n, isPinned: !n.isPinned } : n)));
    };

    const getCategoryLabel = (cat: string) => {
        switch (cat) { case "announcement": return "Pengumuman"; case "event": return "Acara"; case "policy": return "Kebijakan"; default: return "Umum"; }
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-[var(--primary)]" />
                        Manajemen Berita
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">{news.length} berita terpublikasi</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditId(null); setForm(INIT_FORM); }}>
                    <Plus className="w-4 h-4" /> Buat Berita
                </button>
            </div>

            {news.length === 0 ? (
                <div className="card p-12 text-center">
                    <Megaphone className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada berita</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {news.map((item) => (
                        <div key={item.id} className="card p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0 space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {item.isPinned && <Pin className="w-3 h-3 text-[var(--primary)]" />}
                                        <span className="badge badge-primary">{getCategoryLabel(item.category)}</span>
                                    </div>
                                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</h3>
                                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{item.content}</p>
                                    <p className="text-[10px] text-[var(--text-muted)]">{new Date(item.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button onClick={() => togglePin(item)} className={`btn btn-ghost btn-sm !p-1.5 ${item.isPinned ? "text-[var(--primary)]" : ""}`} title={item.isPinned ? "Unpin" : "Pin"}>
                                        <Pin className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => { setEditId(item.id); setForm({ title: item.title, content: item.content, category: item.category, isPinned: item.isPinned }); setShowForm(true); }} className="btn btn-ghost btn-sm !p-1.5">
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editId ? "Edit Berita" : "Buat Berita Baru"}</h2>
                            <button className="modal-close" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="form-group !mb-0">
                                <label className="form-label">Judul</label>
                                <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label">Kategori</label>
                                <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                                    <option value="announcement">Pengumuman</option>
                                    <option value="event">Acara</option>
                                    <option value="policy">Kebijakan</option>
                                    <option value="general">Umum</option>
                                </select>
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label">Konten</label>
                                <textarea className="form-textarea min-h-[150px]" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                                <input type="checkbox" checked={form.isPinned} onChange={(e) => setForm({ ...form, isPinned: e.target.checked })} className="w-4 h-4 accent-[var(--primary)]" />
                                Pin berita ini
                            </label>
                            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {editId ? "Simpan Perubahan" : "Publikasikan"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
