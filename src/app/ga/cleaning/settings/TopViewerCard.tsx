"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, Trash2, UserCheck } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";

interface ReviewerOption {
    employeeId: string;
    name: string;
}

interface TopViewerInfo {
    employeeId: string | null;
    name: string | null;
    isActive: boolean | null;
}

const MAX_VIEWERS = 5;

/**
 * Kartu daftar atasan tertinggi viewer max 5 (HANYA WIG002).
 * Tulis ke AppSetting `cleaning.topViewers` (JSON array).
 * Key tunggal lama `cleaning.topViewer.employeeId` tetap dibaca sebagai
 * fallback LEGACY oleh service hingga backfill selesai.
 * Viewer read-only global; tanpa paraf/TTD; mati sendiri bila nonaktif.
 */
export default function TopViewerCard() {
    const toast = useToast();
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
            if (!infoRes.ok) throw new Error(await getResponseErrorMessage(infoRes, "Gagal memuat atasan tertinggi."));
            const infoJson = await infoRes.json();
            setInfos((infoJson.data ?? []) as TopViewerInfo[]);
            if (reviewersRes.ok) {
                const reviewersJson = await reviewersRes.json();
                const list = (reviewersJson.data ?? []) as Array<{ employeeId: string; name?: string; employee?: { name?: string } }>;
                setOptions(
                    list.map((r) => ({
                        employeeId: r.employeeId,
                        name: r.name ?? r.employee?.name ?? r.employeeId,
                    }))
                );
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat data.";
            toast(msg, "error");
            reportClientError("TopViewerCard", msg, err);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void fetchAll();
    }, [fetchAll]);

    const handleAdd = useCallback(async () => {
        const id = (manualId.trim() || selected).trim();
        if (!id) return;
        const currentIds = infos.map((i) => i.employeeId).filter(Boolean) as string[];
        if (currentIds.includes(id)) {
            toast("Karyawan ini sudah ada di daftar.", "error");
            return;
        }
        if (currentIds.length >= MAX_VIEWERS) {
            toast(`Maksimal ${MAX_VIEWERS} atasan tertinggi.`, "error");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/ga/cleaning/settings/top-viewers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeIds: [...currentIds, id] }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan atasan tertinggi."));
            const json = await res.json();
            setInfos((json.data.infos ?? []) as TopViewerInfo[]);
            setSelected("");
            setManualId("");
            toast("Atasan tertinggi ditambahkan.", "success");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal menyimpan.";
            toast(msg, "error");
            reportClientError("TopViewerCard", msg, err);
        } finally {
            setSaving(false);
        }
    }, [infos, manualId, selected, toast]);

    const handleRemove = useCallback(
        async (employeeId: string) => {
            setRemovingId(employeeId);
            try {
                const res = await fetch(`/api/ga/cleaning/settings/top-viewers?id=${encodeURIComponent(employeeId)}`, {
                    method: "DELETE",
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus."));
                const json = await res.json();
                setInfos((json.data.infos ?? []) as TopViewerInfo[]);
                toast("Atasan dihapus dari daftar pantauan.", "success");
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal menghapus.";
                toast(msg, "error");
                reportClientError("TopViewerCard", msg, err);
            } finally {
                setRemovingId(null);
            }
        },
        [toast]
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-2">
                    Atasan tertinggi saat ini ({infos.length}/{MAX_VIEWERS})
                </h3>
                {infos.length > 0 ? (
                    <ul className="space-y-2">
                        {infos.map((info) => (
                            <li key={info.employeeId} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                                <div className="space-y-0.5">
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                                        {info.name ?? info.employeeId}{" "}
                                        <span className="font-mono text-xs text-[var(--text-muted)]">{info.employeeId}</span>
                                    </p>
                                    {info.isActive === false && (
                                        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                            Karyawan nonaktif — akses pantauannya mati sendiri.
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => info.employeeId && void handleRemove(info.employeeId)}
                                    disabled={removingId === info.employeeId}
                                    aria-label={`Hapus ${info.employeeId}`}
                                    className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-red-600 disabled:opacity-50"
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
                ) : (
                    <p className="text-xs text-[var(--text-muted)]">Belum ada atasan tertinggi yang ditunjuk.</p>
                )}
            </div>

            <div className="rounded-xl border border-[var(--border)] p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Tambah atasan tertinggi
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                    Hanya karyawan internal aktif (maksimal {MAX_VIEWERS} orang). Atasan tertinggi hanya bisa memantau (tanpa paraf/TTD).
                </p>
                <div className="form-group !mb-0">
                    <label className="form-label" htmlFor="top-viewer-select">Pilih karyawan</label>
                    <select
                        id="top-viewer-select"
                        className="form-select"
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
                <div className="form-group !mb-0">
                    <label className="form-label" htmlFor="top-viewer-manual">Atau ketik NIP manual</label>
                    <input
                        id="top-viewer-manual"
                        type="text"
                        className="form-input"
                        value={manualId}
                        onChange={(e) => setManualId(e.target.value)}
                        placeholder="Contoh: ID-24050016"
                        maxLength={100}
                    />
                </div>
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => void handleAdd()}
                        disabled={saving || (!selected && !manualId.trim()) || infos.length >= MAX_VIEWERS}
                        className="btn btn-primary btn-sm disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Tambah ({infos.length}/{MAX_VIEWERS})
                    </button>
                </div>
                <p className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <UserCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Berlaku langsung (cache maksimal 60 detik).
                </p>
            </div>
        </div>
    );
}
