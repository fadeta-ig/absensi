"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";
import type { TaskParticipant } from "@/components/appointments/MeetingTaskSection";

export type TaskFormMode = "create" | "extend" | "cancel";

interface TaskFormModalProps {
    mode: TaskFormMode;
    appointmentId: string;
    task?: { id: string; title: string };
    participants: TaskParticipant[];
    onClose: () => void;
    onSaved: () => void;
}

const MODE_META: Record<TaskFormMode, { title: string; aria: string; submit: string }> = {
    create: { title: "Buat Task", aria: "Buat task meeting", submit: "Simpan Task" },
    extend: { title: "Perpanjang Deadline", aria: "Perpanjang deadline task", submit: "Simpan Perpanjangan" },
    cancel: { title: "Batalkan Task", aria: "Batalkan task meeting", submit: "Ya, Batalkan Task" },
};

export default function TaskFormModal({ mode, appointmentId, task, participants, onClose, onSaved }: TaskFormModalProps) {
    const meta = MODE_META[mode];
    const [title, setTitle] = useState("");
    const [detail, setDetail] = useState("");
    const [picked, setPicked] = useState<string[]>([]);
    const [date, setDate] = useState("");
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const internalParticipants = participants.filter((p) => !p.isExternal && p.employeeId);

    const canSubmit =
        !busy &&
        (mode === "create"
            ? title.trim().length > 0 && picked.length > 0 && date.length > 0
            : mode === "extend"
              ? date.length > 0 && reason.trim().length >= 5
              : reason.trim().length >= 5);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        setError("");
        try {
            let res: Response;
            if (mode === "create") {
                res = await fetch(`/api/appointments/${appointmentId}/tasks`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ title, detail: detail || null, assigneeEmployeeIds: picked, dueDate: date }),
                });
            } else {
                if (!task) throw new Error("Task tidak ditemukan.");
                res = await fetch(`/api/appointments/${appointmentId}/tasks/${task.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify(
                        mode === "extend"
                            ? { action: "extend", proposedDate: date, reason }
                            : { action: "cancel", reason }
                    ),
                });
            }
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan task."));
            onSaved();
            onClose();
        } catch (err) {
            reportClientError("TaskFormModal", "Gagal menyimpan task", err, { appointmentId, mode });
            setError(err instanceof Error ? err.message : "Gagal menyimpan task.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <AccessibleModal ariaLabel={meta.aria} onClose={onClose} className="max-w-lg" disableClose={busy}>
            <div className="modal-header">
                <h2 className="modal-title">
                    {meta.title}
                    {task ? ` — ${task.title}` : ""}
                </h2>
                <button className="modal-close" onClick={onClose} disabled={busy} aria-label="Tutup">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {error && (
                <FeedbackMessage variant="error" className="mb-4">
                    {error}
                </FeedbackMessage>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "create" && (
                    <>
                        <div>
                            <label className="form-label" htmlFor="task-form-title">Judul Task *</label>
                            <input
                                id="task-form-title"
                                className="form-input"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Contoh: Kirim data penjualan Oktober"
                                maxLength={200}
                            />
                        </div>
                        <div>
                            <label className="form-label" htmlFor="task-form-detail">Rincian (opsional)</label>
                            <textarea
                                id="task-form-detail"
                                className="form-textarea"
                                value={detail}
                                onChange={(e) => setDetail(e.target.value)}
                                placeholder="Jelaskan data yang diminta…"
                                maxLength={5000}
                            />
                        </div>
                        <div>
                            <span className="form-label">Penerima * (peserta meeting)</span>
                            <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] p-2 space-y-1">
                                {internalParticipants.length === 0 && (
                                    <p className="text-xs text-[var(--text-muted)]">Tidak ada peserta internal.</p>
                                )}
                                {internalParticipants.map((p) => (
                                    <label key={p.employeeId as string} className="flex items-center gap-2 text-sm cursor-pointer min-h-9">
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
                                        <span className="text-[var(--text-primary)]">
                                            {p.employee?.name ? stripGelar(p.employee.name) : p.employeeId}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="form-label" htmlFor="task-form-due">Deadline *</label>
                            <input id="task-form-due" type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
                        </div>
                    </>
                )}

                {mode === "extend" && (
                    <>
                        <div>
                            <label className="form-label" htmlFor="task-form-ext-date">Tanggal Baru *</label>
                            <input id="task-form-ext-date" type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="form-label" htmlFor="task-form-ext-reason">Alasan *</label>
                            <input
                                id="task-form-ext-reason"
                                className="form-input"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Minimal 5 karakter"
                            />
                        </div>
                    </>
                )}

                {mode === "cancel" && (
                    <div>
                        <label className="form-label" htmlFor="task-form-cancel-reason">Alasan Pembatalan *</label>
                        <input
                            id="task-form-cancel-reason"
                            className="form-input"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Minimal 5 karakter"
                        />
                    </div>
                )}

                <div className="flex gap-2">
                    <button type="button" onClick={onClose} disabled={busy} className="btn btn-secondary flex-1">
                        Batal
                    </button>
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className={`btn flex-1 ${mode === "cancel" ? "bg-rose-600 text-white hover:bg-rose-700" : "btn-primary"}`}
                    >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {busy ? "Menyimpan…" : meta.submit}
                    </button>
                </div>
            </form>
        </AccessibleModal>
    );
}
