"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AlertTriangle,
    CalendarDays,
    Clock,
    Loader2,
    Pencil,
    Plus,
    Power,
    Save,
    Trash2,
    UserCheck,
    X,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import {
    GREETING_DAYS,
    MAX_GREETING_LENGTH,
    MAX_GREETING_NAME_LENGTH,
    MAX_GREETING_PRIORITY,
    MAX_SUB_GREETING_LENGTH,
    formatGreetingDays,
    formatGreetingWindow,
    type GreetingRuleInput,
    type GreetingRuleView,
} from "@/lib/greeting";

interface EditorInfo {
    employeeId: string;
    name: string | null;
    isActive: boolean;
}

interface EditorCandidate {
    employeeId: string;
    name: string;
}

interface GreetingSettingsPanelProps {
    /** True hanya di portal GA: menampilkan penunjukan karyawan editor. */
    canManageEditor?: boolean;
}

function emptyRule(): GreetingRuleInput {
    return {
        name: "",
        greeting: "",
        subGreeting: "",
        startTime: "08:00",
        endTime: "17:00",
        repeatWeekly: true,
        daysOfWeek: [1, 2, 3, 4, 5],
        specificDate: null,
        priority: 0,
        isActive: true,
    };
}

function toRuleInput(rule: GreetingRuleView): GreetingRuleInput {
    return {
        name: rule.name,
        greeting: rule.greeting,
        subGreeting: rule.subGreeting,
        startTime: rule.startTime,
        endTime: rule.endTime,
        repeatWeekly: rule.repeatWeekly,
        daysOfWeek: [...rule.daysOfWeek],
        specificDate: rule.specificDate,
        priority: rule.priority,
        isActive: rule.isActive,
    };
}

export default function GreetingSettingsPanel({ canManageEditor = false }: GreetingSettingsPanelProps) {
    const toast = useToast();
    const confirm = useConfirm();

    const [rules, setRules] = useState<GreetingRuleView[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [form, setForm] = useState<GreetingRuleInput | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [editor, setEditor] = useState<EditorInfo | null>(null);
    const [options, setOptions] = useState<EditorCandidate[]>([]);
    const [selectedEditor, setSelectedEditor] = useState("");
    const [savingEditor, setSavingEditor] = useState(false);

    const fetchRules = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch("/api/ga/greeting-settings", { cache: "no-store" });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat daftar sapaan."));
            }
            const json = await res.json();
            setRules(Array.isArray(json.data?.rules) ? (json.data.rules as GreetingRuleView[]) : []);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Gagal memuat daftar sapaan.";
            setLoadError(message);
            reportClientError("GreetingSettingsPanel", "Gagal memuat daftar sapaan", err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchEditor = useCallback(async () => {
        try {
            const res = await fetch("/api/ga/greeting-settings/editor", { cache: "no-store" });
            if (!res.ok) return;
            const json = await res.json();
            const nextEditor = (json.data?.editor ?? null) as EditorInfo | null;
            setEditor(nextEditor);
            setSelectedEditor(nextEditor?.employeeId ?? "");
            setOptions(Array.isArray(json.data?.options) ? (json.data.options as EditorCandidate[]) : []);
        } catch (err) {
            reportClientError("GreetingSettingsPanel", "Gagal memuat karyawan editor", err);
        }
    }, []);

    useEffect(() => {
        void fetchRules();
    }, [fetchRules]);

    useEffect(() => {
        if (canManageEditor) void fetchEditor();
    }, [canManageEditor, fetchEditor]);

    const startCreate = useCallback(() => {
        setEditingId(null);
        setForm(emptyRule());
    }, []);

    const startEdit = useCallback((rule: GreetingRuleView) => {
        setEditingId(rule.id);
        setForm(toRuleInput(rule));
    }, []);

    const closeForm = useCallback(() => {
        setEditingId(null);
        setForm(null);
    }, []);

    const updateForm = useCallback((patch: Partial<GreetingRuleInput>) => {
        setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    }, []);

    const toggleDay = useCallback((day: number) => {
        setForm((prev) => {
            if (!prev) return prev;
            const days = prev.daysOfWeek.includes(day)
                ? prev.daysOfWeek.filter((value) => value !== day)
                : [...prev.daysOfWeek, day].sort((a, b) => a - b);
            return { ...prev, daysOfWeek: days };
        });
    }, []);

    const saveRule = useCallback(async () => {
        if (!form || saving) return;
        setSaving(true);
        try {
            const payload: GreetingRuleInput = {
                ...form,
                specificDate: form.repeatWeekly ? null : form.specificDate,
                daysOfWeek: form.repeatWeekly ? form.daysOfWeek : [],
            };
            const res = await fetch(
                editingId ? `/api/ga/greeting-settings/${editingId}` : "/api/ga/greeting-settings",
                {
                    method: editingId ? "PUT" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan sapaan."));
            }
            toast(editingId ? "Sapaan diperbarui." : "Sapaan ditambahkan.", "success");
            closeForm();
            await fetchRules();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Gagal menyimpan sapaan.";
            toast(message, "error");
            reportClientError("GreetingSettingsPanel", "Gagal menyimpan sapaan", err);
        } finally {
            setSaving(false);
        }
    }, [closeForm, editingId, fetchRules, form, saving, toast]);

    const toggleActive = useCallback(async (rule: GreetingRuleView) => {
        if (busyId) return;
        setBusyId(rule.id);
        try {
            const res = await fetch(`/api/ga/greeting-settings/${rule.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...toRuleInput(rule), isActive: !rule.isActive }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status sapaan."));
            }
            toast(rule.isActive ? "Sapaan dinonaktifkan." : "Sapaan diaktifkan.", "success");
            await fetchRules();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Gagal mengubah status sapaan.";
            toast(message, "error");
            reportClientError("GreetingSettingsPanel", "Gagal mengubah status sapaan", err);
        } finally {
            setBusyId(null);
        }
    }, [busyId, fetchRules, toast]);

    const requestDelete = useCallback((rule: GreetingRuleView) => {
        confirm({
            title: "Hapus sapaan?",
            message: `Sapaan "${rule.name}" akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`,
            confirmLabel: "Hapus",
            variant: "danger",
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/ga/greeting-settings/${rule.id}`, { method: "DELETE" });
                    if (!res.ok) {
                        throw new Error(await getResponseErrorMessage(res, "Gagal menghapus sapaan."));
                    }
                    toast("Sapaan dihapus.", "success");
                    if (editingId === rule.id) closeForm();
                    await fetchRules();
                } catch (err) {
                    const message = err instanceof Error ? err.message : "Gagal menghapus sapaan.";
                    toast(message, "error");
                    reportClientError("GreetingSettingsPanel", "Gagal menghapus sapaan", err);
                }
            },
        });
    }, [closeForm, confirm, editingId, fetchRules, toast]);

    const saveEditor = useCallback(async (employeeId: string | null) => {
        if (savingEditor) return;
        setSavingEditor(true);
        try {
            const res = await fetch("/api/ga/greeting-settings/editor", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan karyawan editor."));
            }
            const json = await res.json();
            const nextEditor = (json.data?.editor ?? null) as EditorInfo | null;
            setEditor(nextEditor);
            setSelectedEditor(nextEditor?.employeeId ?? "");
            toast(
                employeeId ? "Karyawan editor sapaan tersimpan." : "Penunjukan karyawan editor dikosongkan.",
                "success"
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : "Gagal menyimpan karyawan editor.";
            toast(message, "error");
            reportClientError("GreetingSettingsPanel", "Gagal menyimpan karyawan editor", err);
        } finally {
            setSavingEditor(false);
        }
    }, [savingEditor, toast]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-center">
                <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-[var(--destructive-text)]" />
                <p className="text-sm text-[var(--destructive-text)]">{loadError}</p>
                <button type="button" onClick={() => void fetchRules()} className="mt-3 text-sm font-semibold text-[var(--primary)] underline">
                    Coba lagi
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <p className="text-xs text-[var(--text-muted)]">
                Buat aturan sapaan sesuai jam, hari, atau tanggal tertentu. Aturan dengan prioritas tertinggi
                yang cocok akan dipakai. Bila tidak ada yang cocok, beranda memakai sapaan bawaan sesuai jam WIB.
                Perubahan berlaku maksimal 60 detik setelah disimpan.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {rules.length} aturan sapaan
                </p>
                <button type="button" onClick={startCreate} className="btn btn-primary btn-sm">
                    <Plus className="h-4 w-4" />
                    Tambah Sapaan
                </button>
            </div>

            {form && (
                <section className="rounded-xl border border-[var(--primary)]/40 bg-[var(--card)] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-bold text-[var(--text-primary)]">
                                {editingId ? "Ubah Sapaan" : "Sapaan Baru"}
                            </h2>
                            <p className="text-[11px] text-[var(--text-muted)]">
                                Isi teks, jendela jam, lalu pilih ulangan mingguan atau satu tanggal.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={closeForm}
                            aria-label="Tutup formulir"
                            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="greeting-rule-name">Nama sapaan</label>
                        <input
                            id="greeting-rule-name"
                            type="text"
                            className="form-input"
                            value={form.name}
                            maxLength={MAX_GREETING_NAME_LENGTH}
                            placeholder="Contoh: Sapaan Pagi, Sapaan Libur, Ulang Tahun Perusahaan"
                            onChange={(e) => updateForm({ name: e.target.value })}
                        />
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="greeting-rule-greeting">Teks sapaan</label>
                        <input
                            id="greeting-rule-greeting"
                            type="text"
                            className="form-input"
                            value={form.greeting}
                            maxLength={MAX_GREETING_LENGTH}
                            placeholder="Contoh: Selamat Pagi!"
                            onChange={(e) => updateForm({ greeting: e.target.value })}
                        />
                        <p className="mt-1 text-right text-[10px] text-[var(--text-muted)]">
                            {form.greeting.length}/{MAX_GREETING_LENGTH}
                        </p>
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="greeting-rule-sub">Teks pendukung</label>
                        <textarea
                            id="greeting-rule-sub"
                            className="form-input min-h-[72px] resize-y"
                            value={form.subGreeting}
                            maxLength={MAX_SUB_GREETING_LENGTH}
                            placeholder="Contoh: Awali hari dengan semangat dan senyuman."
                            onChange={(e) => updateForm({ subGreeting: e.target.value })}
                        />
                        <p className="mt-1 text-right text-[10px] text-[var(--text-muted)]">
                            {form.subGreeting.length}/{MAX_SUB_GREETING_LENGTH}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="greeting-rule-start">Jam mulai</label>
                            <input
                                id="greeting-rule-start"
                                type="time"
                                className="form-input"
                                value={form.startTime}
                                onChange={(e) => updateForm({ startTime: e.target.value })}
                            />
                        </div>
                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="greeting-rule-end">Jam selesai</label>
                            <input
                                id="greeting-rule-end"
                                type="time"
                                className="form-input"
                                value={form.endTime}
                                onChange={(e) => updateForm({ endTime: e.target.value })}
                            />
                        </div>
                    </div>
                    <p className="-mt-1 text-[10px] text-[var(--text-muted)]">
                        Jam selesai lebih kecil dari jam mulai berarti jendela lintas hari, mis. 22.00–02.00.
                    </p>

                    <label className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                        <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={form.repeatWeekly}
                            onChange={(e) =>
                                updateForm({
                                    repeatWeekly: e.target.checked,
                                    ...(e.target.checked && form.daysOfWeek.length === 0
                                        ? { daysOfWeek: [1, 2, 3, 4, 5] }
                                        : {}),
                                })
                            }
                        />
                        <span>
                            Ulangi setiap minggu
                            <span className="block text-[11px] text-[var(--text-muted)]">
                                Matikan untuk sapaan satu tanggal saja.
                            </span>
                        </span>
                    </label>

                    {form.repeatWeekly ? (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold text-[var(--text-secondary)]">Hari</span>
                                <button
                                    type="button"
                                    className="text-[11px] font-semibold text-[var(--primary)] underline"
                                    onClick={() => updateForm({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })}
                                >
                                    Semua hari
                                </button>
                                <button
                                    type="button"
                                    className="text-[11px] font-semibold text-[var(--primary)] underline"
                                    onClick={() => updateForm({ daysOfWeek: [1, 2, 3, 4, 5] })}
                                >
                                    Hari kerja
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {GREETING_DAYS.map((day) => {
                                    const checked = form.daysOfWeek.includes(day.value);
                                    return (
                                        <label
                                            key={day.value}
                                            className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-[var(--primary)] ${
                                                checked
                                                    ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                                                    : "border-[var(--border)] text-[var(--text-secondary)]"
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={checked}
                                                onChange={() => toggleDay(day.value)}
                                            />
                                            {day.short}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="greeting-rule-date">Tanggal</label>
                            <input
                                id="greeting-rule-date"
                                type="date"
                                className="form-input"
                                value={form.specificDate ?? ""}
                                onChange={(e) => updateForm({ specificDate: e.target.value || null })}
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="greeting-rule-priority">Prioritas</label>
                            <input
                                id="greeting-rule-priority"
                                type="number"
                                min={0}
                                max={MAX_GREETING_PRIORITY}
                                className="form-input"
                                value={form.priority}
                                onChange={(e) => updateForm({ priority: Number(e.target.value) })}
                            />
                            <p className="mt-1 text-[10px] text-[var(--text-muted)]">Angka lebih besar menang.</p>
                        </div>
                        <label className="flex items-start gap-2 self-start pt-6 text-sm text-[var(--text-primary)]">
                            <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={form.isActive}
                                onChange={(e) => updateForm({ isActive: e.target.checked })}
                            />
                            Aktif
                        </label>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={closeForm} disabled={saving} className="btn btn-sm border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-50">
                            Batal
                        </button>
                        <button type="button" onClick={() => void saveRule()} disabled={saving} className="btn btn-primary btn-sm disabled:opacity-50">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {editingId ? "Simpan Perubahan" : "Simpan Sapaan"}
                        </button>
                    </div>
                </section>
            )}

            {rules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-center">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada aturan sapaan.</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Beranda masih memakai sapaan bawaan. Tambahkan aturan untuk mulai mengatur sendiri.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {rules.map((rule) => (
                        <article key={rule.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="text-sm font-bold text-[var(--text-primary)]">{rule.name}</h2>
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                                rule.isActive
                                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                                    : "bg-[var(--secondary)] text-[var(--text-muted)]"
                                            }`}
                                        >
                                            {rule.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                    </div>
                                    <p className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{rule.greeting}</p>
                                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">{rule.subGreeting}</p>
                                </div>
                                <span className="shrink-0 rounded-lg bg-[var(--secondary)] px-2 py-1 text-[10px] font-bold text-[var(--text-secondary)]">
                                    P{rule.priority}
                                </span>
                            </div>

                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
                                <span className="inline-flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatGreetingWindow(rule.startTime, rule.endTime)}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                    <CalendarDays className="h-3 w-3" />
                                    {rule.repeatWeekly
                                        ? formatGreetingDays(rule.daysOfWeek)
                                        : rule.specificDate ?? "Tanggal tidak diatur"}
                                </span>
                            </div>

                            <div className="mt-3 flex flex-wrap justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => startEdit(rule)}
                                    className="btn btn-sm border border-[var(--border)] text-[var(--text-secondary)]"
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Ubah
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void toggleActive(rule)}
                                    disabled={busyId === rule.id}
                                    className="btn btn-sm border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-50"
                                >
                                    {busyId === rule.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                                    {rule.isActive ? "Nonaktifkan" : "Aktifkan"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => requestDelete(rule)}
                                    className="btn btn-sm border border-[var(--destructive)]/40 text-[var(--destructive-text)]"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Hapus
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}

            {canManageEditor && (
                <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
                    <div>
                        <h2 className="text-sm font-bold text-[var(--text-primary)]">Karyawan yang boleh ikut mengedit</h2>
                        <p className="text-[11px] text-[var(--text-muted)]">
                            Selain WIG002, tunjuk satu karyawan internal aktif. Aksesnya mati sendiri bila karyawan dinonaktifkan.
                        </p>
                    </div>

                    {editor ? (
                        <div className="rounded-lg bg-[color-mix(in_srgb,var(--secondary)_60%,transparent)] px-3 py-2">
                            <p className="text-sm font-semibold text-[var(--text-primary)]">
                                {editor.name ?? editor.employeeId}{" "}
                                <span className="font-mono text-xs text-[var(--text-muted)]">{editor.employeeId}</span>
                            </p>
                            {!editor.isActive && (
                                <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    Karyawan nonaktif — akses edit sapaan mati sendiri. Tunjuk pengganti.
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs text-[var(--text-muted)]">Belum ada karyawan yang ditunjuk.</p>
                    )}

                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="greeting-editor">
                            Pilih karyawan
                        </label>
                        <select
                            id="greeting-editor"
                            className="form-select"
                            value={selectedEditor}
                            onChange={(e) => setSelectedEditor(e.target.value)}
                        >
                            <option value="">— Tidak ada —</option>
                            {options.map((option) => (
                                <option key={option.employeeId} value={option.employeeId}>
                                    {option.name} ({option.employeeId})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                        {editor && (
                            <button
                                type="button"
                                onClick={() => void saveEditor(null)}
                                disabled={savingEditor}
                                className="btn btn-sm border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-50"
                            >
                                Kosongkan
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => void saveEditor(selectedEditor || null)}
                            disabled={savingEditor || !selectedEditor || selectedEditor === editor?.employeeId}
                            className="btn btn-primary btn-sm disabled:opacity-50"
                        >
                            {savingEditor ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                            Simpan Karyawan
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}
