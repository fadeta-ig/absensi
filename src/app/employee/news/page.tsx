"use client";

import { useEffect, useState } from "react";
import styles from "./news.module.css";

interface NewsItem {
    id: string;
    title: string;
    content: string;
    category: string;
    author: string;
    createdAt: string;
    isPinned: boolean;
}

export default function NewsPage() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [selected, setSelected] = useState<NewsItem | null>(null);
    const [filter, setFilter] = useState("all");

    useEffect(() => {
        fetch("/api/news").then((r) => r.json()).then(setNews);
    }, []);

    const filtered = filter === "all" ? news : news.filter((n) => n.category === filter);

    const getCategoryColor = (cat: string) => {
        switch (cat) {
            case "announcement": return "primary";
            case "event": return "info";
            case "policy": return "warning";
            default: return "primary";
        }
    };

    const getCategoryLabel = (cat: string) => {
        switch (cat) {
            case "announcement": return "Pengumuman";
            case "event": return "Acara";
            case "policy": return "Kebijakan";
            default: return "Umum";
        }
    };

    const getCategoryIcon = (cat: string) => {
        switch (cat) {
            case "announcement": return "📢";
            case "event": return "🎉";
            case "policy": return "📋";
            default: return "📰";
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>📢 WIG&apos;s News</h1>
                <p className={styles.subtitle}>Informasi dan pengumuman perusahaan</p>
            </div>

            {/* Filters */}
            <div className={styles.filters}>
                {["all", "announcement", "event", "policy", "general"].map((f) => (
                    <button
                        key={f}
                        className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ""}`}
                        onClick={() => setFilter(f)}
                    >
                        {f === "all" ? "Semua" : getCategoryLabel(f)}
                    </button>
                ))}
            </div>

            {/* News List */}
            {filtered.length === 0 ? (
                <div className="glass-card empty-state">
                    <span className="empty-state-icon">📰</span>
                    <p className="empty-state-title">Tidak ada berita</p>
                </div>
            ) : (
                <div className={styles.newsList}>
                    {filtered.map((item) => (
                        <div
                            key={item.id}
                            className={`glass-card ${styles.newsCard}`}
                            onClick={() => setSelected(item)}
                        >
                            <div className={styles.newsCardIcon}>
                                {getCategoryIcon(item.category)}
                            </div>
                            <div className={styles.newsCardContent}>
                                <div className={styles.newsCardHeader}>
                                    {item.isPinned && <span className={styles.pin}>📌</span>}
                                    <span className={`badge badge-${getCategoryColor(item.category)}`}>
                                        {getCategoryLabel(item.category)}
                                    </span>
                                </div>
                                <h3 className={styles.newsCardTitle}>{item.title}</h3>
                                <p className={styles.newsCardText}>{item.content.slice(0, 150)}...</p>
                                <div className={styles.newsCardMeta}>
                                    <span>Oleh {item.author}</span>
                                    <span>•</span>
                                    <span>
                                        {new Date(item.createdAt).toLocaleDateString("id-ID", {
                                            day: "numeric",
                                            month: "long",
                                            year: "numeric",
                                        })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Detail Modal */}
            {selected && (
                <div className="modal-overlay" onClick={() => setSelected(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{selected.title}</h2>
                            <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
                        </div>
                        <div className={styles.modalMeta}>
                            <span className={`badge badge-${getCategoryColor(selected.category)}`}>
                                {getCategoryLabel(selected.category)}
                            </span>
                            <span className={styles.modalAuthor}>Oleh {selected.author}</span>
                            <span className={styles.modalDate}>
                                {new Date(selected.createdAt).toLocaleDateString("id-ID", {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                })}
                            </span>
                        </div>
                        <div className={styles.modalBody}>
                            <p>{selected.content}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
