"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, CalendarCheck, ShieldCheck } from "lucide-react";
import StateCard from "@/components/ui/StateCard";
import StressmeterCheckinSheet from "@/components/employee/StressmeterCheckinSheet";
import { isValidCalendarDate } from "@/lib/timezone";

function SuccessContent() {
    const searchParams = useSearchParams();
    const action = searchParams.get("action") === "CLOCK_OUT" ? "CLOCK_OUT" : "CLOCK_IN";
    const shiftDate = searchParams.get("shiftDate") ?? "";

    const isClockOut = action === "CLOCK_OUT";

    const [sheetOpen, setSheetOpen] = useState(false);
    const [sheetInitialStep, setSheetInitialStep] = useState<"rating" | "anonymous">("rating");
    const [timePeriodLabel, setTimePeriodLabel] = useState("pagi ini");

    useEffect(() => {
        if (isClockOut || !isValidCalendarDate(shiftDate)) return;

        let cancelled = false;
        const checkPrompt = async () => {
            try {
                const res = await fetch(
                    `/api/employee/stressmeter/today?shiftDate=${encodeURIComponent(shiftDate)}`
                );
                if (!res.ok || cancelled) return;
                const json = await res.json();
                const data = json.data as
                    | { shouldPrompt?: boolean; timePeriodLabel?: string }
                    | undefined;
                if (cancelled || !data) return;
                if (data.timePeriodLabel) {
                    setTimePeriodLabel(data.timePeriodLabel);
                }
                if (data.shouldPrompt) {
                    setSheetInitialStep("rating");
                    setSheetOpen(true);
                }
            } catch {
                // Pop-up bersifat opsional; kegagalan jaringan tidak mengganggu halaman sukses presensi.
            }
        };

        void checkPrompt();
        return () => {
            cancelled = true;
        };
    }, [isClockOut, shiftDate]);

    const openAnonymousSheet = () => {
        setSheetInitialStep("anonymous");
        setSheetOpen(true);
    };

    return (
        <div className="space-y-5 animate-[fadeIn_0.3s_ease]">
            <div className="emp-surface p-6 text-center">
                <CheckCircle2 className="w-14 h-14 text-[var(--success)] mx-auto mb-3" />
                <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                    {isClockOut ? "Clock Out Berhasil!" : "Clock In Berhasil!"}
                </h1>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                    {isClockOut ? "Terima kasih, istirahatlah dengan baik." : "Selamat bekerja, semoga harimu produktif."}
                </p>
                {shiftDate && (
                    <p className="text-xs text-[var(--text-secondary)] mt-3 flex items-center justify-center gap-1.5">
                        <CalendarCheck className="w-3.5 h-3.5" />
                        Shift {shiftDate}
                    </p>
                )}
                <p className="text-[11px] text-[var(--text-muted)] mt-1 flex items-center justify-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Tercatat pada waktu server WIB
                </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <Link href="/employee/attendance-history" className="btn btn-secondary text-center">
                    Lihat Riwayat
                </Link>
                <Link href="/employee" className="btn btn-primary text-center">
                    Beranda
                </Link>
            </div>

            {!isClockOut && (
                <div className="emp-surface p-4 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-bold text-[var(--text-primary)]">
                                Perlu sharing lebih lanjut?
                            </p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                Cerita atau masukan Anda dikirim 100% secara anonim ke tim HR.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={openAnonymousSheet}
                        className="shrink-0 text-xs font-semibold text-[var(--primary)] hover:underline"
                    >
                        Share anonim
                    </button>
                </div>
            )}

            <StressmeterCheckinSheet
                isOpen={sheetOpen}
                onClose={() => setSheetOpen(false)}
                shiftDate={shiftDate}
                timePeriodLabel={timePeriodLabel}
                initialStep={sheetInitialStep}
            />
        </div>
    );
}

export default function AttendanceSuccessPage() {
    return (
        <Suspense
            fallback={
                <StateCard variant="loading" title="Memuat status presensi" />
            }
        >
            <SuccessContent />
        </Suspense>
    );
}
