"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";
import { EquipmentStatusDot, EquipmentCompanyBadge, equipmentStatusLabel } from "@/components/equipment/EquipmentStatusBadge";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import PageHeader from "@/components/ui/PageHeader";
import StateCard from "@/components/ui/StateCard";

type QueueStatus = "DONE" | "APPROVED" | "ALL";

interface QueueRow {
    id: string;
    status: string;
    unit: { id: string; name: string; brand: string | null; company: "WIG" | "MKI" | null };
    startedBy: { employeeId: string; name: string };
    checkedByNameSnapshot: string | null;
    checkedAt: string | null;
    submittedAt: string | null;
    approvedByNameSnapshot: string | null;
    approvedAt: string | null;
}

function formatDateTime(value: string | null): string {
    if (!value) return "—";
    return new Date(value).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
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

function shiftInputDate(base: string, deltaDays: number): string {
    const d = new Date(`${base}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    return toInputDate(d);
}

const FILTER_KEY = "equipment-approval-queue-filter";

function isWibDateStr(v: unknown): v is string {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function loadSavedFilter(): { status: QueueStatus; from: string; to: string } {
    const fallback = { status: "DONE" as QueueStatus, from: "", to: "" };
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.sessionStorage.getItem(FILTER_KEY);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw) as { status?: unknown; from?: unknown; to?: unknown };
        const status: QueueStatus =
            parsed.status === "APPROVED" || parsed.status === "ALL" ? parsed.status : "DONE";
        return {
            status,
            from: isWibDateStr(parsed.from) ? parsed.from : "",
            to: isWibDateStr(parsed.to) ? parsed.to : "",
        };
    } catch {
        return fallback;
    }
}

function saveFilter(f: { status: QueueStatus; from: string; to: string }) {
    try {
        window.sessionStorage.setItem(FILTER_KEY, JSON.stringify(f));
    } catch {
        // Penyimpanan penuh/diblokir: filter tetap jalan sesi ini.
    }
}

const inputClass = "form-input mt-1 min-h-[44px]";

export default function EquipmentApprovalQueuePage() {
    const [rows, setRows] = useState<QueueRow[]>([]);
    const [status, setStatus] = useState<QueueStatus>(() => loadSavedFilter().status);
    const [from, setFrom] = useState<string>(() => loadSavedFilter().from);
    const [to, setTo] = useState<string>(() => loadSavedFilter().to);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);

    const fetchQueue = useCallback(
        async (filters?: { status?: QueueStatus; from?: string; to?: string }) => {
            setLoading(true);
            setError(null);
            setForbidden(false);
            try {
                const f = filters ?? { status, from, to };
                saveFilter({ status: f.status ?? "DONE", from: f.from ?? "", to: f.to ?? "" });
                const params = new URLSearchParams();
                // Default DONE tanpa tanggal = semua backlog (perilaku lama).
                if (f.status && f.status !== "DONE") params.set("status", f.status);
                if (f.status === "ALL") params.set("status", "ALL");
                if (f.from) params.set("from", f.from);
                if (f.to) params.set("to", f.to);
                const qs = params.toString();
                const res = await fetch(`/api/employee/equipment/approvals/pending-approval${qs ? `?${qs}` : ""}`);
                if (res.status === 403) {
                    setForbidden(true);
                    setRows([]);
                    return;
                }
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat antrean approval."));
                const json = await res.json();
                setRows(json.data ?? []);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal memuat antrean.";
                setError(msg);
                reportClientError("EquipmentApprovalQueue", msg, err);
            } finally {
                setLoading(false);
            }
        },
        [status, from, to]
    );

    useEffect(() => {
        void fetchQueue();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const visibleRows = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((row) => {
            const hay = [
                row.unit.name,
                row.unit.brand ?? "",
                row.startedBy.name,
                row.checkedByNameSnapshot ?? "",
                row.approvedByNameSnapshot ?? "",
            ]
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        });
    }, [rows, query]);

    const waitingCount = useMemo(() => rows.filter((r) => r.status === "DONE").length, [rows]);
    const approvedCount = useMemo(() => rows.filter((r) => r.status === "APPROVED").length, [rows]);

    const applyStatus = (next: QueueStatus) => {
        setStatus(next);
        void fetchQueue({ status: next, from, to });
    };

    const applyToday = () => {
        const today = toInputDate(new Date());
        setFrom(today);
        setTo(today);
        void fetchQueue({ status, from: today, to: today });
    };

    const applyYesterday = () => {
        const today = toInputDate(new Date());
        const yesterday = shiftInputDate(today, -1);
        setFrom(yesterday);
        setTo(yesterday);
        void fetchQueue({ status, from: yesterday, to: yesterday });
    };

    const applyLast7 = () => {
        const today = toInputDate(new Date());
        const weekAgo = shiftInputDate(today, -6);
        setFrom(weekAgo);
        setTo(today);
        void fetchQueue({ status, from: weekAgo, to: today });
    };

    const applyAllDates = () => {
        setFrom("");
        setTo("");
        void fetchQueue({ status, from: "", to: "" });
    };

    const subtitle =
        status === "APPROVED"
            ? `${visibleRows.length} riwayat disetujui (filter tanggal = tanggal approval).`
            : status === "ALL"
              ? `${waitingCount} menunggu · ${approvedCount} disetujui.`
              : rows.length === 0
                ? "Daftar pemeriksaan yang menunggu approval final dari Anda."
                : `${rows.length} pemeriksaan menunggu approval final.`;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Persetujuan Final Alat"
                subtitle={subtitle}
                icon={CheckCircle2}
                action={
                    <button
                        type="button"
                        onClick={() => void fetchQueue()}
                        disabled={loading}
                        className="btn btn-secondary btn-sm min-h-[44px]"
                    >
                        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat Ulang
                    </button>
                }
            />

            {forbidden && !loading && (
                <EmptyState
                    icon={CheckCircle2}
                    title="Halaman ini hanya untuk approver yang ditunjuk."
                    description="Hubungi admin GA bila Anda seharusnya memiliki akses."
                />
            )}

            {!forbidden && (
                <>
                    <div className="emp-surface p-4">
                        <div className="flex gap-2" role="tablist" aria-label="Filter status approval">
                            {(
                                [
                                    ["DONE", "Menunggu"],
                                    ["APPROVED", "Disetujui"],
                                    ["ALL", "Semua"],
                                ] as [QueueStatus, string][]
                            ).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="tab"
                                    aria-selected={status === value}
                                    onClick={() => applyStatus(value)}
                                    disabled={loading}
                                    className={`flex-1 px-3 min-h-[44px] text-[11px] font-semibold rounded-lg border transition-colors active:scale-[0.99] disabled:opacity-50 ${
                                        status === value
                                            ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]"
                                            : "border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:border-[color-mix(in_srgb,var(--primary)_40%,transparent)]"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="mt-3">
                            <EquipmentSearchField
                                id="cari-approval"
                                label="Cari approval"
                                value={query}
                                onChange={setQuery}
                                placeholder="Cari alat, pengirim, QC, approver..."
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                            <div>
                                <label htmlFor="approval-dari" className="text-[10px] font-semibold text-[var(--text-muted)]">Dari tanggal</label>
                                <input id="approval-dari" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label htmlFor="approval-sampai" className="text-[10px] font-semibold text-[var(--text-muted)]">Sampai tanggal</label>
                                <input id="approval-sampai" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
                            </div>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-2">
                            {status === "APPROVED"
                                ? "Rentang tanggal memakai tanggal approval."
                                : status === "ALL"
                                  ? "Rentang tanggal memakai tanggal QC (menunggu) atau tanggal approval (disetujui)."
                                  : "Rentang tanggal memakai tanggal QC. Kosongkan untuk semua tunggakan."}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                            <button
                                type="button"
                                onClick={() => void fetchQueue()}
                                disabled={loading}
                                className="btn btn-primary min-h-[44px]"
                            >
                                {loading ? "Memuat..." : "Tampilkan"}
                            </button>
                            <button
                                type="button"
                                onClick={applyToday}
                                disabled={loading}
                                className="btn btn-secondary min-h-[44px]"
                            >
                                Hari ini
                            </button>
                            <button
                                type="button"
                                onClick={applyYesterday}
                                disabled={loading}
                                className="btn btn-secondary min-h-[44px]"
                            >
                                Kemarin
                            </button>
                            <button
                                type="button"
                                onClick={applyLast7}
                                disabled={loading}
                                className="btn btn-secondary min-h-[44px]"
                            >
                                7 hari
                            </button>
                            <button
                                type="button"
                                onClick={applyAllDates}
                                disabled={loading}
                                className="btn btn-secondary min-h-[44px]"
                            >
                                Semua tanggal
                            </button>
                        </div>
                    </div>

                    {loading && <ListSkeleton count={3} label="Memuat antrean approval" />}

                    {error && !loading && (
                        <StateCard
                            variant="error"
                            title="Antrean approval gagal dimuat"
                            description={error}
                            action={
                                <button onClick={() => void fetchQueue()} className="btn btn-secondary btn-sm">
                                    Coba lagi
                                </button>
                            }
                        />
                    )}

                    {!loading && !error && visibleRows.length === 0 && (
                        <EmptyState
                            icon={CheckCircle2}
                            title={
                                rows.length === 0
                                    ? status === "APPROVED"
                                        ? "Belum ada riwayat disetujui pada rentang ini."
                                        : status === "ALL"
                                          ? "Tidak ada data pada rentang ini."
                                          : "Tidak ada yang menunggu approval."
                                    : "Tidak ditemukan. Coba kata kunci lain."
                            }
                            description={
                                rows.length === 0 && status === "DONE"
                                    ? "Semua pemeriksaan yang sudah diverifikasi QC sudah disetujui."
                                    : rows.length === 0
                                      ? "Coba ubah rentang tanggal atau tab status."
                                      : undefined
                            }
                        />
                    )}

                    <div className="space-y-3" aria-live="polite">
                        {visibleRows.map((row) => (
                            <Link
                                key={row.id}
                                href={`/employee/equipment/overview/${row.id}?from=approval-queue`}
                                aria-label={`Periksa ${row.unit.name}`}
                                className="emp-surface emp-surface-hover block p-4 active:scale-[0.99] transition-colors"
                            >
                                <div className="flex items-start gap-2.5">
                                    <EquipmentStatusDot status={row.status} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                                            {row.unit.name}{" "}
                                            <EquipmentCompanyBadge
                                                company={row.unit.company}
                                                isSharedBoth={(row.unit as { isSharedBoth?: boolean }).isSharedBoth}
                                                companies={(row.unit as { companies?: string[] }).companies}
                                            />
                                        </p>
                                        {row.unit.brand && <p className="text-xs text-[var(--text-muted)] truncate">{row.unit.brand}</p>}
                                        <p className="text-xs text-[var(--text-muted)] mt-1 truncate">
                                            Diajukan {stripGelar(row.startedBy.name)} · Diperiksa QC {stripGelar(row.checkedByNameSnapshot ?? "")} · {formatDateTime(row.checkedAt)}
                                        </p>
                                        {row.status === "APPROVED" && (
                                            <p className="text-xs text-[var(--success)] mt-0.5 truncate">
                                                Disetujui {stripGelar(row.approvedByNameSnapshot ?? "")} · {formatDateTime(row.approvedAt)}
                                            </p>
                                        )}
                                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                            {equipmentStatusLabel(row.status)}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-[10px] font-semibold text-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] border border-[color-mix(in_srgb,var(--primary)_30%,transparent)] rounded-full px-3 min-h-[44px] inline-flex items-center">
                                        {row.status === "APPROVED" ? "Lihat" : "Periksa"}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
