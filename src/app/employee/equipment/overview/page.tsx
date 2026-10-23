"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Eye, Loader2, RefreshCw } from "lucide-react";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";
import { EquipmentSearchField } from "@/components/equipment/EquipmentSearchField";
import { EquipmentStatusBadge, equipmentStatusLabel } from "@/components/equipment/EquipmentStatusBadge";

interface OverviewInspection {
    id: string;
    unit: { id: string; name: string; brand: string | null };
    startedBy: { employeeId: string; name: string };
    checkedBy: { employeeId: string; name: string } | null;
    checkedByNameSnapshot: string | null;
    approvedBy: { employeeId: string; name: string } | null;
    approvedByNameSnapshot: string | null;
    status: string;
    createdAt: string;
    submittedAt: string | null;
    checkedAt: string | null;
}

interface OverviewSummary {
    open: number;
    submitted: number;
    done: number;
    approved: number;
    total: number;
}

const STATUS_OPTIONS = ["", "OPEN", "SUBMITTED", "DONE", "APPROVED"] as const;

function formatDateTime(value: string | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function toInputDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const inputClass =
    "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm";

const OVERVIEW_FILTER_KEY = "employee-equipment-overview-filter";

function isWibDateStr(v: unknown): v is string {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Filter terakhir yang dipakai (agar kembali dari detail tidak me-reset ke hari ini). */
function loadSavedFilter(): { status: string; from: string; to: string } {
    const today = toInputDate(new Date());
    const fallback = { status: "", from: today, to: today };
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.sessionStorage.getItem(OVERVIEW_FILTER_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw) as { status?: unknown; from?: unknown; to?: unknown };
        return {
            status: typeof parsed.status === "string" ? parsed.status : "",
            from: isWibDateStr(parsed.from) ? parsed.from : today,
            to: isWibDateStr(parsed.to) ? parsed.to : today,
        };
    } catch {
        return fallback;
    }
}

function saveFilter(f: { status: string; from: string; to: string }) {
    try {
        window.sessionStorage.setItem(OVERVIEW_FILTER_KEY, JSON.stringify(f));
    } catch {
        // Penyimpanan penuh/diblokir: filter tetap jalan sesi ini.
    }
}

export default function EmployeeEquipmentOverviewPage() {
    const [inspections, setInspections] = useState<OverviewInspection[]>([]);
    const [summary, setSummary] = useState<OverviewSummary | null>(null);
    const [status, setStatus] = useState<string>(() => loadSavedFilter().status);
    const [from, setFrom] = useState<string>(() => loadSavedFilter().from);
    const [to, setTo] = useState<string>(() => loadSavedFilter().to);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [query, setQuery] = useState("");

    const visibleInspections = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return inspections;
        return inspections.filter((item) => {
            const hay = [item.unit.name, item.unit.brand ?? "", item.startedBy.name].join(" ").toLowerCase();
            return hay.includes(q);
        });
    }, [inspections, query]);

    const fetchOverview = useCallback(
        async (filters?: { status?: string; from?: string; to?: string }) => {
            setLoading(true);
            setError(null);
            setForbidden(false);
            try {
                const params = new URLSearchParams();
                const f = filters ?? { status, from, to };
                saveFilter({ status: f.status ?? "", from: f.from ?? "", to: f.to ?? "" });
                if (f.status) params.set("status", f.status);
                if (f.from) params.set("from", f.from);
                if (f.to) {
                    // Sampai tanggal inklusif: API memakai batas atas eksklusif.
                    const end = new Date(`${f.to}T00:00:00`);
                    end.setDate(end.getDate() + 1);
                    params.set("to", toInputDate(end));
                }
                const query = params.toString();
                const res = await fetch(`/api/employee/equipment/overview${query ? `?${query}` : ""}`);
                if (res.status === 403) {
                    setForbidden(true);
                    return;
                }
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat pantauan."));
                const json = await res.json();
                setSummary(json.data?.summary ?? null);
                setInspections(json.data?.inspections ?? []);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal memuat pantauan.";
                setError(msg);
                reportClientError("EmployeeEquipmentOverview", msg, err);
            } finally {
                setLoading(false);
            }
        },
        [status, from, to]
    );

    useEffect(() => {
        void fetchOverview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const showToday = useCallback(() => {
        const today = toInputDate(new Date());
        setFrom(today);
        setTo(today);
        void fetchOverview({ status, from: today, to: today });
    }, [fetchOverview, status]);

    return (
        <div className="mx-auto px-4 py-6">
            <div className="flex items-start justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Pantau Inspeksi Alat</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Pantau hasil pemeriksaan bawahan: alat, foto, dan pemeriksaan QC.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void fetchOverview()}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50 shrink-0"
                >
                    <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat Ulang
                </button>
            </div>

            {forbidden && !loading && (
                <div className="bg-card border border-border rounded-lg p-6 text-center">
                    <p className="text-foreground font-medium">Pantauan tidak tersedia untuk akun Anda.</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        Halaman ini hanya untuk atasan yang ditunjuk. Hubungi admin GA bila Anda seharusnya memiliki akses.
                    </p>
                </div>
            )}

            {!forbidden && (
                <>
                    <div className="bg-card border border-border rounded-lg p-4 mb-4">
                        <EquipmentSearchField
                            id="cari-pantau"
                            label="Cari pantauan"
                            value={query}
                            onChange={setQuery}
                            placeholder="Cari alat atau pengirim..."
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <div>
                                <label htmlFor="pantau-status" className="text-xs font-medium">Status</label>
                                <select id="pantau-status" value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} mt-1 min-h-[44px]`}>
                                    {STATUS_OPTIONS.map((s) => (
                                        <option key={s} value={s}>
                                            {s === "" ? "Semua status" : equipmentStatusLabel(s)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="pantau-dari" className="text-xs font-medium">Dari tanggal</label>
                                <input id="pantau-dari" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1 min-h-[44px]`} />
                            </div>
                            <div>
                                <label htmlFor="pantau-sampai" className="text-xs font-medium">Sampai tanggal</label>
                                <input id="pantau-sampai" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1 min-h-[44px]`} />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={() => void fetchOverview()}
                                disabled={loading}
                                className="px-4 min-h-[44px] text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                            >
                                {loading ? "Memuat..." : "Tampilkan"}
                            </button>
                            <button
                                onClick={showToday}
                                disabled={loading}
                                className="px-4 min-h-[44px] text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50"
                            >
                                Hari ini
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
                            <button onClick={() => void fetchOverview()} className="mt-3 text-sm text-primary hover:underline">
                                Coba lagi
                            </button>
                        </div>
                    )}

                    {!loading && !error && summary && (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                            {(
                                [
                                    ["Berjalan", summary.open],
                                    ["Verifikasi", summary.submitted],
                                    ["Approval", summary.done],
                                    ["Selesai", summary.approved],
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
                        <div className="space-y-3">
                            {visibleInspections.map((item) => (
                                <Link
                                    key={item.id}
                                    href={`/employee/equipment/overview/${item.id}`}
                                    className="block bg-card border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-medium text-foreground truncate">{item.unit.name}</p>
                                            {item.unit.brand && (
                                                <p className="text-xs text-muted-foreground">{item.unit.brand}</p>
                                            )}
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {stripGelar(item.startedBy.name)} · mulai {formatDateTime(item.createdAt)}
                                            </p>
                                            {item.status === "SUBMITTED" && (
                                                <p className="text-xs text-muted-foreground">
                                                    Dikirim {formatDateTime(item.submittedAt)}
                                                </p>
                                            )}
                                            {(item.checkedByNameSnapshot || item.checkedBy) && (
                                                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                                                    Diperiksa oleh {stripGelar(item.checkedByNameSnapshot ?? item.checkedBy?.name ?? "")} (QC)
                                                </p>
                                            )}
                                            {(item.approvedByNameSnapshot || item.approvedBy) && (
                                                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                                                    Approval - {stripGelar(item.approvedByNameSnapshot ?? item.approvedBy?.name ?? "")}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            <EquipmentStatusBadge status={item.status} />
                                            <span className="inline-flex items-center gap-1 text-xs text-primary">
                                                <Eye className="h-3.5 w-3.5" /> Detail
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                            {visibleInspections.length === 0 && (
                                <p className="text-center text-muted-foreground py-8 text-sm">
                                    {inspections.length === 0
                                        ? "Tidak ada inspeksi pada rentang ini."
                                        : "Tidak ditemukan. Coba kata kunci lain."}
                                </p>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
