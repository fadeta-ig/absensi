"use client";

import { memo, useState } from "react";
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    ClipboardEdit,
    Loader2,
    MessageSquareHeart,
    ShieldCheck,
    UserRound,
} from "lucide-react";
import ResponsiveSheet from "@/components/ui/ResponsiveSheet";
import { useToast } from "@/components/Toast";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import {
    ANONYMOUS_SHARE_STATUSES,
    STRESSMETER_TOPICS,
    getAnonymousShareStatusMeta,
    getStressmeterTopicLabel,
    type AnonymousShareStatusValue,
} from "@/lib/stressmeterConstants";
import {
    formatStressmeterDate,
    type AnonymousShareItem,
    type AnonymousSharesData,
} from "@/components/stressmeter/types";

interface AnonymousSharesTabProps {
    data: AnonymousSharesData | null;
    loading: boolean;
    statusFilter: string;
    onStatusFilterChange: (val: string) => void;
    topicFilter: string;
    onTopicFilterChange: (val: string) => void;
    identityFilter: string;
    onIdentityFilterChange: (val: string) => void;
    onPageChange: (page: number) => void;
    onUpdated: () => Promise<void>;
}

function AnonymousSharesTab({
    data,
    loading,
    statusFilter,
    onStatusFilterChange,
    topicFilter,
    onTopicFilterChange,
    identityFilter,
    onIdentityFilterChange,
    onPageChange,
    onUpdated,
}: AnonymousSharesTabProps) {
    const toast = useToast();
    const [activeItem, setActiveItem] = useState<AnonymousShareItem | null>(null);
    const [draftStatus, setDraftStatus] = useState<AnonymousShareStatusValue>("READ");
    const [draftNote, setDraftNote] = useState("");
    const [saving, setSaving] = useState(false);

    const openReviewSheet = (item: AnonymousShareItem) => {
        setActiveItem(item);
        setDraftStatus(item.status === "NEW" ? "READ" : item.status);
        setDraftNote(item.hrNote ?? "");
    };

    const handleSaveReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeItem || saving) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/stressmeter/shares/${encodeURIComponent(activeItem.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: draftStatus,
                    hrNote: draftNote.trim() || null,
                }),
            });
            if (!res.ok) {
                throw new Error(
                    await getResponseErrorMessage(res, "Gagal memperbarui status curhat anonim.")
                );
            }
            toast("Status tindak lanjut diperbarui.", "success");
            setActiveItem(null);
            await onUpdated();
        } catch (err) {
            const msg = getFriendlyClientErrorMessage(
                err,
                "Gagal menyimpan tindak lanjut. Periksa koneksi Anda lalu coba lagi."
            );
            toast(msg, "error");
            reportClientError("AnonymousSharesTab", msg, err);
        } finally {
            setSaving(false);
        }
    };

    const counts = data?.counts ?? { ALL: 0, NEW: 0, READ: 0, FOLLOWED_UP: 0 };

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/25 px-4 py-3 text-xs text-emerald-800 dark:text-emerald-300">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                    Pesan bawaan bersifat <strong>100% anonim</strong> tanpa identitas dan tanpa jam kirim presisi. Nama lengkap hanya tampil jika karyawan secara sadar mencentang opsi sertakan nama. Catatan tindak lanjut hanya terlihat oleh tim HR.
                </p>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                <div className="inline-flex flex-wrap rounded-md border border-border bg-muted/40 p-0.5 text-xs">
                    {(
                        [
                            ["ALL", `Semua (${counts.ALL})`],
                            ["NEW", `Baru (${counts.NEW})`],
                            ["READ", `Dibaca (${counts.READ})`],
                            ["FOLLOWED_UP", `Ditindaklanjuti (${counts.FOLLOWED_UP})`],
                        ] as Array<[string, string]>
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onStatusFilterChange(key)}
                            className={`px-2.5 py-1.5 rounded font-medium min-h-[32px] transition-colors ${
                                statusFilter === key
                                    ? "bg-background text-primary shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                    <select
                        aria-label="Filter identitas pengirim"
                        value={identityFilter}
                        onChange={(e) => onIdentityFilterChange(e.target.value)}
                        className="px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-44"
                    >
                        <option value="ALL">Semua Pengirim</option>
                        <option value="ANONYMOUS">Anonim</option>
                        <option value="NAMED">Dengan Nama</option>
                    </select>

                    <select
                        aria-label="Filter kategori topik"
                        value={topicFilter}
                        onChange={(e) => onTopicFilterChange(e.target.value)}
                        className="px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-52"
                    >
                        <option value="ALL">Semua Kategori Topik</option>
                        {STRESSMETER_TOPICS.map((t) => (
                            <option key={t.value} value={t.value}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Daftar Pesan */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            ) : !data || data.items.length === 0 ? (
                <div className="bg-card border border-dashed border-border rounded-xl py-12 text-center space-y-1.5">
                    <MessageSquareHeart className="w-7 h-7 text-muted-foreground mx-auto opacity-60" />
                    <p className="text-sm font-medium text-foreground">
                        Belum ada pesan pada filter ini.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Pesan dari pop-up pasca Clock In maupun menu Ruang Sharing Anonim akan muncul di sini.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {data.items.map((item) => {
                        const statusMeta = getAnonymousShareStatusMeta(item.status);
                        return (
                            <article
                                key={item.id}
                                className="bg-card border border-border rounded-xl p-4 space-y-3"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                                            <CalendarDays className="w-3.5 h-3.5" />
                                            {formatStressmeterDate(item.submittedWibDate)}
                                        </span>
                                        {item.senderName ? (
                                            <span
                                                title="Pengirim menyertakan nama lengkap"
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold border bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800"
                                            >
                                                <UserRound className="w-3 h-3 shrink-0" />
                                                {item.senderName}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium border bg-emerald-50/80 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/70">
                                                <ShieldCheck className="w-3 h-3 shrink-0" />
                                                Anonim
                                            </span>
                                        )}
                                        <span className="px-2 py-0.5 rounded-full bg-muted text-foreground font-medium">
                                            {getStressmeterTopicLabel(item.topic)}
                                        </span>
                                        <span
                                            className={`px-2 py-0.5 rounded-full font-semibold border ${statusMeta.badgeClass}`}
                                        >
                                            {statusMeta.label}
                                        </span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => openReviewSheet(item)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted min-h-[34px]"
                                    >
                                        <ClipboardEdit className="w-3.5 h-3.5" />
                                        Kelola Tindak Lanjut
                                    </button>
                                </div>

                                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                    {item.message}
                                </p>

                                {item.hrNote && (
                                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
                                        <span className="font-semibold text-muted-foreground">
                                            Catatan Internal HR
                                        </span>
                                        <p className="text-foreground whitespace-pre-wrap">
                                            {item.hrNote}
                                        </p>
                                    </div>
                                )}
                            </article>
                        );
                    })}

                    {data.pagination.totalPages > 1 && (
                        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                            <span>
                                Halaman {data.pagination.page} dari {data.pagination.totalPages} (
                                {data.pagination.total} pesan)
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    disabled={data.pagination.page <= 1}
                                    onClick={() => onPageChange(data.pagination.page - 1)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40"
                                >
                                    <ChevronLeft className="w-3.5 h-3.5" />
                                    Sebelumnya
                                </button>
                                <button
                                    type="button"
                                    disabled={data.pagination.page >= data.pagination.totalPages}
                                    onClick={() => onPageChange(data.pagination.page + 1)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40"
                                >
                                    Berikutnya
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ResponsiveSheet Kelola Tindak Lanjut */}
            <ResponsiveSheet
                isOpen={Boolean(activeItem)}
                onClose={() => {
                    if (!saving) setActiveItem(null);
                }}
                title="Kelola Tindak Lanjut"
                description={
                    activeItem
                        ? `${activeItem.senderName ?? "Anonim"} · ${getStressmeterTopicLabel(
                              activeItem.topic
                          )} · ${formatStressmeterDate(activeItem.submittedWibDate)}`
                        : undefined
                }
                size="lg"
                disableClose={saving}
                footer={
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveItem(null)}
                            disabled={saving}
                            className="btn btn-secondary min-h-[42px]"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            form="hr-share-review-form"
                            disabled={saving}
                            className="btn btn-primary min-h-[42px] inline-flex items-center gap-1.5"
                        >
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                            {saving ? "Menyimpan..." : "Simpan Status"}
                        </button>
                    </div>
                }
            >
                {activeItem && (
                    <form
                        id="hr-share-review-form"
                        onSubmit={(e) => void handleSaveReview(e)}
                        className="space-y-4"
                    >
                        <div className="rounded-xl border border-border bg-muted/25 p-3.5 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                            {activeItem.message}
                        </div>

                        <div className="space-y-1.5">
                            <label
                                htmlFor="hr-share-status"
                                className="block text-xs font-semibold text-foreground"
                            >
                                Status Tindak Lanjut
                            </label>
                            <select
                                id="hr-share-status"
                                value={draftStatus}
                                onChange={(e) =>
                                    setDraftStatus(e.target.value as AnonymousShareStatusValue)
                                }
                                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                            >
                                {ANONYMOUS_SHARE_STATUSES.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label
                                htmlFor="hr-share-note"
                                className="block text-xs font-semibold text-foreground"
                            >
                                Catatan Internal HR (Opsional)
                            </label>
                            <textarea
                                id="hr-share-note"
                                rows={4}
                                maxLength={1000}
                                value={draftNote}
                                onChange={(e) => setDraftNote(e.target.value)}
                                placeholder="Contoh: Sudah dibahas pada evaluasi mingguan departemen terkait."
                                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
                            />
                        </div>
                    </form>
                )}
            </ResponsiveSheet>
        </div>
    );
}

export default memo(AnonymousSharesTab);
