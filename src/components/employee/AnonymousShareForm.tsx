"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/Toast";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import {
    STRESSMETER_TOPICS,
    type StressmeterTopicValue,
} from "@/lib/stressmeterConstants";

interface AnonymousShareFormProps {
    formId?: string;
    hideSubmitButton?: boolean;
    onSuccess?: () => void;
    onSubmittingChange?: (submitting: boolean) => void;
}

export default function AnonymousShareForm({
    formId = "anonymous-share-form",
    hideSubmitButton = false,
    onSuccess,
    onSubmittingChange,
}: AnonymousShareFormProps) {
    const toast = useToast();
    const [topic, setTopic] = useState<StressmeterTopicValue>("OTHER");
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const trimmedLength = message.trim().length;
    const isValid = trimmedLength >= 10 && trimmedLength <= 2000;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        if (trimmedLength < 10) {
            toast("Tuliskan minimal 10 karakter agar HR dapat memahami masukan Anda.", "warning");
            return;
        }

        setSubmitting(true);
        onSubmittingChange?.(true);
        try {
            const res = await fetch("/api/employee/stressmeter/anonymous-share", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic, message: message.trim() }),
            });
            if (!res.ok) {
                throw new Error(
                    await getResponseErrorMessage(res, "Gagal mengirim pesan anonim.")
                );
            }
            setSubmitted(true);
            setMessage("");
            setTopic("OTHER");
            onSuccess?.();
        } catch (err) {
            const msg = getFriendlyClientErrorMessage(
                err,
                "Gagal mengirim pesan anonim. Periksa koneksi Anda lalu coba lagi."
            );
            toast(msg, "error");
            reportClientError("AnonymousShareForm", msg, err);
        } finally {
            setSubmitting(false);
            onSubmittingChange?.(false);
        }
    };

    if (submitted && !onSuccess) {
        return (
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/25 p-5 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        Pesan Anonim Terkirim
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        Terima kasih sudah berbagi. Pesan Anda telah diteruskan ke tim HR tanpa menyimpan identitas pengirim.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="btn btn-secondary text-xs"
                >
                    Kirim Pesan Lainnya
                </button>
            </div>
        );
    }

    return (
        <form id={formId} onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                    <strong>100% Anonim.</strong> Nama, NIP, departemen, dan jam kirim Anda tidak disimpan. HR hanya melihat kategori topik, tanggal, dan isi pesan.
                </p>
            </div>

            <div className="space-y-2">
                <span className="block text-xs font-semibold text-[var(--text-primary)]">
                    Kategori Topik (Opsional)
                </span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kategori topik">
                    {STRESSMETER_TOPICS.map((item) => {
                        const active = topic === item.value;
                        return (
                            <button
                                key={item.value}
                                type="button"
                                onClick={() => setTopic(item.value)}
                                aria-pressed={active}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors min-h-[34px] ${
                                    active
                                        ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                                        : "bg-[var(--secondary)]/60 text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]/40"
                                }`}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-1.5">
                <label
                    htmlFor={`${formId}-message`}
                    className="block text-xs font-semibold text-[var(--text-primary)]"
                >
                    Ceritakan hal yang ingin Anda sampaikan
                </label>
                <textarea
                    id={`${formId}-message`}
                    rows={5}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={2000}
                    placeholder="Tuliskan cerita, kendala kerja, atau saran yang ingin Anda bagikan secara aman..."
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 resize-y"
                />
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span>Minimal 10 karakter</span>
                    <span className="tabular-nums">{message.length}/2000</span>
                </div>
            </div>

            {!hideSubmitButton && (
                <button
                    type="submit"
                    disabled={submitting || !isValid}
                    className="btn btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Send className="w-4 h-4" />
                    )}
                    {submitting ? "Mengirim..." : "Kirim secara Anonim"}
                </button>
            )}
        </form>
    );
}
