"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    AlertTriangle,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock,
    EyeOff,
    Loader2,
    Pencil,
    Quote,
    Save,
    Search,
    Trash2,
    UserRound,
    X,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import ResponsiveSheet from "@/components/ui/ResponsiveSheet";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import {
    DEFAULT_GREETING_COPY,
    GREETING_QUOTE_SLOTS,
    GREETING_QUOTE_STATUSES,
    MAX_GREETING_AUTHOR_LENGTH,
    MAX_GREETING_LENGTH,
    MAX_GREETING_QUOTE_LENGTH,
    getGreetingQuoteSlotMeta,
    getGreetingQuoteStatusMeta,
    type EmployeeGreetingQuoteView,
    type GreetingQuoteSlotValue,
    type GreetingQuoteStatusValue,
} from "@/lib/greeting";
import { formatWIBDateTime, isValidCalendarDate, wibDateTimeToDate } from "@/lib/timezone";

interface QuotesListResponse {
    items: EmployeeGreetingQuoteView[];
    counts: Record<"ALL" | GreetingQuoteStatusValue, number>;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

interface GreetingQuotesTabProps {
    onPendingCountChange?: (count: number) => void;
}

function formatShiftDate(wibDate: string): string {
    if (!isValidCalendarDate(wibDate)) return wibDate;
    return formatWIBDateTime(wibDateTimeToDate(wibDate, "00:00:00"), {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function getPreviewHeadline(slot: GreetingQuoteSlotValue, customGreeting: string): string {
    const trimmed = customGreeting.trim();
    if (trimmed) return trimmed;
    switch (slot) {
        case "PAGI":
            return DEFAULT_GREETING_COPY.pagi.greeting;
        case "SIANG":
            return DEFAULT_GREETING_COPY.siang.greeting;
        case "SORE":
            return DEFAULT_GREETING_COPY.sore.greeting;
        case "MALAM":
            return DEFAULT_GREETING_COPY.malam.greeting;
        default:
            return DEFAULT_GREETING_COPY.pagi.greeting;
    }
}

export default function GreetingQuotesTab({ onPendingCountChange }: GreetingQuotesTabProps) {
    const toast = useToast();
    const confirm = useConfirm();
    const abortRef = useRef<AbortController | null>(null);

    const [statusFilter, setStatusFilter] = useState<"ALL" | GreetingQuoteStatusValue>("ALL");
    const [slotFilter, setSlotFilter] = useState<"ALL_SLOTS" | GreetingQuoteSlotValue>("ALL_SLOTS");
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);

    const [data, setData] = useState<QuotesListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    // State modal/sheet kurasi & edit
    const [activeItem, setActiveItem] = useState<EmployeeGreetingQuoteView | null>(null);
    const [draftQuote, setDraftQuote] = useState("");
    const [draftGreeting, setDraftGreeting] = useState("");
    const [draftAuthorName, setDraftAuthorName] = useState("");
    const [draftSlot, setDraftSlot] = useState<GreetingQuoteSlotValue>("ALL");
    const [draftStatus, setDraftStatus] = useState<GreetingQuoteStatusValue>("APPROVED");
    const [savingEdit, setSavingEdit] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearch(search.trim());
        }, 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    const fetchQuotes = useCallback(async () => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        setLoadError(null);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: "15",
            });
            if (statusFilter !== "ALL") params.set("status", statusFilter);
            if (slotFilter !== "ALL_SLOTS") params.set("slot", slotFilter);
            if (debouncedSearch) params.set("search", debouncedSearch);

            const res = await fetch(`/api/ga/greeting-settings/quotes?${params.toString()}`, {
                cache: "no-store",
                signal: controller.signal,
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat quotes karyawan."));
            }
            const json = await res.json();
            if (controller.signal.aborted) return;

            const nextData = json.data as QuotesListResponse;
            setData(nextData);
            if (slotFilter === "ALL_SLOTS" && !debouncedSearch) {
                onPendingCountChange?.(nextData.counts.PENDING);
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            const message = err instanceof Error ? err.message : "Gagal memuat quotes karyawan.";
            setLoadError(message);
            reportClientError("GreetingQuotesTab", "Gagal memuat quotes karyawan", err);
        } finally {
            if (abortRef.current === controller) {
                setLoading(false);
            }
        }
    }, [debouncedSearch, onPendingCountChange, page, slotFilter, statusFilter]);

    useEffect(() => {
        void fetchQuotes();
        return () => abortRef.current?.abort();
    }, [fetchQuotes]);

    const openEditSheet = useCallback((item: EmployeeGreetingQuoteView) => {
        setActiveItem(item);
        setDraftQuote(item.quote);
        setDraftGreeting(item.greeting ?? "");
        setDraftAuthorName(item.authorName ?? "");
        setDraftSlot(item.slot);
        setDraftStatus(item.status === "PENDING" ? "APPROVED" : item.status);
    }, []);

    const closeEditSheet = useCallback(() => {
        if (savingEdit) return;
        setActiveItem(null);
    }, [savingEdit]);

    const quickUpdateStatus = useCallback(
        async (item: EmployeeGreetingQuoteView, nextStatus: GreetingQuoteStatusValue) => {
            if (busyId) return;
            setBusyId(item.id);
            try {
                const res = await fetch(`/api/ga/greeting-settings/quotes/${encodeURIComponent(item.id)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        quote: item.quote,
                        greeting: item.greeting,
                        authorName: item.authorName,
                        slot: item.slot,
                        status: nextStatus,
                    }),
                });
                if (!res.ok) {
                    throw new Error(
                        await getResponseErrorMessage(res, "Gagal memperbarui status quotes.")
                    );
                }
                toast(
                    nextStatus === "APPROVED"
                        ? "Quotes ditampilkan di rotasi beranda karyawan."
                        : "Quotes ditandai tidak ditampilkan.",
                    "success"
                );
                await fetchQuotes();
            } catch (err) {
                const message = err instanceof Error ? err.message : "Gagal memperbarui status quotes.";
                toast(message, "error");
                reportClientError("GreetingQuotesTab", "Gagal mengubah status quotes", err);
            } finally {
                setBusyId(null);
            }
        },
        [busyId, fetchQuotes, toast]
    );

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeItem || savingEdit) return;
        const trimmedQuote = draftQuote.trim();
        if (!trimmedQuote) {
            toast("Teks quotes wajib diisi.", "warning");
            return;
        }

        setSavingEdit(true);
        try {
            const res = await fetch(`/api/ga/greeting-settings/quotes/${encodeURIComponent(activeItem.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    quote: trimmedQuote,
                    greeting: draftGreeting.trim() || null,
                    authorName: draftAuthorName.trim() || null,
                    slot: draftSlot,
                    status: draftStatus,
                }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan perubahan quotes."));
            }
            toast("Kurasi quotes tersimpan.", "success");
            setActiveItem(null);
            await fetchQuotes();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Gagal menyimpan perubahan quotes.";
            toast(message, "error");
            reportClientError("GreetingQuotesTab", "Gagal menyimpan kurasi quotes", err);
        } finally {
            setSavingEdit(false);
        }
    };

    const requestDelete = useCallback(
        (item: EmployeeGreetingQuoteView) => {
            confirm({
                title: "Hapus quotes karyawan?",
                message: `Quotes dari "${item.submitterName}" akan dihapus permanen dan tidak bisa dikembalikan.`,
                confirmLabel: "Hapus",
                variant: "danger",
                onConfirm: async () => {
                    try {
                        const res = await fetch(
                            `/api/ga/greeting-settings/quotes/${encodeURIComponent(item.id)}`,
                            { method: "DELETE" }
                        );
                        if (!res.ok) {
                            throw new Error(
                                await getResponseErrorMessage(res, "Gagal menghapus quotes karyawan.")
                            );
                        }
                        toast("Quotes karyawan dihapus.", "success");
                        await fetchQuotes();
                    } catch (err) {
                        const message = err instanceof Error ? err.message : "Gagal menghapus quotes karyawan.";
                        toast(message, "error");
                        reportClientError("GreetingQuotesTab", "Gagal menghapus quotes", err);
                    }
                },
            });
        },
        [confirm, fetchQuotes, toast]
    );

    const counts = data?.counts ?? { ALL: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 };
    const items = data?.items ?? [];
    const pagination = data?.pagination ?? { page: 1, limit: 15, total: 0, totalPages: 1 };

    const statusTabs: { value: "ALL" | GreetingQuoteStatusValue; label: string }[] = [
        { value: "ALL", label: "Semua" },
        { value: "PENDING", label: "Menunggu" },
        { value: "APPROVED", label: "Ditampilkan" },
        { value: "REJECTED", label: "Tidak Ditampilkan" },
    ];

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--secondary)_45%,transparent)] px-3.5 py-2.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                Quotes kiriman karyawan dari Stressmeter masuk sebagai{" "}
                <strong className="text-[var(--text-primary)]">Menunggu</strong> dan tidak langsung tayang.
                Quotes berstatus <strong className="text-[var(--text-primary)]">Ditampilkan</strong> akan
                berotasi otomatis setiap hari di beranda sesuai slot Pagi, Siang, Sore, Malam, atau Semua Waktu
                saat tidak ada aturan sapaan khusus yang sedang aktif. Perubahan tampil maksimal 60 detik.
            </div>

            {/* ── Filter Bar ──────────────────────────────────────────── */}
            <div className="space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                    {statusTabs.map((tab) => {
                        const active = statusFilter === tab.value;
                        const count = counts[tab.value];
                        return (
                            <button
                                key={tab.value}
                                type="button"
                                onClick={() => {
                                    setStatusFilter(tab.value);
                                    setPage(1);
                                }}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                                    active
                                        ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]"
                                        : "border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--secondary)]"
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span className="rounded-full bg-[var(--secondary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-primary)] tabular-nums">
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-2.5">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            placeholder="Cari quotes, nama pengirim, NIP, atau departemen..."
                            className="form-input pl-8 pr-8 text-xs"
                        />
                        {search && (
                            <button
                                type="button"
                                aria-label="Bersihkan pencarian"
                                onClick={() => {
                                    setSearch("");
                                    setPage(1);
                                }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    <select
                        aria-label="Filter slot waktu"
                        value={slotFilter}
                        onChange={(e) => {
                            setSlotFilter(e.target.value as "ALL_SLOTS" | GreetingQuoteSlotValue);
                            setPage(1);
                        }}
                        className="form-select text-xs"
                    >
                        <option value="ALL_SLOTS">Semua Slot Waktu</option>
                        {GREETING_QUOTE_SLOTS.map((slot) => (
                            <option key={slot.value} value={slot.value}>
                                {slot.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ── List Content ────────────────────────────────────────── */}
            {loading && !data ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
                </div>
            ) : loadError ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-center">
                    <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-[var(--destructive-text)]" />
                    <p className="text-sm text-[var(--destructive-text)]">{loadError}</p>
                    <button
                        type="button"
                        onClick={() => void fetchQuotes()}
                        className="mt-3 text-sm font-semibold text-[var(--primary)] underline"
                    >
                        Coba lagi
                    </button>
                </div>
            ) : items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-center">
                    <Quote className="mx-auto mb-2 h-6 w-6 text-[var(--text-muted)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                        Belum ada quotes karyawan yang sesuai filter.
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Quotes baru akan muncul otomatis saat karyawan menuliskannya setelah mengisi bintang Stressmeter.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {loading && (
                        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Memperbarui daftar...
                        </div>
                    )}

                    {items.map((item) => {
                        const statusMeta = getGreetingQuoteStatusMeta(item.status);
                        const slotMeta = getGreetingQuoteSlotMeta(item.slot);
                        const isBusy = busyId === item.id;

                        return (
                            <article
                                key={item.id}
                                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusMeta.badgeClass}`}
                                        >
                                            {statusMeta.label}
                                        </span>
                                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 px-2 py-0.5 text-[10px] font-semibold">
                                            <Clock className="h-2.5 w-2.5" />
                                            {slotMeta.shortLabel}
                                        </span>
                                    </div>
                                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                                        <CalendarDays className="h-3 w-3" />
                                        {formatShiftDate(item.shiftDate)}
                                    </span>
                                </div>

                                <div className="border-l-2 border-[var(--primary)] pl-3 space-y-0.5">
                                    <p className="text-xs font-semibold italic text-[var(--text-primary)]">
                                        {item.greeting || (
                                            <span className="not-italic font-medium text-[var(--text-muted)]">
                                                Judul otomatis sesuai slot ({slotMeta.shortLabel})
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                                        “{item.quote}”
                                    </p>
                                    {item.authorName ? (
                                        <p className="text-[11px] font-medium text-[var(--text-muted)]">
                                            — {item.authorName}
                                        </p>
                                    ) : (
                                        <p className="text-[11px] italic text-[var(--text-muted)]">
                                            Tanpa nama tampil di beranda
                                        </p>
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border)]/60">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-secondary)]">
                                        <span className="inline-flex items-center gap-1 font-semibold text-[var(--text-primary)]">
                                            <UserRound className="h-3 w-3 text-[var(--text-muted)]" />
                                            {item.submitterName}
                                        </span>
                                        <span className="font-mono text-[10px] text-[var(--text-muted)]">
                                            {item.employeeId}
                                        </span>
                                        <span className="text-[var(--text-muted)]">·</span>
                                        <span>{item.departmentName}</span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {item.status !== "APPROVED" && (
                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => void quickUpdateStatus(item, "APPROVED")}
                                                className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                            >
                                                {isBusy ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Check className="h-3.5 w-3.5" />
                                                )}
                                                Tampilkan
                                            </button>
                                        )}
                                        {item.status !== "REJECTED" && (
                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => void quickUpdateStatus(item, "REJECTED")}
                                                className="btn btn-sm border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-50"
                                            >
                                                {isBusy ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <EyeOff className="h-3.5 w-3.5" />
                                                )}
                                                {item.status === "APPROVED" ? "Sembunyikan" : "Tidak Tampilkan"}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => openEditSheet(item)}
                                            className="btn btn-sm border border-[var(--border)] text-[var(--text-secondary)]"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                            Olah
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => requestDelete(item)}
                                            className="btn btn-sm border border-[var(--destructive)]/40 text-[var(--destructive-text)]"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            Hapus
                                        </button>
                                    </div>
                                </div>
                            </article>
                        );
                    })}

                    {pagination.totalPages > 1 && (
                        <div className="flex items-center justify-between gap-2 pt-2 text-xs text-[var(--text-secondary)]">
                            <span>
                                Halaman {pagination.page} dari {pagination.totalPages} ({pagination.total} quotes)
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    disabled={pagination.page <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className="btn btn-sm border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-40"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                    Sebelumnya
                                </button>
                                <button
                                    type="button"
                                    disabled={pagination.page >= pagination.totalPages}
                                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                                    className="btn btn-sm border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-40"
                                >
                                    Berikutnya
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Sheet Kurasi & Olah Quotes ──────────────────────────── */}
            <ResponsiveSheet
                isOpen={Boolean(activeItem)}
                onClose={closeEditSheet}
                title="Olah & Kurasi Quotes Karyawan"
                description={
                    activeItem
                        ? `Dikirim oleh ${activeItem.submitterName} (${activeItem.employeeId}) · ${activeItem.departmentName}`
                        : undefined
                }
                size="lg"
                disableClose={savingEdit}
                closeLabel="Tutup kurasi"
                footer={
                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={closeEditSheet}
                            disabled={savingEdit}
                            className="btn btn-secondary min-h-[42px] px-4"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            form="greeting-quote-curate-form"
                            disabled={savingEdit || !draftQuote.trim()}
                            className="btn btn-primary min-h-[42px] px-4 inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {savingEdit ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            Simpan Kurasi
                        </button>
                    </div>
                }
            >
                <form id="greeting-quote-curate-form" onSubmit={handleSaveEdit} className="space-y-4">
                    {/* Pratinjau mini tampilan beranda */}
                    <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--secondary)_40%,transparent)] p-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                            Pratinjau di Beranda Karyawan
                        </p>
                        <figure className="border-l-2 border-[var(--primary)] pl-3 py-0.5">
                            <blockquote className="text-[13px] font-semibold italic leading-snug text-[var(--text-primary)]">
                                {getPreviewHeadline(draftSlot, draftGreeting)}
                            </blockquote>
                            <figcaption className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                                {draftQuote.trim() || "Teks quotes akan tampil di sini."}
                            </figcaption>
                            {draftAuthorName.trim() && (
                                <p className="text-[11px] font-medium text-[var(--text-muted)] mt-1">
                                    — {draftAuthorName.trim()}
                                </p>
                            )}
                        </figure>
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="curate-quote-text">
                            Teks quotes
                        </label>
                        <textarea
                            id="curate-quote-text"
                            rows={3}
                            maxLength={MAX_GREETING_QUOTE_LENGTH}
                            value={draftQuote}
                            onChange={(e) => setDraftQuote(e.target.value)}
                            className="form-input resize-y"
                        />
                        <p className="mt-1 text-right text-[10px] text-[var(--text-muted)]">
                            {draftQuote.length}/{MAX_GREETING_QUOTE_LENGTH}
                        </p>
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="curate-quote-greeting">
                            Judul sapaan (opsional)
                        </label>
                        <input
                            id="curate-quote-greeting"
                            type="text"
                            maxLength={MAX_GREETING_LENGTH}
                            value={draftGreeting}
                            onChange={(e) => setDraftGreeting(e.target.value)}
                            placeholder="Kosongkan untuk otomatis: Selamat Pagi/Siang/Sore/Malam!"
                            className="form-input"
                        />
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="curate-quote-author">
                            Nama tampil di beranda (opsional)
                        </label>
                        <input
                            id="curate-quote-author"
                            type="text"
                            maxLength={MAX_GREETING_AUTHOR_LENGTH}
                            value={draftAuthorName}
                            onChange={(e) => setDraftAuthorName(e.target.value)}
                            placeholder="Kosongkan bila tidak ingin menampilkan nama pengirim"
                            className="form-input"
                        />
                        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                            Terisi otomatis dari nama karyawan pengirim. Kosongkan jika ingin tampil tanpa nama.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="curate-quote-slot">
                                Slot waktu tampil
                            </label>
                            <select
                                id="curate-quote-slot"
                                value={draftSlot}
                                onChange={(e) => setDraftSlot(e.target.value as GreetingQuoteSlotValue)}
                                className="form-select"
                            >
                                {GREETING_QUOTE_SLOTS.map((slot) => (
                                    <option key={slot.value} value={slot.value}>
                                        {slot.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="curate-quote-status">
                                Status kurasi
                            </label>
                            <select
                                id="curate-quote-status"
                                value={draftStatus}
                                onChange={(e) => setDraftStatus(e.target.value as GreetingQuoteStatusValue)}
                                className="form-select"
                            >
                                {GREETING_QUOTE_STATUSES.map((status) => (
                                    <option key={status.value} value={status.value}>
                                        {status.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </form>
            </ResponsiveSheet>
        </div>
    );
}
