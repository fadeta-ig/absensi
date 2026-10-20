"use client";

import { Clock3 } from "lucide-react";

export const DURATION_PRESETS = [
    { minutes: 30, label: "30 mnt" },
    { minutes: 60, label: "1 jam" },
    { minutes: 120, label: "2 jam" },
    { minutes: 180, label: "3 jam" },
] as const;

const LAST_MINUTE = 23 * 60 + 59;

export function hmToMinutes(hm: string): number | null {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToHm(total: number): string {
    const clamped = Math.max(0, Math.min(LAST_MINUTE, total));
    return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export function formatDurationId(minutes: number): string {
    if (minutes < 60) return `${minutes} menit`;
    const h = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${h} jam` : `${h} jam ${rest} menit`;
}

/**
 * Pilihan jam mulai/selesai bergaya Zoom: durasi dipilih sekali,
 * jam selesai terhitung otomatis. Semua jam dalam WIB.
 */
export default function TimeRangeFields({
    startTime,
    endTime,
    onChange,
    idPrefix,
}: {
    startTime: string;
    endTime: string;
    onChange: (startTime: string, endTime: string) => void;
    idPrefix: string;
}) {
    const startMin = hmToMinutes(startTime);
    const endMin = hmToMinutes(endTime);
    const duration = startMin !== null && endMin !== null && endMin > startMin ? endMin - startMin : null;
    const invalid = startMin !== null && endMin !== null && endMin <= startMin;

    function handleStart(next: string) {
        const nextStart = hmToMinutes(next);
        if (nextStart === null) {
            onChange(next, endTime);
            return;
        }
        // Geser jam selesai mengikuti durasi yang sedang berlaku.
        onChange(next, minutesToHm(nextStart + (duration ?? 60)));
    }

    function handleDuration(minutes: number) {
        if (startMin === null) return;
        onChange(startTime, minutesToHm(startMin + minutes));
    }

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
                <div className="form-group !mb-0">
                    <label className="form-label" htmlFor={`${idPrefix}-start`}>Jam Mulai * (WIB)</label>
                    <input
                        id={`${idPrefix}-start`}
                        type="time"
                        step={900}
                        className="form-input"
                        value={startTime}
                        onChange={(e) => handleStart(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group !mb-0">
                    <label className="form-label" htmlFor={`${idPrefix}-end`}>Jam Selesai * (WIB)</label>
                    <input
                        id={`${idPrefix}-end`}
                        type="time"
                        step={900}
                        className="form-input"
                        value={endTime}
                        onChange={(e) => onChange(startTime, e.target.value)}
                        required
                    />
                </div>
            </div>

            <div>
                <span className="form-label" id={`${idPrefix}-duration-label`}>
                    <span className="flex items-center gap-1">
                        <Clock3 className="w-3 h-3" /> Durasi
                    </span>
                </span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${idPrefix}-duration-label`}>
                    {DURATION_PRESETS.map((d) => (
                        <button
                            key={d.minutes}
                            type="button"
                            aria-pressed={duration === d.minutes}
                            onClick={() => handleDuration(d.minutes)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold min-h-9 border transition-colors ${
                                duration === d.minutes
                                    ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                                    : "border-[var(--border)] text-[var(--text-secondary)]"
                            }`}
                        >
                            {d.label}
                        </button>
                    ))}
                    {duration !== null && !DURATION_PRESETS.some((d) => d.minutes === duration) && (
                        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold min-h-9 border border-dashed border-[var(--border)] text-[var(--text-muted)]">
                            Kustom
                        </span>
                    )}
                </div>
            </div>

            {invalid ? (
                <p className="text-[11px] font-semibold text-red-600">Jam selesai harus setelah jam mulai pada tanggal yang sama.</p>
            ) : duration !== null ? (
                <p className="text-[11px] text-[var(--text-muted)]" aria-live="polite">
                    {startTime}–{endTime} WIB · {formatDurationId(duration)}
                </p>
            ) : null}
        </div>
    );
}
