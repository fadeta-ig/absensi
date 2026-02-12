"use client";

import { useEffect, useState } from "react";
import styles from "./emp.module.css";

interface Employee {
    id: string;
    employeeId: string;
    name: string;
    email: string;
    phone: string;
    department: string;
    position: string;
    role: string;
    joinDate: string;
    totalLeave: number;
    usedLeave: number;
    isActive: boolean;
}

const defaultForm = {
    employeeId: "",
    name: "",
    email: "",
    phone: "",
    department: "",
    position: "",
    role: "employee" as const,
    joinDate: "",
    totalLeave: 12,
};

export default function EmployeesPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState(defaultForm);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        const res = await fetch("/api/employees");
        setEmployees(await res.json());
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (editId) {
            await fetch("/api/employees", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: editId, ...form }),
            });
        } else {
            await fetch("/api/employees", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
        }

        setShowModal(false);
        setEditId(null);
        setForm(defaultForm);
        setLoading(false);
        fetchEmployees();
    };

    const handleEdit = (emp: Employee) => {
        setEditId(emp.id);
        setForm({
            employeeId: emp.employeeId,
            name: emp.name,
            email: emp.email,
            phone: emp.phone,
            department: emp.department,
            position: emp.position,
            role: emp.role as "employee",
            joinDate: emp.joinDate,
            totalLeave: emp.totalLeave,
        });
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Yakin ingin menghapus karyawan ini?")) return;
        await fetch(`/api/employees?id=${id}`, { method: "DELETE" });
        fetchEmployees();
    };

    const filtered = employees.filter(
        (e) =>
            e.name.toLowerCase().includes(search.toLowerCase()) ||
            e.employeeId.toLowerCase().includes(search.toLowerCase()) ||
            e.department.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>👥 Manajemen Karyawan</h1>
                    <p className={styles.subtitle}>Kelola data karyawan perusahaan</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setEditId(null);
                        setForm(defaultForm);
                        setShowModal(true);
                    }}
                >
                    + Tambah Karyawan
                </button>
            </div>

            <div className={styles.searchWrap}>
                <input
                    className="form-input"
                    placeholder="🔍 Cari karyawan..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className={`glass-card ${styles.tableWrap}`}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Nama</th>
                            <th>Departemen</th>
                            <th>Posisi</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((emp) => (
                            <tr key={emp.id}>
                                <td><span className="badge badge-primary">{emp.employeeId}</span></td>
                                <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{emp.name}</td>
                                <td>{emp.department}</td>
                                <td>{emp.position}</td>
                                <td><span className={`badge badge-${emp.role === "hr" ? "warning" : "info"}`}>{emp.role.toUpperCase()}</span></td>
                                <td><span className={`badge badge-${emp.isActive ? "success" : "error"}`}>{emp.isActive ? "Aktif" : "Nonaktif"}</span></td>
                                <td>
                                    <div className={styles.actions}>
                                        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(emp)}>✏️</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(emp.id)}>🗑️</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length === 0 && (
                    <div className="empty-state">
                        <span className="empty-state-icon">👥</span>
                        <p className="empty-state-title">Tidak ada karyawan ditemukan</p>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editId ? "Edit Karyawan" : "Tambah Karyawan"}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">ID Karyawan</label>
                                    <input className="form-input" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Nama Lengkap</label>
                                    <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                                </div>
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Telepon</label>
                                    <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
                                </div>
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Departemen</label>
                                    <input className="form-input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Posisi</label>
                                    <input className="form-input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} required />
                                </div>
                            </div>
                            <div className="grid-2">
                                <div className="form-group">
                                    <label className="form-label">Role</label>
                                    <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "employee" })}>
                                        <option value="employee">Employee</option>
                                        <option value="hr">HR Admin</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Tanggal Bergabung</label>
                                    <input className="form-input" type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} required />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Jatah Cuti (hari/tahun)</label>
                                <input className="form-input" type="number" value={form.totalLeave} onChange={(e) => setForm({ ...form, totalLeave: Number(e.target.value) })} />
                            </div>
                            <button type="submit" className="btn btn-primary btn-lg w-full mt-md" disabled={loading}>
                                {loading ? "Menyimpan..." : editId ? "Update" : "Simpan"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
