"use client";

/* eslint-disable @next/next/no-img-element -- thumbnail serve privat ber-auth tidak lewat image optimizer */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Camera, Loader2, RefreshCw } from "lucide-react";
import {
    MultiPhotoCapture,
    type CapturedVisitPhoto,
} from "@/app/employee/visits/components/MultiPhotoCapture";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";

export interface CleaningEvidencePhoto {
    id: string;
    url: string;
    mimeType: string;
    size: number;
    capturedAt: string;
    note: string | null;
    uploaderName?: string | null;
}

interface CleaningEvidencePanelProps {
    checklistItemId: string;
    /** true di halaman checklist petugas (tambah + lihat); false di detail atasan (lihat saja). */
    canUpload?: boolean;
    /**
     * true: panel tampil sebagai tombol "Lihat foto (n)" yang membuka isi;
     * tombol HANYA muncul bila ada foto — tidak ada foto = tidak ada tombol.
     * false: konten langsung (perilaku lama).
     */
    collapsible?: boolean;
}

interface EvidenceListResponse {
    success: boolean;
    data: CleaningEvidencePhoto[];
    maxPhotos: number;
    maxMb: number;
}

/**
 * Panel foto bukti cleaning per item (Tahap 3).
 * Bungkus parent di atas MultiPhotoCapture generik TANPA mengubah komponen
 * tersebut: label cleaning + batas maxPhotos/maxMb dibaca dari endpoint list
 * (GET /api/cleaning/evidence?checklistItemId=) — bukan dari endpoint settings
 * HR yang tak dapat diakses pekerja. Caption tiap jepretan dikirim sebagai note.
 */
export function CleaningEvidencePanel({ checklistItemId, canUpload = false, collapsible = false }: CleaningEvidencePanelProps) {
    const toast = useToast();
    const [photos, setPhotos] = useState<CleaningEvidencePhoto[]>([]);
    const [maxPhotos, setMaxPhotos] = useState(3);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<CapturedVisitPhoto[]>([]);
    const [uploading, setUploading] = useState(false);
    const [open, setOpen] = useState(false);

    const fetchPhotos = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/cleaning/evidence?checklistItemId=${encodeURIComponent(checklistItemId)}`
            );
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat foto bukti."));
            const json = (await res.json()) as EvidenceListResponse;
            setPhotos(json.data ?? []);
            if (typeof json.maxPhotos === "number" && json.maxPhotos > 0) {
                setMaxPhotos(Math.floor(json.maxPhotos));
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat foto bukti.";
            setError(msg);
            reportClientError("CleaningEvidencePanel", msg, err);
        } finally {
            setLoading(false);
        }
    }, [checklistItemId]);

    useEffect(() => {
        void fetchPhotos();
    }, [fetchPhotos]);

    const remaining = Math.max(0, maxPhotos - photos.length);
    const isFull = remaining <= 0;

    const uploadDrafts = useCallback(async () => {
        if (uploading || drafts.length === 0) return;
        setUploading(true);
        setError(null);
        try {
            let reverifyWarning: string | null = null;
            for (const draft of drafts) {
                let file = draft.file ?? null;
                if (!file && draft.dataUrl) {
                    const blob = await (await fetch(draft.dataUrl)).blob();
                    file = new File([blob], "cleaning-evidence.jpg", { type: "image/jpeg" });
                }
                if (!file) throw new Error("Foto tidak terbaca. Silakan foto ulang.");
                const form = new FormData();
                form.append("checklistItemId", checklistItemId);
                form.append("photo", file);
                if (draft.caption?.trim()) form.append("note", draft.caption.trim());

                const res = await fetch("/api/cleaning/evidence", { method: "POST", body: form });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengunggah foto."));
                const json = await res.json().catch(() => null);
                const warning = json?.data?.warning;
                if (typeof warning === "string" && warning.trim()) reverifyWarning = warning;
            }
            setDrafts([]);
            toast("Foto bukti berhasil diunggah.", "success");
            if (reverifyWarning) toast(reverifyWarning, "warning");
            await fetchPhotos();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal mengunggah foto.";
            // Refetch dulu (me-reset error loading), lalu tampilkan error unggah.
            await fetchPhotos();
            setError(msg);
            toast(msg, "error");
            reportClientError("CleaningEvidencePanel", msg, err);
        } finally {
            setUploading(false);
        }
    }, [uploading, drafts, checklistItemId, toast, fetchPhotos]);

    return (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground inline-flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                    Foto bukti cleaning
                    <span className="font-normal text-muted-foreground">(opsional)</span>
                </p>
                <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                    {photos.length}/{maxPhotos} foto
                </span>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            )}

            {error && !loading && (
                <div className="flex items-center gap-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button
                        type="button"
                        onClick={() => void fetchPhotos()}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                        <RefreshCw className="h-3 w-3" /> Coba lagi
                    </button>
                </div>
            )}

            {collapsible && !open && !loading && !error && photos.length === 0 && (
                <p className="text-xs text-muted-foreground">Tidak ada foto untuk pekerjaan ini.</p>
            )}

            {collapsible && !open && !loading && !error && photos.length > 0 && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-expanded={false}
                    className="text-[11px] text-primary hover:underline"
                >
                    Lihat foto ({photos.length})
                </button>
            )}

            {collapsible && open && (
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-expanded={true}
                    className="text-[11px] text-primary hover:underline"
                >
                    Sembunyikan foto
                </button>
            )}

            {(!collapsible || open) && photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                    {photos.map((photo, index) => (
                        <a
                            key={photo.id}
                            href={photo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative block aspect-square overflow-hidden rounded-md border border-border bg-background"
                            title={photo.note ?? `Foto bukti ${index + 1}`}
                        >
                            <img
                                src={photo.url}
                                alt={photo.note ?? `Foto bukti cleaning ${index + 1}`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                            />
                            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                {index + 1}
                            </span>
                        </a>
                    ))}
                </div>
            )}

            {!loading && photos.length > 0 && photos.some((photo) => photo.uploaderName ?? photo.note) && (
                <ul className="space-y-1">
                    {photos.map((photo, index) => (
                        <li key={photo.id} className="text-[11px] text-muted-foreground">
                            Foto {index + 1}
                            {photo.uploaderName ? ` oleh ${photo.uploaderName}` : ""}
                            {photo.note ? ` — ${photo.note}` : ""}
                        </li>
                    ))}
                </ul>
            )}

            {!collapsible && !loading && photos.length === 0 && !canUpload && (
                <p className="text-xs text-muted-foreground">Belum ada foto untuk pekerjaan ini.</p>
            )}

            {canUpload && !loading && (!collapsible || open) && (
                isFull ? (
                    <p className="text-xs text-muted-foreground">
                        Batas {maxPhotos} foto per item sudah tercapai.
                    </p>
                ) : (
                    <div className="space-y-2">
                        <MultiPhotoCapture
                            photos={drafts}
                            onPhotosChange={setDrafts}
                            maxPhotos={remaining}
                            minPhotos={1}
                        />
                        {drafts.length > 0 && (
                            <button
                                type="button"
                                onClick={() => void uploadDrafts()}
                                disabled={uploading}
                                className="btn btn-primary btn-sm w-full disabled:opacity-50"
                            >
                                {uploading ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : null}
                                {uploading ? "Mengunggah..." : `Kirim ${drafts.length} foto`}
                            </button>
                        )}
                    </div>
                )
            )}
        </div>
    );
}
