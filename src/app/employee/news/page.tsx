"use client";

import { useEffect, useState } from "react";
import { Newspaper, Pin, X, Megaphone, PartyPopper, BookOpen, Globe, Download, FileText, Paperclip, Loader2, AlertCircle } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface NewsItem {
    id: string;
    title: string;
    content: string;
    category: string;
    author: string;
    createdAt: string;
    isPinned: boolean;
    mediaUrl?: string | null;
    mediaName?: string | null;
}

export default function NewsPage() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [selected, setSelected] = useState<NewsItem | null>(null);
    const [filter, setFilter] = useState("all");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    useEffect(() => {
        const loadNews = async () => {
            setLoading(true);
            setLoadError("");
            try {
                const res = await fetch("/api/news");
                if (!res.ok) {
                    throw new Error(await getResponseErrorMessage(res, "Gagal memuat berita."));
                }

                const data = await res.json() as NewsItem[];
                setNews(Array.isArray(data) ? data : []);
            } catch (err) {
                reportClientError("EmployeeNewsPage", "Gagal memuat berita employee", err);
                setNews([]);
                setLoadError(err instanceof Error ? err.message : "Gagal memuat berita.");
            } finally {
                setLoading(false);
            }
        };

        void loadNews();
    }, []);

    const filtered = filter === "all" ? news : news.filter((n) => n.category === filter);
    const paginatedNews = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;

    const getCategoryInfo = (cat: string) => {
        switch (cat) {
            case "announcement": return { label: "Pengumuman", icon: Megaphone, color: "text-[var(--primary)]", bg: "bg-[var(--primary)]/10" };
            case "event": return { label: "Acara", icon: PartyPopper, color: "text-blue-600", bg: "bg-blue-500/10" };
            case "policy": return { label: "Kebijakan", icon: BookOpen, color: "text-orange-600", bg: "bg-orange-500/10" };
            default: return { label: "Umum", icon: Globe, color: "text-[var(--text-secondary)]", bg: "bg-gray-500/10" };
        }
    };

    const filters = [
        { key: "all", label: "Semua" },
        { key: "announcement", label: "Pengumuman" },
        { key: "event", label: "Acara" },
        { key: "policy", label: "Kebijakan" },
        { key: "general", label: "Umum" },
    ];

    const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Newspaper className="w-5 h-5 text-[var(--primary)]" />
                    WIG News
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Informasi dan pengumuman perusahaan</p>
            </div>

            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
                {filters.map((f) => (
                    <button
                        key={f.key}
                        onClick={() => { setFilter(f.key); setCurrentPage(1); }}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${filter === f.key
                            ? "bg-[var(--primary)] text-white shadow-sm"
                            : "bg-[var(--secondary)] text-[var(--text-secondary)] hover:bg-[var(--muted)]"
                            }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* News List */}
            {loading ? (
                <div className="card p-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)] opacity-60 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Memuat berita...</p>
                </div>
            ) : loadError ? (
                <div className="card p-12 text-center">
                    <AlertCircle className="w-12 h-12 text-[var(--destructive)] opacity-60 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--destructive)]">{loadError}</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="card p-12 text-center">
                    <Newspaper className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Tidak ada berita</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {paginatedNews.map((item) => {
                        const info = getCategoryInfo(item.category);
                        const CatIcon = info.icon;
                        return (
                            <div key={item.id} className="card p-5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelected(item)}>
                                <div className="flex gap-4">
                                    <div className={`w-10 h-10 rounded-lg ${info.bg} flex items-center justify-center shrink-0`}>
                                        <CatIcon className={`w-5 h-5 ${info.color}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            {item.isPinned && <Pin className="w-3 h-3 text-[var(--primary)] shrink-0" />}
                                            <span className="badge badge-primary">{info.label}</span>
                                            {item.mediaUrl && (
                                                <span className="badge bg-blue-50 text-blue-600 text-[10px] flex items-center gap-1">
                                                    <Paperclip className="w-2.5 h-2.5" /> Lampiran
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{item.title}</h3>
                                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{item.content}</p>
                                        <div className="flex items-center gap-2 mt-2 text-[10px] text-[var(--text-muted)]">
                                            <span>Oleh {item.author}</span>
                                            <span>·</span>
                                            <span>{new Date(item.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {filtered.length > ITEMS_PER_PAGE && (
                        <div className="flex justify-between items-center px-4 py-3 border-t border-[var(--border)] mt-4">
                            <button className="btn btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)}>Prev</button>
                            <span className="text-xs font-medium text-[var(--text-muted)]">Halaman {currentPage} dari {totalPages}</span>
                            <button className="btn btn-secondary btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(c => c + 1)}>Next</button>
                        </div>
                    )}
                </div>
            )}

            {/* Detail Modal */}
            {selected && (
                <div className="modal-overlay" onClick={() => setSelected(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{selected.title}</h2>
                            <button className="modal-close" onClick={() => setSelected(null)}><X className="w-4 h-4" /></button>
                        </div>
                        <div className="flex items-center gap-3 mb-4 flex-wrap">
                            <span className="badge badge-primary">{getCategoryInfo(selected.category).label}</span>
                            <span className="text-xs text-[var(--text-muted)]">Oleh {selected.author}</span>
                            <span className="text-xs text-[var(--text-muted)]">{new Date(selected.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{selected.content}</p>

                        {/* Media Preview & Download */}
                        {selected.mediaUrl && (
                            <div className="mt-5 pt-4 border-t border-[var(--border)]">
                                {isImage(selected.mediaUrl) && (
                                    <div className="mb-3 rounded-lg overflow-hidden border border-[var(--border)]">
                                        <img src={selected.mediaUrl} alt={selected.mediaName || "Media"} className="w-full max-h-64 object-contain bg-[var(--bg-secondary)]" />
                                    </div>
                                )}
                                <a
                                    href={selected.mediaUrl}
                                    download={selected.mediaName || "file"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {isImage(selected.mediaUrl) ? <Download className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                    Unduh {selected.mediaName || "File"}
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
