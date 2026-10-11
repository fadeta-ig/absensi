"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { EquipmentEvidencePanel } from "@/components/equipment/EquipmentEvidencePanel";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";

interface DetailItem {
    id: string;
    itemNameSnapshot: string;
    isPass: boolean | null;
    note: string | null;
}

interface InspectionDetail {
    id: string;
    unit: { id: string; name: string; brand: string | null; location: string | null };
    startedBy: { employeeId: string; name: string };
    status: string;
    createdAt: string;
    submittedAt: string | null;
    checkedBy: { employeeId: string; name: string } | null;
    checkedByNameSnapshot: string | null;
    checkedAt: string | null;
    qcNote: string | null;
    items: DetailItem[];
    progress: { total: number; decided: number };
}

const STATUS_LABEL: Record<string, string> = {
    OPEN: "Berjalan",
    SUBMITTED: "Terkirim",
    DONE: "Selesai",
};

function statusBadgeClass(status: string): string {
    switch (status) {
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

export default function EmployeeEquipmentOverviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const [detail, setDetail] = useState<InspectionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);

    const fetchDetail = useCallback(async () => {
        setLoading(true);
        setError(null);
        setForbidden(false);
        try {
            const { id } = await params;
            const res = await fetch(`/api/employee/equipment/inspections/${id}`);
            if (res.status === 403) {
                setForbidden(true);
                return;
            }
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat detail inspeksi."));
            const json = await res.json();
            setDetail(json.data as InspectionDetail);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat detail.";
            setError(msg);
            reportClientError("EmployeeEquipmentOverviewDetail", msg, err);
        } finally {
            setLoading(false);
        }
    }, [params]);

    useEffect(() => {
        void fetchDetail();
    }, [fetchDetail]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (forbidden) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-6">
                <div className="bg-card border border-border rounded-lg p-6 text-center">
                    <p className="text-foreground font-medium">Detail tidak tersedia untuk akun Anda.</p>
                    <p className="text-sm text-muted-foreground mt-1">Halaman ini hanya untuk atasan yang ditunjuk.</p>
                    <Link href="/employee/equipment/overview" className="mt-3 inline-block text-sm text-primary hover:underline">
                        ← Kembali ke pantauan
                    </Link>
                </div>
            </div>
        );
    }

    if (error || !detail) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-6">
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
                    <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
                    <p className="text-sm text-destructive">{error ?? "Detail tidak ditemukan."}</p>
                    <div className="mt-3 flex items-center justify-center gap-3 text-sm">
                        <button onClick={() => void fetchDetail()} className="text-primary hover:underline min-h-[44px] px-3 inline-flex items-center">
                            Coba lagi
                        </button>
                        <Link href="/employee/equipment/overview" className="text-muted-foreground hover:text-foreground min-h-[44px] px-3 inline-flex items-center">
                            ← Kembali
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const baik = detail.items.filter((i) => i.isPass === true).length;
    const rusak = detail.items.filter((i) => i.isPass === false).length;

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <Link
                href="/employee/equipment/overview"
                className="text-sm font-medium text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 min-h-[44px] px-2 -ml-2"
            >
                ← Kembali ke pantauan
            </Link>

            <div className="bg-card border border-border rounded-lg p-4 mb-4">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold text-foreground">{detail.unit.name}</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            {[detail.unit.brand, detail.unit.location].filter(Boolean).join(" · ") || "—"}
                        </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${statusBadgeClass(detail.status)}`}>
                        {STATUS_LABEL[detail.status] ?? detail.status}
                    </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                    {detail.progress.decided}/{detail.progress.total} item dinilai · {baik} baik · {rusak} rusak
                </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-4 mb-4">
                <h2 className="text-sm font-semibold text-foreground mb-2">Linimasa</h2>
                <ol className="space-y-2 text-sm">
                    <li className="flex gap-2">
                        <span className="text-muted-foreground shrink-0 w-16">Mulai</span>
                        <span className="text-foreground">
                            {stripGelar(detail.startedBy.name)} · {formatDateTime(detail.createdAt)}
                        </span>
                    </li>
                    <li className="flex gap-2">
                        <span className="text-muted-foreground shrink-0 w-16">Submit</span>
                        <span className="text-foreground">{formatDateTime(detail.submittedAt)}</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="text-muted-foreground shrink-0 w-16">QC</span>
                        <span className="text-foreground">
                            {detail.checkedByNameSnapshot || detail.checkedBy
                                ? `Checked by QC - ${stripGelar(detail.checkedByNameSnapshot ?? detail.checkedBy?.name ?? "")} · ${formatDateTime(detail.checkedAt)}`
                                : "Menunggu pemeriksaan QC"}
                        </span>
                    </li>
                </ol>
                {detail.qcNote && (
                    <p className="text-xs text-muted-foreground mt-2">Catatan QC: {detail.qcNote}</p>
                )}
            </div>

            <div className="space-y-3 mb-4">
                {detail.items.map((item) => (
                    <div key={item.id} className="bg-card border border-border rounded-lg px-3 py-2">
                        <div className="flex items-start gap-2">
                            {item.isPass === true ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                            ) : item.isPass === false ? (
                                <X className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                            ) : (
                                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">
                                    {item.itemNameSnapshot}{" "}
                                    <span className="font-normal text-muted-foreground">
                                        — {item.isPass === true ? "Baik" : item.isPass === false ? "Rusak" : "Belum dinilai"}
                                    </span>
                                </p>
                                {item.note && <p className="text-xs text-muted-foreground mt-0.5">Catatan: {item.note}</p>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-card border border-border rounded-lg p-4 mb-4">
                <h2 className="text-sm font-semibold text-foreground mb-1">Foto dokumentasi produksi</h2>
                <div className="mt-1">
                    <EquipmentEvidencePanel inspectionId={detail.id} collapsible />
                </div>
            </div>

            {(detail.checkedByNameSnapshot || detail.checkedBy) && (
                <div className="bg-card border border-border rounded-lg p-4">
                    <h2 className="text-sm font-semibold text-foreground mb-2">Dokumentasi QC</h2>
                    <div className="mt-1">
                        <EquipmentEvidencePanel
                            inspectionId={detail.id}
                            collapsible
                            listUrl={`/api/employee/equipment/qc-evidence?inspectionId=${encodeURIComponent(detail.id)}`}
                            fileUrl={(id) => `/api/employee/equipment/qc-evidence/${id}`}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
