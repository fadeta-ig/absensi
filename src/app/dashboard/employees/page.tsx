"use client";

import { useEffect, useState } from "react";
import { Users, Plus, Search, Pencil, Trash2, X, Loader2 } from "lucide-react";

interface Employee {
    id: string; employeeId: string; name: string; email: string; phone: string;
    department: string; position: string; role: string; isActive: boolean; joinDate: string;
}

const INIT_FORM: { employeeId: string; name: string; email: string; phone: string; department: string; position: string; role: "employee" | "hr"; password: string; joinDate: string; totalLeave: number; usedLeave: number; isActive: boolean } = { employeeId: "", name: "", email: "", phone: "", department: "", position: "", role: "employee", password: "password123", joinDate: new Date().toISOString().split("T")[0], totalLeave: 12, usedLeave: 0, isActive: true };

export default function EmployeesPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [search, setSearch] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState(INIT_FORM);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch("/api/employees").then((r) => r.json()).then(setEmployees);
    }, []);

    const filtered = employees.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.employeeId.toLowerCase().includes(search.toLowerCase()) ||
        e.department.toLowerCase().includes(search.toLowerCase())
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const method = editId ? "PUT" : "POST";
        const body = editId ? { ...form, id: editId } : form;
        const res = await fetch("/api/employees", {
            method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (res.ok) {
            const data = await res.json();
            if (editId) setEmployees((prev) => prev.map((e) => (e.id === editId ? data : e)));
            else setEmployees((prev) => [...prev, data]);
            setShowForm(false);
            setEditId(null);
            setForm(INIT_FORM);
        }
        setLoading(false);
    };

    const handleEdit = (emp: Employee) => {
        setForm({ ...emp, password: "", totalLeave: 12, usedLeave: 0 } as typeof INIT_FORM);
        setEditId(emp.id);
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Yakin ingin menghapus karyawan ini?")) return;
        const res = await fetch(`/api/employees?id=${id}`, { method: "DELETE" });
        if (res.ok) setEmployees((prev) => prev.filter((e) => e.id !== id));
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Users className="w-5 h-5 text-[var(--primary)]" />
                        Manajemen Karyawan
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">{employees.length} karyawan terdaftar</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditId(null); setForm(INIT_FORM); }}>
                    <Plus className="w-4 h-4" /> Tambah Karyawan
                </button>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input type="text" className="form-input pl-10" placeholder="Cari karyawan..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Nama</th>
                                <th className="hidden md:table-cell">Departemen</th>
                                <th className="hidden lg:table-cell">Jabatan</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-8 text-sm text-[var(--text-muted)]">Tidak ada karyawan ditemukan</td></tr>
                            ) : (
                                filtered.map((e) => (
                                    <tr key={e.id}>
                                        <td className="font-mono text-xs">{e.employeeId}</td>
                                        <td className="font-medium text-[var(--text-primary)]">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">{e.name.charAt(0)}</div>
                                                <div>
                                                    <p>{e.name}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)] md:hidden">{e.department}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="hidden md:table-cell">{e.department}</td>
                                        <td className="hidden lg:table-cell">{e.position}</td>
                                        <td><span className={`badge ${e.isActive ? "badge-success" : "badge-error"}`}>{e.isActive ? "Aktif" : "Nonaktif"}</span></td>
                                        <td>
                                            <div className="flex items-center gap-1.5">
                                                <button onClick={() => handleEdit(e)} className="btn btn-ghost btn-sm !p-1.5"><Pencil className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => handleDelete(e.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editId ? "Edit Karyawan" : "Tambah Karyawan Baru"}</h2>
                            <button className="modal-close" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group !mb-0">
                                    <label className="form-label">ID Karyawan</label>
                                    <input className="form-input" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label">Nama Lengkap</label>
                                    <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group !mb-0">
                                    <label className="form-label">Email</label>
                                    <input type="email" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label">Telepon</label>
                                    <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group !mb-0">
                                    <label className="form-label">Departemen</label>
                                    <input className="form-input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label">Jabatan</label>
                                    <input className="form-input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} required />
                                </div>
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label">Role</label>
                                <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "employee" | "hr" })}>
                                    <option value="employee">Employee</option>
                                    <option value="hr">HR</option>
                                </select>
                            </div>
                            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {editId ? "Simpan Perubahan" : "Tambah Karyawan"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
