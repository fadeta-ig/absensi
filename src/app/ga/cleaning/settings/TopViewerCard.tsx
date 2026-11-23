"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { cleaningInputClass, toFriendlyCleaningError } from "./cleaningSettingsUtils";

interface ReviewerOption {
    employeeId: string;
    name: string;
}

interface TopViewerInfo {
    employeeId: string | null;
    name: string | null;
    isActive: boolean | null;
    email?: string | null;
}

const MAX_VIEWERS = 5;

/**
 * Kartu daftar pemantau utama inspeksi kebersihan (maksimal 5 karyawan aktif).
 * Hanya dapat memantau dan menerima rekap harian, tanpa hak paraf atau tanda tangan.
 */
export default function TopViewerCard() {
    const toast = useToast();
    const toastRef = useRef(toast);
    toastRef.current = toast;

    const [infos, setInfos] = useState<TopViewerInfo[]>([]);
    const [options, setOptions] = useState<ReviewerOption[]>([]);
    const [selected, setSelected] = useState("");
    const [manualId, setManualId] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [infoRes, reviewersRes] = await Promise.all([
                fetch("/api/ga/cleaning/settings/top-viewers"),
                fetch("/api/ga/cleaning/approvals/reviewers"),
            ]);
            if (!infoRes.ok) {
                throw new Error(
                    await getResponseErrorMessage(infoRes, "Gagal memuat daftar pemantau utama.")
                );
            }
            const infoJson = await infoRes.json();
            setInfos((infoJson.data ?? []) as TopViewerInfo[]);
            if (reviewersRes.ok) {
                const reviewersJson = await reviewersRes.json();
                const list = (reviewersJson.data ?? []) as Array<{
                    employeeId: string;
                    name?: string;
                    employee?: { name?: string };
                }>;
                setOptions(
                    list.map((r) => ({
                        employeeId: r.employeeId,
                        name: r.name ?? r.employee?.name ?? r.employeeId,
                    }))
                );
            }
        } catch (err) {
            const msg = toFriendlyCleaningError(
                err,
                "Gagal memuat daftar pemantau utama. Periksa koneksi Anda lalu coba lagi."
            );
            toastRef.current(msg, "error");
            reportClientError("TopViewerCard", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchAll();
    }, [fetchAll]);

    const handleAdd = useCallback(async () => {
        const id = (manualId.trim() || selected).trim();
        if (!id) return;
        const currentIds = infos.map((i) => i.employeeId).filter(Boolean) as string[];
        if (currentIds.includes(id)) {
            toastRef.current("Karyawan tersebut sudah ada di daftar pemantau.", "error");
            return;
        }
        if (currentIds.length >= MAX_VIEWERS) {
            toastRef.current(`Pemantau utama maksimal ${MAX_VIEWERS} karyawan.`, "error");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/ga/cleaning/settings/top-viewers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeIds: [...currentIds, id] }),
            });
            if (!res.ok) {
                throw new Error(
                    await getResponseErrorMessage(res, "Gagal menyimpan pemantau utama.")
                );
            }
            const json = await res.json();
            setInfos((json.data?.infos ?? []) as TopViewerInfo[]);
            setSelected("");
            setManualId("");
            toastRef.current("Pemantau utama ditambahkan.", "success");
        } catch (err) {
            const msg = toFriendlyCleaningError(
                err,
                "Gagal menyimpan pemantau utama. Periksa koneksi Anda lalu coba lagi."
            );
            toastRef.current(msg, "error");
            reportClientError("TopViewerCard", msg, err);
        } finally {
            setSaving(false);
        }
    }, [infos, manualId, selected]);

    const handleRemove = useCallback(async (employeeId: string) => {
        setRemovingId(employeeId);
        try {
            const res = await fetch(
                `/api/ga/cleaning/settings/top-viewers?id=${encodeURIComponent(employeeId)}`,
                { method: "DELETE" }
            );
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menghapus pemantau utama."));
            }
            const json = await res.json();
            setInfos((json.data?.infos ?? []) as TopViewerInfo[]);
            toastRef.current("Pemantau utama dihapus.", "success");
        } catch (err) {
            const msg = toFriendlyCleaningError(
                err,
                "Gagal menghapus pemantau utama. Periksa koneksi Anda lalu coba lagi."
            );
            toastRef.current(msg, "error");
            reportClientError("TopViewerCard", msg, err);
        } finally {
            setRemovingId(null);
        }
    }, []);

    if (loading) {
        return (
            <section className="bg-card border border-border rounded-xl p-4 flex items-center justify-center min-h-[220px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </section>
        );
    }

    return (
        <section className="bg-card border border-border rounded-xl p-4 space-y-4">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h2 className="text-base font-semibold text-foreground">Pemantau Utama</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Melihat seluruh inspeksi dan menerima rekap harian tanpa hak paraf atau tanda tangan. Maksimal {MAX_VIEWERS} karyawan aktif.
                    </p>
                </div>
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-muted text-muted-foreground shrink-0">
                    {infos.length}/{MAX_VIEWERS}
                </span>
            </div>

            {infos.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
                    Belum ada pemantau utama yang ditunjuk.
                </p>
            ) : (
                <ul className="space-y-2">
                    {infos.map((info) => (
                        <li
                            key={info.employeeId ?? info.name}
                            className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                        >
                            <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-medium text-foreground truncate">
                                        {info.name ?? info.employeeId}
                                    </span>
                                    {info.isActive !== null && (
                                        <span
                                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                                info.isActive
                                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                    : "bg-muted text-muted-foreground"
                                            }`}
                                        >
                                            {info.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                    <span className="font-mono">{info.employeeId}</span>
                                    {info.email ? ` · ${info.email}` : ""}
                                </p>
                                {info.isActive === false && (
                                    <p className="flex items-start gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 pt-0.5">
                                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                        Karyawan nonaktif. Akses pemantauan otomatis berhenti.
                                    </p>
                                )}
                                {!info.email && (
                                    <p className="flex items-start gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 pt-0.5">
                                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                        Belum memiliki alamat email. Rekap harian tidak dapat dikirim.
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => info.employeeId && void handleRemove(info.employeeId)}
                                disabled={removingId === info.employeeId}
                                aria-label={`Hapus ${info.employeeId}`}
                                className="inline-flex items-center gap-1 shrink-0 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-md disabled:opacity-50 min-h-[36px]"
                            >
                                {removingId === info.employeeId ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                )}
                                Hapus
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="pt-2 border-t border-border space-y-3">
                <p className="text-xs font-semibold text-foreground">Tambah Pemantau Utama</p>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <label
                            className="block text-xs font-medium text-foreground mb-1"
                            htmlFor="top-viewer-select"
                        >
                            Pilih karyawan
                        </label>
                        <select
                            id="top-viewer-select"
                            className={cleaningInputClass}
                            value={selected}
                            onChange={(e) => setSelected(e.target.value)}
                        >
                            <option value="">Pilih dari daftar</option>
                            {options.map((opt) => (
                                <option key={opt.employeeId} value={opt.employeeId}>
                                    {opt.name} ({opt.employeeId})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label
                            className="block text-xs font-medium text-foreground mb-1"
                            htmlFor="top-viewer-manual"
                        >
                            Atau masukkan NIP
                        </label>
                        <input
                            id="top-viewer-manual"
                            type="text"
                            className={cleaningInputClass}
                            value={manualId}
                            onChange={(e) => setManualId(e.target.value)}
                            placeholder="Contoh: ID-24050016"
                            maxLength={100}
                        />
                    </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                    {infos.length >= MAX_VIEWERS ? (
                        <p className="text-xs text-muted-foreground">
                            Batas {MAX_VIEWERS} pemantau tercapai. Hapus salah satu untuk menambah.
                        </p>
                    ) : (
                        <span />
                    )}
                    <button
                        type="button"
                        onClick={() => void handleAdd()}
                        disabled={saving || (!selected && !manualId.trim()) || infos.length >= MAX_VIEWERS}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[42px] shrink-0"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Tambah ({infos.length}/{MAX_VIEWERS})
                    </button>
                </div>
            </div>
        </section>
    );
}
