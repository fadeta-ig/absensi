"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Camera, CheckCircle2, Loader2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { EquipmentEvidencePanel } from "@/components/equipment/EquipmentEvidencePanel";
import { EquipmentCompanyBadge } from "@/components/equipment/EquipmentStatusBadge";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import DraftNotice from "@/components/ui/DraftNotice";
import ListSkeleton from "@/components/ui/ListSkeleton";
import StateCard from "@/components/ui/StateCard";
import { useEmployeeDraft } from "@/hooks/useEmployeeDraft";
import { useEmployeeDraftOwner } from "@/components/employee/EmployeeDraftContext";
import { isPlainObject, removeEmployeeDraft } from "@/lib/formPersistence";

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
    const pathname = usePathname();
    const equipmentBase = pathname?.startsWith("/outsource/equipment") ? "/outsource/equipment" : "/employee/equipment";
    const toast = useToast();
    const confirm = useConfirm();
    const draftOwner = useEmployeeDraftOwner();
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

    const canEditQc = Boolean(detail && detail.status === "SUBMITTED");
    const serverQcNote = detail?.qcNote ?? "";
    const qcDraftKey = detail ? `equipment:qc:${detail.id}` : null;

    const {
        restored: qcDraftRestored,
        clearDraft: clearQcDraft,
        discardDraft: discardQcDraft,
    } = useEmployeeDraft<{ qcNote: string; photoNote: string }>({
        formKey: qcDraftKey,
        value: { qcNote, photoNote },
        enabled: canEditQc,
        baseline: serverQcNote,
        hasBaseline: Boolean(detail),
        isDirty: (draft) => draft.qcNote !== serverQcNote || draft.photoNote.trim().length > 0,
        validate: (raw): raw is { qcNote: string; photoNote: string } =>
            isPlainObject(raw) &&
            typeof raw.qcNote === "string" &&
            typeof raw.photoNote === "string",
        onRestore: (draft) => {
            setQcNote(draft.qcNote);
            setPhotoNote(draft.photoNote);
        },
    });

    useEffect(() => {
        if (!draftOwner || !detail) return;
        if (detail.status !== "SUBMITTED") {
            removeEmployeeDraft(draftOwner, `equipment:qc:${detail.id}`);
        }
    }, [draftOwner, detail]);

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
                        clearQcDraft();
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
    }, [detail, doneBusy, qcNote, confirm, toast, clearQcDraft]);

    if (loading) {
        return (
            <div className="space-y-5">
                <ListSkeleton count={3} label="Memuat detail QC" />
            </div>
        );
    }

    if (error || !detail) {
        return (
            <div className="space-y-5">
                <Link href={`${equipmentBase}/approvals`} className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center min-h-[44px] px-2 -ml-2">
                    ← Kembali ke antrean
                </Link>
                <StateCard
                    variant="error"
                    title="Detail QC gagal dimuat"
                    description={error ?? "Detail tidak ditemukan."}
                    action={
                        <button onClick={() => void fetchDetail()} className="btn btn-secondary btn-sm min-h-[44px]">
                            Coba lagi
                        </button>
                    }
                />
            </div>
        );
    }

    const baik = detail.items.filter((i) => i.isActive && i.isPass === true).length;
    const rusak = detail.items.filter((i) => i.isActive && i.isPass === false).length;
    const isDone = detail.status === "DONE";

    return (
        <div className="space-y-5">
            <Link href={`${equipmentBase}/approvals`} className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors inline-flex items-center min-h-[44px] px-2 -ml-2">
                ← Kembali ke antrean
            </Link>

            <div className="emp-surface p-4">
                <h1 className="text-xl font-extrabold leading-none tracking-tight text-[var(--text-primary)]">
                    {detail.unit.name}{" "}
                    <EquipmentCompanyBadge
                        company={detail.unit.company}
                        isSharedBoth={(detail.unit as { isSharedBoth?: boolean }).isSharedBoth}
                        companies={(detail.unit as { companies?: string[] }).companies}
                    />
                </h1>
                {detail.unit.brand && <p className="text-xs text-[var(--text-muted)] mt-1">{detail.unit.brand}</p>}
                <p className="text-[11px] font-medium text-[var(--text-secondary)] mt-1">
                    Dari {stripGelar(detail.startedBy.name)} · Dikirim {formatDateTime(detail.submittedAt)}
                </p>
                <p className={`text-[13px] font-semibold mt-1 ${rusak > 0 ? "text-[var(--destructive-text)]" : "text-[var(--text-primary)]"}`}>
                    {baik} baik · {rusak} rusak · {detail.progress.decided}/{detail.progress.total} dinilai
                </p>
            </div>

            {isDone ? (
                <FeedbackMessage variant="success">
                    <p className="text-[13px] font-semibold">
                        Diperiksa oleh {stripGelar(detail.checkedByNameSnapshot ?? detail.checkedBy?.name ?? "")} (QC)
                    </p>
                    <p className="text-[11px] mt-0.5 opacity-80">{formatDateTime(detail.checkedAt)}</p>
                    {detail.qcNote && <p className="text-[13px] mt-1">Catatan QC: {detail.qcNote}</p>}
                </FeedbackMessage>
            ) : (
                <div className="sticky top-2 z-10">
                    <div className="emp-surface p-3 space-y-2">
                        <DraftNotice
                            compact
                            visible={qcDraftRestored && (qcNote !== serverQcNote || photoNote.trim().length > 0)}
                            onDiscard={() => {
                                discardQcDraft();
                                setQcNote(serverQcNote);
                                setPhotoNote("");
                            }}
                        />
                        <label htmlFor="qc-note" className="text-[10px] font-semibold text-[var(--text-muted)]">
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
                        <p className="text-[11px] text-[var(--text-muted)] text-right">{qcNote.length}/1000</p>
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

            <div className="space-y-3">
                {detail.items
                    .filter((i) => i.isActive)
                    .map((item) => (
                        <div key={item.id} className="emp-surface flex items-start gap-2 text-[13px] px-4 py-3">
                            {item.isPass === true ? (
                                <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-[var(--success)] mt-0.5 shrink-0" />
                            ) : item.isPass === false ? (
                                <X aria-hidden="true" className="h-5 w-5 text-[var(--destructive-text)] mt-0.5 shrink-0" />
                            ) : (
                                <AlertTriangle aria-hidden="true" className="h-5 w-5 text-[var(--warning)] mt-0.5 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-[var(--text-primary)]">
                                    {item.itemNameSnapshot}{" "}
                                    <span className="font-normal text-[var(--text-muted)]">
                                        — {item.isPass === true ? "Baik" : item.isPass === false ? "Rusak" : "Belum dinilai"}
                                    </span>
                                </p>
                                {item.note && <p className="text-xs text-[var(--text-muted)]">Catatan: {item.note}</p>}
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

            <div className="emp-surface p-4">
                <h2 className="emp-eyebrow flex items-center gap-1.5 mb-1">
                    <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Foto QC (opsional{qcPhotos.length > 0 ? ` — ${qcPhotos.length} foto` : ""})
                </h2>
                {qcPhotosLoading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
                    </div>
                ) : (
                    qcPhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mb-3">
                            {qcPhotos.map((p, idx) => (
                                <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.note ?? `Foto QC ${idx + 1}`}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail serve privat ber-auth */}
                                    <img src={p.url} alt={p.note ?? `Foto QC ${idx + 1}`} loading="lazy" className="w-full aspect-square object-cover rounded-lg border border-[var(--border)]" />
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
                <p className="text-xs text-[var(--text-muted)] mt-2">Foto harus diambil dari kamera dalam format JPEG.</p>
            </div>
        </div>
    );
}
