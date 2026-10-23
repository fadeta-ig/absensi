"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";
import { EquipmentStatusDot, equipmentStatusLabel } from "@/components/equipment/EquipmentStatusBadge";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";

type QueueStatus = "DONE" | "APPROVED" | "ALL";

interface QueueRow {
    id: string;
    status: string;
    unit: { id: string; name: string; brand: string | null };
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

const inputClass =
    "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm";

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
        <div className="mx-auto px-4 py-6">
            <div className="flex items-start justify-between gap-2 mb-1">
                <h1 className="text-2xl font-semibold text-foreground">Persetujuan Final Alat</h1>
                <button
                    type="button"
                    onClick={() => void fetchQueue()}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50 shrink-0"
                >
                    <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat Ulang
                </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>

            {forbidden && !loading && (
                <div className="bg-card border border-border rounded-lg p-6 text-center">
                    <p className="text-foreground font-medium">Halaman ini hanya untuk approver yang ditunjuk.</p>
                    <p className="text-sm text-muted-foreground mt-1">Hubungi admin GA bila Anda seharusnya memiliki akses.</p>
                </div>
            )}

            {!forbidden && (
                <>
                    <div className="bg-card border border-border rounded-lg p-4 mb-4">
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
                                    className={`flex-1 px-3 min-h-[44px] text-sm font-medium rounded-md border disabled:opacity-50 ${
                                        status === value
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "border-border hover:bg-muted"
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
                                <label htmlFor="approval-dari" className="text-xs font-medium">Dari tanggal</label>
                                <input id="approval-dari" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} mt-1 min-h-[44px]`} />
                            </div>
                            <div>
                                <label htmlFor="approval-sampai" className="text-xs font-medium">Sampai tanggal</label>
                                <input id="approval-sampai" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} mt-1 min-h-[44px]`} />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
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
                                className="px-4 min-h-[44px] text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                            >
                                {loading ? "Memuat..." : "Tampilkan"}
                            </button>
                            <button
                                type="button"
                                onClick={applyToday}
                                disabled={loading}
                                className="px-4 min-h-[44px] text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50"
                            >
                                Hari ini
                            </button>
                            <button
                                type="button"
                                onClick={applyYesterday}
                                disabled={loading}
                                className="px-4 min-h-[44px] text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50"
                            >
                                Kemarin
                            </button>
                            <button
                                type="button"
                                onClick={applyLast7}
                                disabled={loading}
                                className="px-4 min-h-[44px] text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50"
                            >
                                7 hari
                            </button>
                            <button
                                type="button"
                                onClick={applyAllDates}
                                disabled={loading}
                                className="px-4 min-h-[44px] text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50"
                            >
                                Semua tanggal
                            </button>
                        </div>
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center py-12" role="status" aria-label="Memuat antrean approval">
                            <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {error && !loading && (
                        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center" role="alert">
                            <AlertTriangle aria-hidden="true" className="h-5 w-5 text-destructive mx-auto mb-2" />
                            <p className="text-sm text-destructive">{error}</p>
                            <button
                                onClick={() => void fetchQueue()}
                                className="mt-3 text-sm font-medium text-primary hover:underline min-h-[44px] px-3 inline-flex items-center"
                            >
                                Coba lagi
                            </button>
                        </div>
                    )}

                    {!loading && !error && visibleRows.length === 0 && (
                        <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                            <CheckCircle2 aria-hidden="true" className="h-10 w-10 text-green-600 dark:text-green-400 mx-auto mb-2 opacity-60" />
                            <p className="text-sm font-medium text-foreground">
                                {rows.length === 0
                                    ? status === "APPROVED"
                                        ? "Belum ada riwayat disetujui pada rentang ini."
                                        : status === "ALL"
                                          ? "Tidak ada data pada rentang ini."
                                          : "Tidak ada yang menunggu approval."
                                    : "Tidak ditemukan. Coba kata kunci lain."}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                                {rows.length === 0 && status === "DONE"
                                    ? "Semua pemeriksaan yang sudah diverifikasi QC sudah disetujui."
                                    : rows.length === 0
                                      ? "Coba ubah rentang tanggal atau tab status."
                                      : ""}
                            </p>
                        </div>
                    )}

                    <div className="space-y-3" aria-live="polite">
                        {visibleRows.map((row) => (
                            <Link
                                key={row.id}
                                href={`/employee/equipment/overview/${row.id}?from=approval-queue`}
                                aria-label={`Periksa ${row.unit.name}`}
                                className="block bg-card border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                            >
                                <div className="flex items-start gap-2.5">
                                    <EquipmentStatusDot status={row.status} />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-foreground truncate">{row.unit.name}</p>
                                        {row.unit.brand && <p className="text-xs text-muted-foreground truncate">{row.unit.brand}</p>}
                                        <p className="text-xs text-muted-foreground mt-1 truncate">
                                            Diajukan {stripGelar(row.startedBy.name)} · Diperiksa QC {stripGelar(row.checkedByNameSnapshot ?? "")} · {formatDateTime(row.checkedAt)}
                                        </p>
                                        {row.status === "APPROVED" && (
                                            <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 truncate">
                                                Disetujui {stripGelar(row.approvedByNameSnapshot ?? "")} · {formatDateTime(row.approvedAt)}
                                            </p>
                                        )}
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {equipmentStatusLabel(row.status)}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-xs font-semibold text-primary border border-primary/40 rounded-md px-3 min-h-[44px] inline-flex items-center">
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
