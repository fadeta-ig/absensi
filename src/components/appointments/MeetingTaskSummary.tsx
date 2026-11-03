"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks, Loader2, Plus } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { stripGelar } from "@/lib/utils/formatters";
import TaskFormModal from "@/components/appointments/TaskFormModal";
import type { TaskParticipant } from "@/components/appointments/MeetingTaskSection";
import { meetingTaskStatusLabel } from "@/components/appointments/AppointmentBadges";

interface SummaryTask {
    id: string;
    title: string;
    isCancelled: boolean;
    assigner: { employeeId: string; name: string | null };
    activeDeadline: { date: string; sequence: number } | null;
    assignees: Array<{ employeeId: string; name: string; status: string; isOverdue: boolean }>;
    allDone: boolean;
    anyOverdue: boolean;
}

/**
 * Ringkasan task pada detail meeting. Pembuatan task tetap di sini karena
 * mengikuti aturan meeting; pengelolaan (kumpul/revisi/verifikasi) dilakukan
 * di modul Tugas Saya.
 */
export default function MeetingTaskSummary({
    appointmentId,
    participants,
    canCreateTask = false,
    myEmployeeId = null,
    refreshKey,
}: {
    appointmentId: string;
    participants: TaskParticipant[];
    canCreateTask?: boolean;
    /** Employee yang login: tombol kelola hanya untuk task yang ia terima. */
    myEmployeeId?: string | null;
    refreshKey?: string | number;
}) {
    const [tasks, setTasks] = useState<SummaryTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/tasks`, { credentials: "same-origin" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat ringkasan tugas."));
            const json = await res.json();
            setTasks(json.data ?? []);
        } catch (err) {
            reportClientError("MeetingTaskSummary", "Gagal memuat ringkasan tugas", err, { appointmentId });
            setError(err instanceof Error ? err.message : "Gagal memuat ringkasan tugas.");
        } finally {
            setLoading(false);
        }
    }, [appointmentId]);

    useEffect(() => { void load(); }, [load, refreshKey]);

    return (
        <section aria-label="Tugas dari meeting ini" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-[var(--primary)]" /> Tugas dari Meeting Ini
                </h2>
                {canCreateTask && (
                    <button type="button" onClick={() => setCreating(true)} className="btn btn-primary btn-sm min-h-9">
                        <Plus className="w-3.5 h-3.5" /> Beri Tugas
                    </button>
                )}
            </div>
            <p className="text-xs text-[var(--text-muted)]">Pengumpulan, revisi, dan verifikasi tugas dilakukan di menu Tugas Saya.</p>
            {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}
            {loading ? (
                <p className="text-sm text-[var(--text-muted)] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat tugas…</p>
            ) : tasks.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">Belum ada tugas dari meeting ini.</p>
            ) : (
                <ul className="space-y-2">
                    {tasks.map((task) => (
                        <li key={task.id} className="border border-[var(--border)] rounded-xl p-3 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">{task.title}</p>
                                {task.isCancelled ? <span className="badge-error shrink-0">Dibatalkan</span>
                                    : task.allDone ? <span className="badge-success shrink-0">Selesai</span>
                                    : task.anyOverdue ? <span className="badge-error shrink-0">Overdue</span>
                                    : <span className="badge-info shrink-0">Berjalan</span>}
                            </div>
                            <p className="text-xs text-[var(--text-secondary)]">
                                Deadline {task.activeDeadline?.date ?? "-"} · Penerima: {task.assignees.map((a) => `${stripGelar(a.name)} (${meetingTaskStatusLabel(a.status)})`).join(", ") || "-"}
                            </p>
                            {myEmployeeId !== null && task.assignees.some((a) => a.employeeId === myEmployeeId && a.status !== "DIBATALKAN") && (
                                <Link href={`/employee/my-tasks/${task.id}`} className="inline-flex px-3 py-2 rounded-lg text-xs font-semibold min-h-10 bg-[var(--secondary)] text-[var(--text-secondary)] items-center" aria-label={`Kelola tugas ${task.title} di Tugas Saya`}>
                                    Kelola di Tugas Saya
                                </Link>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {creating && (
                <TaskFormModal
                    mode="create"
                    appointmentId={appointmentId}
                    participants={participants}
                    onClose={() => setCreating(false)}
                    onSaved={() => { setCreating(false); void load(); }}
                />
            )}
        </section>
    );
}
