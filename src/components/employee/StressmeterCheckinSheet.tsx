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
    const [submittingAction, setSubmittingAction] = useState<"rating" | "skip" | null>(null);
    const [submittingAnon, setSubmittingAnon] = useState(false);
    const [anonValid, setAnonValid] = useState(false);
    const [includeSenderName, setIncludeSenderName] = useState(false);
    const [sentWithName, setSentWithName] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setStep(initialStep);
        setSelectedRating(null);
        setHoveredRating(null);
        setWasSkipped(false);
        setSubmittingAction(null);
        setSubmittingAnon(false);
        setAnonValid(false);
        setIncludeSenderName(false);
        setSentWithName(false);
    }, [isOpen, initialStep]);

    const activePreviewRating = hoveredRating ?? selectedRating;
    const activeScale = getStressmeterScale(activePreviewRating);
    const submittingCheckin = submittingAction !== null;

    const submitCheckin = async (skipped: boolean) => {
        if (submittingAction !== null || !shiftDate) return;
        if (!skipped && !selectedRating) {
            toast("Pilih 1 sampai 5 bintang terlebih dahulu, atau klik Lewati.", "warning");
            return;
        }

        setSubmittingAction(skipped ? "skip" : "rating");
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
            setSubmittingAction(null);
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
                    ? includeSenderName
                        ? "Pesan akan dikirim beserta nama lengkap Anda ke tim HR."
                        : "Sampaikan cerita atau masukan secara aman tanpa identitas."
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
                    {submittingAction === "skip" ? (
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
                    {submittingAction === "rating" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    {submittingAction === "rating" ? "Menyimpan..." : "Kirim"}
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
                    onClick={() => {
                        if (initialStep === "rating") {
                            setIncludeSenderName(false);
                            setStep("after");
                        } else {
                            onClose();
                        }
                    }}
                    disabled={submittingAnon}
                    className="btn btn-secondary flex items-center justify-center gap-1.5 min-h-[44px] px-4"
                >
                    {initialStep === "rating" && <ArrowLeft className="w-4 h-4" />}
                    {initialStep === "rating" ? "Kembali" : "Batal"}
                </button>
                <button
                    type="submit"
                    form="stressmeter-sheet-anon-form"
                    disabled={submittingAnon || !anonValid}
                    className="btn btn-primary flex-1 min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {submittingAnon ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Send className="w-4 h-4" />
                    )}
                    {submittingAnon
                        ? "Mengirim..."
                        : includeSenderName
                            ? "Kirim dengan Nama"
                            : "Kirim secara Anonim"}
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
                <div className="py-6 flex flex-col items-center gap-4">
                    <div
                        className="flex items-center justify-center gap-1.5 sm:gap-2.5"
                        role="group"
                        aria-label="Penilaian perasaan 1 sampai 5 bintang"
                        onMouseLeave={() => setHoveredRating(null)}
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
                                    onFocus={() => setHoveredRating(item.rating)}
                                    onBlur={() => setHoveredRating(null)}
                                    aria-label={`${item.rating} bintang: ${item.label}`}
                                    aria-pressed={isChosen}
                                    className="group min-w-[48px] min-h-[48px] p-1.5 rounded-full flex items-center justify-center transition-transform duration-150 hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                                >
                                    <Star
                                        className={`w-10 h-10 sm:w-11 sm:h-11 transition-all duration-150 ${
                                            filled
                                                ? "fill-amber-400 text-amber-400 drop-shadow-[0_2px_6px_rgba(251,191,36,0.35)]"
                                                : "text-[var(--border)] group-hover:text-amber-300"
                                        }`}
                                    />
                                </button>
                            );
                        })}
                    </div>

                    <div
                        className="min-h-[28px] flex items-center justify-center text-center"
                        aria-live="polite"
                    >
                        {activeScale ? (
                            <p
                                className={`text-sm font-semibold tracking-tight transition-colors ${activeScale.textClass}`}
                            >
                                {activeScale.label}
                            </p>
                        ) : (
                            <p className="text-xs text-[var(--text-muted)]">
                                Pilih bintang sesuai perasaanmu
                            </p>
                        )}
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
                                    Bawaan 100% anonim, atau sertakan nama Anda bila ingin ditindaklanjuti langsung oleh tim HR.
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
                    onValidChange={setAnonValid}
                    onIncludeNameChange={setIncludeSenderName}
                    onSuccess={({ includedSenderName }) => {
                        setSentWithName(includedSenderName);
                        setStep("anonymous-done");
                    }}
                />
            )}

            {/* ── STEP 4: KONFIRMASI CURHAT TERKIRIM ───────────────── */}
            {step === "anonymous-done" && (
                <div className="py-4 text-center space-y-3">
                    <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">
                        {sentWithName
                            ? "Pesan Anda Sudah Diterima"
                            : "Pesan Anonim Anda Sudah Diterima"}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-sm mx-auto">
                        {sentWithName
                            ? "Terima kasih sudah berani bercerita. Pesan beserta nama lengkap Anda telah masuk ke kotak pesan HR."
                            : "Terima kasih sudah berani bercerita. Pesan telah masuk ke kotak anonim HR tanpa nama dan tanpa identitas akun Anda."}
                    </p>
                </div>
            )}
        </ResponsiveSheet>
    );
}
