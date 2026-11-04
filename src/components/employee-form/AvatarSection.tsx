"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/components/Toast";
import { reportClientError } from "@/lib/clientErrors";
import { AvatarCropModal } from "./AvatarCropModal";

/**
 * Batas berkas mentah sebelum crop (foto HP bisa besar; hasil crop selalu kecil
 * ±512px JPEG sehingga lolos skema server). Batas akhir tetap di server.
 */
const HR_AVATAR_RAW_MAX_BYTES = 10 * 1024 * 1024;

interface Props {
    employeeName: string;
    /** Foto tersimpan saat ini (mode edit) atau null. */
    currentUrl: string | null;
    /** Data-URL berkas baru yang menunggu submit, atau null. */
    pendingDataUrl: string | null;
    /** True bila foto ditandai untuk dihapus saat submit. */
    cleared: boolean;
    disabled: boolean;
    onSelect: (dataUrl: string) => void;
    onClearRequest: () => void;
    onCancelPending: () => void;
}

export function AvatarSection({ employeeName, currentUrl, pendingDataUrl, cleared, disabled, onSelect, onClearRequest, onCancelPending }: Props) {
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [canUpload, setCanUpload] = useState<boolean | null>(null);
    const [cropSrc, setCropSrc] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/auth/me");
                if (!res.ok) throw new Error("Gagal memuat sesi.");
                const me = await res.json() as { username?: string; permissions?: string[] };
                if (!cancelled) {
                    setCanUpload(me.username === "WIG001" && Array.isArray(me.permissions) && me.permissions.includes("hr.manage"));
                }
            } catch (err) {
                if (!cancelled) setCanUpload(false);
                reportClientError("AvatarSection", "Gagal memeriksa hak upload foto", err);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const preview = pendingDataUrl ?? (cleared ? null : currentUrl);
    const initial = (employeeName.trim().charAt(0) || "?").toUpperCase();

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (file.size > HR_AVATAR_RAW_MAX_BYTES) {
            toast("Ukuran berkas maksimal 10MB (JPG/PNG/WebP).", "warning");
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => setCropSrc(reader.result as string);
        reader.onerror = () => {
            reportClientError("AvatarSection", "Gagal membaca file foto", reader.error ?? "FileReader error");
            toast("Gagal membaca file foto.", "error");
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="card p-6 space-y-5">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)]">
                <Camera className="w-4 h-4 text-[var(--primary)]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-primary)]">Foto Formal (PAS Foto)</h2>
            </div>

            <div className="flex items-start gap-4">
                <div className="w-24 h-24 rounded-2xl bg-[var(--primary)]/10 overflow-hidden flex items-center justify-center shrink-0">
                    {preview
                        ? <Image src={preview} alt="Foto karyawan" width={96} height={96} className="w-24 h-24 object-cover" unoptimized />
                        : <span className="text-4xl font-bold text-[var(--primary)]">{initial}</span>
                    }
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                    {canUpload === null ? (
                        <p className="text-xs text-[var(--text-muted)]">Memeriksa hak akses...</p>
                    ) : canUpload ? (
                        <>
                            <p className="text-xs text-[var(--text-muted)]">
                                PAS foto formal (JPG/PNG/WebP, maks 10MB). Atur bingkai
                                lalu simpan formulir.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={disabled}
                                    className="btn btn-secondary !py-2 text-xs disabled:opacity-50"
                                >
                                    {preview ? "Ganti foto" : "Pilih foto"}
                                </button>
                                {pendingDataUrl && (
                                    <button
                                        type="button"
                                        onClick={onCancelPending}
                                        disabled={disabled}
                                        className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50 min-h-[44px] px-2"
                                    >
                                        <X className="w-3.5 h-3.5" /> Batalkan berkas baru
                                    </button>
                                )}
                                {!pendingDataUrl && !cleared && currentUrl && (
                                    <button
                                        type="button"
                                        onClick={onClearRequest}
                                        disabled={disabled}
                                        className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50 min-h-[44px] px-2"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> Hapus foto
                                    </button>
                                )}
                                {!pendingDataUrl && cleared && (
                                    <button
                                        type="button"
                                        onClick={onCancelPending}
                                        disabled={disabled}
                                        className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50 min-h-[44px] px-2"
                                    >
                                        <X className="w-3.5 h-3.5" /> Batalkan hapus
                                    </button>
                                )}
                            </div>
                            {pendingDataUrl && (
                                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                    Berkas baru akan diunggah saat formulir disimpan.
                                </p>
                            )}
                            {!pendingDataUrl && cleared && (
                                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                    Foto akan dihapus saat formulir disimpan.
                                </p>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={handleFile}
                            />
                            {cropSrc && (
                                <AvatarCropModal
                                    imageSrc={cropSrc}
                                    onCancel={() => setCropSrc(null)}
                                    onDone={(cropped) => {
                                        setCropSrc(null);
                                        onSelect(cropped);
                                    }}
                                />
                            )}
                        </>
                    ) : (
                        <p className="text-xs text-[var(--text-muted)]">
                            Hanya WIG001 yang dapat mengubah foto karyawan.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
