"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Camera, CheckCircle2, Clock, Loader2, X } from "lucide-react";
import { EquipmentEvidencePanel } from "@/components/equipment/EquipmentEvidencePanel";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { EquipmentStatusBadge, EquipmentCompanyBadge } from "@/components/equipment/EquipmentStatusBadge";
import { stripGelar } from "@/lib/utils/formatters";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import StateCard from "@/components/ui/StateCard";

interface DetailItem {
    id: string;
    itemNameSnapshot: string;
    isPass: boolean | null;
    note: string | null;
}

interface InspectionDetail {
    id: string;
    unit: { id: string; name: string; brand: string | null; location: string | null; company: "WIG" | "MKI" | null };
    startedBy: { employeeId: string; name: string };
    status: string;
    createdAt: string;
    submittedAt: string | null;
    checkedBy: { employeeId: string; name: string } | null;
    checkedByNameSnapshot: string | null;
    checkedAt: string | null;
    qcNote: string | null;
    approvedBy: { employeeId: string; name: string } | null;
    approvedByNameSnapshot: string | null;
    approvedAt: string | null;
    items: DetailItem[];
    progress: { total: number; decided: number };
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
    const pathname = usePathname();
    const equipmentBase = pathname?.startsWith("/outsource/equipment") ? "/outsource/equipment" : "/employee/equipment";
    const [detail, setDetail] = useState<InspectionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [canApprove, setCanApprove] = useState(false);
    const [approving, setApproving] = useState(false);
    const [fromParam, setFromParam] = useState<string | null>(null);
    // Detail dipakai dari dua pintu: pantauan atasan dan antrean approval.
    // Approver (tanpa akses overview) harus kembali ke approval-queue.
    // Baca query manual (tanpa useSearchParams) agar aman saat prerender.
    useEffect(() => {
        try {
            setFromParam(new URLSearchParams(window.location.search).get("from"));
        } catch {
            setFromParam(null);
        }
    }, []);
    const backHref = fromParam === "approval-queue" ? `${equipmentBase}/approval-queue` : `${equipmentBase}/overview`;
    const backLabel = fromParam === "approval-queue" ? "← Kembali ke approval" : "← Kembali ke pantauan";
    const toast = useToast();
    const confirm = useConfirm();

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

    useEffect(() => {
        fetch("/api/employee/equipment/capabilities")
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => setCanApprove(json?.data?.canApprove === true))
            .catch(() => setCanApprove(false));
    }, []);

    const handleApprove = () => {
        if (!detail || approving) return;
        confirm({
            title: "Setujui Inspeksi?",
            message: `${detail.unit.name} — hasil pemeriksaan akan disetujui atas nama Anda. Keputusan ini tidak dapat dibatalkan.`,
            confirmLabel: "Ya, Setujui",
            cancelLabel: "Batal",
            onConfirm: () => {
                void (async () => {
                    setApproving(true);
                    try {
                        const res = await fetch("/api/employee/equipment/approvals/approve", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ inspectionId: detail.id }),
                        });
                        if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyetujui inspeksi."));
                        await fetchDetail();
                        toast("Inspeksi telah disetujui.", "success");
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : "Gagal menyetujui inspeksi.";
                        reportClientError("EmployeeEquipmentOverviewDetail", msg, err, { inspectionId: detail.id });
                        toast(msg, "error");
                    } finally {
                        setApproving(false);
                    }
                })();
            },
        });
    };

    if (loading) {
        return (
            <div className="space-y-5">
                <ListSkeleton count={3} label="Memuat detail inspeksi" />
            </div>
        );
    }

    if (forbidden) {
        return (
            <div className="space-y-5">
                <EmptyState
                    title="Detail tidak tersedia untuk akun Anda."
                    description="Halaman ini hanya untuk atasan yang ditunjuk."
                    action={
                        <Link href={backHref} className="btn btn-secondary btn-sm min-h-[44px]">
                            {backLabel}
                        </Link>
                    }
                />
            </div>
        );
    }

    if (error || !detail) {
        return (
            <div className="space-y-5">
                <StateCard
                    variant="error"
                    title="Detail inspeksi gagal dimuat"
                    description={error ?? "Detail tidak ditemukan."}
                    action={
                        <div className="flex items-center justify-center gap-3">
                            <button onClick={() => void fetchDetail()} className="btn btn-secondary btn-sm min-h-[44px]">
                                Coba lagi
                            </button>
                            <Link href={backHref} className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors min-h-[44px] px-3 inline-flex items-center">
                                ← Kembali
                            </Link>
                        </div>
                    }
                />
            </div>
        );
    }

    const baik = detail.items.filter((i) => i.isPass === true).length;
    const rusak = detail.items.filter((i) => i.isPass === false).length;

    return (
        <div className="space-y-5">
            <Link
                href={backHref}
                className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1 min-h-[44px] px-2 -ml-2"
            >
                {backLabel}
            </Link>

            <div className="emp-surface p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <h1 className="text-xl font-extrabold leading-none tracking-tight text-[var(--text-primary)]">
                            {detail.unit.name}{" "}
                            <EquipmentCompanyBadge
                                company={detail.unit.company}
                                isSharedBoth={(detail.unit as { isSharedBoth?: boolean }).isSharedBoth}
                                companies={(detail.unit as { companies?: string[] }).companies}
                            />
                        </h1>
                        <p className="mt-1 text-[11px] font-medium leading-tight text-[var(--text-secondary)]">
                            {[detail.unit.brand, detail.unit.location].filter(Boolean).join(" · ") || "—"}
                        </p>
                    </div>
                    <EquipmentStatusBadge status={detail.status} />
                </div>
                <p className="text-[10px] font-semibold text-[var(--text-muted)] mt-2">
                    {detail.progress.decided}/{detail.progress.total} item dinilai · {baik} baik · {rusak} rusak
                </p>
            </div>

            <div className="emp-surface p-4">
                <h2 className="emp-eyebrow flex items-center gap-1.5 mb-2">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Linimasa
                </h2>
                <ol className="space-y-2 text-[13px]">
                    <li className="flex gap-2">
                        <span className="text-[var(--text-muted)] shrink-0 w-16">Mulai</span>
                        <span className="text-[var(--text-primary)]">
                            {stripGelar(detail.startedBy.name)} · {formatDateTime(detail.createdAt)}
                        </span>
                    </li>
                    <li className="flex gap-2">
                        <span className="text-[var(--text-muted)] shrink-0 w-16">Submit</span>
                        <span className="text-[var(--text-primary)]">{formatDateTime(detail.submittedAt)}</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="text-[var(--text-muted)] shrink-0 w-16">QC</span>
                        <span className="text-[var(--text-primary)]">
                            {detail.checkedByNameSnapshot || detail.checkedBy
                                ? `Diperiksa oleh ${stripGelar(detail.checkedByNameSnapshot ?? detail.checkedBy?.name ?? "")} (QC) · ${formatDateTime(detail.checkedAt)}`
                                : "Menunggu pemeriksaan QC"}
                        </span>
                    </li>
                    <li className="flex gap-2">
                        <span className="text-[var(--text-muted)] shrink-0 w-16">Approval</span>
                        <span className="text-[var(--text-primary)]">
                            {detail.approvedByNameSnapshot || detail.approvedBy
                                ? `Disetujui - ${stripGelar(detail.approvedByNameSnapshot ?? detail.approvedBy?.name ?? "")} · ${formatDateTime(detail.approvedAt)}`
                                : "Menunggu approval atasan"}
                        </span>
                    </li>
                </ol>
                {detail.qcNote && (
                    <p className="text-xs text-[var(--text-muted)] mt-2">Catatan QC: {detail.qcNote}</p>
                )}
                {detail.status === "DONE" && canApprove && (
                    <button
                        onClick={handleApprove}
                        disabled={approving}
                        className="btn btn-primary btn-sm mt-3 min-h-[44px] px-4 inline-flex items-center gap-2 disabled:opacity-50"
                    >
                        {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {approving ? "Menyimpan..." : "Setujui Pemeriksaan"}
                    </button>
                )}
            </div>

            <div className="space-y-3">
                {detail.items.map((item) => (
                    <div key={item.id} className="emp-surface px-4 py-3">
                        <div className="flex items-start gap-2">
                            {item.isPass === true ? (
                                <CheckCircle2 className="h-4 w-4 text-[var(--success)] mt-0.5 shrink-0" />
                            ) : item.isPass === false ? (
                                <X className="h-4 w-4 text-[var(--destructive-text)] mt-0.5 shrink-0" />
                            ) : (
                                <AlertTriangle className="h-4 w-4 text-[var(--warning)] mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-[var(--text-primary)]">
                                    {item.itemNameSnapshot}{" "}
                                    <span className="font-normal text-[var(--text-muted)]">
                                        — {item.isPass === true ? "Baik" : item.isPass === false ? "Rusak" : "Belum dinilai"}
                                    </span>
                                </p>
                                {item.note && <p className="text-xs text-[var(--text-muted)] mt-0.5">Catatan: {item.note}</p>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="emp-surface p-4">
                <h2 className="emp-eyebrow flex items-center gap-1.5 mb-1">
                    <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Foto dokumentasi produksi
                </h2>
                <div className="mt-1">
                    <EquipmentEvidencePanel inspectionId={detail.id} collapsible />
                </div>
            </div>

            {(detail.checkedByNameSnapshot || detail.checkedBy) && (
                <div className="emp-surface p-4">
                    <h2 className="emp-eyebrow flex items-center gap-1.5 mb-2">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Dokumentasi QC
                    </h2>
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
