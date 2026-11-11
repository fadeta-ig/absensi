"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertCircle,
    Megaphone,
    Plus,
    Pencil,
    Trash2,
    Pin,
    X,
    Loader2,
    Upload,
    Paperclip,
    FileText,
    Users,
    Lock,
    Globe,
    Search,
    CheckSquare,
    Square,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { stripGelar } from "@/lib/utils/formatters";
import type { NewsAudience, NewsTargetEmployee } from "@/types";

interface NewsItem {
    id: string;
    title: string;
    content: string;
    category: string;
    author: string;
    createdAt: string;
    isPinned: boolean;
    mediaUrl?: string | null;
    mediaName?: string | null;
    audience?: NewsAudience;
    targetEmployeeIds?: string[] | null;
    targetEmployees?: NewsTargetEmployee[];
}

interface ActiveEmployeeOption {
    employeeId: string;
    name: string;
    department: string;
    position: string;
}

const COMPACT_CHIP_LIMIT = 8;

const INIT_FORM = {
    title: "",
    content: "",
    category: "announcement",
    isPinned: false,
    mediaUrl: "" as string | null,
    mediaName: "" as string | null,
    audience: "ALL" as NewsAudience,
    targetEmployeeIds: [] as string[],
};

export default function NewsManagementPage() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [audienceFilter, setAudienceFilter] = useState<"ALL_ITEMS" | "PUBLIC" | "TARGETED">("ALL_ITEMS");
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState(INIT_FORM);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [actionId, setActionId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Master karyawan aktif untuk target penerima berita
    const [employees, setEmployees] = useState<ActiveEmployeeOption[]>([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [employeesError, setEmployeesError] = useState("");
    const employeesLoadedRef = useRef(false);
    const [empQuery, setEmpQuery] = useState("");
    const [showAllChips, setShowAllChips] = useState(false);

    const confirm = useConfirm();
    const toast = useToast();

    useEffect(() => {
        const loadNews = async () => {
            setInitialLoading(true);
            setLoadError("");
            try {
                const res = await fetch("/api/news");
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat berita."));
                const data = await res.json();
                setNews(Array.isArray(data) ? data : []);
            } catch (error) {
                reportClientError("NewsManagementPage", "Gagal memuat berita", error);
                const message = error instanceof Error ? error.message : "Gagal memuat berita.";
                setLoadError(message);
                toast(message, "error");
            } finally {
                setInitialLoading(false);
            }
        };

        void loadNews();
    }, [toast]);

    const loadActiveEmployees = useCallback(async () => {
        setEmployeesLoading(true);
        setEmployeesError("");
        try {
            const res = await fetch("/api/employees?status=active");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat daftar karyawan aktif."));
            const data = await res.json();
            const list: ActiveEmployeeOption[] = Array.isArray(data)
                ? data.map((emp: Record<string, unknown>) => ({
                      employeeId: String(emp.employeeId ?? ""),
                      name: String(emp.name ?? ""),
                      department: String(emp.department ?? "-"),
                      position: String(emp.position ?? "-"),
                  })).filter((e) => Boolean(e.employeeId))
                : [];
            setEmployees(list);
            employeesLoadedRef.current = true;
        } catch (err) {
            reportClientError("NewsManagementPage", "Gagal memuat daftar karyawan aktif", err);
            setEmployeesError(err instanceof Error ? err.message : "Gagal memuat daftar karyawan aktif.");
            employeesLoadedRef.current = false;
        } finally {
            setEmployeesLoading(false);
        }
    }, []);

    useEffect(() => {
        if (showForm && !employeesLoadedRef.current) {
            void loadActiveEmployees();
        }
    }, [showForm, loadActiveEmployees]);

    const employeeById = useMemo(() => {
        const map = new Map<string, ActiveEmployeeOption>();
        for (const e of employees) map.set(e.employeeId, e);
        return map;
    }, [employees]);

    const selectedTargetSet = useMemo(() => new Set(form.targetEmployeeIds), [form.targetEmployeeIds]);

    const filteredEmployees = useMemo(() => {
        const q = empQuery.trim().toLowerCase();
        if (!q) return employees;
        return employees.filter((e) => {
            const cleanName = stripGelar(e.name).toLowerCase();
            return (
                e.name.toLowerCase().includes(q) ||
                cleanName.includes(q) ||
                e.employeeId.toLowerCase().includes(q) ||
                e.department.toLowerCase().includes(q) ||
                e.position.toLowerCase().includes(q)
            );
        });
    }, [employees, empQuery]);

    const isAllActiveSelected =
        employees.length > 0 && employees.every((e) => selectedTargetSet.has(e.employeeId));
    const isAllFilteredSelected =
        filteredEmployees.length > 0 && filteredEmployees.every((e) => selectedTargetSet.has(e.employeeId));

    const toggleEmployeeTarget = (employeeId: string) => {
        setForm((prev) => {
            const exists = prev.targetEmployeeIds.includes(employeeId);
            const nextIds = exists
                ? prev.targetEmployeeIds.filter((id) => id !== employeeId)
                : [...prev.targetEmployeeIds, employeeId];
            return { ...prev, targetEmployeeIds: nextIds };
        });
    };

    const handleSelectAllEmployees = () => {
        if (employees.length === 0) return;
        if (isAllActiveSelected) {
            setForm((prev) => ({ ...prev, targetEmployeeIds: [] }));
            return;
        }
        setForm((prev) => ({ ...prev, targetEmployeeIds: employees.map((e) => e.employeeId) }));
    };

    const handleSelectFilteredEmployees = () => {
        if (filteredEmployees.length === 0) return;
        const filteredIds = filteredEmployees.map((e) => e.employeeId);
        if (isAllFilteredSelected) {
            const removeSet = new Set(filteredIds);
            setForm((prev) => ({
                ...prev,
                targetEmployeeIds: prev.targetEmployeeIds.filter((id) => !removeSet.has(id)),
            }));
            return;
        }
        setForm((prev) => ({
            ...prev,
            targetEmployeeIds: [...new Set([...prev.targetEmployeeIds, ...filteredIds])],
        }));
    };

    const uploadFile = async (file: File): Promise<{ url: string; name: string } | null> => {
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/news/upload", { method: "POST", body: fd });
            if (!res.ok) {
                toast(await getResponseErrorMessage(res, "Upload gagal"), "error");
                return null;
            }
            return await res.json();
        } catch (error) {
            reportClientError("NewsManagementPage", "Upload lampiran berita gagal", error, { fileName: file.name, fileSize: file.size });
            toast("Upload gagal, cek koneksi", "error");
            return null;
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (form.audience === "SELECTED" && form.targetEmployeeIds.length === 0) {
            toast("Pilih minimal 1 karyawan penerima untuk berita khusus/private.", "warning");
            return;
        }
        setLoading(true);

        let mediaUrl = form.mediaUrl;
        let mediaName = form.mediaName;
        if (selectedFile) {
            const result = await uploadFile(selectedFile);
            if (result) {
                mediaUrl = result.url;
                mediaName = result.name;
            } else {
                setLoading(false);
                return;
            }
        }

        const method = editId ? "PUT" : "POST";
        const payload = {
            title: form.title.trim(),
            content: form.content.trim(),
            category: form.category,
            isPinned: form.isPinned,
            mediaUrl: mediaUrl || null,
            mediaName: mediaName || null,
            audience: form.audience,
            targetEmployeeIds: form.audience === "SELECTED" ? form.targetEmployeeIds : null,
            ...(editId ? { id: editId } : {}),
            author: "Admin HR",
            createdAt: new Date().toISOString(),
        };

        try {
            const res = await fetch("/api/news", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) throw new Error(await getResponseErrorMessage(res, editId ? "Gagal menyimpan perubahan berita." : "Gagal mempublikasikan berita."));

            const data = await res.json();
            if (editId) setNews((prev) => prev.map((n) => (n.id === editId ? data : n)));
            else setNews((prev) => [data, ...prev]);
            toast(editId ? "Berita berhasil diperbarui." : "Berita berhasil dipublikasikan.", "success");
            closeForm();
        } catch (error) {
            reportClientError("NewsManagementPage", "Gagal menyimpan berita", error, { editId });
            toast(error instanceof Error ? error.message : editId ? "Gagal menyimpan perubahan berita." : "Gagal mempublikasikan berita.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        confirm({
            title: "Hapus Berita",
            message: "Yakin ingin menghapus berita ini?",
            variant: "danger",
            confirmLabel: "Ya, Hapus",
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/news?id=${id}`, { method: "DELETE" });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus berita."));
                    setNews((prev) => prev.filter((n) => n.id !== id));
                    toast("Berita berhasil dihapus.", "success");
                } catch (error) {
                    reportClientError("NewsManagementPage", "Gagal menghapus berita", error, { newsId: id });
                    toast(error instanceof Error ? error.message : "Gagal menghapus berita.", "error");
                }
            },
        });
    };

    const togglePin = async (item: NewsItem) => {
        setActionId(item.id);
        try {
            const res = await fetch("/api/news", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: item.id, isPinned: !item.isPinned }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status pin berita."));
            setNews((prev) => prev.map((n) => (n.id === item.id ? { ...n, isPinned: !n.isPinned } : n)));
            toast(!item.isPinned ? "Berita berhasil di-pin." : "Pin berita berhasil dilepas.", "success");
        } catch (error) {
            reportClientError("NewsManagementPage", "Gagal mengubah status pin berita", error, { newsId: item.id, nextPinned: !item.isPinned });
            toast(error instanceof Error ? error.message : "Gagal mengubah status pin berita.", "error");
        } finally {
            setActionId(null);
        }
    };

    const openEdit = (item: NewsItem) => {
        setEditId(item.id);
        setForm({
            title: item.title,
            content: item.content,
            category: item.category,
            isPinned: item.isPinned,
            mediaUrl: item.mediaUrl || null,
            mediaName: item.mediaName || null,
            audience: item.audience === "SELECTED" ? "SELECTED" : "ALL",
            targetEmployeeIds: Array.isArray(item.targetEmployeeIds) ? item.targetEmployeeIds : [],
        });
        setEmpQuery("");
        setShowAllChips(false);
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditId(null);
        setForm(INIT_FORM);
        setEmpQuery("");
        setShowAllChips(false);
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = "";
    };

    const removeMedia = () => {
        setForm({ ...form, mediaUrl: null, mediaName: null });
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = "";
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const getCategoryLabel = (cat: string) => {
        switch (cat) {
            case "announcement": return "Pengumuman";
            case "event": return "Acara";
            case "policy": return "Kebijakan";
            default: return "Umum";
        }
    };

    const publicCount = useMemo(
        () => news.filter((n) => (n.audience ?? "ALL") === "ALL").length,
        [news]
    );
    const targetedCount = useMemo(
        () => news.filter((n) => n.audience === "SELECTED").length,
        [news]
    );

    const visibleNews = useMemo(() => {
        if (audienceFilter === "PUBLIC") return news.filter((n) => (n.audience ?? "ALL") === "ALL");
        if (audienceFilter === "TARGETED") return news.filter((n) => n.audience === "SELECTED");
        return news;
    }, [news, audienceFilter]);

    const visibleChips = showAllChips
        ? form.targetEmployeeIds
        : form.targetEmployeeIds.slice(0, COMPACT_CHIP_LIMIT);
    const hiddenChipCount = Math.max(0, form.targetEmployeeIds.length - visibleChips.length);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-[var(--primary)]" />
                        Manajemen Berita
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        {initialLoading
                            ? "Memuat berita..."
                            : `${news.length} berita (${publicCount} seluruh karyawan, ${targetedCount} khusus/private)`}
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setShowForm(true);
                        setEditId(null);
                        setForm(INIT_FORM);
                        setEmpQuery("");
                        setShowAllChips(false);
                    }}
                >
                    <Plus className="w-4 h-4" /> Buat Berita
                </button>
            </div>

            {/* Filter Tab: Semua / Seluruh Karyawan / Khusus & Private */}
            <div className="flex gap-2 flex-wrap">
                {([
                    { key: "ALL_ITEMS", label: `Semua (${news.length})` },
                    { key: "PUBLIC", label: `Seluruh Karyawan (${publicCount})` },
                    { key: "TARGETED", label: `Khusus / Private (${targetedCount})` },
                ] as const).map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setAudienceFilter(tab.key)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                            audienceFilter === tab.key
                                ? "bg-[var(--primary)] text-white shadow-sm"
                                : "bg-[var(--secondary)] text-[var(--text-secondary)] hover:bg-[var(--muted)]"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {loadError && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {initialLoading ? (
                <div className="card p-12 text-center text-[var(--text-muted)]">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--primary)] opacity-50" />
                    <p className="text-sm font-medium">Memuat berita...</p>
                </div>
            ) : visibleNews.length === 0 ? (
                <div className="card p-12 text-center">
                    <Megaphone className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada berita</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {visibleNews.map((item) => {
                        const isTargeted = item.audience === "SELECTED";
                        const targetList = item.targetEmployees ?? (item.targetEmployeeIds ?? []).map((id) => ({
                            employeeId: id,
                            name: employeeById.get(id)?.name ?? id,
                        }));
                        const targetCount = targetList.length;

                        return (
                            <div key={item.id} className="card p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {item.isPinned && <Pin className="w-3 h-3 text-[var(--primary)]" />}
                                            <span className="badge badge-primary">{getCategoryLabel(item.category)}</span>
                                            {isTargeted ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-2.5 py-0.5 text-[11px] font-bold">
                                                    <Lock className="w-3 h-3" />
                                                    {targetCount === 1
                                                        ? `Private: ${stripGelar(targetList[0].name)} (${targetList[0].employeeId})`
                                                        : `Khusus ${targetCount} Karyawan`}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 text-[11px] font-semibold">
                                                    <Globe className="w-3 h-3" />
                                                    Seluruh Karyawan
                                                </span>
                                            )}
                                            {item.mediaUrl && (
                                                <span className="badge bg-blue-50 text-blue-600 text-[10px] flex items-center gap-1">
                                                    <Paperclip className="w-2.5 h-2.5" /> Lampiran
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</h3>
                                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{item.content}</p>
                                        {isTargeted && targetCount > 1 && (
                                            <p className="text-[11px] text-[var(--text-muted)] truncate">
                                                <span className="font-semibold text-[var(--text-secondary)]">Penerima:</span>{" "}
                                                {targetList.map((t) => `${stripGelar(t.name)} (${t.employeeId})`).join(", ")}
                                            </p>
                                        )}
                                        <p className="text-[10px] text-[var(--text-muted)]">
                                            {new Date(item.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            onClick={() => togglePin(item)}
                                            disabled={actionId === item.id}
                                            className={`btn btn-ghost btn-sm !p-1.5 ${item.isPinned ? "text-[var(--primary)]" : ""}`}
                                            title={item.isPinned ? "Unpin" : "Pin"}
                                        >
                                            {actionId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pin className="w-3.5 h-3.5" />}
                                        </button>
                                        <button onClick={() => openEdit(item)} className="btn btn-ghost btn-sm !p-1.5" title="Edit Berita">
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50" title="Hapus Berita">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={closeForm}>
                    <div className="modal-content !max-w-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editId ? "Edit Berita" : "Buat Berita Baru"}</h2>
                            <button className="modal-close" onClick={closeForm}><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="form-group !mb-0">
                                <label className="form-label">Judul</label>
                                <input
                                    className="form-input"
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    placeholder="Masukkan judul berita atau pengumuman..."
                                    required
                                />
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label">Kategori</label>
                                <select
                                    className="form-select"
                                    value={form.category}
                                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                                >
                                    <option value="announcement">Pengumuman</option>
                                    <option value="event">Acara</option>
                                    <option value="policy">Kebijakan</option>
                                    <option value="general">Umum</option>
                                </select>
                            </div>

                            {/* Target Penerima (Semua Karyawan vs Karyawan Tertentu / Private) */}
                            <div className="form-group !mb-0 space-y-2">
                                <label className="form-label !mb-0">Target Penerima Berita</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setForm((prev) => ({ ...prev, audience: "ALL" }))}
                                        className={`flex items-start gap-2.5 rounded-xl border-2 p-3 text-left transition-all ${
                                            form.audience === "ALL"
                                                ? "border-red-600 bg-[var(--accent)] text-[var(--primary)] shadow-sm"
                                                : "border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:border-red-400"
                                        }`}
                                    >
                                        <Globe className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span className="min-w-0">
                                            <span className="block text-xs font-bold">Seluruh Karyawan</span>
                                            <span className="block text-[11px] text-[var(--text-muted)]">
                                                Tampil untuk semua karyawan perusahaan
                                            </span>
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setForm((prev) => ({ ...prev, audience: "SELECTED" }))}
                                        className={`flex items-start gap-2.5 rounded-xl border-2 p-3 text-left transition-all ${
                                            form.audience === "SELECTED"
                                                ? "border-red-600 bg-[var(--accent)] text-[var(--primary)] shadow-sm"
                                                : "border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:border-red-400"
                                        }`}
                                    >
                                        <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span className="min-w-0">
                                            <span className="block text-xs font-bold">Karyawan Tertentu / Private</span>
                                            <span className="block text-[11px] text-[var(--text-muted)]">
                                                Kirim khusus ke 1 atau beberapa karyawan
                                            </span>
                                        </span>
                                    </button>
                                </div>

                                {form.audience === "SELECTED" && (
                                    <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/40 p-3">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                                                <Users className="w-3.5 h-3.5 text-[var(--primary)]" />
                                                Pilih Karyawan Penerima
                                            </span>
                                            <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                                                Terpilih:{" "}
                                                <span className="text-[var(--primary)] font-bold">
                                                    {form.targetEmployeeIds.length}
                                                </span>
                                                {employees.length > 0 ? `/${employees.length}` : ""} karyawan aktif
                                            </span>
                                        </div>

                                        {/* Search Input */}
                                        <div className="relative">
                                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
                                            <input
                                                type="text"
                                                value={empQuery}
                                                onChange={(e) => setEmpQuery(e.target.value)}
                                                placeholder="Cari nama, NIP, departemen, atau jabatan…"
                                                className="form-input pl-9 pr-8 text-xs"
                                            />
                                            {empQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => setEmpQuery("")}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                                    aria-label="Bersihkan pencarian"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Quick Actions */}
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={handleSelectAllEmployees}
                                                    disabled={employeesLoading || employees.length === 0}
                                                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                                                        isAllActiveSelected
                                                            ? "bg-red-600 text-white"
                                                            : "bg-[var(--card)] text-[var(--primary)] border border-[var(--primary)] hover:bg-[var(--accent)]"
                                                    } disabled:opacity-50`}
                                                >
                                                    {isAllActiveSelected
                                                        ? `Semua Karyawan Terpilih (${employees.length})`
                                                        : `Pilih Semua Karyawan (${employees.length})`}
                                                </button>
                                                {empQuery.trim() !== "" &&
                                                    filteredEmployees.length > 0 &&
                                                    filteredEmployees.length < employees.length && (
                                                        <button
                                                            type="button"
                                                            onClick={handleSelectFilteredEmployees}
                                                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold bg-[var(--card)] text-[var(--text-primary)] border border-[var(--border)] hover:border-red-500"
                                                        >
                                                            {isAllFilteredSelected
                                                                ? `Batal Pilih Hasil Cari (${filteredEmployees.length})`
                                                                : `Pilih Hasil Cari (${filteredEmployees.length})`}
                                                        </button>
                                                    )}
                                            </div>
                                            {form.targetEmployeeIds.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setForm((prev) => ({ ...prev, targetEmployeeIds: [] }))}
                                                    className="text-[11px] font-bold text-red-600 hover:underline"
                                                >
                                                    Reset ({form.targetEmployeeIds.length})
                                                </button>
                                            )}
                                        </div>

                                        {/* Employee List */}
                                        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                                            {employeesLoading ? (
                                                <div className="p-4 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
                                                    <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
                                                    <span>Memuat daftar karyawan aktif…</span>
                                                </div>
                                            ) : employeesError ? (
                                                <div className="p-3 flex items-center justify-between gap-2 text-xs text-red-600">
                                                    <span>{employeesError}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => void loadActiveEmployees()}
                                                        className="underline font-semibold shrink-0"
                                                    >
                                                        Coba lagi
                                                    </button>
                                                </div>
                                            ) : filteredEmployees.length === 0 ? (
                                                <p className="p-3 text-xs text-[var(--text-muted)] text-center">
                                                    {empQuery.trim()
                                                        ? `Tidak ada karyawan aktif yang cocok dengan "${empQuery.trim()}".`
                                                        : "Belum ada data karyawan aktif."}
                                                </p>
                                            ) : (
                                                <ul className="max-h-48 overflow-y-auto divide-y divide-[var(--border)]">
                                                    {filteredEmployees.map((emp) => {
                                                        const selected = selectedTargetSet.has(emp.employeeId);
                                                        return (
                                                            <li key={emp.employeeId}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleEmployeeTarget(emp.employeeId)}
                                                                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                                                                        selected
                                                                            ? "bg-[var(--accent)]"
                                                                            : "hover:bg-[var(--secondary)]"
                                                                    }`}
                                                                >
                                                                    <span className="flex items-center gap-2.5 min-w-0">
                                                                        {selected ? (
                                                                            <CheckSquare className="w-4 h-4 text-red-600 shrink-0" />
                                                                        ) : (
                                                                            <Square className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                                                                        )}
                                                                        <span className="min-w-0">
                                                                            <span className="block text-xs font-semibold text-[var(--text-primary)] truncate">
                                                                                {stripGelar(emp.name)}
                                                                            </span>
                                                                            <span className="block text-[10px] text-[var(--text-muted)] truncate">
                                                                                {emp.employeeId} · {emp.department}
                                                                                {emp.position && emp.position !== "-" ? ` · ${emp.position}` : ""}
                                                                            </span>
                                                                        </span>
                                                                    </span>
                                                                    {selected && (
                                                                        <span className="text-[10px] font-bold text-red-600 bg-[var(--card)] border border-red-300 rounded-full px-2 py-0.5 shrink-0">
                                                                            Terpilih
                                                                        </span>
                                                                    )}
                                                                </button>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>

                                        {/* Selected Recipient Chips */}
                                        {form.targetEmployeeIds.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 pt-1">
                                                {visibleChips.map((empId) => {
                                                    const emp = employeeById.get(empId);
                                                    return (
                                                        <span
                                                            key={empId}
                                                            className="inline-flex items-center gap-1 rounded-full bg-[var(--card)] border border-[var(--border)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-primary)]"
                                                        >
                                                            {emp ? stripGelar(emp.name) : empId}
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleEmployeeTarget(empId)}
                                                                className="text-[var(--text-muted)] hover:text-red-600"
                                                                aria-label={`Hapus ${emp?.name ?? empId}`}
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </span>
                                                    );
                                                })}
                                                {hiddenChipCount > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowAllChips(true)}
                                                        className="inline-flex items-center rounded-full bg-[var(--accent)] text-[var(--primary)] border border-[var(--primary)] px-2.5 py-0.5 text-[11px] font-bold"
                                                    >
                                                        +{hiddenChipCount} lainnya (Lihat semua)
                                                    </button>
                                                )}
                                                {showAllChips && form.targetEmployeeIds.length > COMPACT_CHIP_LIMIT && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowAllChips(false)}
                                                        className="inline-flex items-center rounded-full bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)] px-2.5 py-0.5 text-[11px] font-semibold"
                                                    >
                                                        Ringkas tampilan
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="form-group !mb-0">
                                <label className="form-label">Konten</label>
                                <textarea
                                    className="form-textarea min-h-[150px]"
                                    value={form.content}
                                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                                    placeholder="Tuliskan isi berita atau pengumuman..."
                                    required
                                />
                            </div>

                            {/* Media Upload */}
                            <div className="form-group !mb-0">
                                <label className="form-label flex items-center gap-1">
                                    <Paperclip className="w-3 h-3" /> Lampiran Media
                                </label>
                                {(form.mediaUrl && form.mediaName) || selectedFile ? (
                                    <div className="flex items-center gap-2 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
                                        <FileText className="w-4 h-4 text-[var(--primary)] shrink-0" />
                                        <span className="text-xs text-[var(--text-secondary)] truncate flex-1">
                                            {selectedFile ? selectedFile.name : form.mediaName}
                                        </span>
                                        {selectedFile && (
                                            <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                                                {(selectedFile.size / 1024).toFixed(0)} KB
                                            </span>
                                        )}
                                        <button type="button" onClick={removeMedia} className="text-red-400 hover:text-red-600 shrink-0">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <input
                                            ref={fileRef}
                                            type="file"
                                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                            className="hidden"
                                            id="news-media-upload"
                                            onChange={handleFileChange}
                                        />
                                        <label
                                            htmlFor="news-media-upload"
                                            className="flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] text-[var(--text-muted)] hover:text-[var(--primary)] cursor-pointer transition-colors"
                                        >
                                            <Upload className="w-4 h-4" />
                                            <span className="text-xs font-medium">Pilih file (maks 10MB)</span>
                                        </label>
                                    </div>
                                )}
                                {uploading && (
                                    <div className="flex items-center gap-2 mt-2 text-xs text-[var(--text-muted)]">
                                        <Loader2 className="w-3 h-3 animate-spin" /> Mengupload...
                                    </div>
                                )}
                            </div>

                            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.isPinned}
                                    onChange={(e) => setForm({ ...form, isPinned: e.target.checked })}
                                    className="w-4 h-4 accent-[var(--primary)]"
                                />
                                Pin berita ini
                            </label>
                            <button
                                type="submit"
                                className="btn btn-primary w-full"
                                disabled={loading || uploading || (form.audience === "SELECTED" && form.targetEmployeeIds.length === 0)}
                            >
                                {(loading || uploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {editId
                                    ? "Simpan Perubahan"
                                    : form.audience === "SELECTED"
                                      ? `Kirim Berita ke ${form.targetEmployeeIds.length} Karyawan`
                                      : "Publikasikan ke Seluruh Karyawan"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
