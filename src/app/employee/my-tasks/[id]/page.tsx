"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, Loader2, UploadCloud } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { stripGelar } from "@/lib/utils/formatters";
import { formatWIBDateTime } from "@/lib/timezone";
import { useConfirm } from "@/components/ConfirmModal";
import { meetingTaskStatusLabel } from "@/components/appointments/AppointmentBadges";

interface Assignee {
    employeeId: string;
    name: string;
    status: string;
    isOverdue: boolean;
    stickyOverdue: boolean;
    rejectionReason?: string | null;
}
interface Submission {
    id: string;
    employeeId: string;
    note: string | null;
    attemptNo: number;
    verdict: string;
    resubmitDueAt: string | null;
    verifyNote: string | null;
    createdAt: string;
    attachments: Array<{ id: string; mimeType: string; size: number }>;
}
interface WorkTask {
    id: string;
    appointmentId: string | null;
    sourceType: string;
    title: string;
    detail: string | null;
    isCancelled: boolean;
    cancelReason: string | null;
    assigner: { employeeId: string; name: string | null };
    appointment: { id: string; title: string; startAt: string; endAt: string; status: string; room: { name: string } | null } | null;
    activeDeadline: { date: string; deadlineAt: string; sequence: number } | null;
    extensionsCount: number;
    assignees: Assignee[];
    submissions: Submission[];
    allDone: boolean;
    anyOverdue: boolean;
}

const VERDICT_LABEL: Record<string, string> = { PENDING: "Menunggu Verifikasi", DITERIMA: "Diterima", DIREVISI: "Perlu Revisi" };

export default function MyTaskDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const confirm = useConfirm();
    const [task, setTask] = useState<WorkTask | null>(null);
    const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [note, setNote] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [revNote, setRevNote] = useState<Record<string, string>>({});
    const [revDue, setRevDue] = useState<Record<string, string>>({});
    const [extendDate, setExtendDate] = useState("");
    const [extendReason, setExtendReason] = useState("");
    const [cancelReason, setCancelReason] = useState("");
    const [editTitle, setEditTitle] = useState("");
    const [editDetail, setEditDetail] = useState("");
    const [editDue, setEditDue] = useState("");
    const [rejectReason, setRejectReason] = useState("");
    const [memberOptions, setMemberOptions] = useState<Array<{ employeeId: string; name: string }>>([]);
    const [editAssigneeIds, setEditAssigneeIds] = useState<string[]>([]);
    // Peran meeting task ini (penyelenggara/pimpinan/PIC) — boleh kelola selain pemberi.
    const [meetingManagerIds, setMeetingManagerIds] = useState<string[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const [meRes, res] = await Promise.all([
                fetch("/api/auth/me", { credentials: "same-origin" }),
                fetch(`/api/my-tasks/${params.id}`, { credentials: "same-origin" }),
            ]);
            if (meRes.ok) {
                const me = await meRes.json();
                setMyEmployeeId(me.employeeId ?? null);
            }
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat detail tugas. Periksa koneksi Anda, lalu coba lagi."));
            const json = await res.json();
            setTask(json.data);
            setEditTitle(json.data.title ?? "");
            setEditDetail(json.data.detail ?? "");
            setEditAssigneeIds((json.data.assignees ?? []).map((a: Assignee) => a.employeeId));
            // Opsi ubah penerima: peserta internal meeting (Appointments) atau
            // seluruh karyawan aktif (Operasional).
            try {
                if (json.data.sourceType === "OPERASIONAL") {
                    const recRes = await fetch("/api/my-tasks/recipients", { credentials: "same-origin" });
                    if (recRes.ok) {
                        const recJson = await recRes.json();
                        const recs = (recJson.data ?? []) as Array<{ employeeId: string; name: string }>;
                        setMemberOptions(recs.map((r) => ({ employeeId: r.employeeId, name: r.name })));
                    }
                } else if (json.data.appointmentId) {
                    const apptRes = await fetch(`/api/appointments/${json.data.appointmentId}`, { credentials: "same-origin" });
                    if (apptRes.ok) {
                        const apptJson = await apptRes.json();
                        const parts = (apptJson.data?.participants ?? []) as Array<{ employeeId: string | null; employee?: { name: string | null } | null }>;
                        setMemberOptions(parts.filter((p) => p.employeeId).map((p) => ({ employeeId: p.employeeId as string, name: p.employee?.name ?? (p.employeeId as string) })));
                        const roles = [apptJson.data?.requesterEmployeeId, apptJson.data?.leaderEmployeeId, apptJson.data?.notulisEmployeeId].filter((v): v is string => typeof v === "string" && v.length > 0);
                        setMeetingManagerIds([...new Set(roles)]);
                    }
                }
            } catch { /* daftar penerima tetap dapat memakai penerima saat ini */ }
        } catch (err) {
            reportClientError("MyTaskDetailPage", "Gagal memuat detail tugas", err);
            setError(err instanceof Error ? err.message : "Gagal memuat detail tugas. Periksa koneksi Anda, lalu coba lagi.");
        } finally {
            setLoading(false);
        }
    }, [params.id]);

    useEffect(() => { void load(); }, [load]);

    const mine = task && myEmployeeId ? task.assignees.find((a) => a.employeeId === myEmployeeId) ?? null : null;
    const iAmAssigner = Boolean(task && myEmployeeId && task.assigner.employeeId === myEmployeeId);
    // Kelola task: pemberi ATAU salah satu dari tiga peran meeting (penyelenggara/pimpinan/PIC).
    const isMeetingManager = Boolean(myEmployeeId && meetingManagerIds.includes(myEmployeeId));
    const isOperational = task?.sourceType === "OPERASIONAL";
    // Tugas terkunci permanen bila seluruh penerima sudah final
    // (SELESAI terverifikasi / DIBATALKAN / DITOLAK): kelola ditutup.
    const isFullyFinal = task
        ? task.allDone || (task.assignees.length > 0 && task.assignees.every((a) => a.status === "SELESAI" || a.status === "DIBATALKAN" || a.status === "DITOLAK"))
        : false;
    const meetingFinished = task ? isOperational || !task.appointment || task.appointment.status === "COMPLETED" || new Date(task.appointment.endAt).getTime() <= Date.now() : false;
    const canSubmit = Boolean(task && !task.isCancelled && meetingFinished && mine && (mine.status === "OPEN" || mine.status === "BELUM_DIKERJAKAN"));
    const nameOf = (employeeId: string) => {
        const a = task?.assignees.find((x) => x.employeeId === employeeId);
        return a ? stripGelar(a.name) : employeeId;
    };

    async function handleRespond(decision: "TERIMA" | "TOLAK") {
        if (!task) return;
        if (decision === "TOLAK" && rejectReason.trim().length < 5) { setError("Alasan penolakan wajib diisi minimal 5 karakter."); return; }
        setBusy(true); setError(""); setSuccess("");
        try {
            const res = await fetch(`/api/my-tasks/${task.id}`, {
                method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(decision === "TERIMA" ? { action: "accept" } : { action: "reject", reason: rejectReason.trim() }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan persetujuan tugas."));
            setRejectReason("");
            setSuccess(decision === "TERIMA" ? "Tugas diterima. Kerjakan dan kumpulkan hasilnya sebelum deadline." : "Tugas ditolak. Pemberi tugas sudah menerima pemberitahuan.");
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Gagal menyimpan persetujuan tugas.");
        } finally { setBusy(false); }
    }

    async function handleSubmit() {
        if (!task) return;
        if (files.length < 1 || files.length > 5) { setError("Lampirkan 1–5 file hasil pekerjaan (JPG, PNG, WEBP, atau PDF)."); return; }
        setBusy(true); setError(""); setSuccess("");
        try {
            const form = new FormData();
            if (note.trim()) form.set("note", note.trim());
            for (const f of files.slice(0, 5)) form.append("files", f);
            const res = await fetch(`/api/my-tasks/${task.id}/submissions`, { method: "POST", credentials: "same-origin", body: form });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengirim hasil. Periksa lampiran Anda, lalu coba lagi."));
            setNote(""); setFiles([]);
            setSuccess("Hasil terkirim. Menunggu verifikasi dari pemberi tugas.");
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Gagal mengirim hasil. Periksa lampiran Anda, lalu coba lagi.");
        } finally { setBusy(false); }
    }

    function confirmTerima(submissionId: string) {
        confirm({
            title: "Terima hasil pekerjaan?",
            message: "Hasil yang diterima akan dinyatakan selesai dan tidak dapat diubah lagi.",
            confirmLabel: "Ya, Terima",
            variant: "info",
            onConfirm: () => { void handleVerify(submissionId, "TERIMA"); },
        });
    }

    async function handleVerify(submissionId: string, decision: "TERIMA" | "REVISI") {
        if (decision === "REVISI") {
            if ((revNote[submissionId] ?? "").trim().length < 5) { setError("Catatan revisi wajib diisi minimal 5 karakter."); return; }
            if (!revDue[submissionId]) { setError("Tanggal batas pengumpulan ulang wajib diisi."); return; }
        }
        setBusy(true); setError(""); setSuccess("");
        try {
            const res = await fetch(`/api/my-tasks/submissions/${submissionId}/verify`, {
                method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(decision === "TERIMA" ? { decision } : { decision, note: revNote[submissionId].trim(), resubmitDue: revDue[submissionId] }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan verifikasi. Periksa isian Anda, lalu coba lagi."));
            setSuccess(decision === "TERIMA" ? "Hasil pekerjaan diterima. Tugas penerima dinyatakan selesai." : "Revisi berhasil dikirim. Penerima dapat mengumpulkan ulang hasil pekerjaannya.");
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Gagal menyimpan verifikasi. Periksa isian Anda, lalu coba lagi.");
        } finally { setBusy(false); }
    }

    async function handleManage(action: "extend" | "cancel" | "edit") {
        if (!task) return;
        let body: Record<string, unknown> = { action };
        if (action === "extend") {
            if (!extendDate) { setError("Tanggal deadline baru wajib diisi."); return; }
            if (extendReason.trim().length < 5) { setError("Alasan perpanjangan wajib diisi minimal 5 karakter."); return; }
            body = { action, proposedDate: extendDate, reason: extendReason.trim() };
        } else if (action === "cancel") {
            if (cancelReason.trim().length < 5) { setError("Alasan pembatalan wajib diisi minimal 5 karakter."); return; }
            body = { action, reason: cancelReason.trim() };
        } else {
            if (!editTitle.trim()) { setError("Judul tugas wajib diisi."); return; }
            if (editAssigneeIds.length === 0) { setError("Pilih minimal satu penerima tugas."); return; }
            const currentIds = task.assignees.map((a) => a.employeeId);
            body = {
                action, title: editTitle.trim(), detail: editDetail.trim() || null, ...(editDue ? { dueDate: editDue } : {}),
                addAssigneeIds: editAssigneeIds.filter((id) => !currentIds.includes(id)),
                removeAssigneeIds: currentIds.filter((id) => !editAssigneeIds.includes(id)),
            };
        }
        setBusy(true); setError(""); setSuccess("");
        try {
            const res = await fetch(`/api/my-tasks/${task.id}`, {
                method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan perubahan. Periksa isian Anda, lalu coba lagi."));
            setSuccess(action === "extend" ? "Deadline tugas berhasil diperpanjang." : action === "cancel" ? "Tugas berhasil dibatalkan." : "Tugas berhasil diperbarui.");
            setExtendDate(""); setExtendReason(""); setCancelReason(""); setEditDue("");
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan. Periksa isian Anda, lalu coba lagi.");
        } finally { setBusy(false); }
    }

    if (loading) return <p className="text-sm text-[var(--text-muted)] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Memuat detail tugas…</p>;
    if (!task) return <FeedbackMessage variant="error">{error || "Tugas tidak ditemukan."}</FeedbackMessage>;

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-2">
                <button type="button" onClick={() => router.push("/employee/my-tasks")} className="btn btn-secondary btn-sm" aria-label="Kembali ke Tugas Saya"><ArrowLeft className="w-4 h-4" /></button>
                <div className="min-w-0">
                    <h1 className="text-lg font-bold text-[var(--text-primary)]">{task.title}</h1>
                    <p className="text-xs text-[var(--text-muted)]">{isOperational ? "Sumber: Operasional · Tugas di luar meeting" : `Sumber: E-Meeting · ${task.appointment?.title ?? ""}`}</p>
                </div>
            </div>

            {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}
            {success && <FeedbackMessage variant="success">{success}</FeedbackMessage>}
            {task.isCancelled && <FeedbackMessage variant="warning">Tugas dibatalkan{task.cancelReason ? `: ${task.cancelReason}` : "."} Anda tidak bisa lagi mengumpulkan atau memverifikasi hasil.</FeedbackMessage>}

            <section className="card p-4 space-y-2" aria-label="Informasi tugas">
                <dl className="space-y-1.5 text-xs">
                    {isOperational ? (
                        <div className="flex gap-2"><dt className="text-[var(--text-muted)] w-24 shrink-0">Sumber</dt><dd className="text-[var(--text-secondary)]">Operasional — tugas di luar meeting</dd></div>
                    ) : task.appointment && task.appointmentId ? (
                        <div className="flex gap-2"><dt className="text-[var(--text-muted)] w-24 shrink-0">Meeting asal</dt><dd><Link className="text-[var(--primary)] font-semibold hover:underline" href={`/employee/appointments/detail/${task.appointmentId}`}>{task.appointment.title}</Link> · {formatWIBDateTime(new Date(task.appointment.startAt), { day: "numeric", month: "short", year: "numeric" })}{task.appointment.room ? ` · ${task.appointment.room.name}` : ""}</dd></div>
                    ) : null}
                    <div className="flex gap-2"><dt className="text-[var(--text-muted)] w-24 shrink-0">Pemberi tugas</dt><dd className="text-[var(--text-secondary)]">{task.assigner.name ? stripGelar(task.assigner.name) : task.assigner.employeeId}</dd></div>
                    <div className="flex gap-2"><dt className="text-[var(--text-muted)] w-24 shrink-0">Deadline</dt><dd className={`font-semibold ${mine?.isOverdue ? "text-red-600" : "text-[var(--text-secondary)]"}`}>{task.activeDeadline ? formatWIBDateTime(new Date(task.activeDeadline.deadlineAt), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-"}{task.extensionsCount > 0 ? ` (diperpanjang ${task.extensionsCount}x)` : ""}</dd></div>
                    {mine && <div className="flex gap-2"><dt className="text-[var(--text-muted)] w-24 shrink-0">Status Anda</dt><dd className="text-[var(--text-secondary)]">{meetingTaskStatusLabel(mine.status)}{mine.stickyOverdue && mine.status === "SELESAI" ? " · Overdue (Done)" : ""}</dd></div>}
                </dl>
                {task.detail && <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap border-t border-[var(--border)] pt-2">{task.detail}</p>}
                <div className="border-t border-[var(--border)] pt-2">
                    <p className="text-xs font-semibold text-[var(--text-primary)] mb-1">Penerima tugas</p>
                    <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                        {task.assignees.map((a) => <li key={a.employeeId} className="flex justify-between gap-2"><span>{stripGelar(a.name)}{a.employeeId === myEmployeeId ? " (Anda)" : ""}{a.status === "DITOLAK" && a.rejectionReason ? <span className="block text-[11px] text-[var(--text-muted)]">Alasan: {a.rejectionReason}</span> : null}</span><span>{meetingTaskStatusLabel(a.status)}</span></li>)}
                    </ul>
                </div>
            </section>

            {mine?.status === "MENUNGGU_PERSETUJUAN" && !task.isCancelled && (
                <section className="card p-4 space-y-3" aria-label="Persetujuan tugas">
                    <h2 className="text-sm font-bold text-[var(--text-primary)]">Persetujuan Tugas</h2>
                    <p className="text-xs text-[var(--text-secondary)]">Tugas ini menunggu persetujuan Anda. Terima tugas untuk mulai mengerjakan sebelum deadline.</p>
                    <button type="button" disabled={busy} onClick={() => confirm({ title: "Terima tugas ini?", message: "Setelah diterima, Anda perlu mengumpulkan hasil sebelum deadline.", confirmLabel: "Ya, Terima Tugas", variant: "info", onConfirm: () => { void handleRespond("TERIMA"); } })} className="btn btn-primary w-full min-h-11 text-sm">Terima Tugas</button>
                    <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={1000} placeholder="Alasan penolakan (wajib, min. 5 karakter)" className="input w-full text-sm" aria-label="Alasan penolakan tugas" />
                    <button type="button" disabled={busy} onClick={() => void handleRespond("TOLAK")} className="btn btn-secondary w-full min-h-10 text-sm text-red-600">Tolak Tugas</button>
                </section>
            )}

            {mine && !task.isCancelled && (
                <section className="card p-4 space-y-3" aria-label="Pengumpulan hasil">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5"><UploadCloud className="w-4 h-4 text-[var(--primary)]" /> Pengumpulan Hasil</h2>
                    {canSubmit ? (
                        <>
                            <p className="text-xs text-[var(--text-muted)]">Lampirkan 1–5 file hasil pekerjaan (JPG, PNG, WEBP, atau PDF), lalu kumpulkan untuk diverifikasi pemberi tugas.</p>
                            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} placeholder="Catatan hasil pekerjaan (opsional)" className="input w-full text-sm" aria-label="Catatan hasil pekerjaan" />
                            <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} className="input w-full text-sm" aria-label="Pilih lampiran hasil pekerjaan" />
                            {files.length > 0 && <p className="text-xs text-[var(--text-muted)]">{files.length} file dipilih: {files.map((f) => f.name).join(", ")}</p>}
                            <button type="button" disabled={busy} onClick={() => void handleSubmit()} className="btn btn-primary w-full min-h-11 text-sm">{busy ? "Mengirim…" : "Kumpulkan Hasil"}</button>
                        </>
                    ) : mine.status === "MENUNGGU_PERSETUJUAN" ? (
                        <p className="text-xs text-[var(--text-secondary)]">Terima dulu tugas ini di bagian Persetujuan Tugas, lalu kumpulkan hasilnya di sini.</p>
                    ) : mine.status === "DITOLAK" ? (
                        <p className="text-xs text-[var(--text-secondary)]">Anda menolak tugas ini{mine.rejectionReason ? `: ${mine.rejectionReason}` : "."} Anda tidak bisa lagi mengumpulkan hasil.</p>
                    ) : mine.status === "ON_PROGRESS" ? (
                        <p className="text-xs text-[var(--text-secondary)]">Hasil terkirim. Menunggu verifikasi dari pemberi tugas.</p>
                    ) : mine.status === "SELESAI" ? (
                        <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Tugas Anda sudah selesai dan terverifikasi.</p>
                    ) : !meetingFinished ? (
                        <p className="text-xs text-[var(--text-secondary)]">Anda bisa mengumpulkan hasil setelah meeting selesai.</p>
                    ) : (
                        <p className="text-xs text-[var(--text-secondary)]">Status tugas Anda belum memungkinkan pengumpulan hasil.</p>
                    )}
                </section>
            )}

            <section className="card p-4 space-y-3" aria-label="Riwayat pengumpulan">
                <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5"><FileText className="w-4 h-4 text-[var(--primary)]" /> Riwayat Pengumpulan</h2>
                {task.submissions.length === 0 ? <p className="text-xs text-[var(--text-muted)]">Belum ada hasil yang dikumpulkan.</p> : task.submissions.map((s) => (
                    <article key={s.id} className="border border-[var(--border)] rounded-xl p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-[var(--text-primary)]">{nameOf(s.employeeId)} · Pengumpulan ke-{s.attemptNo}</p>
                            <span className="badge-info shrink-0">{VERDICT_LABEL[s.verdict] ?? s.verdict}</span>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)]">{formatWIBDateTime(new Date(s.createdAt), { day: "numeric", month: "short", year: "numeric" })}</p>
                        {s.note && <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{s.note}</p>}
                        {s.verifyNote && <p className="text-xs text-[var(--text-secondary)]">Catatan verifikator: {s.verifyNote}</p>}
                        {s.resubmitDueAt && s.verdict === "DIREVISI" && <p className="text-xs font-semibold text-red-600">Batas kumpul ulang: {formatWIBDateTime(new Date(s.resubmitDueAt), { day: "numeric", month: "short", year: "numeric" })}</p>}
                        {s.attachments.length > 0 && (
                            <ul className="space-y-1">
                                {s.attachments.map((a, i) => (
                                    <li key={a.id}><a className="text-xs text-[var(--primary)] font-semibold hover:underline" href={`/api/my-tasks/submissions/attachments/${a.id}`} target="_blank" rel="noreferrer">Lampiran {i + 1} ({Math.max(1, Math.round(a.size / 1024))} KB)</a></li>
                                ))}
                            </ul>
                        )}
                        {iAmAssigner && s.verdict === "PENDING" && !task.isCancelled && (
                            <div className="border-t border-[var(--border)] pt-2 space-y-2">
                                <div className="flex gap-1.5">
                                    <button type="button" disabled={busy} onClick={() => confirmTerima(s.id)} className="btn btn-primary btn-sm flex-1 min-h-10">Terima Hasil</button>
                                </div>
                                <textarea value={revNote[s.id] ?? ""} onChange={(e) => setRevNote((p) => ({ ...p, [s.id]: e.target.value }))} rows={2} maxLength={2000} placeholder="Catatan revisi (wajib, min. 5 karakter)" className="input w-full text-sm" aria-label="Catatan revisi" />
                                <label className="block text-xs text-[var(--text-secondary)]">Batas kumpul ulang
                                    <input type="date" value={revDue[s.id] ?? ""} onChange={(e) => setRevDue((p) => ({ ...p, [s.id]: e.target.value }))} className="input w-full text-sm mt-1" aria-label="Batas kumpul ulang" />
                                </label>
                                <button type="button" disabled={busy} onClick={() => void handleVerify(s.id, "REVISI")} className="btn btn-secondary btn-sm w-full min-h-10">Minta Revisi</button>
                            </div>
                        )}
                    </article>
                ))}
            </section>

            {iAmAssigner && isFullyFinal && !task.isCancelled && !success && (
                <FeedbackMessage variant="success">Tugas selesai. Semua penerima sudah tuntas, sehingga pengelolaan tugas ditutup.</FeedbackMessage>
            )}

            {(iAmAssigner || isMeetingManager) && !task.isCancelled && !isFullyFinal && (
                <section className="card p-4 space-y-4" aria-label="Kelola tugas">
                    <h2 className="text-sm font-bold text-[var(--text-primary)]">Kelola Tugas</h2>
                    <div className="space-y-2">
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">Perpanjang deadline</p>
                        <div className="grid grid-cols-1 gap-2">
                            <input type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} className="input w-full text-sm" aria-label="Tanggal deadline baru" />
                            <input value={extendReason} onChange={(e) => setExtendReason(e.target.value)} maxLength={1000} placeholder="Alasan perpanjangan (min. 5 karakter)" className="input w-full text-sm" aria-label="Alasan perpanjangan" />
                        </div>
                        <button type="button" disabled={busy} onClick={() => void handleManage("extend")} className="btn btn-secondary btn-sm w-full min-h-10">Perpanjang Deadline</button>
                        <p className="text-[11px] text-[var(--text-muted)]">{isOperational ? "Perpanjangan mengikuti batas kesempatan deadline yang berlaku (awal + 1 perpanjangan)." : "Perpanjangan mengikuti batas kesempatan deadline yang berlaku untuk tugas dari meeting."}</p>
                    </div>
                    <div className="space-y-2 border-t border-[var(--border)] pt-3">
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">Ubah tugas</p>
                        <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={200} className="input w-full text-sm" aria-label="Judul tugas" />
                        <textarea value={editDetail} onChange={(e) => setEditDetail(e.target.value)} rows={3} maxLength={5000} className="input w-full text-sm" aria-label="Detail tugas" placeholder="Detail tugas (opsional)" />
                        <label className="block text-xs text-[var(--text-secondary)]">Ubah deadline (kosongkan jika tidak berubah)
                            <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="input w-full text-sm mt-1" aria-label="Deadline dari ubah tugas" />
                        </label>
                        {memberOptions.length > 0 && (
                            <fieldset className="space-y-1">
                                <legend className="text-xs text-[var(--text-secondary)]">Penerima tugas</legend>
                                {memberOptions.map((m) => (
                                    <label key={m.employeeId} className="flex items-center gap-2 text-xs text-[var(--text-secondary)] min-h-9">
                                        <input type="checkbox" checked={editAssigneeIds.includes(m.employeeId)} onChange={(e) => setEditAssigneeIds((prev) => e.target.checked ? [...prev, m.employeeId] : prev.filter((id) => id !== m.employeeId))} />
                                        {stripGelar(m.name)}
                                    </label>
                                ))}
                            </fieldset>
                        )}
                        <button type="button" disabled={busy} onClick={() => void handleManage("edit")} className="btn btn-secondary btn-sm w-full min-h-10">Simpan Perubahan</button>
                    </div>
                    <div className="space-y-2 border-t border-[var(--border)] pt-3">
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">Batalkan tugas</p>
                        <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={1000} placeholder="Alasan pembatalan (min. 5 karakter)" className="input w-full text-sm" aria-label="Alasan pembatalan" />
                        <button type="button" disabled={busy} onClick={() => {
                            if (cancelReason.trim().length < 5) { setError("Alasan pembatalan wajib diisi minimal 5 karakter."); return; }
                            confirm({ title: "Batalkan tugas ini?", message: "Tugas yang dibatalkan tidak dapat dikumpulkan atau diverifikasi lagi.", confirmLabel: "Ya, Batalkan Tugas", variant: "danger", onConfirm: () => { void handleManage("cancel"); } });
                        }} className="btn btn-secondary btn-sm w-full min-h-10 text-red-600">Batalkan Tugas</button>
                    </div>
                </section>
            )}
        </div>
    );
}
