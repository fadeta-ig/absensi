"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, Loader2, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import PageHeader from "@/components/ui/PageHeader";
import DraftNotice from "@/components/ui/DraftNotice";
import { useEmployeeDraft } from "@/hooks/useEmployeeDraft";
import { isPlainObject } from "@/lib/formPersistence";
import { stripGelar } from "@/lib/utils/formatters";

interface Recipient {
    employeeId: string;
    name: string;
    department: string;
    division: string;
    position: string;
}

const RECIPIENT_RENDER_LIMIT = 50;

export default function CreateMyTaskPage() {
    const router = useRouter();
    const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
    const [myName, setMyName] = useState("");
    const [recipients, setRecipients] = useState<Recipient[]>([]);
    const [loadingRecipients, setLoadingRecipients] = useState(true);
    const [recipientQuery, setRecipientQuery] = useState("");
    const [picked, setPicked] = useState<string[]>([]);
    const [title, setTitle] = useState("");
    const [detail, setDetail] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [dueTime, setDueTime] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const {
        restored: draftRestored,
        clearDraft,
        discardDraft,
    } = useEmployeeDraft<{
        title: string;
        detail: string;
        picked: string[];
        dueDate: string;
        dueTime: string;
    }>({
        formKey: "my-tasks:create",
        value: { title, detail, picked, dueDate, dueTime },
        isDirty: (draft) =>
            draft.title.trim().length > 0 ||
            draft.detail.trim().length > 0 ||
            draft.picked.length > 0 ||
            draft.dueDate.length > 0 ||
            draft.dueTime.length > 0,
        validate: (raw): raw is {
            title: string;
            detail: string;
            picked: string[];
            dueDate: string;
            dueTime: string;
        } =>
            isPlainObject(raw) &&
            typeof raw.title === "string" &&
            typeof raw.detail === "string" &&
            Array.isArray(raw.picked) &&
            raw.picked.every((id) => typeof id === "string") &&
            typeof raw.dueDate === "string" &&
            typeof raw.dueTime === "string",
        onRestore: (draft) => {
            setTitle(draft.title);
            setDetail(draft.detail);
            setPicked(draft.picked);
            setDueDate(draft.dueDate);
            setDueTime(draft.dueTime);
        },
    });

    useEffect(() => {
        const controller = new AbortController();
        void (async () => {
            try {
                const [meRes, recRes] = await Promise.all([
                    fetch("/api/auth/me", { credentials: "same-origin", signal: controller.signal }),
                    fetch("/api/my-tasks/recipients", { credentials: "same-origin", signal: controller.signal }),
                ]);
                if (meRes.ok) {
                    const me = await meRes.json();
                    setMyEmployeeId(me.employeeId ?? null);
                    setMyName(me.name ?? "");
                }
                if (!recRes.ok) throw new Error(await getResponseErrorMessage(recRes, "Gagal memuat daftar karyawan. Periksa koneksi Anda, lalu coba lagi."));
                const json = await recRes.json();
                setRecipients(Array.isArray(json.data) ? json.data : []);
            } catch (err) {
                if (controller.signal.aborted) return;
                reportClientError("CreateMyTaskPage", "Gagal memuat data Tambah Tugas", err);
                setError(err instanceof Error ? err.message : "Gagal memuat daftar karyawan. Periksa koneksi Anda, lalu coba lagi.");
            } finally {
                if (!controller.signal.aborted) setLoadingRecipients(false);
            }
        })();
        return () => controller.abort();
    }, []);

    const eligibleRecipients = useMemo(
        () => recipients.filter((r) => r.employeeId !== myEmployeeId),
        [recipients, myEmployeeId]
    );

    // Pastikan penerima yang dipulihkan dari draf masih valid & bukan diri sendiri.
    useEffect(() => {
        if (loadingRecipients || recipients.length === 0) return;
        const allowed = new Set(eligibleRecipients.map((r) => r.employeeId));
        setPicked((prev) => {
            const next = prev.filter((id) => allowed.has(id));
            return next.length === prev.length ? prev : next;
        });
    }, [loadingRecipients, recipients.length, eligibleRecipients]);
    const filteredRecipients = useMemo(() => {
        const q = recipientQuery.trim().toLowerCase();
        if (!q) return eligibleRecipients;
        return eligibleRecipients.filter((r) =>
            r.name.toLowerCase().includes(q) ||
            r.employeeId.toLowerCase().includes(q) ||
            r.department.toLowerCase().includes(q) ||
            r.division.toLowerCase().includes(q) ||
            r.position.toLowerCase().includes(q)
        );
    }, [eligibleRecipients, recipientQuery]);
    // Render dibatasi agar daftar master karyawan besar tetap ringan di HP;
    // pilihan yang sudah diambil tetap terlihat lewat chip di bawah.
    const visibleRecipients = filteredRecipients.slice(0, RECIPIENT_RENDER_LIMIT);
    const pickedRecipients = useMemo(
        () => picked.map((id) => recipients.find((r) => r.employeeId === id)).filter((r): r is Recipient => Boolean(r)),
        [picked, recipients]
    );

    const canSubmit = Boolean(title.trim() && picked.length > 0 && dueDate && /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime));

    async function handleSubmit() {
        if (!canSubmit) {
            setError("Judul, minimal satu penerima, tanggal, dan jam deadline wajib diisi.");
            return;
        }
        setBusy(true);
        setError("");
        setSuccess("");
        try {
            const res = await fetch("/api/my-tasks", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    detail: detail.trim() || null,
                    assigneeEmployeeIds: picked,
                    dueDate,
                    dueTime,
                }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal membuat tugas. Periksa kolom wajib, lalu coba lagi."));
            const json = await res.json();
            clearDraft();
            setSuccess("Tugas berhasil dibuat. Menunggu persetujuan penerima.");
            router.push(`/employee/my-tasks/${json.data.id}`);
        } catch (err) {
            reportClientError("CreateMyTaskPage", "Gagal membuat task operasional", err);
            setError(err instanceof Error ? err.message : "Gagal membuat tugas. Periksa kolom wajib, lalu coba lagi.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-2">
                <button type="button" onClick={() => router.push("/employee/my-tasks")} className="btn btn-secondary btn-sm" aria-label="Kembali ke Tugas Saya">
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <PageHeader
                    title="Tambah Tugas"
                    subtitle="Beri tugas di luar meeting ke karyawan lain"
                    className="flex-1"
                />
            </div>

            {error && <FeedbackMessage variant="error">{error}</FeedbackMessage>}
            {success && <FeedbackMessage variant="success">{success}</FeedbackMessage>}

            <section className="emp-surface p-4 space-y-2" aria-label="Pilih kategori tugas">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Pilih kategori</h2>
                <div className="grid grid-cols-1 gap-2">
                    <div className="rounded-xl border-2 border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] p-3 flex items-start gap-2" aria-current="true">
                        <Briefcase className="w-4 h-4 text-[var(--primary)] shrink-0 mt-0.5" />
                        <span>
                            <span className="block text-sm font-bold text-[var(--text-primary)]">Operasional</span>
                            <span className="block text-xs text-[var(--text-muted)]">Untuk tugas di luar meeting. Penerima menyetujui dulu sebelum mengerjakan.</span>
                        </span>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] p-3 flex items-start gap-2 opacity-60" aria-disabled="true">
                        <ShieldCheck className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                        <span>
                            <span className="block text-sm font-bold text-[var(--text-primary)]">CAPA Internal <span className="text-[10px] font-semibold text-[var(--text-muted)]">(Menyusul)</span></span>
                            <span className="block text-xs text-[var(--text-muted)]">Corrective Action and Preventive Action internal. Belum bisa dipilih — formatnya menyusul.</span>
                        </span>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] p-3 flex items-start gap-2 opacity-60" aria-disabled="true">
                        <ShieldAlert className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                        <span>
                            <span className="block text-sm font-bold text-[var(--text-primary)]">CAPA Eksternal <span className="text-[10px] font-semibold text-[var(--text-muted)]">(Menyusul)</span></span>
                            <span className="block text-xs text-[var(--text-muted)]">Corrective Action and Preventive Action eksternal. Belum bisa dipilih — formatnya menyusul.</span>
                        </span>
                    </div>
                </div>
            </section>

            <section className="emp-surface p-4 space-y-3" aria-label="Form tugas operasional">
                <DraftNotice
                    compact
                    visible={draftRestored}
                    onDiscard={() => {
                        discardDraft();
                        setTitle("");
                        setDetail("");
                        setPicked([]);
                        setDueDate("");
                        setDueTime("");
                    }}
                />
                <div>
                    <span className="form-label">Pemberi Tugas</span>
                    <p className="form-input bg-[color-mix(in_srgb,var(--secondary)_50%,transparent)] flex items-center min-h-10 text-sm" aria-readonly="true">
                        {myName ? `${stripGelar(myName)} (${myEmployeeId ?? "-"})` : (myEmployeeId ?? "Memuat…")}
                        <span className="text-[11px] text-[var(--text-muted)] ml-1">— otomatis dari akun Anda, bertugas memverifikasi hasil</span>
                    </p>
                </div>
                <div>
                    <label className="form-label" htmlFor="op-task-title">Judul tugas *</label>
                    <input id="op-task-title" className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Periksa stok bahan baku gudang B" maxLength={200} />
                </div>
                <div>
                    <label className="form-label" htmlFor="op-task-detail">Rincian (opsional)</label>
                    <textarea id="op-task-detail" className="form-textarea" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Jelaskan hasil yang diharapkan…" maxLength={5000} rows={3} />
                </div>
                <div>
                    <span className="form-label">Penerima tugas *</span>
                    <div className="relative mb-2">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                        <input className="form-input pl-10" value={recipientQuery} onChange={(e) => setRecipientQuery(e.target.value)} placeholder="Cari nama, NIP, departemen, atau jabatan…" aria-label="Cari penerima tugas" />
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mb-1.5" aria-live="polite">
                        {loadingRecipients ? "Memuat daftar karyawan…" : `${picked.length} dipilih · ${filteredRecipients.length} karyawan aktif cocok`}
                    </p>
                    {pickedRecipients.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {pickedRecipients.map((r) => (
                                <button key={r.employeeId} type="button" onClick={() => setPicked((prev) => prev.filter((id) => id !== r.employeeId))} className="px-2 py-1 rounded-full text-[11px] font-semibold bg-[var(--primary)] text-white min-h-8" aria-label={`Hapus penerima ${r.name}`}>
                                    {stripGelar(r.name)} ×
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="max-h-44 overflow-y-auto rounded-lg border border-[var(--border)] p-2 space-y-1">
                        {loadingRecipients ? (
                            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat karyawan aktif…</p>
                        ) : visibleRecipients.length === 0 ? (
                            <p className="text-xs text-[var(--text-muted)]">Tidak ada karyawan aktif yang cocok dengan pencarian.</p>
                        ) : (
                            visibleRecipients.map((r) => (
                                <label key={r.employeeId} className="flex items-center gap-2 text-sm cursor-pointer min-h-9">
                                    <input
                                        type="checkbox"
                                        checked={picked.includes(r.employeeId)}
                                        onChange={(e) => setPicked((prev) => e.target.checked ? [...prev, r.employeeId] : prev.filter((id) => id !== r.employeeId))}
                                        className="w-4 h-4 text-[var(--primary)] rounded"
                                    />
                                    <span className="text-[var(--text-primary)] min-w-0">
                                        {stripGelar(r.name)} <span className="text-[11px] text-[var(--text-muted)]">({r.employeeId}) · {r.position} · {r.department}</span>
                                    </span>
                                </label>
                            ))
                        )}
                    </div>
                    {filteredRecipients.length > RECIPIENT_RENDER_LIMIT && (
                        <p className="text-[11px] text-[var(--text-muted)] mt-1">Menampilkan {RECIPIENT_RENDER_LIMIT} pertama — persempit dengan pencarian untuk nama lain.</p>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="form-label" htmlFor="op-task-due">Tanggal deadline *</label>
                        <input id="op-task-due" type="date" className="form-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </div>
                    <div>
                        <label className="form-label" htmlFor="op-task-due-time">Jam deadline * (WIB)</label>
                        <input id="op-task-due-time" type="time" className="form-input" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
                    </div>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">Penerima akan menerima notifikasi. Ia harus menyetujui tugas ini sebelum mengumpulkan hasil. Deadline dihitung dari tanggal dan jam pilihan Anda.</p>
                <button type="button" disabled={busy || !canSubmit} onClick={() => void handleSubmit()} className="btn btn-primary w-full min-h-11 text-sm">
                    {busy ? "Mengirim…" : "Kirim Tugas ke Penerima"}
                </button>
            </section>
        </div>
    );
}
