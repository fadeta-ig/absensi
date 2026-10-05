"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save, UserCheck, XCircle } from "lucide-react";
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

/**
 * Kartu penunjukan atasan tertinggi viewer (HANYA WIG002).
 * Menyimpan employeeId ke AppSetting `cleaning.topViewer.employeeId`.
 * Viewer bersifat read-only global; tanpa paraf/TTD; mati sendiri bila
 * HR menonaktifkan employee tersebut (peringatan di bawah).
 */
export default function TopViewerCard() {
    const toast = useToast();
    const [info, setInfo] = useState<TopViewerInfo | null>(null);
    const [options, setOptions] = useState<ReviewerOption[]>([]);
    const [selected, setSelected] = useState("");
    const [manualId, setManualId] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [infoRes, reviewersRes] = await Promise.all([
                fetch("/api/ga/cleaning/settings/top-viewer"),
                fetch("/api/ga/cleaning/approvals/reviewers"),
            ]);
            if (!infoRes.ok) throw new Error(await getResponseErrorMessage(infoRes, "Gagal memuat atasan tertinggi."));
            const infoJson = await infoRes.json();
            setInfo(infoJson.data as TopViewerInfo);
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

    const handleSave = useCallback(
        async (employeeId: string) => {
            setSaving(true);
            try {
                const res = await fetch("/api/ga/cleaning/settings/top-viewer", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ employeeId }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan atasan tertinggi."));
                const json = await res.json();
                setInfo(json.data.info as TopViewerInfo);
                setSelected("");
                setManualId("");
                toast(
                    json.data.info?.employeeId
                        ? `Atasan tertinggi: ${json.data.info.name ?? json.data.info.employeeId}.`
                        : "Penunjukan atasan tertinggi dikosongkan.",
                    "success"
                );
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal menyimpan.";
                toast(msg, "error");
                reportClientError("TopViewerCard", msg, err);
            } finally {
                setSaving(false);
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
                    Atasan tertinggi saat ini
                </h3>
                {info?.employeeId ? (
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {info.name ?? info.employeeId} <span className="font-mono text-xs text-[var(--text-muted)]">{info.employeeId}</span>
                        </p>
                        {info.isActive === false && (
                            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                Karyawan ini sudah nonaktif — akses pantauannya mati sendiri. Segera tunjuk pengganti di bawah.
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={() => void handleSave("")}
                            disabled={saving}
                            className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-red-600 disabled:opacity-50"
                        >
                            <XCircle className="h-3.5 w-3.5" /> Kosongkan penunjukan
                        </button>
                    </div>
                ) : (
                    <p className="text-xs text-[var(--text-muted)]">Belum ada atasan tertinggi yang ditunjuk.</p>
                )}
            </div>

            <div className="rounded-xl border border-[var(--border)] p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Tunjuk / ganti atasan tertinggi
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                    Hanya karyawan internal aktif. Atasan tertinggi hanya bisa memantau (tanpa paraf/TTD).
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
                        onClick={() => void handleSave(manualId.trim() || selected)}
                        disabled={saving || (!selected && !manualId.trim())}
                        className="btn btn-primary btn-sm disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Simpan Atasan Tertinggi
                    </button>
                </div>
                <p className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <UserCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Berlaku langsung (cache maksimal 60 detik). Bila HR menonaktifkan karyawan ini, akses pantauannya ikut mati.
                </p>
            </div>
        </div>
    );
}
