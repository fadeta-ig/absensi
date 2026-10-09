"use client";

import { useEffect, useRef, useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";
import { notifyAuthChanged } from "@/lib/authEvents";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface PasskeyLoginButtonProps {
    username: string;
    disabled?: boolean;
    onError: (message: string) => void;
    onSuccess: (landingPath: string) => void;
}

async function browserSupported(): Promise<{ platform: boolean; conditional: boolean }> {
    try {
        if (typeof window === "undefined" || typeof PublicKeyCredential === "undefined") {
            return { platform: false, conditional: false };
        }
        const platform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
        const conditional =
            typeof PublicKeyCredential.isConditionalMediationAvailable === "function"
                ? await PublicKeyCredential.isConditionalMediationAvailable().catch(() => false)
                : false;
        return { platform, conditional };
    } catch {
        return { platform: false, conditional: false };
    }
}

export default function PasskeyLoginButton({ username, disabled, onError, onSuccess }: PasskeyLoginButtonProps) {
    const [supported, setSupported] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(false);
    const conditionalTriedRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        void browserSupported().then((s) => {
            if (!cancelled) setSupported(s.platform);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // Conditional mediation: tempel jari langsung masuk tanpa ketik username.
    // Jalan sekali saat mount bila browser mendukung.
    useEffect(() => {
        if (supported !== true || conditionalTriedRef.current || disabled) return;
        conditionalTriedRef.current = true;
        let cancelled = false;
        (async () => {
            try {
                const { isConditionalMediationAvailable } = PublicKeyCredential as unknown as {
                    isConditionalMediationAvailable?: () => Promise<boolean>;
                };
                if (typeof isConditionalMediationAvailable !== "function") return;
                if (!(await isConditionalMediationAvailable().catch(() => false))) return;
                const optRes = await fetch("/api/auth/passkeys/auth-options", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: null }),
                    credentials: "same-origin",
                    signal: AbortSignal.timeout(10000),
                });
                if (!optRes.ok || cancelled) return;
                const { data: options } = await optRes.json();
                const { startAuthentication } = await import("@simplewebauthn/browser");
                const authResponse = await startAuthentication({ optionsJSON: options, useBrowserAutofill: true });
                if (cancelled) return;
                await verifyAndEnter(null, authResponse);
            } catch {
                // Batal/tidak ada passkey = diam, user pakai tombol/manual.
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supported]);

    async function verifyAndEnter(name: string | null, authResponse: unknown) {
        const verifyRes = await fetch("/api/auth/passkeys/auth-verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: name, response: authResponse }),
            credentials: "same-origin",
        });
        const data = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(data.error || "Login passkey gagal.");
        await new Promise((r) => setTimeout(r, 200));
        notifyAuthChanged("login");
        onSuccess(data.landingPath || "/employee");
    }

    async function handleClick() {
        if (loading) return;
        setLoading(true);
        try {
            const name = username.trim() || null;
            const optRes = await fetch("/api/auth/passkeys/auth-options", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: name }),
                credentials: "same-origin",
            });
            if (!optRes.ok) throw new Error(await getResponseErrorMessage(optRes, "Login passkey gagal."));
            const { data: options } = await optRes.json();

            const { startAuthentication } = await import("@simplewebauthn/browser");
            let authResponse;
            try {
                authResponse = await startAuthentication({ optionsJSON: options });
            } catch (err) {
                const errName = err instanceof Error ? err.name : "";
                if (errName === "NotAllowedError") return; // Batal oleh user = kembali diam-diam
                if (errName === "SecurityError") throw new Error("Domain tidak cocok. Hubungi IT.");
                throw new Error("Verifikasi biometrik gagal atau dibatalkan. Coba lagi atau gunakan password.");
            }

            await verifyAndEnter(name, authResponse);
        } catch (error) {
            reportClientError("PasskeyLoginButton", "Login passkey gagal", error);
            onError(error instanceof Error ? error.message : "Login passkey gagal. Gunakan password.");
        } finally {
            setLoading(false);
        }
    }

    if (supported !== true) return null;

    return (
        <button
            type="button"
            onClick={() => { void handleClick(); }}
            disabled={disabled || loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--secondary)] border border-[var(--border)] text-[var(--text-primary)] font-semibold rounded-lg hover:border-[var(--primary)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4 text-[var(--primary)]" />}
            {loading ? "Memverifikasi…" : "Masuk dengan Sidik Jari / Face ID"}
        </button>
    );
}
