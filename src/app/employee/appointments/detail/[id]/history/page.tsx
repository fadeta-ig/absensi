"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ArrowLeft, Ban, CalendarClock, CheckCircle2, ClipboardList, FileText, Hourglass,
    Info, Loader2, Megaphone, Pencil, PlayCircle, UploadCloud, UserCheck, UserX, XCircle,
} from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import EmptyState from "@/components/ui/EmptyState";
import { AppointmentStatusBadge } from "@/components/appointments/AppointmentBadges";
import type { HistoryEvent, MeetingHistory } from "@/lib/services/meetingHistoryService";
import { formatWIBDateTime } from "@/lib/timezone";

type ChipTone = "info" | "warning" | "success" | "danger" | "neutral";

const CHIP_TONE: Record<ChipTone, string> = {
    info: "bg-[var(--info-bg)] text-[var(--info)]",
    warning: "bg-[var(--warning-bg)] text-[var(--warning)]",
    success: "bg-[var(--success-bg)] text-[var(--success)]",
    danger: "bg-[var(--destructive-bg)] text-[var(--destructive-text)]",
    neutral: "bg-[var(--secondary)] text-[var(--text-secondary)]",
};

const ACTION_STYLE: Record<string, { icon: typeof Info; tone: ChipTone }> = {
    created: { icon: Megaphone, tone: "info" },
    rescheduled: { icon: CalendarClock, tone: "warning" },
    cancelled: { icon: Ban, tone: "danger" },
    completed_early: { icon: CheckCircle2, tone: "success" },
    minutes_created: { icon: FileText, tone: "neutral" },
    minutes_updated: { icon: Pencil, tone: "neutral" },
    minutes_deleted: { icon: XCircle, tone: "danger" },
    rsvp_accepted: { icon: UserCheck, tone: "success" },
    rsvp_declined: { icon: UserX, tone: "danger" },
    task_created: { icon: ClipboardList, tone: "info" },
    task_progress: { icon: PlayCircle, tone: "info" },
    task_done: { icon: CheckCircle2, tone: "success" },
    task_done_late: { icon: CheckCircle2, tone: "warning" },
    task_submitted: { icon: UploadCloud, tone: "info" },
    submission_approved: { icon: CheckCircle2, tone: "success" },
    revision_requested: { icon: Pencil, tone: "warning" },
    task_cancelled: { icon: XCircle, tone: "neutral" },
    deadline_extended: { icon: Hourglass, tone: "warning" },
};

function fmtDT(iso: string): string {
    return formatWIBDateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDay(iso: string): string {
    return formatWIBDateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric" });
}

type Filter = "all" | "meeting" | "task";

export default function MeetingHistoryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return (
        <Suspense fallback={<p className="text-sm text-[var(--text-muted)] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat riwayat…</p>}>
            <HistoryContent id={id} />
        </Suspense>
    );
}

function HistoryContent({ id }: { id: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const highlight = searchParams.get("highlight");
    const [data, setData] = useState<MeetingHistory | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [retryKey, setRetryKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError("");
            try {
                const res = await fetch(`/api/appointments/${id}/history`, { credentials: "same-origin" });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat riwayat."));
                const json = await res.json();
                if (!cancelled) setData(json.data);
            } catch (err) {
                reportClientError("MeetingHistoryPage", "Gagal memuat riwayat", err, { id });
                if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat riwayat.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => {
            cancelled = true;
        };
    }, [id, retryKey]);

    const events = useMemo(
        () => (data?.events ?? []).filter((e) => filter === "all" || e.scope === filter),
        [data, filter]
    );

    useEffect(() => {
        if (!highlight || loading) return;
        if (!/^[A-Za-z0-9-]{1,120}$/.test(highlight)) return;
        document.getElementById(`hist-${highlight}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [highlight, loading, events]);

    if (loading) {
        return (
            <p className="text-sm text-[var(--text-muted)] flex items-center gap-2 py-10 justify-center" aria-label="Memuat riwayat">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat riwayat…
            </p>
        );
    }

    if (error || !data) {
        return (
            <div className="space-y-5">
                <button type="button" onClick={() => router.push(`/employee/appointments/detail/${id}`)} className="btn btn-secondary btn-sm">
                    <ArrowLeft className="w-4 h-4" /> Kembali ke Detail
                </button>
                {error ? <FeedbackMessage variant="error">{error}</FeedbackMessage> : <p className="text-sm text-[var(--text-muted)]">Riwayat tidak ditemukan.</p>}
                {error && <button type="button" onClick={() => setRetryKey((k) => k + 1)} className="btn btn-secondary w-full">Coba Lagi</button>}
            </div>
        );
    }

    const a = data.appointment;
    const s = data.summary;
    const filters: Array<{ key: Filter; label: string }> = [
        { key: "all", label: "Semua" },
        { key: "meeting", label: "Meeting" },
        { key: "task", label: "Task" },
    ];

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => router.push(`/employee/appointments/detail/${id}`)}
                    className="min-w-11 min-h-11 rounded-xl hover:bg-[var(--secondary)] flex items-center justify-center active:scale-[0.99] transition-colors"
                    aria-label="Kembali ke detail meeting"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                    <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)] truncate">Riwayat Meeting</h1>
                    <p className="text-[11px] font-medium text-[var(--text-secondary)] truncate">{a.title}</p>
                </div>
            </div>

            <div className="emp-surface p-4 space-y-2">
                <AppointmentStatusBadge status={a.status} lifecycle={a.lifecycle} />
                <dl className="space-y-1 text-xs">
                    <div className="flex gap-1.5">
                        <dt className="text-[var(--text-muted)] w-24 shrink-0">Jadwal</dt>
                        <dd className="text-[var(--text-secondary)]">
                            {a.isFullDay
                                ? `${formatWIBDateTime(new Date(a.startAt), { day: "numeric", month: "short", year: "numeric" })} · Seharian Penuh`
                                : `${fmtDay(a.startAt)} – ${fmtDay(a.endAt)}`}
                        </dd>
                    </div>
                    <div className="flex gap-1.5">
                        <dt className="text-[var(--text-muted)] w-24 shrink-0">Tempat</dt>
                        <dd className="text-[var(--text-secondary)]">{a.roomName ?? (a.meetingLink ? "Daring" : "-")}</dd>
                    </div>
                    <div className="flex gap-1.5">
                        <dt className="text-[var(--text-muted)] w-24 shrink-0">Penyelenggara</dt>
                        <dd className="text-[var(--text-secondary)]">{a.requesterName ?? "-"}</dd>
                    </div>
                    <div className="flex gap-1.5">
                        <dt className="text-[var(--text-muted)] w-24 shrink-0">Peserta</dt>
                        <dd className="text-[var(--text-secondary)]">{s.participants} orang · {s.accepted} terima · {s.present} hadir</dd>
                    </div>
                    <div className="flex gap-1.5">
                        <dt className="text-[var(--text-muted)] w-24 shrink-0">Task</dt>
                        <dd className="text-[var(--text-secondary)]">{s.tasks} task · {s.tasksDone} selesai · {s.tasksOverdue} overdue · {s.extensions} perpanjangan</dd>
                    </div>
                </dl>
                {a.agenda && (
                    <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--secondary)_40%,transparent)] px-3 py-2.5 mt-1">
                        <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Agenda / Pokok Bahasan</p>
                        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{a.agenda}</p>
                    </div>
                )}
                {a.minutes && (
                    <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--secondary)_50%,transparent)] px-3 py-2.5 mt-1">
                        <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">Notulensi Final</p>
                        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{a.minutes}</p>
                    </div>
                )}
            </div>

            <div className="flex gap-1.5" role="tablist" aria-label="Filter riwayat">
                {filters.map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        role="tab"
                        aria-selected={filter === f.key}
                        onClick={() => setFilter(f.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold min-h-9 ${
                            filter === f.key ? "bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)] border border-[var(--primary)]" : "bg-[var(--secondary)] text-[var(--text-secondary)]"
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {events.length === 0 ? (
                <EmptyState
                    icon={ClipboardList}
                    title="Belum ada riwayat"
                    description="Aktivitas meeting dan task akan tercatat di sini."
                />
            ) : (
                <ol className="space-y-2">
                    {events.map((e: HistoryEvent) => {
                        const style = ACTION_STYLE[e.action] ?? ACTION_STYLE.created;
                        const Icon = style.icon;
                        return (
                            <li
                                key={e.id}
                                id={`hist-${e.id}`}
                                className={`emp-surface p-3 flex gap-3 ${highlight === e.id ? "ring-2 ring-[var(--primary)]" : ""}`}
                            >
                                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${CHIP_TONE[style.tone]}`}>
                                    <Icon className="w-4 h-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">{e.title}</p>
                                    {e.detail && <p className="text-xs text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap">{e.detail}</p>}
                                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                                        {fmtDT(e.at)}
                                        {e.actorName ? ` · ${e.actorName}` : ""}
                                        {e.reason && e.action !== "minutes_created" && e.action !== "minutes_updated" ? ` · Alasan: ${e.reason}` : ""}
                                    </p>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}
