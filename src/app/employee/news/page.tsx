"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    Newspaper, Pin, X, Megaphone, PartyPopper, BookOpen, Globe,
    Download, FileText, Paperclip, Loader2, AlertCircle, Maximize2, ExternalLink, Eye
} from "lucide-react";
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

function NewsPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryId = searchParams.get("id");

    const [news, setNews] = useState<NewsItem[]>([]);
    const [selected, setSelected] = useState<NewsItem | null>(null);
    const [previewPdf, setPreviewPdf] = useState<{ url: string; name: string } | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [filter, setFilter] = useState("all");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 5;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (previewPdf) setPreviewPdf(null);
                else if (previewImage) setPreviewImage(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [previewPdf, previewImage]);

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
                const newsList = Array.isArray(data) ? data : [];
                setNews(newsList);

                // Auto-open modal if URL has ?id=... parameter
                if (queryId) {
                    const matched = newsList.find((item) => item.id === queryId);
                    if (matched) {
                        setSelected(matched);
                    }
                }
            } catch (err) {
                reportClientError("EmployeeNewsPage", "Gagal memuat berita employee", err);
                setNews([]);
                setLoadError(err instanceof Error ? err.message : "Gagal memuat berita.");
            } finally {
                setLoading(false);
            }
        };

        void loadNews();
    }, [queryId]);

    const handleCloseModal = () => {
        setSelected(null);
        // Clean URL if query parameter was used
        if (queryId) {
            router.replace("/employee/news", { scroll: false });
        }
    };

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

    const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|svg)($|\?)/i.test(url);
    const isPdf = (url: string, name?: string | null) =>
        /\.pdf($|\?)/i.test(url) || (Boolean(name) && /\.pdf$/i.test(name!));

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
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div
                        className={`modal-content transition-all duration-300 ${
                            selected.mediaUrl && isPdf(selected.mediaUrl, selected.mediaName)
                                ? "!max-w-3xl"
                                : selected.mediaUrl && isImage(selected.mediaUrl)
                                ? "!max-w-2xl"
                                : ""
                        }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header">
                            <h2 className="modal-title">{selected.title}</h2>
                            <button className="modal-close" onClick={handleCloseModal}><X className="w-4 h-4" /></button>
                        </div>
                        <div className="flex items-center gap-3 mb-4 flex-wrap">
                            <span className="badge badge-primary">{getCategoryInfo(selected.category).label}</span>
                            <span className="text-xs text-[var(--text-muted)]">Oleh {selected.author}</span>
                            <span className="text-xs text-[var(--text-muted)]">{new Date(selected.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{selected.content}</p>

                        {/* Media Preview & Download Section */}
                        {selected.mediaUrl && (
                            <div className="mt-6 pt-5 border-t border-[var(--border)] space-y-3">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                                        <Paperclip className="w-3.5 h-3.5 text-[var(--primary)]" />
                                        Lampiran Dokumen & Media
                                    </span>
                                    <span className="text-xs text-[var(--text-muted)] font-mono truncate max-w-xs">
                                        {selected.mediaName || "Berkas Terlampir"}
                                    </span>
                                </div>

                                {/* Gambar */}
                                {isImage(selected.mediaUrl) && (
                                    <div className="space-y-3">
                                        <div className="relative group rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--secondary)] max-h-80 flex items-center justify-center">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={selected.mediaUrl}
                                                alt={selected.mediaName || "Lampiran Berita"}
                                                className="w-full max-h-80 object-contain rounded-xl"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setPreviewImage(selected.mediaUrl!)}
                                                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-semibold text-xs gap-2"
                                            >
                                                <Eye className="w-4 h-4" /> Perbesar Gambar
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <a
                                                href={selected.mediaUrl}
                                                download={selected.mediaName || "gambar"}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-primary btn-sm flex items-center gap-1.5"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Download className="w-3.5 h-3.5" /> Unduh Gambar
                                            </a>
                                            <a
                                                href={selected.mediaUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-secondary btn-sm flex items-center gap-1.5 border border-[var(--border)]"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" /> Buka Tab Baru
                                            </a>
                                        </div>
                                    </div>
                                )}

                                {/* Dokumen PDF */}
                                {isPdf(selected.mediaUrl, selected.mediaName) && (
                                    <div className="space-y-3">
                                        {/* Document Action & Info Card */}
                                        <div className="p-3.5 rounded-xl bg-[var(--secondary)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 flex items-center justify-center shrink-0">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-[var(--text-primary)] truncate max-w-xs sm:max-w-md">
                                                        {selected.mediaName || "Dokumen Lampiran.pdf"}
                                                    </p>
                                                    <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                                                        Dokumen PDF Resmi
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewPdf({ url: selected.mediaUrl!, name: selected.mediaName || "Dokumen.pdf" })}
                                                    className="btn btn-secondary btn-sm flex items-center gap-1.5 border border-[var(--border)]"
                                                    title="Buka pratinjau mode layar penuh"
                                                >
                                                    <Maximize2 className="w-3.5 h-3.5 text-[var(--primary)]" />
                                                    Layar Penuh
                                                </button>
                                                <a
                                                    href={selected.mediaUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn btn-secondary btn-sm flex items-center gap-1.5 border border-[var(--border)]"
                                                    title="Buka PDF di tab browser baru"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                    Tab Baru
                                                </a>
                                                <a
                                                    href={selected.mediaUrl}
                                                    download={selected.mediaName || "dokumen.pdf"}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn btn-primary btn-sm flex items-center gap-1.5"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                    Unduh PDF
                                                </a>
                                            </div>
                                        </div>

                                        {/* Inline Embedded PDF Viewer */}
                                        <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--card)] shadow-inner">
                                            <iframe
                                                src={`${selected.mediaUrl}#toolbar=0&navpanes=0&view=FitH`}
                                                className="w-full h-80 sm:h-96 border-0 bg-[var(--card)]"
                                                title={selected.mediaName || "Pratinjau PDF"}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Format Dokumen Lain (Word, Excel, dsb) */}
                                {!isImage(selected.mediaUrl) && !isPdf(selected.mediaUrl, selected.mediaName) && (
                                    <div className="p-4 rounded-xl bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-between flex-wrap gap-3">
                                        <div className="flex items-center gap-2.5">
                                            <FileText className="w-5 h-5 text-[var(--primary)]" />
                                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                                                {selected.mediaName || "Dokumen Lampiran"}
                                            </span>
                                        </div>
                                        <a
                                            href={selected.mediaUrl}
                                            download={selected.mediaName || "file"}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn btn-primary btn-sm flex items-center gap-1.5"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Unduh Dokumen
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Fullscreen PDF Viewer Modal */}
            {previewPdf && (
                <div className="modal-overlay !p-2 sm:!p-6 z-[1100]" onClick={() => setPreviewPdf(null)}>
                    <div
                        className="modal-content !max-w-5xl !w-full !h-[92vh] flex flex-col !p-0 overflow-hidden shadow-2xl border-2 border-[var(--border)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Viewer Top Bar */}
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--card)]">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/40 text-red-600 flex items-center justify-center shrink-0">
                                    <FileText className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-bold text-[var(--text-primary)] truncate max-w-xs sm:max-w-xl">
                                        {previewPdf.name}
                                    </h3>
                                    <p className="text-[10px] text-[var(--text-muted)]">Mode Pratinjau Dokumen PDF Layar Penuh</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <a
                                    href={previewPdf.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-secondary btn-sm flex items-center gap-1.5 border border-[var(--border)]"
                                    title="Buka di tab browser baru"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Tab Baru</span>
                                </a>
                                <a
                                    href={previewPdf.url}
                                    download={previewPdf.name}
                                    className="btn btn-primary btn-sm flex items-center gap-1.5"
                                    title="Unduh berkas PDF"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Unduh PDF</span>
                                </a>
                                <button
                                    type="button"
                                    onClick={() => setPreviewPdf(null)}
                                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--secondary)] transition-colors ml-1"
                                    title="Tutup Pratinjau"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Viewer Iframe Content */}
                        <div className="flex-1 w-full bg-[var(--secondary)]/30 relative">
                            <iframe
                                src={`${previewPdf.url}#toolbar=1`}
                                className="w-full h-full border-0 bg-[var(--card)]"
                                title={previewPdf.name}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Fullscreen Image Preview Modal */}
            {previewImage && (
                <div className="modal-overlay !p-2 sm:!p-6 z-[1100]" onClick={() => setPreviewImage(null)}>
                    <div
                        className="modal-content !max-w-4xl !w-full !p-4 flex flex-col items-center justify-center relative bg-[var(--card)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setPreviewImage(null)}
                            className="absolute top-4 right-4 p-2 rounded-lg bg-[var(--secondary)] text-[var(--text-primary)] hover:bg-[var(--destructive)] hover:text-white transition-colors z-10"
                            title="Tutup"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={previewImage}
                            alt="Pratinjau Foto Lampiran"
                            className="max-h-[82vh] w-auto object-contain rounded-xl"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function NewsPage() {
    return (
        <Suspense fallback={
            <div className="card p-12 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)] opacity-60 mx-auto mb-3" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">Memuat berita...</p>
            </div>
        }>
            <NewsPageContent />
        </Suspense>
    );
}
