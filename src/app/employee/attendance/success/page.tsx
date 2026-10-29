"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, CalendarCheck } from "lucide-react";

function SuccessContent() {
    const searchParams = useSearchParams();
    const action = searchParams.get("action") === "CLOCK_OUT" ? "CLOCK_OUT" : "CLOCK_IN";
    const shiftDate = searchParams.get("shiftDate") ?? "";

    const isClockOut = action === "CLOCK_OUT";

    return (
        <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
            <div className="card p-8 text-center">
                <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
                <h1 className="text-lg font-bold text-[var(--text-primary)]">
                    {isClockOut ? "Clock Out Berhasil!" : "Clock In Berhasil!"}
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
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
        </div>
    );
}

export default function AttendanceSuccessPage() {
    return (
        <Suspense
            fallback={
                <div className="card p-8 text-center text-sm text-[var(--text-muted)]">Memuat status presensi...</div>
            }
        >
            <SuccessContent />
        </Suspense>
    );
}
