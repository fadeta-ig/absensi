"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, ListChecks, Loader2, Plus } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";

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
}: {
    appointmentId: string;
    participants: TaskParticipant[];
}) {
    const [tasks, setTasks] = useState<MeetingTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [title, setTitle] = useState("");
    const [detail, setDetail] = useState("");
    const [picked, setPicked] = useState<string[]>([]);
    const [dueDate, setDueDate] = useState("");
    const [busy, setBusy] = useState(false);
    const [extFor, setExtFor] = useState<string | null>(null);
    const [extDate, setExtDate] = useState("");
    const [extReason, setExtReason] = useState("");
    const [cancelFor, setCancelFor] = useState<string | null>(null);
    const [cancelReason, setCancelReason] = useState("");
    const [pendingExt, setPendingExt] = useState<Record<string, ExtensionRequest[]>>({});

    const internalParticipants = participants.filter((p) => !p.isExternal && p.employeeId);

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
    }, [load]);

    async function refreshPending(taskId: string) {
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/tasks/${taskId}/extension-requests`, { credentials: "same-origin" });
            if (!res.ok) return;
            const json = await res.json();
            setPendingExt((prev) => ({ ...prev, [taskId]: json.data ?? [] }));
        } catch {
            // Biarkan kosong; bukan alur utama
        }
    }

    async function handleCreate() {
        setBusy(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/tasks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ title, detail: detail || null, assigneeEmployeeIds: picked, dueDate }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal membuat task."));
            setTitle("");
            setDetail("");
            setPicked([]);
            setDueDate("");
            setShowCreate(false);
            await load();
        } catch (err) {
            reportClientError("MeetingTaskSection", "Gagal membuat task", err, { appointmentId });
            setError(err instanceof Error ? err.message : "Gagal membuat task.");
        } finally {
            setBusy(false);
        }
    }

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

    async function handleExtend(taskId: string) {
        setBusy(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/tasks/${taskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ action: "extend", proposedDate: extDate, reason: extReason }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memperpanjang deadline."));
            setExtFor(null);
            setExtDate("");
            setExtReason("");
            await load();
        } catch (err) {
            reportClientError("MeetingTaskSection", "Gagal memperpanjang deadline", err, { taskId });
            setError(err instanceof Error ? err.message : "Gagal memperpanjang deadline.");
        } finally {
            setBusy(false);
        }
    }

    async function handleCancel(taskId: string) {
        if (cancelReason.trim().length < 5) {
            setError("Alasan pembatalan minimal 5 karakter.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/tasks/${taskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ action: "cancel", reason: cancelReason }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal membatalkan task."));
            setCancelFor(null);
            setCancelReason("");
            await load();
        } catch (err) {
            reportClientError("MeetingTaskSection", "Gagal membatalkan task", err, { taskId });
            setError(err instanceof Error ? err.message : "Gagal membatalkan task.");
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
                body: JSON.stringify({ proposedDate: extDate, reason: extReason }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengajukan perpanjangan."));
            setExtFor(null);
            setExtDate("");
            setExtReason("");
            await refreshPending(taskId);
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
            await refreshPending(taskId);
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
                {!showCreate && (
                    <button type="button" onClick={() => setShowCreate(true)} className="btn btn-secondary btn-sm">
                        <Plus className="w-3.5 h-3.5" /> Beri Task
                    </button>
                )}
            </div>

            {loading ? (
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5" aria-label="Memuat task meeting">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat task…
                </p>
            ) : (
                <div className="space-y-2">
                    {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}

                    {showCreate && (
                        <div className="space-y-2 rounded-xl border border-[var(--border)] p-2.5">
                            <label className="form-label" htmlFor="task-title">Judul Task *</label>
                            <input id="task-title" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Kirim data penjualan Oktober" maxLength={200} />
                            <label className="form-label" htmlFor="task-detail">Rincian (opsional)</label>
                            <textarea id="task-detail" className="form-textarea" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Jelaskan data yang diminta…" maxLength={5000} />
                            <span className="form-label">Penerima * (peserta meeting)</span>
                            <div className="max-h-32 overflow-y-auto rounded-lg border border-[var(--border)] p-2 space-y-1">
                                {internalParticipants.length === 0 && (
                                    <p className="text-xs text-[var(--text-muted)]">Tidak ada peserta internal.</p>
                                )}
                                {internalParticipants.map((p) => (
                                    <label key={p.employeeId as string} className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={picked.includes(p.employeeId as string)}
                                            onChange={(e) =>
                                                setPicked((prev) =>
                                                    e.target.checked
                                                        ? [...prev, p.employeeId as string]
                                                        : prev.filter((id) => id !== p.employeeId)
                                                )
                                            }
                                            className="w-4 h-4 text-[var(--primary)] rounded"
                                        />
                                        <span className="text-[var(--text-primary)]">{p.employee?.name ?? p.employeeId}</span>
                                    </label>
                                ))}
                            </div>
                            <label className="form-label" htmlFor="task-due">Deadline *</label>
                            <input id="task-due" type="date" className="form-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setShowCreate(false)} disabled={busy} className="btn btn-secondary flex-1">Batal</button>
                                <button
                                    type="button"
                                    onClick={() => { void handleCreate(); }}
                                    disabled={busy || !title.trim() || picked.length === 0 || !dueDate}
                                    className="btn btn-primary flex-1"
                                >
                                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {busy ? "Menyimpan…" : "Simpan Task"}
                                </button>
                            </div>
                        </div>
                    )}

                    {tasks.length === 0 && !showCreate && (
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
                                    Dari {task.assigner.name ?? task.assigner.employeeId}
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
                                            title={`${a.name}: ${STATUS_LABEL[a.status] ?? a.status}`}
                                        >
                                            {a.status === "SELESAI" ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                                            {a.name} · {STATUS_LABEL[a.status] ?? a.status}
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
                                                onClick={() => { void handleStatus(task.id, s); }}
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
                                                    onClick={() => { setExtFor(extFor === task.id ? null : task.id); setExtDate(""); setExtReason(""); void refreshPending(task.id); }}
                                                    className="px-2 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)]"
                                                >
                                                    Perpanjang
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => { setCancelFor(cancelFor === task.id ? null : task.id); setCancelReason(""); }}
                                                    className="px-2 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 bg-[var(--card)] border border-[var(--border)] text-red-600"
                                                >
                                                    Batalkan
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => { setExtFor(extFor === task.id ? null : task.id); setExtDate(""); setExtReason(""); }}
                                                className="px-2 py-1.5 rounded-lg text-[11px] font-semibold min-h-9 bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)]"
                                            >
                                                Minta Perpanjangan
                                            </button>
                                        )}
                                    </div>
                                )}

                                {cancelFor === task.id && !task.isCancelled && (
                                    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 mt-2">
                                        <label className="form-label" htmlFor={`cancel-reason-${task.id}`}>Alasan Pembatalan *</label>
                                        <input id={`cancel-reason-${task.id}`} className="form-input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Minimal 5 karakter" />
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setCancelFor(null)} disabled={busy} className="btn btn-secondary flex-1">Kembali</button>
                                            <button
                                                type="button"
                                                disabled={busy || cancelReason.trim().length < 5}
                                                onClick={() => { void handleCancel(task.id); }}
                                                className="btn flex-1 bg-rose-600 text-white hover:bg-rose-700"
                                            >
                                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                                Ya, Batalkan Task
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {extFor === task.id && !task.isCancelled && (
                                    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 mt-2">
                                        <label className="form-label" htmlFor={`ext-date-${task.id}`}>Tanggal Baru *</label>
                                        <input id={`ext-date-${task.id}`} type="date" className="form-input" value={extDate} onChange={(e) => setExtDate(e.target.value)} />
                                        <label className="form-label" htmlFor={`ext-reason-${task.id}`}>Alasan *</label>
                                        <input id={`ext-reason-${task.id}`} className="form-input" value={extReason} onChange={(e) => setExtReason(e.target.value)} placeholder="Minimal 5 karakter" />
                                        <button
                                            type="button"
                                            disabled={busy || !extDate || extReason.trim().length < 5}
                                            onClick={() => { void (iAmAssigner ? handleExtend(task.id) : handleRequestExtension(task.id)); }}
                                            className="btn btn-primary w-full"
                                        >
                                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                            {iAmAssigner ? "Simpan Perpanjangan" : "Kirim Pengajuan"}
                                        </button>
                                        {iAmAssigner && (pendingExt[task.id] ?? []).filter((r) => r.status === "PENDING").map((r) => (
                                            <div key={r.id} className="rounded-lg border border-[var(--border)] p-2 text-xs">
                                                <p className="font-semibold text-[var(--text-primary)]">
                                                    {r.requestedBy.name ?? r.requestedBy.employeeId} meminta ke {new Date(r.proposedDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                                                </p>
                                                <p className="text-[var(--text-muted)] mt-0.5">Alasan: {r.reason}</p>
                                                <div className="flex gap-1.5 mt-1.5">
                                                    <button type="button" disabled={busy} onClick={() => { void handleDecide(task.id, r.id, "APPROVED"); }} className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600 text-white flex-1">
                                                        Setujui
                                                    </button>
                                                    <button type="button" disabled={busy} onClick={() => { void handleDecide(task.id, r.id, "REJECTED"); }} className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--secondary)] text-[var(--text-secondary)] flex-1">
                                                        Tolak
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
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
