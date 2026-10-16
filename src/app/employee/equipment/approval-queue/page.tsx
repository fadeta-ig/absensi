"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";
import { EquipmentStatusDot } from "@/components/equipment/EquipmentStatusBadge";

interface QueueRow {
    id: string;
    unit: { id: string; name: string; brand: string | null };
    startedBy: { employeeId: string; name: string };
    checkedByNameSnapshot: string | null;
    checkedAt: string | null;
    submittedAt: string | null;
}

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

export default function EquipmentApprovalQueuePage() {
    const [rows, setRows] = useState<QueueRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);

    const fetchQueue = useCallback(async () => {
        setLoading(true);
        setError(null);
        setForbidden(false);
        try {
            const res = await fetch("/api/employee/equipment/approvals/pending-approval");
            if (res.status === 403) {
                setForbidden(true);
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
    }, []);

    useEffect(() => {
        void fetchQueue();
    }, [fetchQueue]);

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Persetujuan Final Alat</h1>
            <p className="text-sm text-muted-foreground mb-4">
                {rows.length === 0
                    ? "Daftar pemeriksaan yang menunggu approval final dari Anda."
                    : `${rows.length} pemeriksaan menunggu approval final.`}
            </p>

            {loading && (
                <div className="flex items-center justify-center py-12" role="status" aria-label="Memuat antrean approval">
                    <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {forbidden && !loading && (
                <div className="bg-card border border-border rounded-lg p-6 text-center">
                    <p className="text-foreground font-medium">Halaman ini hanya untuk approver yang ditunjuk.</p>
                    <p className="text-sm text-muted-foreground mt-1">Hubungi admin GA bila Anda seharusnya memiliki akses.</p>
                </div>
            )}

            {error && !loading && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
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

            {!loading && !error && !forbidden && rows.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
                    <CheckCircle2 aria-hidden="true" className="h-10 w-10 text-green-600 dark:text-green-400 mx-auto mb-2 opacity-60" />
                    <p className="text-sm font-medium text-foreground">Tidak ada yang menunggu approval.</p>
                    <p className="text-sm text-muted-foreground mt-1">Semua pemeriksaan yang sudah diverifikasi QC sudah disetujui.</p>
                </div>
            )}

            <div className="space-y-3" aria-live="polite">
                {rows.map((row) => (
                    <Link
                        key={row.id}
                        href={`/employee/equipment/overview/${row.id}`}
                        className="block bg-card border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                    >
                        <div className="flex items-start gap-2.5">
                            <EquipmentStatusDot status="DONE" />
                            <div className="min-w-0 flex-1">
                                <p className="font-medium text-foreground truncate">{row.unit.name}</p>
                                {row.unit.brand && <p className="text-xs text-muted-foreground truncate">{row.unit.brand}</p>}
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                    Diajukan {stripGelar(row.startedBy.name)} · Diperiksa QC {stripGelar(row.checkedByNameSnapshot ?? "")} · {formatDateTime(row.checkedAt)}
                                </p>
                            </div>
                            <span className="shrink-0 text-xs font-semibold text-primary border border-primary/40 rounded-md px-3 min-h-[44px] inline-flex items-center">
                                Periksa
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
