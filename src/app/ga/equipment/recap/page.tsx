"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Wrench, X } from "lucide-react";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AccessibleModal from "@/components/ui/AccessibleModal";
import { EquipmentEvidencePanel } from "@/components/equipment/EquipmentEvidencePanel";
import { stripGelar } from "@/lib/utils/formatters";

interface RecapUnitOption {
    id: string;
    name: string;
}

interface RecapSummary {
    open: number;
    submitted: number;
    done: number;
    total: number;
}

interface RecapInspection {
    id: string;
    unit: { id: string; name: string; brand: string | null };
    startedBy: { employeeId: string; name: string };
    status: string;
    createdAt: string;
}

interface RecapDetailItem {
    id: string;
    itemNameSnapshot: string;
    isPass: boolean | null;
    note: string | null;
}

interface RecapDetail {
    id: string;
    unit: { id: string; name: string; brand: string | null };
    startedBy: { employeeId: string; name: string };
    status: string;
    createdAt: string;
    submittedAt: string | null;
    checkedBy: { employeeId: string; name: string } | null;
    checkedByNameSnapshot: string | null;
    checkedAt: string | null;
    qcNote: string | null;
    items: RecapDetailItem[];
}

const STATUS_OPTIONS = ["", "OPEN", "SUBMITTED", "DONE"] as const;

const STATUS_LABEL: Record<string, string> = {
    OPEN: "Berjalan",
    SUBMITTED: "Terkirim",
    DONE: "Selesai",
};

function formatDateTime(value: string): string {
    return new Date(value).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function statusBadgeClass(status: string): string {    switch (status) {
        case "OPEN":
            return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
        case "SUBMITTED":
            return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
        case "DONE":
            return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
        default:
            return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    }
}

const inputClass =
    "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm";

export default function EquipmentRecapPage() {
    const [unitOptions, setUnitOptions] = useState<RecapUnitOption[]>([]);
    const [unitId, setUnitId] = useState("");
    const [status, setStatus] = useState<string>("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [summary, setSummary] = useState<RecapSummary | null>(null);
    const [inspections, setInspections] = useState<RecapInspection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);

    const fetchRecap = useCallback(
        async (filters?: { unitId?: string; status?: string; from?: string; to?: string }) => {
            setLoading(true);
            setError(null);
            setForbidden(false);
            try {
                const params = new URLSearchParams();
                const f = filters ?? { unitId, status, from, to };
                if (f.unitId) params.set("unitId", f.unitId);
                if (f.status) params.set("status", f.status);
                if (f.from) params.set("from", f.from);
                if (f.to) params.set("to", f.to);
                const query = params.toString();
                const res = await fetch(`/api/ga/equipment/recap${query ? `?${query}` : ""}`);
                if (res.status === 403) {
                    setForbidden(true);
                    return;
                }
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat rekap peralatan."));
                const json = await res.json();
                setSummary(json.data?.summary ?? null);
                setInspections(json.data?.inspections ?? []);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal memuat rekap.";
                setError(msg);
                reportClientError("EquipmentRecap", msg, err);
            } finally {
                setLoading(false);
            }
        },
        [unitId, status, from, to]
    );

    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch("/api/ga/equipment/units");
                if (res.ok) {
                    const json = await res.json();
                    setUnitOptions((json.data ?? []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
                }
            } catch (err) {
                reportClientError("EquipmentRecap", "Unit options load failed", err);
            }
            await fetchRecap({ unitId: "", status: "", from: "", to: "" });
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const applyFilters = useCallback(() => {
        void fetchRecap();
    }, [fetchRecap]);

    const resetFilters = useCallback(() => {
        setUnitId("");
        setStatus("");
        setFrom("");
        setTo("");
        void fetchRecap({ unitId: "", status: "", from: "", to: "" });
    }, [fetchRecap]);

    const [detailId, setDetailId] = useState<string | null>(null);
    const [detail, setDetail] = useState<RecapDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    const openDetail = useCallback(async (id: string) => {
        setDetailId(id);
        setDetail(null);
        setDetailError(null);
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/ga/equipment/inspections/${id}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat detail inspeksi."));
            const json = await res.json();
            setDetail(json.data as RecapDetail);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat detail.";
            setDetailError(msg);
            reportClientError("EquipmentRecap", msg, err);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const closeDetail = useCallback(() => {
        setDetailId(null);
        setDetail(null);
        setDetailError(null);
    }, []);

    function todayRange(): { from: string; to: string } {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const to = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
        return { from: today, to };
    }

    const showToday = useCallback(() => {
        const { from: f, to: t } = todayRange();
        setFrom(f);
        setTo(t);
        void fetchRecap({ unitId, status, from: f, to: t });
    }, [fetchRecap, unitId, status]);

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground mb-1">Rekap Peralatan</h1>
                    <p className="text-sm text-muted-foreground">Ringkasan inspeksi peralatan berdasarkan filter.</p>
                </div>
                <Link
                    href="/ga/equipment/settings"
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-card hover:bg-accent text-sm font-medium text-foreground transition-colors self-start"
                >
                    <Wrench className="h-4 w-4 text-primary" /> Pengaturan
                </Link>
            </div>

            {forbidden && !loading && (
                <div className="bg-card border border-border rounded-lg p-6 text-center">
                    <p className="text-foreground font-medium">Rekap tidak tersedia untuk akun Anda.</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        Halaman ini hanya untuk atasan yang ditunjuk. Hubungi admin GA bila Anda seharusnya memiliki akses.
                    </p>
                </div>
            )}

            {!forbidden && (
                <>
                    <div className="bg-card border border-border rounded-lg p-4 mb-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-medium">Unit alat</label>
                                <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={`${inputClass} mt-1`}>
                                    <option value="">Semua unit</option>
                                    {unitOptions.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium">Status</label>
                                <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} mt-1`}>
                                    {STATUS_OPTIONS.map((s) => (
                                        <option key={s} value={s}>
                                            {s === "" ? "Semua status" : (STATUS_LABEL[s] ?? s)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium">Dari tanggal</label>
                                <input
                                    type="date"
                                    value={from}
                                    onChange={(e) => setFrom(e.target.value)}
                                    className={`${inputClass} mt-1`}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium">Sampai tanggal</label>
                                <input
                                    type="date"
                                    value={to}
                                    onChange={(e) => setTo(e.target.value)}
                                    className={`${inputClass} mt-1`}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={applyFilters}
                                disabled={loading}
                                className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                            >
                                {loading ? "Memuat..." : "Tampilkan"}
                            </button>
                            <button
                                onClick={showToday}
                                disabled={loading}
                                className="px-3 py-1.5 text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50"
                            >
                                Hari ini
                            </button>
                            <button
                                onClick={resetFilters}
                                disabled={loading}
                                className="px-3 py-1.5 text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50"
                            >
                                Atur ulang
                            </button>
                        </div>
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {error && !loading && (
                        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
                            <AlertTriangle className="h-5 w-5 text-destructive mx-auto mb-2" />
                            <p className="text-sm text-destructive">{error}</p>
                            <button onClick={applyFilters} className="mt-3 text-sm text-primary hover:underline">
                                Coba lagi
                            </button>
                        </div>
                    )}

                    {!loading && !error && summary && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            {(
                                [
                                    ["Berjalan", summary.open],
                                    ["Terkirim", summary.submitted],
                                    ["Selesai", summary.done],
                                    ["Total", summary.total],
                                ] as [string, number][]
                            ).map(([label, value]) => (
                                <div key={label} className="bg-card border border-border rounded-lg p-3 text-center">
                                    <p className="text-2xl font-semibold text-foreground">{value}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {!loading && !error && (
                        <div className="bg-card border border-border rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Unit</TableHead>
                                        <TableHead>Pemulai</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Tanggal</TableHead>
                                        <TableHead>Aksi</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {inspections.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <p className="font-medium text-foreground">{item.unit.name}</p>
                                                {item.unit.brand && (
                                                    <p className="text-xs text-muted-foreground">{item.unit.brand}</p>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <p className="text-sm text-foreground">{item.startedBy.name}</p>
                                                <p className="text-xs text-muted-foreground">{item.startedBy.employeeId}</p>
                                            </TableCell>
                                            <TableCell>
                                                <span className={`text-xs px-1.5 py-0.5 rounded ${statusBadgeClass(item.status)}`}>
                                                    {STATUS_LABEL[item.status] ?? item.status}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatDateTime(item.createdAt)}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <button
                                                    type="button"
                                                    onClick={() => void openDetail(item.id)}
                                                    className="text-xs font-medium text-primary hover:underline min-h-9 px-2"
                                                >
                                                    Lihat
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            {inspections.length === 0 && (
                                <p className="text-center text-muted-foreground py-8 text-sm">
                                    Tidak ada inspeksi yang cocok dengan filter.
                                </p>
                            )}
                        </div>
                    )}
                </>
            )}

            {detailId && (
                <AccessibleModal ariaLabel="Detail inspeksi peralatan" onClose={closeDetail} className="!max-w-2xl !p-6">
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">{detail ? detail.unit.name : "Memuat..."}</h2>
                            {detail && (
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                    {detail.startedBy.name} ·{" "}
                                    {new Date(detail.createdAt).toLocaleDateString("id-ID", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                    })}
                                </p>
                            )}
                        </div>
                        <button type="button" className="modal-close" onClick={closeDetail} aria-label="Tutup detail">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {detailLoading && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                        </div>
                    )}

                    {!detailLoading && detailError && (
                        <p className="text-sm text-[var(--destructive)] text-center py-8">{detailError}</p>
                    )}

                    {!detailLoading && !detailError && detail && (
                        <div className="space-y-3">
                            {detail.items.map((item) => (
                                <div key={item.id} className="rounded-lg border border-[var(--border)] px-3 py-2">
                                    <p className="text-sm font-medium text-[var(--text-primary)]">
                                        {item.itemNameSnapshot}{" "}
                                        <span className="font-normal text-[var(--text-muted)]">
                                            — {item.isPass === true ? "Baik" : item.isPass === false ? "Rusak" : "Belum dinilai"}
                                        </span>
                                    </p>
                                    {item.note && <p className="text-xs text-[var(--text-muted)] mt-0.5">Catatan: {item.note}</p>}
                                </div>
                            ))}

                            <div className="rounded-lg border border-[var(--border)] px-3 py-2">
                                <p className="text-sm font-medium text-[var(--text-primary)]">Foto dokumentasi produksi</p>
                                <div className="mt-1.5">
                                    <EquipmentEvidencePanel
                                        inspectionId={detail.id}
                                        collapsible
                                        listUrl={`/api/ga/equipment/evidence?inspectionId=${encodeURIComponent(detail.id)}`}
                                        fileUrl={(id) => `/api/ga/equipment/evidence/${id}`}
                                    />
                                </div>
                            </div>

                            {(detail.checkedByNameSnapshot || detail.checkedBy) && (
                                <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800 px-3 py-2">
                                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                                        Checked by QC - {stripGelar(detail.checkedByNameSnapshot ?? detail.checkedBy?.name ?? "")}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{detail.checkedAt ? formatDateTime(detail.checkedAt) : ""}</p>
                                    {detail.qcNote && <p className="text-xs text-[var(--text-muted)] mt-1">Catatan QC: {detail.qcNote}</p>}
                                    <div className="mt-1.5">
                                        <EquipmentEvidencePanel
                                            inspectionId={detail.id}
                                            collapsible
                                            listUrl={`/api/ga/equipment/qc-evidence?inspectionId=${encodeURIComponent(detail.id)}`}
                                            fileUrl={(id) => `/api/ga/equipment/qc-evidence/${id}`}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </AccessibleModal>
            )}
        </div>
    );
}
