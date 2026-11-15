"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, RefreshCw } from "lucide-react";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { EquipmentStatusBadge, EquipmentCompanyBadge, equipmentStatusLabel } from "@/components/equipment/EquipmentStatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import PageHeader from "@/components/ui/PageHeader";
import StateCard from "@/components/ui/StateCard";

interface OverviewInspection {
    id: string;
    unit: {
        id: string;
        name: string;
        brand: string | null;
        company: "WIG" | "MKI" | null;
        isSharedBoth?: boolean;
        companies?: Array<"WIG" | "MKI">;
    };
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

const inputClass = "mt-1 min-h-[44px]";

const OVERVIEW_FILTER_KEY = "employee-equipment-overview-filter";

function isWibDateStr(v: unknown): v is string {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Filter terakhir yang dipakai (agar kembali dari detail tidak me-reset ke hari ini). */
function loadSavedFilter(): { status: string; from: string; to: string; company: string; productId: string } {
    const today = toInputDate(new Date());
    const fallback = { status: "", from: today, to: today, company: "", productId: "" };
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.sessionStorage.getItem(OVERVIEW_FILTER_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw) as { status?: unknown; from?: unknown; to?: unknown; company?: unknown; productId?: unknown };
        return {
            status: typeof parsed.status === "string" ? parsed.status : "",
            from: isWibDateStr(parsed.from) ? parsed.from : today,
            to: isWibDateStr(parsed.to) ? parsed.to : today,
            company: parsed.company === "WIG" || parsed.company === "MKI" ? parsed.company : "",
            productId: typeof parsed.productId === "string" ? parsed.productId : "",
        };
    } catch {
        return fallback;
    }
}

function saveFilter(f: { status: string; from: string; to: string; company: string; productId: string }) {
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
    const [company, setCompany] = useState<string>(() => loadSavedFilter().company);
    const [productId, setProductId] = useState<string>(() => loadSavedFilter().productId);
    const [products, setProducts] = useState<Array<{ id: string; name: string; company: string }>>([]);
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
        async (filters?: { status?: string; from?: string; to?: string; company?: string; productId?: string }) => {
            setLoading(true);
            setError(null);
            setForbidden(false);
            try {
                const params = new URLSearchParams();
                const f = filters ?? { status, from, to, company, productId };
                saveFilter({ status: f.status ?? "", from: f.from ?? "", to: f.to ?? "", company: f.company ?? "", productId: f.productId ?? "" });
                if (f.status) params.set("status", f.status);
                if (f.company) params.set("company", f.company);
                if (f.productId) params.set("productId", f.productId);
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
        [status, from, to, company, productId]
    );

    useEffect(() => {
        void fetchOverview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        void fetch("/api/employee/equipment/products")
            .then((res) => (res.ok ? res.json() : null))
            .then((json: unknown) => {
                const data = (json as { data?: Array<{ id: string; name: string; company: string }> }).data;
                if (Array.isArray(data)) setProducts(data);
            })
            .catch(() => undefined);
    }, []);

    const showToday = useCallback(() => {
        const today = toInputDate(new Date());
        setFrom(today);
        setTo(today);
        void fetchOverview({ status, from: today, to: today, company, productId });
    }, [fetchOverview, status, company, productId]);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Pantau Inspeksi Alat"
                subtitle="Pantau hasil pemeriksaan bawahan: alat, foto, dan pemeriksaan QC."
                icon={Eye}
                action={
                    <button
                        type="button"
                        onClick={() => void fetchOverview()}
                        disabled={loading}
                        className="btn btn-secondary btn-sm min-h-[44px]"
                    >
                        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat Ulang
                    </button>
                }
            />

            {forbidden && !loading && (
                <EmptyState
                    icon={Eye}
                    title="Pantauan tidak tersedia untuk akun Anda."
                    description="Halaman ini hanya untuk atasan yang ditunjuk. Hubungi admin GA bila Anda seharusnya memiliki akses."
                />
            )}

            {!forbidden && (
                <>
                    <div className="emp-surface p-4">
                        <EquipmentSearchField
                            id="cari-pantau"
                            label="Cari pantauan"
                            value={query}
                            onChange={setQuery}
                            placeholder="Cari alat atau pengirim..."
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                            <div>
                                <label htmlFor="pantau-status" className="text-[10px] font-semibold text-[var(--text-muted)]">Status</label>
                                <select id="pantau-status" value={status} onChange={(e) => setStatus(e.target.value)} className={`form-select ${inputClass}`}>
                                    {STATUS_OPTIONS.map((s) => (
                                        <option key={s} value={s}>
                                            {s === "" ? "Semua status" : equipmentStatusLabel(s)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="pantau-perusahaan" className="text-[10px] font-semibold text-[var(--text-muted)]">Perusahaan</label>
                                <select
                                    id="pantau-perusahaan"
                                    value={company}
                                    onChange={(e) => {
                                        setCompany(e.target.value);
                                        setProductId("");
                                    }}
                                    className={`form-select ${inputClass}`}
                                >
                                    <option value="">Semua perusahaan</option>
                                    <option value="WIG">WIG</option>
                                    <option value="MKI">MKI</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="pantau-produk" className="text-[10px] font-semibold text-[var(--text-muted)]">Produk</label>
                                <select
                                    id="pantau-produk"
                                    value={productId}
                                    onChange={(e) => setProductId(e.target.value)}
                                    className={`form-select ${inputClass}`}
                                >
                                    <option value="">Semua produk</option>
                                    {products
                                        .filter((p) => !company || p.company === company)
                                        .map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                                {company ? "" : ` (${p.company})`}
                                            </option>
                                        ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="pantau-dari" className="text-[10px] font-semibold text-[var(--text-muted)]">Dari tanggal</label>
                                <input id="pantau-dari" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`form-input ${inputClass}`} />
                            </div>
                            <div>
                                <label htmlFor="pantau-sampai" className="text-[10px] font-semibold text-[var(--text-muted)]">Sampai tanggal</label>
                                <input id="pantau-sampai" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`form-input ${inputClass}`} />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={() => void fetchOverview()}
                                disabled={loading}
                                className="btn btn-primary min-h-[44px]"
                            >
                                {loading ? "Memuat..." : "Tampilkan"}
                            </button>
                            <button
                                onClick={showToday}
                                disabled={loading}
                                className="btn btn-secondary min-h-[44px]"
                            >
                                Hari ini
                            </button>
                        </div>
                    </div>

                    {loading && <ListSkeleton count={3} label="Memuat pantauan" />}

                    {error && !loading && (
                        <StateCard
                            variant="error"
                            title="Pantauan gagal dimuat"
                            description={error}
                            action={
                                <button onClick={() => void fetchOverview()} className="btn btn-secondary btn-sm">
                                    Coba lagi
                                </button>
                            }
                        />
                    )}

                    {!loading && !error && summary && (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {(
                                [
                                    ["Berjalan", summary.open],
                                    ["Verifikasi", summary.submitted],
                                    ["Approval", summary.done],
                                    ["Selesai", summary.approved],
                                    ["Total", summary.total],
                                ] as [string, number][]
                            ).map(([label, value]) => (
                                <div key={label} className="emp-surface px-4 py-3 min-w-0">
                                    <p className="text-xl font-extrabold leading-none text-[var(--text-primary)]">{value}</p>
                                    <p className="text-[10px] font-semibold text-[var(--text-muted)] mt-0.5 truncate">{label}</p>
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
                                    className="emp-surface emp-surface-hover block p-4 active:scale-[0.99] transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-bold text-[var(--text-primary)] truncate">
                                                {item.unit.name}{" "}
                                                <EquipmentCompanyBadge
                                                    company={item.unit.company}
                                                    isSharedBoth={item.unit.isSharedBoth}
                                                    companies={item.unit.companies}
                                                />
                                            </p>
                                            {item.unit.brand && (
                                                <p className="text-xs text-[var(--text-muted)]">{item.unit.brand}</p>
                                            )}
                                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                                {stripGelar(item.startedBy.name)} · mulai {formatDateTime(item.createdAt)}
                                            </p>
                                            {item.status === "SUBMITTED" && (
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    Dikirim {formatDateTime(item.submittedAt)}
                                                </p>
                                            )}
                                            {(item.checkedByNameSnapshot || item.checkedBy) && (
                                                <p className="text-xs text-[var(--success)] mt-0.5">
                                                    Diperiksa oleh {stripGelar(item.checkedByNameSnapshot ?? item.checkedBy?.name ?? "")} (QC)
                                                </p>
                                            )}
                                            {(item.approvedByNameSnapshot || item.approvedBy) && (
                                                <p className="text-xs text-[var(--success)] mt-0.5">
                                                    Approval - {stripGelar(item.approvedByNameSnapshot ?? item.approvedBy?.name ?? "")}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            <EquipmentStatusBadge status={item.status} />
                                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--primary)]">
                                                <Eye className="h-3.5 w-3.5" /> Detail
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                            {visibleInspections.length === 0 && (
                                <EmptyState
                                    icon={Eye}
                                    title={inspections.length === 0 ? "Tidak ada inspeksi pada rentang ini." : "Tidak ditemukan. Coba kata kunci lain."}
                                />
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
