"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Send, ShieldCheck, UserCheck } from "lucide-react";
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

export interface AnonymousShareSubmitResult {
    includedSenderName: boolean;
}

interface AnonymousShareFormProps {
    formId?: string;
    hideSubmitButton?: boolean;
    onSuccess?: (result: AnonymousShareSubmitResult) => void;
    onSubmittingChange?: (submitting: boolean) => void;
    onValidChange?: (valid: boolean) => void;
    onIncludeNameChange?: (includeName: boolean) => void;
}

export default function AnonymousShareForm({
    formId = "anonymous-share-form",
    hideSubmitButton = false,
    onSuccess,
    onSubmittingChange,
    onValidChange,
    onIncludeNameChange,
}: AnonymousShareFormProps) {
    const toast = useToast();
    const [topic, setTopic] = useState<StressmeterTopicValue>("OTHER");
    const [message, setMessage] = useState("");
    const [includeSenderName, setIncludeSenderName] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [lastSentWithName, setLastSentWithName] = useState(false);

    const trimmedLength = message.trim().length;
    const isValid = trimmedLength >= 10 && trimmedLength <= 2000;

    useEffect(() => {
        onValidChange?.(isValid);
    }, [isValid, onValidChange]);

    useEffect(() => {
        onIncludeNameChange?.(includeSenderName);
    }, [includeSenderName, onIncludeNameChange]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        if (trimmedLength < 10) {
            toast("Tuliskan minimal 10 karakter agar HR dapat memahami masukan Anda.", "warning");
            return;
        }

        const sentWithName = includeSenderName;
        setSubmitting(true);
        onSubmittingChange?.(true);
        try {
            const res = await fetch("/api/employee/stressmeter/anonymous-share", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic,
                    message: message.trim(),
                    includeSenderName: sentWithName,
                }),
            });
            if (!res.ok) {
                throw new Error(
                    await getResponseErrorMessage(res, "Gagal mengirim pesan.")
                );
            }
            setLastSentWithName(sentWithName);
            setSubmitted(true);
            setMessage("");
            setTopic("OTHER");
            setIncludeSenderName(false);
            onSuccess?.({ includedSenderName: sentWithName });
        } catch (err) {
            const msg = getFriendlyClientErrorMessage(
                err,
                "Gagal mengirim pesan. Periksa koneksi Anda lalu coba lagi."
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
                        {lastSentWithName ? "Pesan Terkirim" : "Pesan Anonim Terkirim"}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {lastSentWithName
                            ? "Terima kasih sudah berbagi. Pesan beserta nama lengkap Anda telah diteruskan ke tim HR."
                            : "Terima kasih sudah berbagi. Pesan Anda telah diteruskan ke tim HR tanpa menyimpan identitas pengirim."}
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
            <div
                aria-live="polite"
                className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs transition-colors ${
                    includeSenderName
                        ? "border-sky-200 dark:border-sky-900/60 bg-sky-50/70 dark:bg-sky-950/30 text-sky-800 dark:text-sky-300"
                        : "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
                }`}
            >
                {includeSenderName ? (
                    <UserCheck className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <p className="leading-relaxed">
                    {includeSenderName ? (
                        <>
                            <strong>Dengan nama lengkap.</strong> Nama lengkap akun Anda akan ditampilkan pada pesan ini agar tim HR dapat menindaklanjuti secara langsung.
                        </>
                    ) : (
                        <>
                            <strong>100% Anonim.</strong> Identitas akun dan jam kirim Anda tidak disimpan. HR hanya melihat kategori topik, tanggal, dan isi pesan.
                        </>
                    )}
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

            <label
                htmlFor={`${formId}-include-name`}
                className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 cursor-pointer transition-colors select-none ${
                    includeSenderName
                        ? "border-sky-300 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30"
                        : "border-[var(--border)] bg-[var(--secondary)]/35 hover:border-[var(--primary)]/40"
                }`}
            >
                <input
                    id={`${formId}-include-name`}
                    type="checkbox"
                    checked={includeSenderName}
                    onChange={(e) => setIncludeSenderName(e.target.checked)}
                    disabled={submitting}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/30 shrink-0 cursor-pointer accent-[var(--primary)]"
                />
                <span className="space-y-0.5 min-w-0">
                    <span className="block text-xs font-semibold text-[var(--text-primary)] leading-snug">
                        Sertakan nama lengkap saya (tidak anonim)
                    </span>
                    <span className="block text-[11px] text-[var(--text-muted)] leading-relaxed">
                        Cocok jika Anda ingin tim HR menindaklanjuti atau menghubungi langsung.
                    </span>
                </span>
            </label>

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
                    {submitting
                        ? "Mengirim..."
                        : includeSenderName
                            ? "Kirim dengan Nama"
                            : "Kirim secara Anonim"}
                </button>
            )}
        </form>
    );
}
