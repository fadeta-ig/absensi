import { Camera, ExternalLink, FileCheck2, MapPin } from "lucide-react";
import type { VisitPhoto, VisitPhotoCategory } from "@/types";

/* eslint-disable @next/next/no-img-element -- endpoint bukti privat memerlukan cookie sesi dan no-store */

const CATEGORY_LABELS: Record<VisitPhotoCategory, string> = {
    LOKASI: "Lokasi",
    AKTIVITAS: "Aktivitas",
    HASIL: "Hasil",
    DOKUMEN: "Dokumen",
    LAINNYA: "Lainnya",
};

function formatOfficialTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
    return new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(date) + " WIB";
}

export function VisitPhotoGrid({
    photos,
    label,
}: {
    photos: Array<string | VisitPhoto>;
    label: string;
}) {
    if (photos.length === 0) return null;

    return (
        <div>
            <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" /> {label}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {photos.map((photo, index) => {
                    const evidence = typeof photo === "string" ? null : photo;
                    const src = evidence?.stampedUrl ?? String(photo);
                    return (
                        <div
                            key={evidence?.id ?? `legacy-${index}`}
                            className="rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--secondary)]"
                        >
                            <a
                                href={src}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Buka ${label.toLowerCase()} ${index + 1}`}
                            >
                                <img
                                    src={src}
                                    alt={`${label} ${index + 1}`}
                                    className="w-full aspect-[4/3] object-cover"
                                    loading="lazy"
                                />
                            </a>
                            {evidence && (
                                <div className="p-2.5 space-y-1.5 text-[10px] text-[var(--text-secondary)]">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="font-bold text-[var(--text-primary)]">
                                                {CATEGORY_LABELS[evidence.category]}
                                            </p>
                                            {evidence.caption && (
                                                <p className="mt-0.5 text-xs leading-relaxed">{evidence.caption}</p>
                                            )}
                                        </div>
                                        <a
                                            href={evidence.originalUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-[var(--primary)] font-semibold shrink-0"
                                        >
                                            Asli <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                    <p>{formatOfficialTimestamp(evidence.officialTimestamp)}</p>
                                    <p className="flex items-center gap-1 font-mono">
                                        <MapPin className="w-3 h-3 shrink-0" />
                                        {evidence.latitude.toFixed(6)}, {evidence.longitude.toFixed(6)}
                                        {evidence.accuracyMeters != null && ` · ±${Math.round(evidence.accuracyMeters)}m`}
                                    </p>
                                    <p
                                        className="flex items-center gap-1 font-mono truncate"
                                        title={evidence.sha256Original}
                                    >
                                        <FileCheck2 className="w-3 h-3 shrink-0" />
                                        SHA-256 {evidence.sha256Original.slice(0, 16)}…
                                    </p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
