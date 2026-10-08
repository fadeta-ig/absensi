"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, ListChecks, Loader2, Plus } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { stripGelar } from "@/lib/utils/formatters";
import { useConfirm } from "@/components/ConfirmModal";
import TaskFormModal, { type TaskFormMode } from "@/components/appointments/TaskFormModal";

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
    pendingExtensionRequests: ExtensionRequest[];
    assignees: TaskAssignee[];
    allDone: boolean;
    anyOverdue: boolean;
}

interface ExtensionRequest {
    id: string;
    proposedDate: string;
    reason: string;
    status: string;
    createdAt: string;
    requestedBy: { employeeId: string; name: string | null };
}

const STATUS_LABEL: Record<string, string> = {
    BELUM_DIKERJAKAN: "Belum Dikerjakan",
    ON_PROGRESS: "On Progress",
    SELESAI: "Selesai",
    DIBATALKAN: "Dibatalkan",
};

const STATUS_ACTION: Array<"BELUM_DIKERJAKAN" | "ON_PROGRESS" | "SELESAI"> = ["BELUM_DIKERJAKAN", "ON_PROGRESS", "SELESAI"];

export default function MeetingTaskSection({
    appointmentId,
    participants,
    readOnly = false,
}: {
    appointmentId: string;
    participants: TaskParticipant[];
    readOnly?: boolean;
}) {
    const [tasks, setTasks] = useState<MeetingTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [taskModal, setTaskModal] = useState<{ mode: TaskFormMode; task?: { id: string; title: string } } | null>(null);
    const [reqFor, setReqFor] = useState<string | null>(null);
    const [reqDate, setReqDate] = useState("");
    const [reqReason, setReqReason] = useState("");
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
            const list = json.data ?? [];
            setTasks(list);
        } catch (err) {
            reportClientError("MeetingTaskSection", "Gagal memuat task", err, { appointmentId });
            setError(err instanceof Error ? err.message : "Gagal memuat task meeting.");
        } finally {
            setLoading(false);
        }
    }, [appointmentId]);

    useEffect(() => {
        void load();
    }, [load]);

    async function handleStatus(taskId: string, status: string) {
        setBusy(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/tasks/${taskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ action: "status", status }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status."));
            await load();
        } catch (err) {
            reportClientError("MeetingTaskSection", "Gagal mengubah status task", err, { taskId });
            setError(err instanceof Error ? err.message : "Gagal mengubah status.");
        } finally {
            setBusy(false);
        }
    }

    async function handleRequestExtension(taskId: string) {
        setBusy(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/tasks/${taskId}/extension-requests`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ proposedDate: reqDate, reason: reqReason }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengajukan perpanjangan."));
            setReqFor(null);
            setReqDate("");
            setReqReason("");
            await load();
        } catch (err) {
            reportClientError("MeetingTaskSection", "Gagal mengajukan perpanjangan", err, { taskId });
            setError(err instanceof Error ? err.message : "Gagal mengajukan perpanjangan.");
        } finally {
            setBusy(false);
        }
    }

    async function handleDecide(taskId: string, requestId: string, decision: "APPROVED" | "REJECTED") {
        setBusy(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/tasks/${taskId}/extension-requests/${requestId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ decision }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memutuskan pengajuan."));
            await load();
        } catch (err) {
            reportClientError("MeetingTaskSection", "Gagal memutuskan pengajuan", err, { taskId });
            setError(err instanceof Error ? err.message : "Gagal memutuskan pengajuan.");
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
                {!readOnly && (
                    <button type="button" onClick={() => setTaskModal({ mode: "create" })} className="btn btn-secondary btn-sm">
                        <Plus className="w-3.5 h-3.5" /> Beri Task
                    </button>
                )}
            </div>

            {taskModal && !readOnly && (
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
                        <p className="text-xs text-[var(--text-muted)]">Belum ada task dari meeting ini. Task bersifat opsional.</p>
                    )}

                    {tasks.map((task) => {
                        const mine = task.assignees.find((a) => a.employeeId === myEmployeeId);
                        const iAmAssigner = myEmployeeId !== null && task.assigner.employeeId === myEmployeeId;
                        return (
                            <div key={task.id} className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 px-3 py-2.5">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">{task.title}</p>
                                    {task.isCancelled ? (
                                        <span className="badge-error shrink-0">Dibatalkan</span>
                                    ) : task.allDone ? (
                                        <span className="badge-success shrink-0">Selesai</span>
                                    ) : task.anyOverdue ? (
                                        <span className="badge-error shrink-0">Overdue</span>
                                    ) : (
                                        <span className="badge-info shrink-0">Berjalan</span>
                                    )}
                                </div>
                                {task.detail && <p className="text-xs text-[var(--text-secondary)] mt-1 whitespace-pre-wrap">{task.detail}</p>}
                                <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                                    Dari {task.assigner.name ? stripGelar(task.assigner.name) : task.assigner.employeeId}
                                    {task.activeDeadline ? ` · Deadline ${task.activeDeadline.date}` : ""}
                                    {task.extensionsCount > 0 ? ` · Diperpanjang ${task.extensionsCount}x` : ""}
                                </p>
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {task.assignees.map((a) => (
                                        <span
                                            key={a.employeeId}
                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border border-[var(--border)] ${
                                                a.status === "SELESAI"
                                                    ? "bg-emerald-600 text-white border-emerald-600"
                                                    : a.isOverdue
                                                      ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                                      : "bg-[var(--card)] text-[var(--text-secondary)]"
                                            }`}
                                            title={`${stripGelar(a.name)}: ${STATUS_LABEL[a.status] ?? a.status}`}
                                        >
                                            {a.status === "SELESAI" ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                                            {stripGelar(a.name)} · {STATUS_LABEL[a.status] ?? a.status}
                                        </span>
                                    ))}
                                </div>

                                {!task.isCancelled && mine && mine.status !== "SELESAI" && mine.status !== "DIBATALKAN" && (
                                    <div className="flex gap-1.5 mt-2">
                                        {STATUS_ACTION.filter((s) => s !== mine.status).map((s) => (
                                            <button
                                                key={s}
                                                type="button"
                                                disabled={busy}
                                                onClick={() => {
                                                    if (s === "SELESAI") {
                                                        confirm({
                                                            title: "Tandai Selesai?",
                                                            message: `Task "${task.title}" akan ditandai selesai. Pastikan pekerjaan sudah benar-benar tuntas.`,
                                                            confirmLabel: "Ya, Selesai",
                                                            variant: "info",
                                                            onConfirm: () => { void handleStatus(task.id, s); },
                                                        });
                                                    } else {
                                                        void handleStatus(task.id, s);
                                                    }
                                                }}
                                                className="px-2 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)]"
                                            >
                                                {s === "SELESAI" ? "Tandai Selesai" : STATUS_LABEL[s]}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {!task.isCancelled && (iAmAssigner || mine) && (
                                    <div className="flex gap-1.5 mt-2">
                                        {iAmAssigner ? (
                                            <>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => { setTaskModal({ mode: "extend", task: { id: task.id, title: task.title } }); }}
                                                    className="px-2 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)]"
                                                >
                                                    Perpanjang
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => setTaskModal({ mode: "cancel", task: { id: task.id, title: task.title } })}
                                                    className="px-2 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 bg-[var(--card)] border border-[var(--border)] text-red-600"
                                                >
                                                    Batalkan
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => { setReqFor(reqFor === task.id ? null : task.id); setReqDate(""); setReqReason(""); }}
                                                className="px-2 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)]"
                                            >
                                                Minta Perpanjangan
                                            </button>
                                        )}
                                    </div>
                                )}

                                {reqFor === task.id && !task.isCancelled && !iAmAssigner && (
                                    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 mt-2">
                                        <label className="form-label" htmlFor={`req-date-${task.id}`}>Tanggal Usulan *</label>
                                        <input id={`req-date-${task.id}`} type="date" className="form-input" value={reqDate} onChange={(e) => setReqDate(e.target.value)} />
                                        <label className="form-label" htmlFor={`req-reason-${task.id}`}>Alasan *</label>
                                        <input id={`req-reason-${task.id}`} className="form-input" value={reqReason} onChange={(e) => setReqReason(e.target.value)} placeholder="Minimal 5 karakter" />
                                        <button
                                            type="button"
                                            disabled={busy || !reqDate || reqReason.trim().length < 5}
                                            onClick={() => { void handleRequestExtension(task.id); }}
                                            className="btn btn-primary w-full"
                                        >
                                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                            Kirim Pengajuan
                                        </button>
                                    </div>
                                )}

                                {iAmAssigner && task.pendingExtensionRequests.filter((r) => r.status === "PENDING").map((r) => (
                                    <div key={r.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 mt-2 text-xs">
                                        <p className="font-semibold text-[var(--text-primary)]">
                                            {r.requestedBy.name ? stripGelar(r.requestedBy.name) : r.requestedBy.employeeId} meminta ke {new Date(r.proposedDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                                        </p>
                                        <p className="text-[var(--text-muted)] mt-0.5">Alasan: {r.reason}</p>
                                        <div className="flex gap-1.5 mt-1.5">
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() =>
                                                    confirm({
                                                        title: "Setujui Perpanjangan?",
                                                        message: `Deadline "${task.title}" akan digeser ke tanggal usulan.`,
                                                        confirmLabel: "Ya, Setujui",
                                                        variant: "info",
                                                        onConfirm: () => { void handleDecide(task.id, r.id, "APPROVED"); },
                                                    })
                                                }
                                                className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600 text-white flex-1"
                                            >
                                                Setujui
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() =>
                                                    confirm({
                                                        title: "Tolak Pengajuan?",
                                                        message: "Penerima task akan tetap terikat deadline aktif.",
                                                        confirmLabel: "Ya, Tolak",
                                                        variant: "warning",
                                                        onConfirm: () => { void handleDecide(task.id, r.id, "REJECTED"); },
                                                    })
                                                }
                                                className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--secondary)] text-[var(--text-secondary)] flex-1"
                                            >
                                                Tolak
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
