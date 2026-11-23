"use client";

import { useEffect, useState } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    HeartHandshake,
    Loader2,
    Send,
    ShieldCheck,
    Star,
} from "lucide-react";
import ResponsiveSheet from "@/components/ui/ResponsiveSheet";
import AnonymousShareForm from "@/components/employee/AnonymousShareForm";
import { useToast } from "@/components/Toast";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import { STRESSMETER_SCALE, getStressmeterScale } from "@/lib/stressmeterConstants";

type SheetStep = "rating" | "after" | "anonymous" | "anonymous-done";

export interface StressmeterCheckinSheetProps {
    isOpen: boolean;
    onClose: () => void;
    shiftDate?: string;
    timePeriodLabel?: string;
    initialStep?: "rating" | "anonymous";
    onCompleted?: () => void;
}

export default function StressmeterCheckinSheet({
    isOpen,
    onClose,
    shiftDate,
    timePeriodLabel = "hari ini",
    initialStep = "rating",
    onCompleted,
}: StressmeterCheckinSheetProps) {
    const toast = useToast();
    const [step, setStep] = useState<SheetStep>(initialStep);
    const [selectedRating, setSelectedRating] = useState<number | null>(null);
    const [hoveredRating, setHoveredRating] = useState<number | null>(null);
    const [wasSkipped, setWasSkipped] = useState(false);
    const [submittingCheckin, setSubmittingCheckin] = useState(false);
    const [submittingAnon, setSubmittingAnon] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setStep(initialStep);
        setSelectedRating(null);
        setHoveredRating(null);
        setWasSkipped(false);
        setSubmittingCheckin(false);
        setSubmittingAnon(false);
    }, [isOpen, initialStep]);

    const activePreviewRating = hoveredRating ?? selectedRating;
    const activeScale = getStressmeterScale(activePreviewRating);

    const submitCheckin = async (skipped: boolean) => {
        if (submittingCheckin || !shiftDate) return;
        if (!skipped && !selectedRating) {
            toast("Pilih 1 sampai 5 bintang terlebih dahulu, atau klik Lewati.", "warning");
            return;
        }

        setSubmittingCheckin(true);
        try {
            const res = await fetch("/api/employee/stressmeter/checkin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    skipped
                        ? { shiftDate, skipped: true }
                        : { shiftDate, skipped: false, rating: selectedRating }
                ),
            });
            if (!res.ok) {
                throw new Error(
                    await getResponseErrorMessage(res, "Gagal menyimpan respons perasaan Anda.")
                );
            }
            setWasSkipped(skipped);
            setStep("after");
            onCompleted?.();
        } catch (err) {
            const msg = getFriendlyClientErrorMessage(
                err,
                "Gagal menyimpan respons. Periksa koneksi Anda lalu coba lagi."
            );
            toast(msg, "error");
            reportClientError("StressmeterCheckinSheet", msg, err);
        } finally {
            setSubmittingCheckin(false);
        }
    };

    const isBusy = submittingCheckin || submittingAnon;

    const sheetTitle =
        step === "rating"
            ? `Hai, mau sharing perasaanmu ${timePeriodLabel}?`
            : step === "after"
                ? "Terima Kasih"
                : step === "anonymous"
                    ? "Ruang Sharing Anonim"
                    : "Pesan Terkirim";

    const sheetDescription =
        step === "rating"
            ? "Opsional aja ya, hanya butuh 5 detik."
            : step === "after"
                ? "Masukan Anda sangat berarti bagi kami."
                : step === "anonymous"
                    ? "Sampaikan cerita atau masukan secara aman tanpa identitas."
                    : "Terima kasih telah berbagi bersama tim HR.";

    const footer =
        step === "rating" ? (
            <div className="flex items-center gap-2.5">
                <button
                    type="button"
                    onClick={() => void submitCheckin(true)}
                    disabled={submittingCheckin}
                    className="btn btn-secondary flex-1 min-h-[44px]"
                >
                    {submittingCheckin && !selectedRating ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    ) : (
                        "Lewati"
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => void submitCheckin(false)}
                    disabled={submittingCheckin || !selectedRating}
                    className="btn btn-primary flex-[1.5] min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {submittingCheckin && selectedRating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    {submittingCheckin && selectedRating ? "Menyimpan..." : "Kirim"}
                </button>
            </div>
        ) : step === "after" ? (
            <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary w-full min-h-[44px]"
            >
                Selesai
            </button>
        ) : step === "anonymous" ? (
            <div className="flex items-center gap-2.5">
                <button
                    type="button"
                    onClick={() =>
                        initialStep === "rating" ? setStep("after") : onClose()
                    }
                    disabled={submittingAnon}
                    className="btn btn-secondary flex items-center justify-center gap-1.5 min-h-[44px] px-4"
                >
                    {initialStep === "rating" && <ArrowLeft className="w-4 h-4" />}
                    {initialStep === "rating" ? "Kembali" : "Batal"}
                </button>
                <button
                    type="submit"
                    form="stressmeter-sheet-anon-form"
                    disabled={submittingAnon}
                    className="btn btn-primary flex-1 min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {submittingAnon ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Send className="w-4 h-4" />
                    )}
                    {submittingAnon ? "Mengirim..." : "Kirim secara Anonim"}
                </button>
            </div>
        ) : (
            <button
                type="button"
                onClick={onClose}
                className="btn btn-primary w-full min-h-[44px]"
            >
                Tutup
            </button>
        );

    return (
        <ResponsiveSheet
            isOpen={isOpen}
            onClose={onClose}
            title={sheetTitle}
            description={sheetDescription}
            size="lg"
            closeOnBackdrop={step === "after" || step === "anonymous-done"}
            disableClose={isBusy}
            closeLabel="Tutup jendela"
            footer={footer}
        >
            {/* ── STEP 1: PILIH RATING BINTANG 1–5 ─────────────────── */}
            {step === "rating" && (
                <div className="space-y-5 py-1">
                    {/* 5 Bintang Interaktif */}
                    <div className="flex flex-col items-center gap-3">
                        <div
                            className="flex items-center justify-center gap-2 sm:gap-3"
                            role="group"
                            aria-label="Penilaian perasaan 1 sampai 5 bintang"
                        >
                            {STRESSMETER_SCALE.map((item) => {
                                const filled =
                                    activePreviewRating !== null &&
                                    item.rating <= activePreviewRating;
                                const isChosen = selectedRating === item.rating;
                                return (
                                    <button
                                        key={item.rating}
                                        type="button"
                                        onClick={() => setSelectedRating(item.rating)}
                                        onMouseEnter={() => setHoveredRating(item.rating)}
                                        onMouseLeave={() => setHoveredRating(null)}
                                        aria-label={`${item.rating} bintang: ${item.label}`}
                                        aria-pressed={isChosen}
                                        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl border flex items-center justify-center transition-all active:scale-95 ${
                                            isChosen
                                                ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40 shadow-sm scale-105"
                                                : filled
                                                    ? "border-amber-300/70 bg-amber-50/50 dark:bg-amber-950/20"
                                                    : "border-[var(--border)] bg-[var(--secondary)]/40 hover:border-amber-300"
                                        }`}
                                    >
                                        <Star
                                            className={`w-7 h-7 sm:w-8 sm:h-8 transition-colors ${
                                                filled
                                                    ? "fill-amber-400 text-amber-400"
                                                    : "text-[var(--text-muted)]"
                                            }`}
                                        />
                                    </button>
                                );
                            })}
                        </div>

                        <div className="min-h-[28px] flex items-center justify-center" aria-live="polite">
                            {activeScale ? (
                                <span
                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${activeScale.badgeClass}`}
                                >
                                    {activeScale.rating} Bintang · {activeScale.label}
                                </span>
                            ) : (
                                <span className="text-xs text-[var(--text-muted)]">
                                    Ketuk bintang untuk memilih perasaanmu
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Daftar Keterangan Skala (juga bisa diklik langsung) */}
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/30 divide-y divide-[var(--border)]/60 overflow-hidden">
                        {STRESSMETER_SCALE.map((item) => {
                            const isChosen = selectedRating === item.rating;
                            return (
                                <button
                                    key={item.rating}
                                    type="button"
                                    onClick={() => setSelectedRating(item.rating)}
                                    className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs transition-colors ${
                                        isChosen
                                            ? "bg-[var(--primary)]/10 font-bold text-[var(--text-primary)]"
                                            : "text-[var(--text-secondary)] hover:bg-[var(--secondary)]/60"
                                    }`}
                                >
                                    <span className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-0.5 text-amber-500 font-semibold w-10">
                                            {item.rating}
                                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                        </span>
                                        <span>{item.label}</span>
                                    </span>
                                    {isChosen && (
                                        <span className="text-[11px] font-semibold text-[var(--primary)]">
                                            Dipilih
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── STEP 2: AFTER PENGISIAN ──────────────────────────── */}
            {step === "after" && (
                <div className="space-y-5 py-2 text-center">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <HeartHandshake className="w-7 h-7" />
                    </div>
                    <div className="space-y-1.5">
                        <h3 className="text-base font-bold text-[var(--text-primary)]">
                            {wasSkipped
                                ? "Tidak masalah, semoga harimu tetap lancar ya."
                                : "Thank you sudah mengisi, semoga harimu lebih baik yaa."}
                        </h3>
                        <p className="text-xs text-[var(--text-muted)] leading-relaxed max-w-sm mx-auto">
                            {wasSkipped
                                ? "Kapan pun kamu ingin bercerita, ruang sharing anonim selalu terbuka untukmu."
                                : "Jika ada hal yang mengganjal atau ingin disampaikan ke tim HR, kamu bisa bercerita secara anonim."}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/40 p-4 text-left space-y-3">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center shrink-0">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-[var(--text-primary)]">
                                    Perlu Sharing Lebih Lanjut?
                                </p>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                                    Identitas akun Anda tidak disimpan sama sekali. Pesan hanya dibaca oleh tim HR.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setStep("anonymous")}
                            className="btn btn-primary w-full text-xs font-semibold min-h-[42px]"
                        >
                            Share secara anonim di sini
                        </button>
                    </div>
                </div>
            )}

            {/* ── STEP 3: FORM CURHAT ANONIM ───────────────────────── */}
            {step === "anonymous" && (
                <AnonymousShareForm
                    formId="stressmeter-sheet-anon-form"
                    hideSubmitButton
                    onSubmittingChange={setSubmittingAnon}
                    onSuccess={() => setStep("anonymous-done")}
                />
            )}

            {/* ── STEP 4: KONFIRMASI CURHAT ANONIM TERKIRIM ────────── */}
            {step === "anonymous-done" && (
                <div className="py-4 text-center space-y-3">
                    <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">
                        Pesan Anonim Anda Sudah Diterima
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-sm mx-auto">
                        Terima kasih sudah berani bercerita. Pesan telah masuk ke kotak anonim HR tanpa nama dan tanpa identitas akun Anda.
                    </p>
                </div>
            )}
        </ResponsiveSheet>
    );
}
