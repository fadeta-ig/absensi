"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Users } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { cleaningInputClass, toFriendlyCleaningError } from "./cleaningSettingsUtils";

interface ReviewerOption {
    employeeId: string;
    name: string;
}

interface DefaultInfo {
    inspectedBy: { employeeId: string; name: string; isActive: boolean } | null;
    knownBy: { employeeId: string; name: string; isActive: boolean } | null;
}

/**
 * Kartu pasangan pemeriksa & mengetahui default global untuk inspeksi kebersihan.
 * Berlaku otomatis pada periode bulan baru; riwayat persetujuan lama tidak diubah.
 */
export default function DefaultReviewerCard() {
    const toast = useToast();
    const toastRef = useRef(toast);
    toastRef.current = toast;

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
                throw new Error(
                    await getResponseErrorMessage(defaultsRes, "Gagal memuat pasangan pemeriksa default.")
                );
            }
            const defaultsJson = await defaultsRes.json();
            setInfo((defaultsJson.data?.info ?? null) as DefaultInfo | null);
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
                "Gagal memuat pasangan pemeriksa default. Periksa koneksi Anda lalu coba lagi."
            );
            toastRef.current(msg, "error");
            reportClientError("DefaultReviewerCard", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchAll();
    }, [fetchAll]);

    const handleSave = useCallback(async () => {
        const inspected = inspectedBy.trim();
        const known = knownBy.trim();
        if (!inspected || !known) {
            toastRef.current("Pilih Diperiksa Oleh dan Mengetahui terlebih dahulu.", "error");
            return;
        }
        if (inspected === known) {
            toastRef.current("Diperiksa Oleh dan Mengetahui harus orang yang berbeda.", "error");
            return;
        }
        setSaving(true);
        try {
            const res = await fetch("/api/ga/cleaning/settings/default-reviewers", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ inspectedByEmployeeId: inspected, knownByEmployeeId: known }),
            });
            if (!res.ok) {
                throw new Error(
                    await getResponseErrorMessage(res, "Gagal menyimpan pasangan pemeriksa default.")
                );
            }
            const json = await res.json();
            if (json.data?.info) {
                setInfo(json.data.info as DefaultInfo);
            }
            setInspectedBy("");
            setKnownBy("");
            toastRef.current(
                "Pasangan pemeriksa default tersimpan dan berlaku untuk periode baru.",
                "success"
            );
        } catch (err) {
            const msg = toFriendlyCleaningError(
                err,
                "Gagal menyimpan pasangan pemeriksa default. Periksa koneksi Anda lalu coba lagi."
            );
            toastRef.current(msg, "error");
            reportClientError("DefaultReviewerCard", msg, err);
        } finally {
            setSaving(false);
        }
    }, [inspectedBy, knownBy]);

    if (loading) {
        return (
            <section className="bg-card border border-border rounded-xl p-4 flex items-center justify-center min-h-[220px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </section>
        );
    }

    const hasInactive = Boolean(
        info?.inspectedBy && info?.knownBy && (!info.inspectedBy.isActive || !info.knownBy.isActive)
    );

    return (
        <section className="bg-card border border-border rounded-xl p-4 space-y-4">
            <div>
                <h2 className="text-base font-semibold text-foreground">Pemeriksa &amp; Mengetahui Default</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Berlaku otomatis untuk seluruh ruangan pada periode bulan baru. Riwayat persetujuan bulan sebelumnya tetap terjaga.
                </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/25 p-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Pasangan Aktif Saat Ini
                </p>
                {info?.inspectedBy && info?.knownBy ? (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-muted-foreground text-xs">Diperiksa Oleh</span>
                            <div className="flex items-center gap-1.5 min-w-0">
                                <strong className="font-semibold text-foreground truncate">
                                    {info.inspectedBy.name}
                                </strong>
                                <span className="font-mono text-xs text-muted-foreground shrink-0">
                                    {info.inspectedBy.employeeId}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-muted-foreground text-xs">Mengetahui</span>
                            <div className="flex items-center gap-1.5 min-w-0">
                                <strong className="font-semibold text-foreground truncate">
                                    {info.knownBy.name}
                                </strong>
                                <span className="font-mono text-xs text-muted-foreground shrink-0">
                                    {info.knownBy.employeeId}
                                </span>
                            </div>
                        </div>
                        {hasInactive && (
                            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 pt-1">
                                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                Salah satu karyawan sudah nonaktif. Segera pilih pengganti di bawah.
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        Belum ditetapkan. Tanda tangan periode bulan baru akan terbuka setelah pasangan default ditentukan.
                    </p>
                )}
            </div>

            <div className="pt-2 border-t border-border space-y-3">
                <p className="text-xs font-semibold text-foreground">Ubah Pasangan Default</p>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <label
                            className="block text-xs font-medium text-foreground mb-1"
                            htmlFor="default-inspected-by"
                        >
                            Diperiksa Oleh
                        </label>
                        <select
                            id="default-inspected-by"
                            className={cleaningInputClass}
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
                    <div>
                        <label
                            className="block text-xs font-medium text-foreground mb-1"
                            htmlFor="default-known-by"
                        >
                            Mengetahui
                        </label>
                        <select
                            id="default-known-by"
                            className={cleaningInputClass}
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
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[42px]"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                        Simpan Pasangan Default
                    </button>
                </div>
            </div>
        </section>
    );
}
