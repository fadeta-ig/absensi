"use client";

/* eslint-disable @next/next/no-img-element -- thumbnail serve privat ber-auth tidak lewat image optimizer */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";

export interface EquipmentEvidencePhoto {
    id: string;
    url: string;
    note: string | null;
    capturedAt: string;
}

interface EquipmentEvidencePanelProps {
    /** ID inspeksi — satu tempat upload per inspeksi (maks 5 foto). */
    inspectionId: string;
    /** true di halaman inspeksi petugas (tambah + lihat); false di detail lain (lihat saja). */
    canUpload?: boolean;
    /**
     * true: panel tampil sebagai tombol "Lihat foto (n)" yang membuka isi;
     * tombol HANYA muncul bila ada foto — tidak ada foto = tidak ada tombol.
     * false: konten langsung.
     */
    collapsible?: boolean;
    /** Dipanggil setelah unggahan berhasil agar parent bisa refresh progres. */
    onChanged?: () => void;
    /** Override endpoint list (default employee). Untuk drill-down GA. */
    listUrl?: string;
    /** Pembentuk URL file per id (default employee). Untuk drill-down GA. */
    fileUrl?: (id: string) => string;
    /** Batas maks foto (default 5, mengikuti server). */
    maxPhotos?: number;
}

interface EvidenceListResponse {
    success: boolean;
    data: Array<{
        id: string;
        url?: string;
        filePath?: string;
        note: string | null;
        capturedAt: string;
    }>;
}

/**
 * Panel foto dokumentasi inspeksi peralatan — satu tempat per inspeksi (maks 5).
 * Meniru CleaningEvidencePanel: label "Foto dokumentasi" + batas dibaca dari
 * endpoint list (GET /api/employee/equipment/evidence?inspectionId=).
 * Unggah langsung saat berkas dipilih (POST multipart {photo, inspectionId, note?}).
 */
export function EquipmentEvidencePanel({
    inspectionId,
    canUpload = false,
    collapsible = false,
    onChanged,
    listUrl,
    fileUrl,
    maxPhotos = 5,
}: EquipmentEvidencePanelProps) {
    const toast = useToast();
    const [photos, setPhotos] = useState<EquipmentEvidencePhoto[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [note, setNote] = useState("");
    const [open, setOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const fetchPhotos = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                listUrl ?? `/api/employee/equipment/evidence?inspectionId=${encodeURIComponent(inspectionId)}`
            );
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat foto bukti."));
            const json = (await res.json()) as EvidenceListResponse;
            const toUrl = fileUrl ?? ((id: string) => `/api/employee/equipment/evidence/${id}`);
            setPhotos(
                (json.data ?? []).map((p) => ({
                    id: p.id,
                    url: p.url ?? toUrl(p.id),
                    note: p.note,
                    capturedAt: p.capturedAt,
                }))
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat foto bukti.";
            setError(msg);
            reportClientError("EquipmentEvidencePanel", msg, err);
        } finally {
            setLoading(false);
        }
    }, [inspectionId, listUrl, fileUrl]);

    useEffect(() => {
        void fetchPhotos();
    }, [fetchPhotos]);

    const uploadFile = useCallback(
        async (file: File) => {
            if (uploading) return;
            setUploading(true);
            setError(null);
            try {
                const form = new FormData();
                form.append("inspectionId", inspectionId);
                form.append("photo", file);
                if (note.trim()) form.append("note", note.trim());

                const res = await fetch("/api/employee/equipment/evidence", { method: "POST", body: form });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengunggah foto."));
                setNote("");
                toast("Foto bukti berhasil diunggah.", "success");
                await fetchPhotos();
                onChanged?.();
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal mengunggah foto.";
                setError(msg);
                toast(msg, "error");
                reportClientError("EquipmentEvidencePanel", msg, err);
            } finally {
                setUploading(false);
                if (fileRef.current) fileRef.current.value = "";
            }
        },
        [uploading, inspectionId, note, toast, fetchPhotos, onChanged]
    );

    return (
        <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground inline-flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                    Foto dokumentasi
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
                <p className="text-xs text-muted-foreground">Tidak ada foto untuk inspeksi ini.</p>
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
                                alt={photo.note ?? `Foto bukti ${index + 1}`}
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

            {!loading && photos.length > 0 && photos.some((photo) => photo.note) && (
                <ul className="space-y-1">
                    {photos.map((photo, index) => (
                        <li key={photo.id} className="text-[11px] text-muted-foreground">
                            Foto {index + 1}
                            {photo.note ? ` — ${photo.note}` : ""}
                        </li>
                    ))}
                </ul>
            )}

            {!collapsible && !loading && photos.length === 0 && !canUpload && (
                <p className="text-xs text-muted-foreground">Belum ada foto untuk inspeksi ini.</p>
            )}

            {canUpload && !loading && (!collapsible || open) && photos.length >= maxPhotos && (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Batas {maxPhotos} foto tercapai.
                </p>
            )}

            {canUpload && !loading && (!collapsible || open) && photos.length < maxPhotos && (
                <div className="space-y-2">
                    <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Catatan foto (opsional)"
                        maxLength={500}
                        className="w-full px-2 py-1.5 border border-border rounded text-xs bg-background"
                    />
                    <label className="btn btn-secondary btn-sm w-full cursor-pointer">
                        {uploading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Camera className="h-3.5 w-3.5" />
                        )}
                        {uploading ? "Mengunggah..." : "Ambil / unggah foto"}
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/jpeg"
                            capture="environment"
                            className="hidden"
                            disabled={uploading}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void uploadFile(file);
                            }}
                        />
                    </label>
                    <p className="text-[11px] text-muted-foreground">Foto harus berformat JPEG dari kamera aplikasi.</p>
                </div>
            )}
        </div>
    );
}
