"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Loader2, Plus, Trash2 } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { useConfirm } from "@/components/ConfirmModal";

interface PasskeyDevice {
    id: string;
    label: string | null;
    deviceType: string | null;
    backedUp: boolean;
    lastUsedAt: string | null;
    createdAt: string;
}
function fmtDate(iso: string | null): string {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function PasskeyCard() {
    const confirm = useConfirm();
    const [devices, setDevices] = useState<PasskeyDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [supported, setSupported] = useState<boolean | null>(null);
    const [label, setLabel] = useState("");
    const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function check() {
            try {
                if (typeof PublicKeyCredential === "undefined") {
                    if (!cancelled) setSupported(false);
                    return;
                }
                const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
                if (!cancelled) setSupported(ok);
            } catch {
                if (!cancelled) setSupported(false);
            }
        }
        void check();
        return () => {
            cancelled = true;
        };
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/auth/passkeys", { credentials: "same-origin" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat perangkat."));
            const json = await res.json();
            setDevices(Array.isArray(json.data) ? json.data : []);
        } catch (err) {
            reportClientError("PasskeyCard", "Gagal memuat perangkat", err);
            setMessage({ kind: "error", text: err instanceof Error ? err.message : "Gagal memuat perangkat." });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function handleAdd() {
        setBusy(true);
        setMessage(null);
        try {
            const optRes = await fetch("/api/auth/passkeys/register-options", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({}),
            });
            if (!optRes.ok) throw new Error(await getResponseErrorMessage(optRes, "Gagal memulai pendaftaran."));
            const { data: options } = await optRes.json();

            const { startRegistration } = await import("@simplewebauthn/browser");
            let regResponse;
            try {
                regResponse = await startRegistration({ optionsJSON: options });
            } catch (err) {
                const name = err instanceof Error ? err.name : "";
                const msg = err instanceof Error ? err.message : "";
                reportClientError("PasskeyCard", "startRegistration gagal", err, { errorName: name });
                if (name === "InvalidStateError") {
                    setMessage({ kind: "error", text: "Perangkat ini sudah terdaftar untuk akun Anda." });
                    return;
                }
                if (name === "NotAllowedError") {
                    setMessage({ kind: "error", text: "Pendaftaran dibatalkan. Coba lagi dan selesaikan verifikasi di perangkat." });
                    return;
                }
                if (name === "SecurityError") {
                    setMessage({ kind: "error", text: "Domain tidak cocok (rpID). Pastikan buka via domain yang terdaftar." });
                    return;
                }
                void msg;
                throw new Error("Perangkat tidak mendukung passkey. Pastikan HTTPS dan browser modern.");
            }

            const verifyRes = await fetch("/api/auth/passkeys/register-verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ response: regResponse, label: label.trim() || null }),
            });
            const data = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(data.error || "Gagal mendaftarkan perangkat.");
            setLabel("");
            setMessage({ kind: "success", text: "Perangkat berhasil didaftarkan. Login berikutnya bisa pakai sidik jari / Face ID." });
            await load();
        } catch (err) {
            reportClientError("PasskeyCard", "Gagal mendaftarkan perangkat", err);
            setMessage({ kind: "error", text: err instanceof Error ? err.message : "Gagal mendaftarkan perangkat." });
        } finally {
            setBusy(false);
        }
    }

    function handleRevoke(id: string, name: string | null) {
        confirm({
            title: "Hapus Perangkat?",
            message: `Perangkat "${name ?? "tanpa nama"}" tidak bisa lagi dipakai login. Password tetap berlaku.`,
            confirmLabel: "Ya, Hapus",
            variant: "danger",
            onConfirm: () => {
                void (async () => {
                    setBusy(true);
                    try {
                        const res = await fetch(`/api/auth/passkeys/${id}`, { method: "DELETE", credentials: "same-origin" });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || "Gagal menghapus perangkat.");
                        setMessage({ kind: "success", text: "Perangkat dihapus." });
                        await load();
                    } catch (err) {
                        reportClientError("PasskeyCard", "Gagal menghapus perangkat", err);
                        setMessage({ kind: "error", text: err instanceof Error ? err.message : "Gagal menghapus perangkat." });
                    } finally {
                        setBusy(false);
                    }
                })();
            },
        });
    }

    return (
        <div className="card">
            <div className="flex items-center gap-2 mb-1">
                <Fingerprint className="w-4 h-4 text-[var(--primary)]" />
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Passkey / Login Sidik Jari</h2>
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-4">
                Daftarkan perangkat ini agar bisa login dengan sidik jari atau Face ID. Data biometrik tidak pernah keluar dari perangkat ini.
            </p>

            {message && (
                <div
                    className={`mb-4 p-3 rounded-lg border text-sm ${
                        message.kind === "success"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300"
                            : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300"
                    }`}
                    role={message.kind === "error" ? "alert" : "status"}
                >
                    {message.text}
                </div>
            )}

            {supported === false && (
                <p className="text-xs text-[var(--text-muted)] mb-4">
                    Perangkat/browser ini tidak mendukung passkey. Tetap gunakan password seperti biasa.
                </p>
            )}

            {loading ? (
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat perangkat…
                </p>
            ) : (
                <>
                    {devices.length > 0 && (
                        <ul className="space-y-2 mb-4">
                            {devices.map((d) => (
                                <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{d.label || "Perangkat tanpa nama"}</p>
                                        <p className="text-[11px] text-[var(--text-muted)]">
                                            Didaftarkan {fmtDate(d.createdAt)} · Terakhir dipakai {fmtDate(d.lastUsedAt)}
                                            {d.deviceType ? ` · ${d.deviceType}` : ""}
                                            {d.backedUp ? " · Tersinkron" : ""}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleRevoke(d.id, d.label)}
                                        className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 min-w-9 min-h-9 flex items-center justify-center shrink-0"
                                        aria-label={`Hapus ${d.label || "perangkat"}`}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {supported !== false && (
                        <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                            <label className="form-label" htmlFor="passkey-label">Nama Perangkat (opsional)</label>
                            <input
                                id="passkey-label"
                                className="form-input"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="Contoh: iPhone saya, Laptop kantor"
                                maxLength={100}
                            />
                            <button
                                type="button"
                                onClick={() => { void handleAdd(); }}
                                disabled={busy}
                                className="btn btn-primary w-full"
                            >
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                {busy ? "Mendaftarkan…" : "Daftarkan Perangkat Ini"}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
