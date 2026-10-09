"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, X } from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";

const STORAGE_PREFIX = "hris_passkey_prompt_";
const SNOOZE_DAYS = 7;

type PromptState = { status: "snoozed" | "dismissed" | "done"; at: string; snoozeUntil: string | null };

function readPref(userId: string): PromptState | null {
    try {
        const raw = window.localStorage.getItem(STORAGE_PREFIX + userId);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PromptState;
        if (!parsed || typeof parsed.status !== "string") return null;
        return parsed;
    } catch {
        return null;
    }
}

function writePref(userId: string, value: PromptState): void {
    try {
        window.localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(value));
    } catch {
        // Storage penuh/diblokir bukan alasan menggagalkan alur
    }
}

/**
 * Headless: tawarkan setup passkey sekali pasca-login (portal employee).
 * Mount di dalam AppShell setelah guard sesi lolos. Return null bila:
 * tidak perlu tampil, browser tak dukung, atau user sudah punya passkey.
 */
export default function PasskeyPrompt({ ownerKey }: { ownerKey: string | null }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const checkedRef = useRef(false);

    useEffect(() => {
        if (!ownerKey || checkedRef.current) return;
        checkedRef.current = true;
        let cancelled = false;

        async function check() {
            try {
                const pref = readPref(ownerKey as string);
                if (pref?.status === "done" || pref?.status === "dismissed") return;
                if (pref?.status === "snoozed" && pref.snoozeUntil && new Date(pref.snoozeUntil).getTime() > Date.now()) return;
                if (typeof PublicKeyCredential === "undefined") return;
                if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false))) return;
                const res = await fetch("/api/auth/passkeys", { credentials: "same-origin" });
                if (!res.ok) return;
                const json = await res.json();
                if (Array.isArray(json.data) && json.data.length > 0) {
                    writePref(ownerKey as string, { status: "done", at: new Date().toISOString(), snoozeUntil: null });
                    return;
                }
                if (!cancelled) setOpen(true);
            } catch {
                // Gagal cek = jangan ganggu user
            }
        }
        void check();
        return () => {
            cancelled = true;
        };
    }, [ownerKey]);

    if (!open || !ownerKey) return null;

    const snooze = () => {
        const until = new Date(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000).toISOString();
        writePref(ownerKey, { status: "snoozed", at: new Date().toISOString(), snoozeUntil: until });
        setOpen(false);
    };

    return (
        <AccessibleModal ariaLabel="Aktifkan login sidik jari" onClose={snooze} className="max-w-md">
            <div className="modal-header">
                <div className="flex items-center gap-2">
                    <Fingerprint className="w-5 h-5 text-[var(--primary)]" />
                    <h2 className="modal-title">Masuk Lebih Cepat Tanpa Password</h2>
                </div>
                <button className="modal-close" onClick={snooze} aria-label="Tutup penawaran">
                    <X className="w-4 h-4" />
                </button>
            </div>
            <div className="px-5 py-4 space-y-3 text-sm text-[var(--text-secondary)]">
                <p>
                    Perangkat ini mendukung login sidik jari / Face ID. Daftarkan sekali, selanjutnya
                    cukup verifikasi biometrik — tanpa mengetik password.
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                    Data biometrik tidak pernah keluar dari perangkat ini. Password tetap bisa dipakai kapan pun.
                </p>
            </div>
            <div className="px-5 pb-5 space-y-2">
                <button
                    type="button"
                    onClick={() => {
                        snooze();
                        router.push("/employee/settings");
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--primary)] text-white font-semibold rounded-lg hover:bg-[var(--primary-light,#9B1B30)] transition-all shadow-md"
                >
                    <Fingerprint className="w-4 h-4" /> Aktifkan Sekarang
                </button>
                <div className="flex gap-2">
                    <button type="button" onClick={snooze} className="btn btn-secondary flex-1">
                        Ingatkan Nanti
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            writePref(ownerKey, { status: "dismissed", at: new Date().toISOString(), snoozeUntil: null });
                            setOpen(false);
                        }}
                        className="flex-1 text-center text-xs text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                    >
                        Jangan Tampilkan Lagi
                    </button>
                </div>
            </div>
        </AccessibleModal>
    );
}
