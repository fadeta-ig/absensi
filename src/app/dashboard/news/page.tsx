"use client";

import { useEffect, useState } from "react";
import styles from "./nw.module.css";

interface NewsItem {
    id: string;
    title: string;
    content: string;
    category: string;
    author: string;
    createdAt: string;
    isPinned: boolean;
}

const defaultForm = {
    title: "",
    content: "",
    category: "announcement",
    isPinned: false,
};

export default function NewsManagementPage() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState(defaultForm);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchNews();
    }, []);

    const fetchNews = async () => {
        const res = await fetch("/api/news");
        setNews(await res.json());
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (editId) {
            await fetch("/api/news", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: editId, ...form }),
            });
        } else {
            await fetch("/api/news", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
        }

        setShowModal(false);
        setEditId(null);
        setForm(defaultForm);
        setLoading(false);
        fetchNews();
    };

    const handleEdit = (item: NewsItem) => {
        setEditId(item.id);
        setForm({
            title: item.title,
            content: item.content,
            category: item.category,
            isPinned: item.isPinned,
        });
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Yakin ingin menghapus berita ini?")) return;
        await fetch(`/api/news?id=${id}`, { method: "DELETE" });
        fetchNews();
    };

    const getCategoryLabel = (cat: string) => {
        switch (cat) { case "announcement": return "Pengumuman"; case "event": return "Acara"; case "policy": return "Kebijakan"; default: return "Umum"; }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>📢 Kelola WIG News</h1>
                    <p className={styles.subtitle}>Posting dan kelola informasi karyawan</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setEditId(null); setForm(defaultForm); setShowModal(true); }}>
                    + Posting Baru
                </button>
            </div>

            <div className={styles.list}>
                {news.map((item) => (
                    <div key={item.id} className={`glass-card ${styles.card}`}>
                        <div className={styles.cardHeader}>
                            {item.isPinned && <span className={styles.pin}>📌</span>}
                            <span className="badge badge-primary">{getCategoryLabel(item.category)}</span>
                            <span className={styles.date}>
                                {new Date(item.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                        </div>
                        <h3 className={styles.cardTitle}>{item.title}</h3>
                        <p className={styles.cardText}>{item.content.slice(0, 150)}...</p>
                        <div className={styles.cardActions}>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(item)}>✏️ Edit</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item.id)}>🗑️ Hapus</button>
                        </div>
                    </div>
                ))}
                {news.length === 0 && (
                    <div className="glass-card empty-state">
                        <span className="empty-state-icon">📢</span>
                        <p className="empty-state-title">Belum ada berita</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editId ? "Edit Berita" : "Posting Baru"}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label className="form-label">Judul</label>
                                <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Kategori</label>
                                <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                                    <option value="announcement">Pengumuman</option>
                                    <option value="event">Acara</option>
                                    <option value="policy">Kebijakan</option>
                                    <option value="general">Umum</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Konten</label>
                                <textarea className="form-textarea" style={{ minHeight: 150 }} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
                            </div>
                            <div className={styles.pinToggle}>
                                <label>
                                    <input type="checkbox" checked={form.isPinned} onChange={(e) => setForm({ ...form, isPinned: e.target.checked })} />
                                    <span>📌 Sematkan di atas</span>
                                </label>
                            </div>
                            <button type="submit" className="btn btn-primary btn-lg w-full mt-md" disabled={loading}>
                                {loading ? "Menyimpan..." : editId ? "Update" : "Posting"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
