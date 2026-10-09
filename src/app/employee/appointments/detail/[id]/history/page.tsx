"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ArrowLeft, Ban, CalendarClock, CheckCircle2, ClipboardList, FileText, Hourglass,
    Info, Loader2, Megaphone, Pencil, PlayCircle, UserCheck, UserX, XCircle,
} from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { AppointmentStatusBadge } from "@/components/appointments/AppointmentBadges";
import type { HistoryEvent, MeetingHistory } from "@/lib/services/meetingHistoryService";

const ACTION_STYLE: Record<string, { icon: typeof Info; chip: string }> = {
    created: { icon: Megaphone, chip: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
    rescheduled: { icon: CalendarClock, chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
    cancelled: { icon: Ban, chip: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
    completed_early: { icon: CheckCircle2, chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    minutes_created: { icon: FileText, chip: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
    minutes_updated: { icon: Pencil, chip: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
    rsvp_accepted: { icon: UserCheck, chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    rsvp_declined: { icon: UserX, chip: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
    task_created: { icon: ClipboardList, chip: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
    task_progress: { icon: PlayCircle, chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
    task_done: { icon: CheckCircle2, chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    task_cancelled: { icon: XCircle, chip: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
    deadline_extended: { icon: Hourglass, chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
    extension_requested: { icon: Hourglass, chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
    extension_approved: { icon: CheckCircle2, chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    extension_rejected: { icon: XCircle, chip: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
};

function fmtDT(iso: string): string {
    return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtDay(iso: string): string {
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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
    }, [id]);

    const events = useMemo(
        () => (data?.events ?? []).filter((e) => filter === "all" || e.scope === filter),
        [data, filter]
    );

    useEffect(() => {
        if (!highlight || loading) return;
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
            <div className="space-y-4">
                <button type="button" onClick={() => router.push(`/employee/appointments/detail/${id}`)} className="btn btn-secondary btn-sm">
                    <ArrowLeft className="w-4 h-4" /> Kembali ke Detail
                </button>
                {error ? <FeedbackMessage variant="error">{error}</FeedbackMessage> : <p className="text-sm text-[var(--text-muted)]">Riwayat tidak ditemukan.</p>}
                {error && <button type="button" onClick={() => window.location.reload()} className="btn btn-secondary w-full">Coba Lagi</button>}
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
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => router.push(`/employee/appointments/detail/${id}`)}
                    className="min-w-11 min-h-11 rounded-xl hover:bg-[var(--secondary)] flex items-center justify-center"
                    aria-label="Kembali ke detail meeting"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                    <h1 className="text-base font-extrabold text-[var(--text-primary)] truncate">Riwayat Meeting</h1>
                    <p className="text-xs text-[var(--text-muted)] truncate">{a.title}</p>
                </div>
            </div>

            <div className="card p-4 space-y-2">
                <AppointmentStatusBadge status={a.status} lifecycle={a.lifecycle} />
                <dl className="space-y-1 text-xs">
                    <div className="flex gap-1.5">
                        <dt className="text-[var(--text-muted)] w-24 shrink-0">Jadwal</dt>
                        <dd className="text-[var(--text-secondary)]">
                            {a.isFullDay ? "Seharian" : `${fmtDay(a.startAt)} – ${fmtDay(a.endAt)}`}
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
                {a.minutes && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 px-3 py-2.5 mt-1">
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
                            filter === f.key ? "bg-[var(--primary)] text-white" : "bg-[var(--secondary)] text-[var(--text-secondary)]"
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {events.length === 0 ? (
                <div className="card p-6 text-center">
                    <p className="text-sm font-medium text-[var(--text-primary)]">Belum ada riwayat</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Aktivitas meeting dan task akan tercatat di sini.</p>
                </div>
            ) : (
                <ol className="space-y-2">
                    {events.map((e: HistoryEvent) => {
                        const style = ACTION_STYLE[e.action] ?? ACTION_STYLE.created;
                        const Icon = style.icon;
                        return (
                            <li
                                key={e.id}
                                id={`hist-${e.id}`}
                                className={`card p-3 flex gap-3 ${highlight === e.id ? "ring-2 ring-[var(--primary)]" : ""}`}
                            >
                                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${style.chip}`}>
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
