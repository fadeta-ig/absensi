"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    KeyRound,
    Loader2,
    Pencil,
    Plus,
    Power,
    Search,
    ShieldCheck,
    Trash2,
    UserPlus,
    X,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { formatWIBDateTime } from "@/lib/timezone";
import {
    OUTSOURCE_MODULE_DEFINITIONS,
    type OutsourceModuleKey,
} from "@/lib/permissions";

interface OutsourceUserRow {
    id: string;
    username: string;
    displayName: string;
    email: string;
    isActive: boolean;
    createdAt: string;
    lastLoginAt: string | null;
    isLegacyAccount: boolean;
    modules: OutsourceModuleKey[];
    cleaningAssignments: Array<{ id: string; room: { id: string; name: string } }>;
    activeEquipmentAssignmentsCount: number;
    canHardDelete: boolean;
}

const MODULE_BY_KEY = new Map(OUTSOURCE_MODULE_DEFINITIONS.map((m) => [m.key, m]));
const CLEANING_MODULES = OUTSOURCE_MODULE_DEFINITIONS.filter((m) => m.group === "cleaning");
const EQUIPMENT_MODULES = OUTSOURCE_MODULE_DEFINITIONS.filter((m) => m.group === "equipment");

const inputClass =
    "w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm";

function formatShortDate(iso: string | null): string {
    if (!iso) return "Belum pernah";
    try {
        return formatWIBDateTime(new Date(iso), {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

export default function OutsourceUsersPanel() {
    const toast = useToast();
    const confirm = useConfirm();

    const [users, setUsers] = useState<OutsourceUserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter state
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
    const [moduleFilter, setModuleFilter] = useState<"all" | OutsourceModuleKey>("all");

    // Create / Edit modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<OutsourceUserRow | null>(null);
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [selectedModules, setSelectedModules] = useState<OutsourceModuleKey[]>(["cleaning_execute"]);
    const [saving, setSaving] = useState(false);

    // Reset password modal state
    const [resetTarget, setResetTarget] = useState<OutsourceUserRow | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [resetting, setResetting] = useState(false);

    const [busyId, setBusyId] = useState<string | null>(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/ga/outsource-users");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat daftar akun outsource."));
            const json = await res.json();
            setUsers(json.data ?? []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat data.";
            setError(msg);
            reportClientError("OutsourceUsersPanel", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchUsers();
    }, [fetchUsers]);

    const filteredUsers = useMemo(() => {
        const q = query.trim().toLowerCase();
        return users.filter((u) => {
            if (statusFilter === "active" && !u.isActive) return false;
            if (statusFilter === "inactive" && u.isActive) return false;
            if (moduleFilter !== "all" && !u.modules.includes(moduleFilter)) return false;
            if (q) {
                const hay = `${u.displayName} ${u.username} ${u.email}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [users, query, statusFilter, moduleFilter]);

    const stats = useMemo(() => {
        const total = users.length;
        const active = users.filter((u) => u.isActive).length;
        const withCleaning = users.filter((u) => u.isActive && u.modules.includes("cleaning_execute")).length;
        const withEquipment = users.filter(
            (u) =>
                u.isActive &&
                (u.modules.includes("equipment_execute") ||
                    u.modules.includes("equipment_qc") ||
                    u.modules.includes("equipment_approve"))
        ).length;
        return { total, active, withCleaning, withEquipment };
    }, [users]);

    const openCreateModal = useCallback(() => {
        setEditingUser(null);
        setUsername("");
        setDisplayName("");
        setEmail("");
        setPassword("");
        setSelectedModules(["cleaning_execute"]);
        setModalOpen(true);
    }, []);

    const openEditModal = useCallback((row: OutsourceUserRow) => {
        setEditingUser(row);
        setUsername(row.username);
        setDisplayName(row.displayName);
        setEmail(row.email);
        setPassword("");
        setSelectedModules([...row.modules]);
        setModalOpen(true);
    }, []);

    const toggleModule = useCallback((key: OutsourceModuleKey) => {
        setSelectedModules((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    }, []);

    const handleSubmitForm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;

        if (!editingUser) {
            if (username.trim().length < 3) {
                toast("Username minimal 3 karakter.", "warning");
                return;
            }
            if (password.length < 8) {
                toast("Password minimal 8 karakter.", "warning");
                return;
            }
        }
        if (displayName.trim().length < 2) {
            toast("Nama lengkap minimal 2 karakter.", "warning");
            return;
        }

        setSaving(true);
        try {
            if (!editingUser) {
                const res = await fetch("/api/ga/outsource-users", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: username.trim().toLowerCase(),
                        displayName: displayName.trim(),
                        email: email.trim() || undefined,
                        password,
                        modules: selectedModules,
                    }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal membuat akun outsource."));
                toast(`Akun outsource "${username.trim().toLowerCase()}" berhasil dibuat.`, "success");
            } else {
                const res = await fetch(`/api/ga/outsource-users/${editingUser.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        displayName: displayName.trim(),
                        email: email.trim(),
                        modules: selectedModules,
                    }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memperbarui akun outsource."));
                toast(`Akun & RBAC "${editingUser.username}" berhasil diperbarui.`, "success");
            }
            setModalOpen(false);
            await fetchUsers();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
            reportClientError("OutsourceUsersPanel", "Submit form failed", err);
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = useCallback(
        (row: OutsourceUserRow) => {
            const nextActive = !row.isActive;
            confirm({
                title: nextActive ? `Aktifkan akun "${row.displayName}"?` : `Nonaktifkan akun "${row.displayName}"?`,
                message: nextActive
                    ? `Akun ${row.username} akan kembali bisa login ke portal /outsource sesuai RBAC E-Checklist yang dipilih.`
                    : `Akun ${row.username} akan langsung diputus sesinya, tidak bisa login, dan semua penugasan Cleaning/Equipment aktif akan diakhiri hari ini. Data historis tetap utuh.`,
                confirmLabel: nextActive ? "Ya, Aktifkan" : "Ya, Nonaktifkan",
                cancelLabel: "Batal",
                variant: nextActive ? "info" : "warning",
                onConfirm: () => {
                    void (async () => {
                        setBusyId(row.id);
                        try {
                            const res = await fetch(`/api/ga/outsource-users/${row.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ isActive: nextActive }),
                            });
                            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status akun."));
                            toast(
                                nextActive
                                    ? `Akun "${row.username}" diaktifkan.`
                                    : `Akun "${row.username}" dinonaktifkan dan penugasan aktif diakhiri.`,
                                "success"
                            );
                            await fetchUsers();
                        } catch (err) {
                            toast(err instanceof Error ? err.message : "Gagal mengubah status.", "error");
                            reportClientError("OutsourceUsersPanel", "Toggle active failed", err);
                        } finally {
                            setBusyId(null);
                        }
                    })();
                },
            });
        },
        [confirm, toast, fetchUsers]
    );

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetTarget || resetting) return;
        if (newPassword.length < 8) {
            toast("Password baru minimal 8 karakter.", "warning");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast("Konfirmasi password tidak cocok.", "warning");
            return;
        }
        setResetting(true);
        try {
            const res = await fetch(`/api/ga/outsource-users/${resetTarget.id}/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: newPassword }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyetel ulang password."));
            toast(`Password "${resetTarget.username}" berhasil direset & sesi lama diputus.`, "success");
            setResetTarget(null);
            setNewPassword("");
            setConfirmPassword("");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal reset password.", "error");
            reportClientError("OutsourceUsersPanel", "Reset password failed", err);
        } finally {
            setResetting(false);
        }
    };

    const handleDelete = useCallback(
        (row: OutsourceUserRow) => {
            confirm({
                title: `Hapus permanen "${row.displayName}"?`,
                message: `Akun "${row.username}" belum memiliki riwayat penugasan/inspeksi dan akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`,
                confirmLabel: "Ya, Hapus Permanen",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: () => {
                    void (async () => {
                        setBusyId(row.id);
                        try {
                            const res = await fetch(`/api/ga/outsource-users/${row.id}`, {
                                method: "DELETE",
                            });
                            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus akun."));
                            toast(`Akun "${row.username}" berhasil dihapus permanen.`, "success");
                            await fetchUsers();
                        } catch (err) {
                            toast(err instanceof Error ? err.message : "Gagal menghapus akun.", "error");
                            reportClientError("OutsourceUsersPanel", "Delete failed", err);
                        } finally {
                            setBusyId(null);
                        }
                    })();
                },
            });
        },
        [confirm, toast, fetchUsers]
    );

    return (
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Manajemen Akun Outsource (OS)</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Kelola akun petugas eksternal (tanpa data karyawan HR) beserta RBAC akses modul E-Checklist
                        pada portal terisolasi <code className="text-xs">/outsource</code>. Khusus <strong>WIG002</strong>.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openCreateModal}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 shrink-0 min-h-[44px]"
                >
                    <Plus className="h-4 w-4" />
                    Tambah Akun OS
                </button>
            </div>

            {/* Ringkasan */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-card border border-border rounded-lg p-3.5">
                    <p className="text-xs text-muted-foreground">Total Akun OS</p>
                    <p className="text-xl font-semibold mt-0.5">{stats.total}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3.5">
                    <p className="text-xs text-muted-foreground">Akun Aktif</p>
                    <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.active}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3.5">
                    <p className="text-xs text-muted-foreground">Akses Cleaning</p>
                    <p className="text-xl font-semibold mt-0.5">{stats.withCleaning}</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3.5">
                    <p className="text-xs text-muted-foreground">Akses Peralatan</p>
                    <p className="text-xl font-semibold mt-0.5">{stats.withEquipment}</p>
                </div>
            </div>

            {error && (
                <FeedbackMessage variant="error">
                    {error}{" "}
                    <button type="button" onClick={() => void fetchUsers()} className="underline ml-1">
                        Coba lagi
                    </button>
                </FeedbackMessage>
            )}

            {/* Filter Bar */}
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="relative">
                        <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Cari nama, username, atau email…"
                            className={`${inputClass} pl-9`}
                            aria-label="Cari akun outsource"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
                        className={inputClass}
                        aria-label="Filter status akun"
                    >
                        <option value="all">Semua Status</option>
                        <option value="active">Aktif</option>
                        <option value="inactive">Nonaktif</option>
                    </select>
                    <select
                        value={moduleFilter}
                        onChange={(e) => setModuleFilter(e.target.value as "all" | OutsourceModuleKey)}
                        className={inputClass}
                        aria-label="Filter modul RBAC"
                    >
                        <option value="all">Semua Modul E-Checklist</option>
                        {OUTSOURCE_MODULE_DEFINITIONS.map((m) => (
                            <option key={m.key} value={m.key}>
                                {m.label}
                            </option>
                        ))}
                    </select>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Memuat daftar akun outsource…
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">
                        {users.length === 0
                            ? "Belum ada akun outsource terdaftar. Klik Tambah Akun OS untuk memulai."
                            : "Tidak ada akun outsource yang cocok dengan filter."}
                    </p>
                ) : (
                    <div className="border border-border rounded-lg overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Akun OS</TableHead>
                                    <TableHead>RBAC Modul E-Checklist</TableHead>
                                    <TableHead>Penugasan Aktif</TableHead>
                                    <TableHead>Status & Login</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.map((row) => {
                                    const isBusy = busyId === row.id;
                                    return (
                                        <TableRow key={row.id} className={!row.isActive ? "opacity-65" : undefined}>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-medium text-sm text-foreground">
                                                        {row.displayName}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                                        OS
                                                    </span>
                                                </div>
                                                <div className="text-xs text-muted-foreground">@{row.username}</div>
                                                <div className="text-[11px] text-muted-foreground">{row.email}</div>
                                            </TableCell>
                                            <TableCell>
                                                {row.modules.length === 0 ? (
                                                    <span className="text-xs text-muted-foreground italic">
                                                        Belum ada modul dipilih
                                                    </span>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1 max-w-xs">
                                                        {row.modules.map((key) => {
                                                            const def = MODULE_BY_KEY.get(key);
                                                            if (!def) return null;
                                                            return (
                                                                <span
                                                                    key={key}
                                                                    className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                                                                        def.group === "cleaning"
                                                                            ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                                                                            : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
                                                                    }`}
                                                                >
                                                                    {def.shortLabel}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                {row.isLegacyAccount && (
                                                    <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                                                        Akun OS lama — klik Ubah untuk migrasi ke portal /outsource
                                                    </p>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                <div>
                                                    Cleaning:{" "}
                                                    <strong className="text-foreground">
                                                        {row.cleaningAssignments.length}
                                                    </strong>{" "}
                                                    ruang
                                                </div>
                                                <div>
                                                    Alat:{" "}
                                                    <strong className="text-foreground">
                                                        {row.activeEquipmentAssignmentsCount}
                                                    </strong>{" "}
                                                    penugasan
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-full ${
                                                        row.isActive
                                                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                            : "bg-destructive/15 text-destructive"
                                                    }`}
                                                >
                                                    {row.isActive ? "Aktif" : "Nonaktif"}
                                                </span>
                                                <div className="text-[11px] text-muted-foreground mt-1 whitespace-nowrap">
                                                    {formatShortDate(row.lastLoginAt)}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right whitespace-nowrap">
                                                <div className="inline-flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditModal(row)}
                                                        disabled={isBusy}
                                                        title="Ubah profil & RBAC modul"
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted min-h-[36px] disabled:opacity-50"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                        Ubah
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setResetTarget(row);
                                                            setNewPassword("");
                                                            setConfirmPassword("");
                                                        }}
                                                        disabled={isBusy}
                                                        title="Reset password"
                                                        className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted min-h-[36px] disabled:opacity-50"
                                                    >
                                                        <KeyRound className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleActive(row)}
                                                        disabled={isBusy}
                                                        title={row.isActive ? "Nonaktifkan akun" : "Aktifkan akun"}
                                                        className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border border-border min-h-[36px] disabled:opacity-50 ${
                                                            row.isActive
                                                                ? "text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
                                                                : "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                                        }`}
                                                    >
                                                        <Power className="h-3.5 w-3.5" />
                                                    </button>
                                                    {row.canHardDelete && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(row)}
                                                            disabled={isBusy}
                                                            title="Hapus permanen (hanya akun tanpa riwayat)"
                                                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md text-destructive hover:bg-destructive/10 min-h-[36px] disabled:opacity-50"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>

            {/* Modal Tambah / Ubah Akun OS + RBAC */}
            {modalOpen && (
                <AccessibleModal
                    ariaLabel={editingUser ? "Ubah Akun & RBAC Outsource" : "Tambah Akun Outsource"}
                    onClose={() => !saving && setModalOpen(false)}
                    className="!max-w-2xl !p-6"
                >
                    <div className="flex items-start justify-between gap-2 pb-4 mb-4 border-b border-border">
                        <div>
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                {editingUser ? (
                                    <>
                                        <ShieldCheck className="h-5 w-5 text-primary" />
                                        Ubah Akun & RBAC Outsource
                                    </>
                                ) : (
                                    <>
                                        <UserPlus className="h-5 w-5 text-primary" />
                                        Tambah Akun Outsource Baru
                                    </>
                                )}
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Atur identitas akun dan centang modul E-Checklist yang diizinkan di portal{" "}
                                <code className="text-[11px]">/outsource</code>.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setModalOpen(false)}
                            disabled={saving}
                            aria-label="Tutup modal"
                            className="p-1.5 rounded-md hover:bg-muted"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmitForm} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="os-username" className="block text-xs font-medium mb-1">
                                    Username {editingUser ? "(tetap)" : "*"}
                                </label>
                                <input
                                    id="os-username"
                                    type="text"
                                    value={username}
                                    disabled={Boolean(editingUser)}
                                    onChange={(e) =>
                                        setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))
                                    }
                                    placeholder="contoh: os.budi"
                                    className={`${inputClass} disabled:opacity-60`}
                                    required={!editingUser}
                                />
                            </div>
                            <div>
                                <label htmlFor="os-display-name" className="block text-xs font-medium mb-1">
                                    Nama Lengkap *
                                </label>
                                <input
                                    id="os-display-name"
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    placeholder="contoh: Budi Santoso (OS)"
                                    className={inputClass}
                                    required
                                />
                            </div>
                            <div>
                                <label htmlFor="os-email" className="block text-xs font-medium mb-1">
                                    Email {editingUser ? "*" : "(opsional)"}
                                </label>
                                <input
                                    id="os-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="otomatis @outsource.wig.co.id bila kosong"
                                    className={inputClass}
                                    required={Boolean(editingUser)}
                                />
                            </div>
                            {!editingUser && (
                                <div>
                                    <label htmlFor="os-password" className="block text-xs font-medium mb-1">
                                        Password Awal * (min 8 karakter)
                                    </label>
                                    <input
                                        id="os-password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Minimal 8 karakter"
                                        minLength={8}
                                        maxLength={128}
                                        className={inputClass}
                                        required
                                    />
                                </div>
                            )}
                        </div>

                        {/* Matriks RBAC Modul E-Checklist */}
                        <div className="space-y-3 pt-2 border-t border-border">
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    RBAC Akses Modul E-Checklist
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Akun OS otomatis masuk portal terisolasi <code className="text-[11px]">/outsource</code>{" "}
                                    (tidak bisa mengakses portal HR/Karyawan). Pilih modul yang boleh dibuka akun ini:
                                </p>
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    E-Checklist Kebersihan (Cleaning)
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {CLEANING_MODULES.map((m) => {
                                        const checked = selectedModules.includes(m.key);
                                        return (
                                            <label
                                                key={m.key}
                                                className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                                                    checked
                                                        ? "border-primary/60 bg-primary/5"
                                                        : "border-border hover:bg-muted/40"
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleModule(m.key)}
                                                    className="mt-0.5 rounded border-border shrink-0"
                                                />
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-medium leading-tight">
                                                        {m.label}
                                                    </span>
                                                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                                                        {m.description}
                                                    </span>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    E-Checklist Peralatan Produksi (Equipment)
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {EQUIPMENT_MODULES.map((m) => {
                                        const checked = selectedModules.includes(m.key);
                                        return (
                                            <label
                                                key={m.key}
                                                className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                                                    checked
                                                        ? "border-primary/60 bg-primary/5"
                                                        : "border-border hover:bg-muted/40"
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleModule(m.key)}
                                                    className="mt-0.5 rounded border-border shrink-0"
                                                />
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-medium leading-tight">
                                                        {m.label}
                                                    </span>
                                                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                                                        {m.description}
                                                    </span>
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setModalOpen(false)}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-muted min-h-[44px]"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
                            >
                                {saving
                                    ? "Menyimpan…"
                                    : editingUser
                                        ? "Simpan Perubahan"
                                        : "Buat Akun OS"}
                            </button>
                        </div>
                    </form>
                </AccessibleModal>
            )}

            {/* Modal Reset Password */}
            {resetTarget && (
                <AccessibleModal
                    ariaLabel="Reset Password Akun Outsource"
                    onClose={() => !resetting && setResetTarget(null)}
                    className="!max-w-md !p-6"
                >
                    <div className="flex items-start justify-between gap-2 pb-3 mb-4 border-b border-border">
                        <div>
                            <h2 className="text-base font-semibold">Reset Password OS</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {resetTarget.displayName} (@{resetTarget.username}) — sesi login lama akan langsung
                                diputus.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setResetTarget(null)}
                            disabled={resetting}
                            aria-label="Tutup modal"
                            className="p-1.5 rounded-md hover:bg-muted"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    <form onSubmit={handleResetPassword} className="space-y-3">
                        <div>
                            <label htmlFor="os-new-pass" className="block text-xs font-medium mb-1">
                                Password Baru (min 8 karakter)
                            </label>
                            <input
                                id="os-new-pass"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                minLength={8}
                                maxLength={128}
                                className={inputClass}
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="os-confirm-pass" className="block text-xs font-medium mb-1">
                                Konfirmasi Password Baru
                            </label>
                            <input
                                id="os-confirm-pass"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                minLength={8}
                                maxLength={128}
                                className={inputClass}
                                required
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setResetTarget(null)}
                                disabled={resetting}
                                className="px-3 py-2 text-sm rounded-md border border-border hover:bg-muted min-h-[40px]"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={resetting}
                                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[40px]"
                            >
                                {resetting ? "Menyimpan…" : "Reset Password"}
                            </button>
                        </div>
                    </form>
                </AccessibleModal>
            )}
        </div>
    );
}
