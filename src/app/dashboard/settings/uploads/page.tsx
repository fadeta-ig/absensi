"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Pencil, Settings, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";

interface UploadLimit {
    key: string;
    label: string;
    description: string;
    valueMb: number;
    source: "database" | "default";
}

function formatMb(valueMb: number): string {
    return `${valueMb.toLocaleString("id-ID", { maximumFractionDigits: 2 })} MB`;
}

export default function UploadSettingsPage() {
    const toast = useToast();
    const [limits, setLimits] = useState<UploadLimit[]>([]);
    const [canManage, setCanManage] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [actionError, setActionError] = useState("");
    const [actionResult, setActionResult] = useState("");
    const [editing, setEditing] = useState<UploadLimit | null>(null);
    const [draftValue, setDraftValue] = useState("");
    const [saving, setSaving] = useState(false);

    const fetchLimits = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            const res = await fetch("/api/settings/uploads");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat batas upload."));
            const json = await res.json() as { limits?: UploadLimit[]; canManage?: boolean };
            setLimits(Array.isArray(json.limits) ? json.limits : []);
            setCanManage(json.canManage === true);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Gagal memuat batas upload.";
            setLoadError(message);
            reportClientError("UploadSettingsPage", message, error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchLimits();
    }, [fetchLimits]);

    const openEdit = useCallback((limit: UploadLimit) => {
        setActionError("");
        setActionResult("");
        setEditing(limit);
        setDraftValue(String(limit.valueMb));
    }, []);

    const saveEdit = useCallback(async () => {
        if (!editing || saving) return;
        const valueMb = Number(draftValue.replace(",", "."));
        if (!Number.isFinite(valueMb)) {
            setActionError("Nilai batas harus berupa angka dalam MB.");
            return;
        }
        setSaving(true);
        setActionError("");
        setActionResult("");
        try {
            const res = await fetch("/api/settings/uploads", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: editing.key, valueMb }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan batas upload."));
            const updated = await res.json() as { key: string; valueMb: number };
            setLimits((prev) => prev.map((item) =>
                item.key === updated.key ? { ...item, valueMb: updated.valueMb, source: "database" as const } : item
            ));
            setEditing(null);
            setActionResult(`Batas ${editing.label} diperbarui menjadi ${formatMb(updated.valueMb)}.`);
            toast("Batas upload berhasil disimpan.", "success");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Gagal menyimpan batas upload.";
            setActionError(message);
            toast(message, "error");
            reportClientError("UploadSettingsPage", "Gagal menyimpan batas upload", error, { key: editing.key });
        } finally {
            setSaving(false);
        }
    }, [editing, draftValue, saving, toast]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-6">
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
                    <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
                    <p className="text-destructive">{loadError}</p>
                    <button onClick={fetchLimits} className="mt-3 text-sm text-primary hover:underline">Coba lagi</button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                    <Settings size={12} />
                    Konfigurasi Sistem
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                    Pengelola Tetap: WIG001
                </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Batas Ukuran Unggahan
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 mb-6">
                Atur batas maksimal ukuran file (dalam MB) untuk setiap jenis unggahan. Nilai bawaan mengikuti batas aktual di kode.
                {!canManage && " Akun Anda hanya dapat melihat — perubahan dikunci untuk WIG001."}
            </p>

            {actionError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-sm mb-4">
                    <AlertTriangle size={18} />
                    <span>{actionError}</span>
                </div>
            )}

            {actionResult && !actionError && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm mb-4">
                    {actionResult}
                </div>
            )}

            <div className="bg-card border border-border rounded-xl overflow-hidden">
                <ul className="divide-y divide-border">
                    {limits.map((limit) => (
                        <li key={limit.key} className="flex items-center justify-between gap-3 p-4">
                            <div className="min-w-0">
                                <p className="font-medium text-sm text-foreground">{limit.label}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{limit.description}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    <span className="font-semibold text-foreground">{formatMb(limit.valueMb)}</span>
                                    {" · "}
                                    <span className={`px-1.5 py-0.5 rounded ${limit.source === "database" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                                        {limit.source === "database" ? "Tersimpan" : "Bawaan"}
                                    </span>
                                </p>
                            </div>
                            <button
                                onClick={() => openEdit(limit)}
                                disabled={!canManage}
                                title={canManage ? `Ubah ${limit.label}` : "Dikunci untuk WIG001"}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-md hover:bg-muted text-foreground disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                            >
                                <Pencil className="h-3.5 w-3.5" /> Ubah
                            </button>
                        </li>
                    ))}
                </ul>
                {limits.length === 0 && (
                    <p className="text-center text-muted-foreground py-8 text-sm">Belum ada data batas upload.</p>
                )}
            </div>

            {editing && (
                <AccessibleModal
                    ariaLabel={`Ubah ${editing.label}`}
                    onClose={() => setEditing(null)}
                >
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">Ubah {editing.label}</h2>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">{editing.description}</p>
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => setEditing(null)}
                            aria-label="Tutup modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="upload-limit-value">Batas maksimal (MB)</label>
                        <input
                            id="upload-limit-value"
                            type="number"
                            min={0.5}
                            max={50}
                            step={0.25}
                            value={draftValue}
                            onChange={(e) => setDraftValue(e.target.value)}
                            className="form-input"
                        />
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            Rentang yang diizinkan 0,5–50 MB; nilai di luar rentang dijepit otomatis. Saat ini: {formatMb(editing.valueMb)}.
                        </p>
                    </div>

                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={saveEdit}
                            disabled={saving}
                            className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                        >
                            {saving ? "Menyimpan..." : "Simpan"}
                        </button>
                        <button
                            onClick={() => setEditing(null)}
                            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                        >
                            Batal
                        </button>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
