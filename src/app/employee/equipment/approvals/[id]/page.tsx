"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, Loader2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { EquipmentEvidencePanel } from "@/components/equipment/EquipmentEvidencePanel";
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

interface QcPhoto {
    id: string;
    url: string;
    note: string | null;
    capturedAt: string;
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

export default function QcDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const toast = useToast();
    const confirm = useConfirm();
    const [detail, setDetail] = useState<ApprovalDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [doneBusy, setDoneBusy] = useState(false);
    const [qcNote, setQcNote] = useState("");

    const [qcPhotos, setQcPhotos] = useState<QcPhoto[]>([]);
    const [qcPhotosLoading, setQcPhotosLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [photoNote, setPhotoNote] = useState("");
    const fileRef = useRef<HTMLInputElement | null>(null);

    const fetchQcPhotos = useCallback(async (inspectionId: string) => {
        setQcPhotosLoading(true);
        try {
            const res = await fetch(`/api/employee/equipment/qc-evidence?inspectionId=${encodeURIComponent(inspectionId)}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat foto QC."));
            const json = await res.json();
            setQcPhotos((json.data ?? []) as QcPhoto[]);
        } catch (err) {
            reportClientError("EmployeeEquipmentQc", "QC photos load failed", err);
            setQcPhotos([]);
        } finally {
            setQcPhotosLoading(false);
        }
    }, []);

    const fetchDetail = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { id } = await params;
            const res = await fetch(`/api/employee/equipment/inspections/${id}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat detail inspeksi."));
            const json = await res.json();
            const dto = json.data as ApprovalDto;
            setDetail(dto);
            setQcNote(dto.qcNote ?? "");
            await fetchQcPhotos(dto.id);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat detail.";
            setError(msg);
            reportClientError("EmployeeEquipmentQc", msg, err);
        } finally {
            setLoading(false);
        }
    }, [params, fetchQcPhotos]);

    useEffect(() => {
        void fetchDetail();
    }, [fetchDetail]);

    const handleUploadPhoto = useCallback(
        async (file: File) => {
            if (!detail || uploading) return;
            setUploading(true);
            try {
                const form = new FormData();
                form.append("inspectionId", detail.id);
                form.append("photo", file);
                if (photoNote.trim()) form.append("note", photoNote.trim());
                const res = await fetch("/api/employee/equipment/qc-evidence", { method: "POST", body: form });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengunggah foto QC."));
                setPhotoNote("");
                if (fileRef.current) fileRef.current.value = "";
                toast("Foto QC tersimpan.", "success");
                await fetchQcPhotos(detail.id);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal mengunggah foto.";
                toast(msg, "error");
                reportClientError("EmployeeEquipmentQc", msg, err);
            } finally {
                setUploading(false);
            }
        },
        [detail, uploading, photoNote, toast, fetchQcPhotos]
    );

    const handleDone = useCallback(() => {
        if (!detail || doneBusy) return;
        const baik = detail.items.filter((i) => i.isActive && i.isPass === true).length;
        const rusak = detail.items.filter((i) => i.isActive && i.isPass === false).length;
        confirm({
            title: "Selesaikan pemeriksaan ini?",
            message: `${detail.unit.name} — ${baik} baik, ${rusak} rusak. Riwayat akan mencatat pemeriksaan QC atas nama Anda. Keputusan ini tidak dapat dibatalkan.`,
            confirmLabel: "Ya, selesaikan",
            cancelLabel: "Batal",
            variant: "info",
            onConfirm: () => {
                void (async () => {
                    setDoneBusy(true);
                    try {
                        const res = await fetch("/api/employee/equipment/approvals/done", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ inspectionId: detail.id, note: qcNote.trim() ? qcNote.trim() : null }),
                        });
                        if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyelesaikan inspeksi."));
                        const json = await res.json();
                        const dto = json.data as ApprovalDto;
                        setDetail(dto);
                        toast(`Pemeriksaan QC oleh ${stripGelar(dto.checkedByNameSnapshot ?? dto.checkedBy?.name ?? "")} telah dicatat.`, "success");
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : "Gagal menyelesaikan inspeksi.";
                        toast(msg, "error");
                        reportClientError("EmployeeEquipmentQc", msg, err);
                    } finally {
                        setDoneBusy(false);
                    }
                })();
            },
        });
    }, [detail, doneBusy, qcNote, confirm, toast]);

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-6" role="status" aria-live="polite" aria-label="Memuat detail QC">
                <Skeleton className="h-7 w-2/3 mb-2" />
                <Skeleton className="h-4 w-1/2 mb-6" />
                {[0, 1, 2].map((i) => (
                    <div key={i} className="bg-card border border-border rounded-lg p-4 mb-3">
                        <Skeleton className="h-5 w-3/4 mb-2" />
                        <Skeleton className="h-4 w-1/2" />
                    </div>
                ))}
            </div>
        );
    }

    if (error || !detail) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-6">
                <Link href="/employee/equipment/approvals" className="text-sm font-medium text-muted-foreground hover:text-foreground mb-4 inline-flex items-center min-h-[44px] px-2 -ml-2">
                    ← Kembali ke antrean
                </Link>
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
                    <AlertTriangle aria-hidden="true" className="h-6 w-6 text-destructive mx-auto mb-2" />
                    <p className="text-sm text-destructive">{error ?? "Detail tidak ditemukan."}</p>
                    <button onClick={() => void fetchDetail()} className="mt-3 px-4 min-h-[44px] inline-flex items-center text-sm font-medium text-primary hover:underline">
                        Coba lagi
                    </button>
                </div>
            </div>
        );
    }

    const baik = detail.items.filter((i) => i.isActive && i.isPass === true).length;
    const rusak = detail.items.filter((i) => i.isActive && i.isPass === false).length;
    const isDone = detail.status === "DONE";

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <Link href="/employee/equipment/approvals" className="text-sm font-medium text-muted-foreground hover:text-foreground mb-4 inline-flex items-center min-h-[44px] px-2 -ml-2">
                ← Kembali ke antrean
            </Link>

            <div className="bg-card border border-border rounded-lg p-4 mb-4">
                <h1 className="text-xl font-semibold text-foreground">{detail.unit.name}</h1>
                {detail.unit.brand && <p className="text-sm text-muted-foreground">{detail.unit.brand}</p>}
                <p className="text-sm text-muted-foreground mt-1">
                    Dari {stripGelar(detail.startedBy.name)} · Dikirim {formatDateTime(detail.submittedAt)}
                </p>
                <p className={`text-sm font-medium mt-1 ${rusak > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                    {baik} baik · {rusak} rusak · {detail.progress.decided}/{detail.progress.total} dinilai
                </p>
            </div>

            {isDone ? (
                <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800 px-4 py-3 mb-4">
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                        Diperiksa oleh {stripGelar(detail.checkedByNameSnapshot ?? detail.checkedBy?.name ?? "")} (QC)
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(detail.checkedAt)}</p>
                    {detail.qcNote && <p className="text-sm text-muted-foreground mt-1">Catatan QC: {detail.qcNote}</p>}
                </div>
            ) : (
                <div className="sticky top-2 z-10 mb-4">
                    <div className="bg-card/95 backdrop-blur border border-border rounded-lg p-3 shadow-lg">
                        <label htmlFor="qc-note" className="text-xs font-medium text-secondary">
                            Catatan QC (opsional)
                        </label>
                        <textarea
                            id="qc-note"
                            value={qcNote}
                            onChange={(e) => setQcNote(e.target.value)}
                            placeholder="Contoh: sudah diperiksa, kondisi baik."
                            maxLength={1000}
                            rows={2}
                            className="form-textarea mt-1 min-h-[64px] text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground text-right">{qcNote.length}/1000</p>
                        <button
                            type="button"
                            onClick={handleDone}
                            disabled={doneBusy}
                            className="btn btn-primary w-full min-h-[52px] text-base mt-1"
                        >
                            {doneBusy && <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />}
                            {doneBusy ? "Menyimpan..." : "Selesaikan Pemeriksaan"}
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-3 mb-4">
                {detail.items
                    .filter((i) => i.isActive)
                    .map((item) => (
                        <div key={item.id} className="flex items-start gap-2 text-sm border border-[var(--border)] rounded-lg px-3 py-2.5 bg-card">
                            {item.isPass === true ? (
                                <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                            ) : item.isPass === false ? (
                                <X aria-hidden="true" className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                            ) : (
                                <AlertTriangle aria-hidden="true" className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-[var(--text-primary)]">
                                    {item.itemNameSnapshot}{" "}
                                    <span className="font-normal text-[var(--text-muted)]">
                                        — {item.isPass === true ? "Baik" : item.isPass === false ? "Rusak" : "Belum dinilai"}
                                    </span>
                                </p>
                                {item.note && <p className="text-sm text-[var(--text-muted)]">Catatan: {item.note}</p>}
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

            <div className="bg-card border border-border rounded-lg p-4">
                <h2 className="text-sm font-semibold text-foreground mb-1">
                    Foto QC (opsional{qcPhotos.length > 0 ? ` — ${qcPhotos.length} foto` : ""})
                </h2>
                {qcPhotosLoading ? (
                    <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                    qcPhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mb-3">
                            {qcPhotos.map((p, idx) => (
                                <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.note ?? `Foto QC ${idx + 1}`}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail serve privat ber-auth */}
                                    <img src={p.url} alt={p.note ?? `Foto QC ${idx + 1}`} loading="lazy" className="w-full aspect-square object-cover rounded-md border border-[var(--border)]" />
                                </a>
                            ))}
                        </div>
                    )
                )}
                {!isDone && (
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label htmlFor="qc-photo-note" className="sr-only">Keterangan foto QC</label>
                            <input
                                id="qc-photo-note"
                                type="text"
                                value={photoNote}
                                onChange={(e) => setPhotoNote(e.target.value)}
                                placeholder="Keterangan foto (opsional)"
                                maxLength={500}
                                className="form-input min-h-[48px] text-sm"
                            />
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/jpeg"
                            capture="environment"
                            className="hidden"
                            aria-label="Pilih foto QC"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void handleUploadPhoto(f);
                            }}
                        />
                        <button
                            type="button"
                            disabled={uploading}
                            onClick={() => fileRef.current?.click()}
                            className="btn btn-secondary min-h-[48px] shrink-0"
                        >
                            <Camera aria-hidden="true" className="h-4 w-4" /> {uploading ? "Mengunggah..." : "Ambil Foto"}
                        </button>
                    </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">Foto harus diambil dari kamera dalam format JPEG.</p>
            </div>
        </div>
    );
}
