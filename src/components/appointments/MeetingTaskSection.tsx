"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Clock, FileText, ListChecks, Loader2, Plus, UploadCloud, Pencil } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { stripGelar } from "@/lib/utils/formatters";
import { formatWIBDateTime } from "@/lib/timezone";
import { useConfirm } from "@/components/ConfirmModal";
import TaskFormModal, { type TaskFormMode, type TaskFormTask } from "@/components/appointments/TaskFormModal";

export interface TaskParticipant {
    employeeId: string | null;
    guestName: string | null;
    isExternal: boolean;
    employee?: { name: string | null } | null;
}

interface TaskAssignee {
    employeeId: string;
    name: string;
    status: string;
    completedAt: string | null;
    isOverdue: boolean;
    stickyOverdue: boolean;
    deadlineTicketsUsed: number;
    deadlineTicketsLeft: number;
    submissionCount: number;
}

interface TaskSubmission {
    id: string;
    employeeId: string;
    note: string | null;
    attemptNo: number;
    verdict: string;
    resubmitDueAt: string | null;
    verifiedBy: string | null;
    verifiedAt: string | null;
    verifyNote: string | null;
    createdAt: string;
    attachments: Array<{ id: string; mimeType: string; size: number; createdAt: string }>;
}

interface MeetingTask {
    id: string;
    title: string;
    detail: string | null;
    isCancelled: boolean;
    cancelReason: string | null;
    assigner: { employeeId: string; name: string | null };
    activeDeadline: { date: string; deadlineAt: string; sequence: number } | null;
    extensionsCount: number;
    deadlineChancesMax: number;
    submissions: TaskSubmission[];
    assignees: TaskAssignee[];
    allDone: boolean;
    anyOverdue: boolean;
}

const STATUS_LABEL: Record<string, string> = {
    OPEN: "Open",
    BELUM_DIKERJAKAN: "Belum Dikerjakan",
    ON_PROGRESS: "Menunggu Verifikasi",
    SELESAI: "Selesai",
    DIBATALKAN: "Dibatalkan",
};

function badgeForTask(task: MeetingTask) {
    if (task.isCancelled) return { cls: "badge-error shrink-0", text: "Dibatalkan" };
    const doneLate = task.assignees.some((a) => a.status === "SELESAI" && a.stickyOverdue);
    if (task.allDone) return { cls: "badge-success shrink-0", text: doneLate ? "Overdue (Done)" : "Selesai" };
    if (task.anyOverdue) {
        const seq2 = (task.activeDeadline?.sequence ?? 1) > 1;
        return { cls: "badge-error shrink-0", text: seq2 ? "Overdue · Kesempatan ke-2" : "Overdue" };
    }
    return { cls: "badge-info shrink-0", text: "Berjalan" };
}

export default function MeetingTaskSection({
    appointmentId,
    participants,
    readOnly = false,
    canCreateTask = true,
    canManageTask = true,
    refreshKey,
}: {
    appointmentId: string;
    participants: TaskParticipant[];
    readOnly?: boolean;
    canCreateTask?: boolean;
    /** Kelola pemberi (ubah/perpanjang/batalkan): hanya selama meeting berjalan. */
    canManageTask?: boolean;
    refreshKey?: string | number;
}) {
    const [tasks, setTasks] = useState<MeetingTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [taskModal, setTaskModal] = useState<{ mode: TaskFormMode; task?: TaskFormTask } | null>(null);
    const [reviseFor, setReviseFor] = useState<string | null>(null);
    const [revNote, setRevNote] = useState("");
    const [revDue, setRevDue] = useState("");
    const confirm = useConfirm();

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [meRes, taskRes] = await Promise.all([
                fetch("/api/auth/me", { credentials: "same-origin" }),
                fetch(`/api/appointments/${appointmentId}/tasks`, { credentials: "same-origin" }),
            ]);
            if (meRes.ok) {
                const me = await meRes.json();
                setMyEmployeeId(me.employeeId ?? null);
            }
            if (!taskRes.ok) throw new Error(await getResponseErrorMessage(taskRes, "Gagal memuat task meeting."));
            const json = await taskRes.json();
            setTasks(json.data ?? []);
        } catch (err) {
            reportClientError("MeetingTaskSection", "Gagal memuat task", err, { appointmentId });
            setError(err instanceof Error ? err.message : "Gagal memuat task meeting.");
        } finally {
            setLoading(false);
        }
    }, [appointmentId]);

    useEffect(() => {
        void load();
    }, [load, refreshKey]);

    async function handleVerify(taskId: string, submissionId: string, decision: "TERIMA" | "REVISI") {
        if (readOnly) {
            setError("Meeting belum selesai. Verifikasi dibuka setelah meeting selesai.");
            return;
        }
        if (decision === "REVISI" && (revNote.trim().length < 5 || !revDue)) {
            setError("Alasan revisi minimal 5 karakter dan tenggat revisi wajib diisi.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/submissions/${submissionId}/verify`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(
                    decision === "REVISI"
                        ? { decision, note: revNote.trim(), resubmitDue: revDue }
                        : { decision }
                ),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memverifikasi."));
            setReviseFor(null);
            setRevNote("");
            setRevDue("");
            await load();
        } catch (err) {
            reportClientError("MeetingTaskSection", "Gagal memverifikasi submission", err, { taskId, submissionId });
            setError(err instanceof Error ? err.message : "Gagal memverifikasi.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                    <ListChecks className="w-3.5 h-3.5" /> Task Hasil Meeting ({tasks.length})
                </p>
                {canCreateTask && (
                    <button type="button" onClick={() => setTaskModal({ mode: "create" })} className="btn btn-secondary btn-sm">
                        <Plus className="w-3.5 h-3.5" /> Beri Task
                    </button>
                )}
            </div>
            {readOnly && (
                <p className="text-[11px] text-[var(--text-muted)] mb-2" role="note">
                    Meeting belum selesai. Task dapat dibuat selama meeting berjalan dan dikerjakan setelah meeting selesai.
                </p>
            )}

            {taskModal && (
                <TaskFormModal
                    mode={taskModal.mode}
                    appointmentId={appointmentId}
                    task={taskModal.task}
                    participants={participants}
                    onClose={() => setTaskModal(null)}
                    onSaved={() => { void load(); }}
                />
            )}

            {loading ? (
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5" aria-label="Memuat task meeting">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat task…
                </p>
            ) : (
                <div className="space-y-2">
                    {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}

                    {tasks.length === 0 && (
                        <p className="text-xs text-[var(--text-muted)]">Belum ada task dari meeting ini.</p>
                    )}

                    {tasks.map((task) => {
                        const mine = task.assignees.find((a) => a.employeeId === myEmployeeId);
                        const iAmAssigner = myEmployeeId !== null && task.assigner.employeeId === myEmployeeId;
                        const badge = badgeForTask(task);
                        const pendingSubs = task.submissions.filter((s) => s.verdict === "PENDING");
                        const canSubmit = !task.isCancelled && !readOnly && mine && (mine.status === "OPEN" || mine.status === "BELUM_DIKERJAKAN");
                        return (
                            <div key={task.id} className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 px-3 py-2.5">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">{task.title}</p>
                                    <span className={badge.cls}>{badge.text}</span>
                                </div>
                                {task.detail && <p className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap">{task.detail}</p>}
                                <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                                    Dari {task.assigner.name ? stripGelar(task.assigner.name) : task.assigner.employeeId}
                                    {task.activeDeadline ? ` · Deadline ${task.activeDeadline.date}` : ""}
                                    {task.extensionsCount > 0 ? ` · Diperpanjang ${task.extensionsCount}x` : ""}
                                </p>

                                {canSubmit && (
                                    <div className="mt-2 rounded-xl border border-[var(--primary)]/40 bg-[var(--card)] p-2.5" aria-label={`Kumpulkan hasil ${task.title}`}>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Status saya · <span className="text-[var(--text-primary)]">{STATUS_LABEL[mine.status] ?? mine.status}</span>
                                        </p>
                                        {mine.stickyOverdue && (
                                            <p className="text-[11px] text-red-600 mt-1">Terlambat dari deadline pertama — status tetap Overdue.</p>
                                        )}
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => setTaskModal({ mode: "submit", task: { id: task.id, title: task.title } })}
                                            className="mt-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 w-full flex items-center justify-center gap-1 bg-[var(--primary)] text-white"
                                        >
                                            <UploadCloud className="w-3.5 h-3.5" /> Kumpulkan Hasil + Lampiran
                                        </button>
                                    </div>
                                )}
                                {!task.isCancelled && !readOnly && mine?.status === "ON_PROGRESS" && (
                                    <div className="mt-2 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-2" aria-label={`Menunggu verifikasi untuk ${task.title}`}>
                                        <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5 shrink-0" /> Menunggu verifikasi {task.assigner.name ? stripGelar(task.assigner.name) : "pemberi task"}.
                                        </p>
                                    </div>
                                )}
                                {!task.isCancelled && mine?.status === "SELESAI" && (
                                    <p className="text-[11px] font-semibold text-emerald-600 mt-2 flex items-center gap-1">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        {mine.stickyOverdue ? "Selesai — tercatat overdue (lewat deadline pertama)." : "Anda sudah menyelesaikan bagian Anda."}
                                    </p>
                                )}

                                {mine && task.submissions.filter((s) => s.employeeId === mine.employeeId).length > 0 && (
                                    <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5" aria-label={`Riwayat pengumpulan saya pada ${task.title}`}>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Pengumpulan saya</p>
                                        <ul className="space-y-1">
                                            {task.submissions.filter((s) => s.employeeId === (mine as { employeeId: string }).employeeId).map((s) => (
                                                <li key={s.id} className="text-[11px]">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[var(--text-secondary)]">
                                                            Attempt {s.attemptNo} · {new Date(s.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} · {s.attachments.length} file{s.verifyNote ? ` · "${s.verifyNote}"` : ""}
                                                        </span>
                                                        <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${s.verdict === "DITERIMA" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : s.verdict === "DIREVISI" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"}`}>
                                                            {s.verdict === "DITERIMA" ? "Diterima" : s.verdict === "DIREVISI" ? "Revisi" : "Diproses"}
                                                        </span>
                                                    </div>
                                                    {s.attachments.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                                            {s.attachments.map((att, i) => (
                                                                <a
                                                                    key={att.id}
                                                                    href={`/api/appointments/submissions/attachments/${att.id}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-[var(--border)] text-[11px] text-[var(--primary)]"
                                                                >
                                                                    <FileText className="w-3 h-3" /> File {i + 1} ({(att.size / 1024).toFixed(0)} KB)
                                                                </a>
                                                            ))}
                                                        </div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div className="mt-2">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                                        Penerima ({task.assignees.length})
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {task.assignees.map((a) => {
                                            const isMine = a.employeeId === myEmployeeId;
                                            const label = a.status === "SELESAI" && a.stickyOverdue
                                                ? "Overdue (Done)"
                                                : STATUS_LABEL[a.status] ?? a.status;
                                            return (
                                                <span
                                                    key={a.employeeId}
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border border-[var(--border)] ${
                                                        a.status === "SELESAI" && !a.stickyOverdue
                                                            ? "bg-emerald-600 text-white border-emerald-600"
                                                            : a.isOverdue || a.stickyOverdue
                                                              ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                                              : "bg-[var(--card)] text-[var(--text-secondary)]"
                                                    }${isMine ? " ring-1 ring-[var(--primary)] font-semibold" : ""}`}
                                                    title={`${stripGelar(a.name)}${isMine ? " (Anda)" : ""}: ${label}${a.deadlineTicketsLeft < 2 ? ` · tiket deadline sisa ${a.deadlineTicketsLeft}` : ""}`}
                                                >
                                                    {a.status === "SELESAI" ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                                                    {stripGelar(a.name)}{isMine ? " (Anda)" : ""} · {label}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>

                                {iAmAssigner && !readOnly && !task.isCancelled && pendingSubs.length > 0 && (
                                    <div className="mt-2 space-y-1.5">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Menunggu verifikasi Anda ({pendingSubs.length})
                                        </p>
                                        {pendingSubs.map((s) => (
                                            <div key={s.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs">
                                                <p className="font-semibold text-[var(--text-primary)]">
                                                    {stripGelar(nameOf(task, s.employeeId))} · attempt {s.attemptNo} · {new Date(s.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                                </p>
                                                {s.note && <p className="text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap">{s.note}</p>}
                                                {s.attachments.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                        {s.attachments.map((att, i) => (
                                                            <a
                                                                key={att.id}
                                                                href={`/api/appointments/submissions/attachments/${att.id}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--border)] text-[11px] text-[var(--primary)]"
                                                            >
                                                                <FileText className="w-3 h-3" /> Lampiran {i + 1} ({(att.size / 1024).toFixed(0)} KB)
                                                            </a>
                                                        ))}
                                                    </div>
                                                )}
                                                {reviseFor === s.id ? (
                                                    <div className="mt-1.5 space-y-1.5">
                                                        <input
                                                            className="form-input text-xs"
                                                            value={revNote}
                                                            onChange={(e) => setRevNote(e.target.value)}
                                                            placeholder="Alasan revisi (min 5 karakter)"
                                                            aria-label="Alasan revisi"
                                                        />
                                                        <input
                                                            type="date"
                                                            className="form-input text-xs"
                                                            value={revDue}
                                                            onChange={(e) => setRevDue(e.target.value)}
                                                            aria-label="Tenggat revisi"
                                                        />
                                                        <div className="flex gap-1.5">
                                                            <button
                                                                type="button"
                                                                disabled={busy}
                                                                onClick={() => { void handleVerify(task.id, s.id, "REVISI"); }}
                                                                className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-600 text-white flex-1"
                                                            >
                                                                Kirim Revisi
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={busy}
                                                                onClick={() => { setReviseFor(null); setRevNote(""); setRevDue(""); }}
                                                                className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--secondary)] text-[var(--text-secondary)]"
                                                            >
                                                                Batal
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-1.5 mt-1.5">
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() =>
                                                                confirm({
                                                                    title: "Setujui Hasil?",
                                                                    message: `Task "${task.title}" untuk penerima ini akan ditandai selesai.`,
                                                                    confirmLabel: "Ya, Setujui",
                                                                    variant: "info",
                                                                    onConfirm: () => { void handleVerify(task.id, s.id, "TERIMA"); },
                                                                })
                                                            }
                                                            className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600 text-white flex-1"
                                                        >
                                                            Terima
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => { setReviseFor(s.id); setRevNote(""); setRevDue(""); }}
                                                            className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-600 text-white flex-1"
                                                        >
                                                            Revisi
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {iAmAssigner && task.submissions.length > 0 && (
                                    <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5" aria-label={`Riwayat pengumpulan pada ${task.title}`}>
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Riwayat pengumpulan</p>
                                        <ul className="space-y-2">
                                            {task.submissions.map((s) => (
                                                <li key={s.id} className="text-[11px]">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[var(--text-secondary)]">
                                                            {stripGelar(nameOf(task, s.employeeId))} · attempt {s.attemptNo} · {new Date(s.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                                            {s.verifyNote ? ` · "${s.verifyNote}"` : ""}
                                                        </span>
                                                        <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${s.verdict === "DITERIMA" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : s.verdict === "DIREVISI" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"}`}>
                                                            {s.verdict === "DITERIMA" ? "Diterima" : s.verdict === "DIREVISI" ? `Revisi${s.resubmitDueAt ? ` · tenggat ${new Date(s.resubmitDueAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}` : ""}` : "Diproses"}
                                                        </span>
                                                    </div>
                                                    {s.note && <p className="text-[var(--text-secondary)] mt-0.5 whitespace-pre-wrap">Catatan penerima: {s.note}</p>}
                                                    {s.attachments.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                                            {s.attachments.map((att, i) => (
                                                                <a
                                                                    key={att.id}
                                                                    href={`/api/appointments/submissions/attachments/${att.id}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-[var(--border)] text-[11px] text-[var(--primary)]"
                                                                >
                                                                    <FileText className="w-3 h-3" /> Lampiran {i + 1} ({(att.size / 1024).toFixed(0)} KB)
                                                                </a>
                                                            ))}
                                                        </div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {!task.isCancelled && canManageTask && iAmAssigner && (
                                    <div className="flex gap-1.5 mt-2">
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => setTaskModal({ mode: "extend", task: { id: task.id, title: task.title } })}
                                            className="px-2 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)]"
                                        >
                                            Perpanjang
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() =>
                                                setTaskModal({
                                                    mode: "edit",
                                                    task: {
                                                        id: task.id,
                                                        title: task.title,
                                                        detail: task.detail,
                                                        dueDate: task.activeDeadline?.date ?? null,
                                                        assigneeIds: task.assignees.map((a) => a.employeeId),
                                                    },
                                                })
                                            }
                                            className="px-2 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] flex items-center gap-1"
                                        >
                                            <Pencil className="w-3 h-3" /> Ubah
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => setTaskModal({ mode: "cancel", task: { id: task.id, title: task.title } })}
                                            className="px-2 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 bg-[var(--card)] border border-[var(--border)] text-red-600"
                                        >
                                            Batalkan
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function nameOf(task: { assigner: { employeeId: string; name: string | null }; assignees: Array<{ employeeId: string; name: string }> }, employeeId: string): string {
    if (task.assigner.employeeId === employeeId) return task.assigner.name ?? employeeId;
    return task.assignees.find((a) => a.employeeId === employeeId)?.name ?? employeeId;
}
