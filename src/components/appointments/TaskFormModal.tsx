"use client";

import { useMemo, useState } from "react";
import { Loader2, Search, X, Paperclip } from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";
import type { TaskParticipant } from "@/components/appointments/MeetingTaskSection";

export type TaskFormMode = "create" | "extend" | "cancel" | "submit" | "edit";

export interface TaskFormTask {
    id: string;
    title: string;
    detail?: string | null;
    dueDate?: string | null;
    assigneeIds?: string[];
}

interface TaskFormModalProps {
    mode: TaskFormMode;
    appointmentId: string;
    task?: TaskFormTask;
    participants: TaskParticipant[];
    onClose: () => void;
    onSaved: () => void;
}

const MODE_META: Record<TaskFormMode, { title: string; aria: string; submit: string }> = {
    create: { title: "Buat Task", aria: "Buat task meeting", submit: "Simpan Task" },
    extend: { title: "Perpanjang Deadline", aria: "Perpanjang deadline task", submit: "Simpan Perpanjangan" },
    cancel: { title: "Batalkan Task", aria: "Batalkan task meeting", submit: "Ya, Batalkan Task" },
    submit: { title: "Kumpulkan Hasil", aria: "Kumpulkan hasil task", submit: "Kirim untuk Verifikasi" },
    edit: { title: "Ubah Task", aria: "Ubah task meeting", submit: "Simpan Perubahan" },
};

const ACCEPTED_UPLOAD = ".jpg,.jpeg,.png,.webp,.pdf";
const MAX_SUBMIT_FILES = 5;

export default function TaskFormModal({ mode, appointmentId, task, participants, onClose, onSaved }: TaskFormModalProps) {
    const meta = MODE_META[mode];
    const [title, setTitle] = useState(task?.title ?? "");
    const [detail, setDetail] = useState(task?.detail ?? "");
    const [picked, setPicked] = useState<string[]>(task?.assigneeIds ?? []);
    const [date, setDate] = useState(task?.dueDate ?? "");
    const [reason, setReason] = useState("");
    const [note, setNote] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [assigneeQuery, setAssigneeQuery] = useState("");

    const internalParticipants = useMemo(
        () => participants.filter((p) => !p.isExternal && p.employeeId),
        [participants]
    );

    const filteredAssignees = useMemo(() => {
        const q = assigneeQuery.trim().toLowerCase();
        if (!q) return internalParticipants;
        return internalParticipants.filter((p) => {
            const name = p.employee?.name ? stripGelar(p.employee.name).toLowerCase() : "";
            const id = (p.employeeId ?? "").toLowerCase();
            return name.includes(q) || id.includes(q);
        });
    }, [assigneeQuery, internalParticipants]);

    const originalPicked = useMemo(() => task?.assigneeIds ?? [], [task]);
    const editChanged =
        mode !== "edit" ||
        title.trim() !== (task?.title ?? "") ||
        detail !== (task?.detail ?? "") ||
        date !== (task?.dueDate ?? "") ||
        picked.length !== originalPicked.length ||
        picked.some((id) => !originalPicked.includes(id));

    const canSubmit =
        !busy &&
        (mode === "create"
            ? title.trim().length > 0 && picked.length > 0 && date.length > 0
            : mode === "extend"
              ? date.length > 0 && reason.trim().length >= 5
              : mode === "cancel"
                ? reason.trim().length >= 5
                : mode === "submit"
                  ? files.length >= 1 && files.length <= MAX_SUBMIT_FILES
                  : title.trim().length > 0 && editChanged);

    function handleFiles(selected: FileList | null) {
        if (!selected) return;
        setFiles((prev) => [...prev, ...Array.from(selected)].slice(0, MAX_SUBMIT_FILES));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        setError("");
        try {
            let res: Response;
            if (mode === "submit") {
                if (!task) throw new Error("Task tidak ditemukan.");
                const form = new FormData();
                if (note.trim()) form.append("note", note.trim());
                for (const f of files) form.append("files", f, f.name);
                res = await fetch(`/api/appointments/${appointmentId}/tasks/${task.id}/submissions`, {
                    method: "POST",
                    credentials: "same-origin",
                    body: form,
                });
            } else if (mode === "edit") {
                if (!task) throw new Error("Task tidak ditemukan.");
                const added = picked.filter((id) => !originalPicked.includes(id));
                const removed = originalPicked.filter((id) => !picked.includes(id));
                res = await fetch(`/api/appointments/${appointmentId}/tasks/${task.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({
                        action: "edit",
                        title: title.trim() !== task.title ? title.trim() : undefined,
                        detail: detail !== (task.detail ?? "") ? detail || null : undefined,
                        dueDate: date !== (task.dueDate ?? "") && date ? date : undefined,
                        addAssigneeIds: added,
                        removeAssigneeIds: removed,
                    }),
                });
            } else if (mode === "create") {
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
                            <div className="relative mb-2">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                                <input
                                    className="form-input pl-10"
                                    value={assigneeQuery}
                                    onChange={(e) => setAssigneeQuery(e.target.value)}
                                    placeholder="Cari nama peserta yang hadir…"
                                    aria-label="Cari nama penerima task"
                                />
                            </div>
                            <div className="flex items-center justify-between mb-1.5">
                                <p className="text-[11px] text-[var(--text-muted)]" aria-live="polite">
                                    {assigneeQuery.trim()
                                        ? `${filteredAssignees.length} dari ${internalParticipants.length} cocok · ${picked.length} dipilih`
                                        : `${picked.length} dari ${internalParticipants.length} dipilih`}
                                </p>
                                {internalParticipants.length > 1 && (
                                    <div className="flex gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setPicked((prev) => {
                                                    const next = new Set(prev);
                                                    for (const p of filteredAssignees) {
                                                        if (p.employeeId) next.add(p.employeeId);
                                                    }
                                                    return [...next];
                                                })
                                            }
                                            disabled={filteredAssignees.length === 0}
                                            className="text-[11px] font-semibold text-[var(--primary)] hover:underline disabled:opacity-40"
                                        >
                                            Pilih hasil
                                        </button>
                                        {picked.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setPicked([])}
                                                className="text-[11px] font-semibold text-[var(--text-muted)] hover:underline"
                                            >
                                                Bersihkan
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] p-2 space-y-1">
                                {internalParticipants.length === 0 && (
                                    <p className="text-xs text-[var(--text-muted)]">Tidak ada peserta internal.</p>
                                )}
                                {internalParticipants.length > 0 && filteredAssignees.length === 0 && (
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Tidak ada peserta yang cocok dengan &ldquo;{assigneeQuery.trim()}&rdquo;.
                                    </p>
                                )}
                                {filteredAssignees.map((p) => (
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

                {mode === "edit" && (
                    <>
                        <div>
                            <label className="form-label" htmlFor="task-form-edit-title">Judul Task *</label>
                            <input
                                id="task-form-edit-title"
                                className="form-input"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                maxLength={200}
                            />
                        </div>
                        <div>
                            <label className="form-label" htmlFor="task-form-edit-detail">Rincian</label>
                            <textarea
                                id="task-form-edit-detail"
                                className="form-textarea"
                                value={detail}
                                onChange={(e) => setDetail(e.target.value)}
                                maxLength={5000}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="form-label" htmlFor="task-form-edit-due">Deadline</label>
                                <input id="task-form-edit-due" type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
                            </div>
                            <p className="text-[11px] text-[var(--text-muted)] self-end">Kosongkan bila tidak diubah. Ubah tanggal = kesempatan baru + tiket penerima idle.</p>
                        </div>
                        <div>
                            <span className="form-label">Penerima (hapus hanya bila belum pernah submit)</span>
                            <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] p-2 space-y-1">
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
                    </>
                )}

                {mode === "submit" && (
                    <>
                        <div>
                            <label className="form-label" htmlFor="task-form-note">Catatan hasil (opsional)</label>
                            <textarea
                                id="task-form-note"
                                className="form-textarea"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Jelaskan hasil kerja yang dikumpulkan…"
                                maxLength={2000}
                            />
                        </div>
                        <div>
                            <label className="form-label" htmlFor="task-form-files">Lampiran * (1–5 file: JPG, PNG, WEBP, PDF)</label>
                            <input
                                id="task-form-files"
                                type="file"
                                multiple
                                accept={ACCEPTED_UPLOAD}
                                className="form-input"
                                onChange={(e) => handleFiles(e.target.files)}
                                aria-label="Pilih lampiran hasil kerja"
                            />
                            {files.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                    {files.map((f, i) => (
                                        <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-[var(--border)] px-2 py-1.5">
                                            <span className="flex items-center gap-1.5 truncate">
                                                <Paperclip className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                                                <span className="truncate">{f.name}</span>
                                                <span className="text-[var(--text-muted)] shrink-0">({(f.size / 1024).toFixed(0)} KB)</span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                                                className="text-[var(--text-muted)] hover:text-red-600 shrink-0 min-h-9 min-w-9 inline-flex items-center justify-center"
                                                aria-label={`Hapus ${f.name}`}
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <p className="text-[11px] text-[var(--text-muted)] mt-1">Setelah dikirim, status berubah menjadi Menunggu Verifikasi.</p>
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
                        {busy ? (mode === "submit" ? "Mengunggah…" : "Menyimpan…") : meta.submit}
                    </button>
                </div>
                {busy && mode === "submit" && (
                    <p className="text-[11px] text-[var(--text-muted)]" role="status">Mengunggah lampiran ke server, mohon jangan tutup dialog ini…</p>
                )}
            </form>
        </AccessibleModal>
    );
}
