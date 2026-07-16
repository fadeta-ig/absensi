"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, Pencil, Plus, Search, ShieldCheck, UserCheck, UserX, X } from "lucide-react";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";

type RoleCode = "SUPER_ADMIN" | "HR_ADMIN" | "GA_ADMIN";

type AdminUser = {
    id: string;
    username: string;
    displayName: string;
    email: string;
    isActive: boolean;
    employeeId: string | null;
    roles: { code: RoleCode; name: string }[];
    lastLoginAt: string | null;
    createdAt: string;
    employee: {
        employeeId: string;
        name: string;
        departmentRel: { name: string };
        positionRel: { name: string };
    } | null;
};

type EligibleEmployee = {
    employeeId: string;
    name: string;
    email: string;
    departmentRel: { name: string };
    positionRel: { name: string };
};

type UserForm = {
    id?: string;
    source: "standalone" | "employee";
    username: string;
    displayName: string;
    email: string;
    employeeId: string;
    roleCode: "HR_ADMIN" | "GA_ADMIN";
};

const emptyForm: UserForm = {
    source: "standalone",
    username: "",
    displayName: "",
    email: "",
    employeeId: "",
    roleCode: "HR_ADMIN",
};

const ROLE_LABELS: Record<RoleCode, string> = {
    SUPER_ADMIN: "Super Admin HR",
    HR_ADMIN: "Admin HR",
    GA_ADMIN: "Admin GA",
};

export default function UsersPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [eligibleEmployees, setEligibleEmployees] = useState<EligibleEmployee[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [busyUserId, setBusyUserId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [form, setForm] = useState<UserForm | null>(null);
    const toast = useToast();
    const confirm = useConfirm();

    const loadUsers = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/users", { cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Gagal memuat user.");
            setUsers(data.users ?? []);
            setEligibleEmployees(data.eligibleEmployees ?? []);
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal memuat user.", "error");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { void loadUsers(); }, [loadUsers]);

    const filteredUsers = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return users;
        return users.filter((user) =>
            user.displayName.toLowerCase().includes(query)
            || user.username.toLowerCase().includes(query)
            || user.email.toLowerCase().includes(query)
            || user.roles.some((role) => ROLE_LABELS[role.code].toLowerCase().includes(query))
        );
    }, [search, users]);

    const submitForm = async (event: FormEvent) => {
        event.preventDefault();
        if (!form) return;
        setSaving(true);
        try {
            const isEdit = Boolean(form.id);
            const payload = isEdit
                ? {
                    id: form.id,
                    action: "update",
                    displayName: form.displayName,
                    email: form.email,
                    roleCode: form.roleCode,
                }
                : form;
            const response = await fetch("/api/users", {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Gagal menyimpan user.");
            toast(data.message || "User berhasil disimpan.", data.emailSent === false ? "warning" : "success");
            setForm(null);
            await loadUsers();
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal menyimpan user.", "error");
        } finally {
            setSaving(false);
        }
    };

    const updateStatus = (user: AdminUser) => {
        confirm({
            title: user.isActive ? "Nonaktifkan User" : "Aktifkan User",
            message: user.isActive
                ? `Akun ${user.displayName} akan langsung kehilangan seluruh sesi login.`
                : `Akun ${user.displayName} akan dapat login kembali.`,
            variant: user.isActive ? "danger" : "warning",
            confirmLabel: user.isActive ? "Nonaktifkan" : "Aktifkan",
            onConfirm: async () => {
                setBusyUserId(user.id);
                try {
                    const response = await fetch("/api/users", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: user.id, action: "update", isActive: !user.isActive }),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Gagal mengubah status user.");
                    toast(data.message, "success");
                    await loadUsers();
                } catch (error) {
                    toast(error instanceof Error ? error.message : "Gagal mengubah status user.", "error");
                } finally {
                    setBusyUserId(null);
                }
            },
        });
    };

    const resetPassword = (user: AdminUser) => {
        confirm({
            title: "Reset Password",
            message: `Buat password baru dan kirim ke ${user.email}? Seluruh sesi lama akan dihentikan.`,
            variant: "warning",
            confirmLabel: "Reset & Kirim",
            onConfirm: async () => {
                setBusyUserId(user.id);
                try {
                    const response = await fetch("/api/users", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: user.id, action: "reset_password" }),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Gagal mereset password.");
                    toast(data.message, data.emailSent === false ? "warning" : "success");
                } catch (error) {
                    toast(error instanceof Error ? error.message : "Gagal mereset password.", "error");
                } finally {
                    setBusyUserId(null);
                }
            },
        });
    };

    const openEdit = (user: AdminUser) => {
        const roleCode = user.roles[0]?.code;
        if (roleCode === "SUPER_ADMIN") return;
        setForm({
            id: user.id,
            source: user.employeeId ? "employee" : "standalone",
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            employeeId: user.employeeId ?? "",
            roleCode,
        });
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.4s_ease]">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
                        <ShieldCheck className="h-5 w-5 text-[var(--primary)]" /> Manajemen User
                    </h1>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">Kelola akun admin HR dan GA secara terpisah dari master karyawan.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setForm({ ...emptyForm })}>
                    <Plus className="h-4 w-4" /> Tambah User
                </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                {(["SUPER_ADMIN", "HR_ADMIN", "GA_ADMIN"] as const).map((role) => (
                    <div key={role} className="card p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{ROLE_LABELS[role]}</p>
                        <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{users.filter((user) => user.roles.some((item) => item.code === role) && user.isActive).length}</p>
                        <p className="text-xs text-[var(--text-muted)]">user aktif</p>
                    </div>
                ))}
            </div>

            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input className="form-input pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama, username, email, atau role..." />
            </div>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead><tr><th>User</th><th>Role</th><th className="hidden md:table-cell">Keterkaitan Karyawan</th><th>Status</th><th className="hidden lg:table-cell">Login Terakhir</th><th>Aksi</th></tr></thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="py-10 text-center text-sm text-[var(--text-muted)]"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Memuat user...</td></tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr><td colSpan={6} className="py-10 text-center text-sm text-[var(--text-muted)]">Tidak ada user ditemukan.</td></tr>
                            ) : filteredUsers.map((user) => {
                                const roleCode = user.roles[0]?.code;
                                const isSuper = roleCode === "SUPER_ADMIN";
                                const busy = busyUserId === user.id;
                                return (
                                    <tr key={user.id} className={!user.isActive ? "opacity-70" : undefined}>
                                        <td><p className="font-semibold text-[var(--text-primary)]">{user.displayName}</p><p className="text-xs text-[var(--text-muted)]">{user.username} · {user.email}</p></td>
                                        <td><span className={`badge ${isSuper ? "badge-primary" : roleCode === "HR_ADMIN" ? "badge-success" : "badge-warning"}`}>{ROLE_LABELS[roleCode]}</span></td>
                                        <td className="hidden md:table-cell">{user.employee ? <><p className="text-sm">{user.employee.name} ({user.employee.employeeId})</p><p className="text-xs text-[var(--text-muted)]">{user.employee.departmentRel.name} · {user.employee.positionRel.name}</p></> : <span className="text-xs text-[var(--text-muted)]">Akun admin mandiri</span>}</td>
                                        <td><span className={`badge ${user.isActive ? "badge-success" : "badge-error"}`}>{user.isActive ? "Aktif" : "Nonaktif"}</span></td>
                                        <td className="hidden lg:table-cell text-xs text-[var(--text-muted)]">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("id-ID") : "Belum pernah"}</td>
                                        <td><div className="flex items-center gap-1">
                                            <button className="btn btn-ghost btn-sm !p-1.5" disabled={busy || isSuper} title={isSuper ? "Super admin dilindungi" : "Edit user"} onClick={() => openEdit(user)}><Pencil className="h-3.5 w-3.5" /></button>
                                            <button className="btn btn-ghost btn-sm !p-1.5 text-blue-600" disabled={busy} title="Reset password" onClick={() => resetPassword(user)}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}</button>
                                            <button className={`btn btn-ghost btn-sm !p-1.5 ${user.isActive ? "text-red-600" : "text-emerald-600"}`} disabled={busy || isSuper} title={isSuper ? "Super admin dilindungi" : user.isActive ? "Nonaktifkan" : "Aktifkan"} onClick={() => updateStatus(user)}>{user.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}</button>
                                        </div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {form && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setForm(null); }}>
                    <form onSubmit={submitForm} className="card w-full max-w-lg space-y-5 p-6 shadow-2xl">
                        <div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-[var(--text-primary)]">{form.id ? "Edit User Admin" : "Tambah User Admin"}</h2><p className="text-xs text-[var(--text-muted)]">Akses hanya dapat diberikan sebagai Admin HR atau Admin GA.</p></div><button type="button" className="btn btn-ghost btn-sm !p-1.5" onClick={() => setForm(null)} disabled={saving}><X className="h-4 w-4" /></button></div>

                        {!form.id && <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--secondary)]/50 p-1">
                            <button type="button" className={`rounded-lg px-3 py-2 text-xs font-semibold ${form.source === "standalone" ? "bg-[var(--card)] shadow-sm" : "text-[var(--text-muted)]"}`} onClick={() => setForm({ ...form, source: "standalone", employeeId: "" })}>Akun Mandiri</button>
                            <button type="button" className={`rounded-lg px-3 py-2 text-xs font-semibold ${form.source === "employee" ? "bg-[var(--card)] shadow-sm" : "text-[var(--text-muted)]"}`} onClick={() => setForm({ ...form, source: "employee", username: "", displayName: "", email: "" })}>Dari Karyawan</button>
                        </div>}

                        {!form.id && form.source === "employee" ? <div className="form-group !mb-0"><label className="form-label">Karyawan Aktif</label><select className="form-select" value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })} required><option value="">Pilih karyawan</option>{eligibleEmployees.map((employee) => <option key={employee.employeeId} value={employee.employeeId}>{employee.name} ({employee.employeeId}) · {employee.departmentRel.name}</option>)}</select><p className="mt-1 text-xs text-[var(--text-muted)]">Password akun karyawan yang sudah ada akan tetap dipertahankan.</p></div> : <>
                            <div className="form-group !mb-0"><label className="form-label">Nama</label><input className="form-input" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required /></div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div className="form-group !mb-0"><label className="form-label">Username</label><input className="form-input" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required disabled={Boolean(form.id)} /></div><div className="form-group !mb-0"><label className="form-label">Email</label><input type="email" className="form-input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></div></div>
                        </>}

                        <div className="form-group !mb-0"><label className="form-label">Role</label><select className="form-select" value={form.roleCode} onChange={(event) => setForm({ ...form, roleCode: event.target.value as UserForm["roleCode"] })}><option value="HR_ADMIN">Admin HR</option><option value="GA_ADMIN">Admin GA</option></select></div>
                        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4"><button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setForm(null)}>Batal</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{form.id ? "Simpan Perubahan" : "Buat User"}</button></div>
                    </form>
                </div>
            )}
        </div>
    );
}
