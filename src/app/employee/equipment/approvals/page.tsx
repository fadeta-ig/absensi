"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileCheck2, RefreshCw } from "lucide-react";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { EquipmentStatusDot, EquipmentCompanyBadge } from "@/components/equipment/EquipmentStatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import PageHeader from "@/components/ui/PageHeader";
import StateCard from "@/components/ui/StateCard";
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
    unit: { id: string; name: string; brand: string | null; company: "WIG" | "MKI" | null };
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
        <div className="space-y-5">
            <PageHeader
                title="Pemeriksaan QC"
                subtitle={
                    tasks.length === 0
                        ? "Periksa hasil inspeksi produksi, lalu selesaikan pemeriksaannya."
                        : `${tasks.length} antrean · ${readyCount} siap diselesaikan`
                }
                icon={FileCheck2}
                action={
                    <button
                        type="button"
                        onClick={() => void fetchTasks()}
                        disabled={loading}
                        className="btn btn-secondary btn-sm min-h-[44px]"
                    >
                        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat Ulang
                    </button>
                }
            />

            {forbidden && (
                <EmptyState
                    icon={FileCheck2}
                    title="Pemeriksaan QC tidak tersedia untuk akun Anda."
                    description="Halaman ini hanya untuk anggota QC yang ditunjuk. Hubungi admin GA bila Anda seharusnya memiliki akses."
                />
            )}

            {!forbidden && loading && <ListSkeleton count={3} label="Memuat antrean QC" />}

            {!forbidden && error && !loading && (
                <StateCard
                    variant="error"
                    title="Antrean QC gagal dimuat"
                    description={error}
                    action={
                        <button onClick={() => void fetchTasks()} className="btn btn-secondary btn-sm">
                            Coba lagi
                        </button>
                    }
                />
            )}

            {!forbidden && !loading && !error && tasks.length === 0 && (
                <EmptyState
                    icon={FileCheck2}
                    title="Tidak ada antrean QC"
                    description="Tidak ada inspeksi yang menunggu pemeriksaan QC. Muat ulang untuk melihat data terbaru."
                />
            )}

            {!forbidden && !loading && !error && tasks.length > 0 && (
                <>
                    <div className="space-y-3">
                        <EquipmentSearchField
                            id="cari-antrean"
                            label="Cari antrean QC"
                            value={query}
                            onChange={setQuery}
                            placeholder="Cari alat atau pengirim..."
                        />
                        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter antrean">
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
                                    className={`shrink-0 px-3 min-h-[44px] inline-flex items-center text-[11px] font-semibold rounded-full border transition-colors active:scale-[0.99] ${
                                        qcFilter === key
                                            ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]"
                                            : "border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:border-[color-mix(in_srgb,var(--primary)_40%,transparent)]"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setQcSort((s) => (s === "OLDEST" ? "NEWEST" : "OLDEST"))}
                                aria-label={qcSort === "OLDEST" ? "Urut: terlama menunggu. Ketuk untuk terbaru." : "Urut: terbaru. Ketuk untuk terlama."}
                                className="shrink-0 px-3 min-h-[44px] inline-flex items-center text-[11px] font-semibold rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:border-[color-mix(in_srgb,var(--primary)_40%,transparent)] transition-colors active:scale-[0.99]"
                            >
                                {qcSort === "OLDEST" ? "Terlama dulu" : "Terbaru dulu"}
                            </button>
                        </div>
                    </div>
                    {visibleTasks.length === 0 && (
                        <EmptyState
                            title="Tidak ditemukan."
                            description="Coba kata kunci atau filter lain."
                            action={
                                <button
                                    type="button"
                                    onClick={() => {
                                        setQuery("");
                                        setQcFilter("ALL");
                                    }}
                                    className="btn btn-secondary btn-sm min-h-[44px]"
                                >
                                    Atur ulang pencarian
                                </button>
                            }
                        />
                    )}
                    <div className="space-y-3" aria-live="polite">
                        {visibleTasks.map((task) => {
                            const stats = taskStats(task);
                            return (
                                <div key={task.id} className="emp-surface p-4">
                                    <div className="flex items-start gap-2">
                                        <EquipmentStatusDot status={stats.attention ? "OPEN" : "SUBMITTED"} />
                                        <div className="min-w-0 flex-1">
                                            <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                                                {task.unit.name}{" "}
                                                <EquipmentCompanyBadge
                                                    company={task.unit.company}
                                                    isSharedBoth={(task.unit as { isSharedBoth?: boolean }).isSharedBoth}
                                                    companies={(task.unit as { companies?: string[] }).companies}
                                                />
                                            </h3>
                                            {task.unit.brand && (
                                                <p className="text-xs text-[var(--text-muted)]">{task.unit.brand}</p>
                                            )}
                                            <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
                                                Dari {stripGelar(task.startedBy.name)} · {waitingFor(task.submittedAt)}
                                            </p>
                                            <p className={`text-xs mt-0.5 ${stats.rusak > 0 ? "font-semibold text-[var(--destructive-text)]" : stats.belum > 0 ? "font-medium text-[var(--warning)]" : "text-[var(--text-muted)]"}`}>
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
