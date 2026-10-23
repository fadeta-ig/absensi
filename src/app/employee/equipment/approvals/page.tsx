"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, FileCheck2, RefreshCw } from "lucide-react";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { EquipmentStatusDot } from "@/components/equipment/EquipmentStatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";

interface ApprovalItem {
    id: string;
    itemNameSnapshot: string;
    requirePhoto: boolean;
    isActive: boolean;
    isPass: boolean | null;
    note: string | null;
    evidence: Array<{ id: string }>;
}

interface ApprovalDto {
    id: string;
    unit: { id: string; name: string; brand: string | null };
    startedBy: { employeeId: string; name: string };
    status: string;
    submittedAt: string | null;
    checkedBy: { employeeId: string; name: string } | null;
    checkedByNameSnapshot: string | null;
    checkedAt: string | null;
    qcNote: string | null;
    items: ApprovalItem[];
    qcEvidence: Array<{ id: string; note: string | null; capturedAt: string }>;
    progress: { total: number; decided: number; allDecided: boolean; photoOk: boolean };
}

/** "Menunggu 3j 20m" dari submittedAt — bantu QC dahulukan yang lama. */
function waitingFor(submittedAt: string | null): string {
    if (!submittedAt) return "";
    const mins = Math.max(0, Math.floor((Date.now() - new Date(submittedAt).getTime()) / 60000));
    if (mins < 60) return `Menunggu ${mins}m`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `Menunggu ${h}j ${mins % 60}m`;
    return `Menunggu ${Math.floor(h / 24)}h ${h % 24}j`;
}

type QcFilter = "ALL" | "READY" | "ATTENTION";
type QcSort = "OLDEST" | "NEWEST";

function taskStats(task: ApprovalDto) {
    const active = task.items.filter((i) => i.isActive);
    const baik = active.filter((i) => i.isPass === true).length;
    const rusak = active.filter((i) => i.isPass === false).length;
    const belum = active.filter((i) => i.isPass === null).length;
    const ready = belum === 0;
    return { baik, rusak, belum, ready, attention: rusak > 0 || belum > 0 };
}

export default function EmployeeEquipmentApprovalsPage() {
    const [tasks, setTasks] = useState<ApprovalDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [query, setQuery] = useState("");
    const [qcFilter, setQcFilter] = useState<QcFilter>("ALL");
    const [qcSort, setQcSort] = useState<QcSort>("OLDEST");

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        setError(null);
        setForbidden(false);
        try {
            const res = await fetch("/api/employee/equipment/approvals");
            if (res.status === 403) {
                setForbidden(true);
                return;
            }
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat antrean QC."));
            const json = await res.json();
            setTasks(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat antrean.";
            setError(msg);
            reportClientError("EmployeeEquipmentQc", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchTasks();
    }, [fetchTasks]);

    const readyCount = useMemo(() => tasks.filter((t) => taskStats(t).ready).length, [tasks]);

    const visibleTasks = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = tasks.filter((task) => {
            if (q) {
                const hay = [task.unit.name, task.unit.brand ?? "", task.startedBy.name].join(" ").toLowerCase();
                if (!hay.includes(q)) return false;
            }
            const stats = taskStats(task);
            if (qcFilter === "READY" && !stats.ready) return false;
            if (qcFilter === "ATTENTION" && !stats.attention) return false;
            return true;
        });
        return [...filtered].sort((a, b) => {
            const at = new Date(a.submittedAt ?? 0).getTime();
            const bt = new Date(b.submittedAt ?? 0).getTime();
            return qcSort === "OLDEST" ? at - bt : bt - at;
        });
    }, [tasks, query, qcFilter, qcSort]);

    return (
        <div className="mx-auto px-4 py-6">
            <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">Pemeriksaan QC</h1>
                    <p className="text-sm text-[var(--text-muted)] mt-0.5">
                        {tasks.length === 0
                            ? "Periksa hasil inspeksi produksi, lalu selesaikan pemeriksaannya."
                            : `${tasks.length} antrean · ${readyCount} siap diselesaikan`}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void fetchTasks()}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50 shrink-0"
                >
                    <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat Ulang
                </button>
            </div>

            {forbidden && (
                <div className="card p-6 text-center">
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">Pemeriksaan QC tidak tersedia untuk akun Anda.</h2>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Halaman ini hanya untuk anggota QC yang ditunjuk. Hubungi admin GA bila Anda seharusnya memiliki akses.
                    </p>
                </div>
            )}

            {!forbidden && loading && (
                <div role="status" aria-live="polite" aria-label="Memuat antrean QC">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="bg-card border border-border rounded-lg p-4 mb-3">
                            <Skeleton className="h-5 w-2/3 mb-2" />
                            <Skeleton className="h-4 w-1/2 mb-1" />
                            <Skeleton className="h-3 w-1/3" />
                        </div>
                    ))}
                </div>
            )}

            {!forbidden && error && !loading && (
                <div className="mb-6 p-4 bg-[var(--destructive-bg)] text-[var(--destructive)] rounded-xl border border-[var(--destructive-border)] text-center">
                    <AlertTriangle className="h-5 w-5 mx-auto mb-2" />
                    <p className="text-sm">{error}</p>
                    <button onClick={() => void fetchTasks()} className="mt-3 text-sm font-medium text-primary hover:underline min-h-[44px] px-3 inline-flex items-center">
                        Coba lagi
                    </button>
                </div>
            )}

            {!forbidden && !loading && !error && tasks.length === 0 && (
                <div className="text-center py-16 border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--card)]">
                    <FileCheck2 aria-hidden="true" className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
                    <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Tidak Ada Antrean QC</h3>
                    <p className="text-sm text-[var(--text-muted)] max-w-sm mx-auto">
                        Tidak ada inspeksi yang menunggu pemeriksaan QC. Muat ulang untuk melihat data terbaru.
                    </p>
                </div>
            )}

            {!forbidden && !loading && !error && tasks.length > 0 && (
                <>
                    <div className="mb-3">
                        <EquipmentSearchField
                            id="cari-antrean"
                            label="Cari antrean QC"
                            value={query}
                            onChange={setQuery}
                            placeholder="Cari alat atau pengirim..."
                        />
                        <div className="flex gap-2 mt-2 overflow-x-auto pb-1" role="group" aria-label="Filter antrean">
                            {(
                                [
                                    ["ALL", "Semua"],
                                    ["READY", `Siap diselesaikan (${readyCount})`],
                                    ["ATTENTION", "Perlu perhatian"],
                                ] as Array<[QcFilter, string]>
                            ).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setQcFilter(key)}
                                    aria-pressed={qcFilter === key}
                                    className={`shrink-0 px-3 min-h-[44px] inline-flex items-center text-sm font-medium rounded-full border transition-colors ${
                                        qcFilter === key
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setQcSort((s) => (s === "OLDEST" ? "NEWEST" : "OLDEST"))}
                                aria-label={qcSort === "OLDEST" ? "Urut: terlama menunggu. Ketuk untuk terbaru." : "Urut: terbaru. Ketuk untuk terlama."}
                                className="shrink-0 px-3 min-h-[44px] inline-flex items-center text-sm font-medium rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                            >
                                {qcSort === "OLDEST" ? "Terlama dulu" : "Terbaru dulu"}
                            </button>
                        </div>
                    </div>
                    {visibleTasks.length === 0 && (
                        <div className="text-center py-12 border-2 border-dashed border-[var(--border)] rounded-xl">
                            <p className="text-sm font-medium text-[var(--text-primary)]">Tidak ditemukan.</p>
                            <p className="text-sm text-[var(--text-muted)] mt-1">Coba kata kunci atau filter lain.</p>
                            <button
                                type="button"
                                onClick={() => {
                                    setQuery("");
                                    setQcFilter("ALL");
                                }}
                                className="mt-3 px-4 min-h-[44px] inline-flex items-center text-sm font-medium text-primary border border-primary/40 rounded-md hover:bg-primary/10"
                            >
                                Atur ulang pencarian
                            </button>
                        </div>
                    )}
                    <div className="space-y-3" aria-live="polite">
                        {visibleTasks.map((task) => {
                            const stats = taskStats(task);
                            return (
                                <div key={task.id} className="card p-4">
                                    <div className="flex items-start gap-2">
                                        <EquipmentStatusDot status={stats.attention ? "OPEN" : "SUBMITTED"} />
                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-base font-bold text-[var(--text-primary)] truncate">{task.unit.name}</h3>
                                            {task.unit.brand && (
                                                <p className="text-xs text-[var(--text-muted)]">{task.unit.brand}</p>
                                            )}
                                            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                                                Dari {stripGelar(task.startedBy.name)} · {waitingFor(task.submittedAt)}
                                            </p>
                                            <p className={`text-xs mt-0.5 ${stats.rusak > 0 ? "font-semibold text-red-600 dark:text-red-400" : stats.belum > 0 ? "font-medium text-amber-700 dark:text-amber-300" : "text-[var(--text-muted)]"}`}>
                                                {stats.baik} baik · {stats.rusak} rusak · {stats.belum} belum dinilai
                                                {stats.ready && stats.rusak === 0 ? " · siap diselesaikan" : ""}
                                            </p>
                                        </div>
                                    </div>
                                    <Link
                                        href={`/employee/equipment/approvals/${task.id}`}
                                        className="btn btn-primary mt-3 w-full min-h-[48px]"
                                    >
                                        Lihat &amp; Selesaikan
                                    </Link>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

        </div>
    );
}
