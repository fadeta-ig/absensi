"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save, Users } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";

interface ReviewerOption {
    employeeId: string;
    name: string;
}

interface DefaultInfo {
    inspectedBy: { employeeId: string; name: string; isActive: boolean } | null;
    knownBy: { employeeId: string; name: string; isActive: boolean } | null;
}

/**
 * Kartu pasangan default reviewer global (HANYA WIG002).
 * Berlaku sebagai cetakan periode BARU (prefill modal + auto-ensure);
 * baris approval lama tidak diubah.
 */
export default function DefaultReviewerCard() {
    const toast = useToast();
    const [info, setInfo] = useState<DefaultInfo | null>(null);
    const [options, setOptions] = useState<ReviewerOption[]>([]);
    const [inspectedBy, setInspectedBy] = useState("");
    const [knownBy, setKnownBy] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [defaultsRes, reviewersRes] = await Promise.all([
                fetch("/api/ga/cleaning/settings/default-reviewers"),
                fetch("/api/ga/cleaning/approvals/reviewers"),
            ]);
            if (!defaultsRes.ok) {
                throw new Error(await getResponseErrorMessage(defaultsRes, "Gagal memuat default reviewer."));
            }
            const defaultsJson = await defaultsRes.json();
            setInfo(defaultsJson.data.info as DefaultInfo);
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
            const msg = err instanceof Error ? err.message : "Gagal memuat data.";
            toast(msg, "error");
            reportClientError("DefaultReviewerCard", msg, err);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void fetchAll();
    }, [fetchAll]);

    const handleSave = useCallback(async () => {
        const inspected = inspectedBy.trim();
        const known = knownBy.trim();
        if (!inspected || !known) {
            toast("Pilih Diperiksa Oleh dan Mengetahui terlebih dahulu.", "error");
            return;
        }
        if (inspected === known) {
            toast("Diperiksa Oleh dan Mengetahui harus orang yang berbeda.", "error");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/ga/cleaning/settings/default-reviewers", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ inspectedByEmployeeId: inspected, knownByEmployeeId: known }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan default reviewer."));
            const json = await res.json();
            setInfo(json.data.info as DefaultInfo);
            setInspectedBy("");
            setKnownBy("");
            toast("Pasangan default reviewer tersimpan. Berlaku untuk periode baru.", "success");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal menyimpan.";
            toast(msg, "error");
            reportClientError("DefaultReviewerCard", msg, err);
        } finally {
            setSaving(false);
        }
    }, [inspectedBy, knownBy, toast]);

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
                    Default reviewer saat ini
                </h3>
                {info?.inspectedBy && info?.knownBy ? (
                    <div className="space-y-1">
                        <p className="text-sm text-[var(--text-primary)]">
                            Diperiksa Oleh: <strong>{info.inspectedBy.name}</strong>{" "}
                            <span className="font-mono text-xs text-[var(--text-muted)]">{info.inspectedBy.employeeId}</span>
                        </p>
                        <p className="text-sm text-[var(--text-primary)]">
                            Mengetahui: <strong>{info.knownBy.name}</strong>{" "}
                            <span className="font-mono text-xs text-[var(--text-muted)]">{info.knownBy.employeeId}</span>
                        </p>
                        {(!info.inspectedBy.isActive || !info.knownBy.isActive) && (
                            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                Salah satu default sudah nonaktif — segera tunjuk pengganti di bawah.
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-[var(--text-muted)]">
                        Belum ada pasangan default. Paraf/TTD ruangan-bulan baru terkunci sampai default ditetapkan.
                    </p>
                )}
            </div>

            <div className="rounded-xl border border-[var(--border)] p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Tunjuk / ganti pasangan default
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="default-inspected-by">Diperiksa Oleh</label>
                        <select
                            id="default-inspected-by"
                            className="form-select"
                            value={inspectedBy}
                            onChange={(e) => setInspectedBy(e.target.value)}
                        >
                            <option value="">Pilih karyawan</option>
                            {options.map((opt) => (
                                <option key={opt.employeeId} value={opt.employeeId}>
                                    {opt.name} ({opt.employeeId})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="default-known-by">Mengetahui</label>
                        <select
                            id="default-known-by"
                            className="form-select"
                            value={knownBy}
                            onChange={(e) => setKnownBy(e.target.value)}
                        >
                            <option value="">Pilih karyawan</option>
                            {options.map((opt) => (
                                <option key={opt.employeeId} value={opt.employeeId}>
                                    {opt.name} ({opt.employeeId})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving || !inspectedBy || !knownBy}
                        className="btn btn-primary btn-sm disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                        Simpan Pasangan Default
                    </button>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                    Berlaku untuk periode baru (prefill + otomatis). Baris approval lama tidak diubah.
                </p>
            </div>
        </div>
    );
}
