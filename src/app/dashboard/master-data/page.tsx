"use client";

import { useEffect, useState } from "react";
import {
    Database, Plus, Pencil, Trash2, X, Loader2,
    Building2, Briefcase, ChevronRight, AlertCircle, Check
} from "lucide-react";

interface Department {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    isActive: boolean;
    _count?: { positions: number };
}

interface Position {
    id: string;
    name: string;
    departmentId: string;
    level: number;
    isActive: boolean;
    department: { name: string };
}

type Tab = "departments" | "positions";

export default function MasterDataPage() {
    const [tab, setTab] = useState<Tab>("departments");
    const [departments, setDepartments] = useState<Department[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Form states
    const [deptForm, setDeptForm] = useState({ id: "", name: "", code: "", description: "", isActive: true });
    const [posForm, setPosForm] = useState({ id: "", name: "", departmentId: "", level: 1, isActive: true });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [deptsRes, posRes] = await Promise.all([
                fetch("/api/master/departments"),
                fetch("/api/master/positions")
            ]);
            if (deptsRes.ok) setDepartments(await deptsRes.json());
            if (posRes.ok) setPositions(await posRes.json());
        } catch (error) {
            console.error("Failed to fetch master data", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const resetForms = () => {
        setDeptForm({ id: "", name: "", code: "", description: "", isActive: true });
        setPosForm({ id: "", name: "", departmentId: "", level: 1, isActive: true });
        setEditMode(false);
        setMsg(null);
    };

    const handleAdd = () => {
        resetForms();
        setShowModal(true);
    };

    const handleEditDept = (dept: Department) => {
        setDeptForm({
            id: dept.id,
            name: dept.name,
            code: dept.code || "",
            description: dept.description || "",
            isActive: dept.isActive
        });
        setEditMode(true);
        setShowModal(true);
    };

    const handleEditPos = (pos: Position) => {
        setPosForm({
            id: pos.id,
            name: pos.name,
            departmentId: pos.departmentId,
            level: pos.level,
            isActive: pos.isActive
        });
        setEditMode(true);
        setShowModal(true);
    };

    const handleSubmitDept = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsg(null);
        try {
            const res = await fetch("/api/master/departments", {
                method: editMode ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(deptForm)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: "success", text: `Departemen berhasil ${editMode ? "diperbarui" : "ditambahkan"}` });
                fetchData();
                setTimeout(() => setShowModal(false), 1000);
            } else {
                setMsg({ type: "error", text: data.error || "Gagal menyimpan data" });
            }
        } catch {
            setMsg({ type: "error", text: "Terjadi kesalahan server" });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitPos = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsg(null);
        try {
            const res = await fetch("/api/master/positions", {
                method: editMode ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(posForm)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: "success", text: `Jabatan berhasil ${editMode ? "diperbarui" : "ditambahkan"}` });
                fetchData();
                setTimeout(() => setShowModal(false), 1000);
            } else {
                setMsg({ type: "error", text: data.error || "Gagal menyimpan data" });
            }
        } catch {
            setMsg({ type: "error", text: "Terjadi kesalahan server" });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteDept = async (id: string) => {
        if (!confirm("Hapus departemen ini? Ini tidak bisa dihapus jika masih ada jabatan didalamnya.")) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/master/departments?id=${id}`, { method: "DELETE" });
            const data = await res.json();
            if (res.ok) {
                fetchData();
            } else {
                alert(data.error);
            }
        } catch {
            alert("Gagal menghapus data");
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePos = async (id: string) => {
        if (!confirm("Hapus jabatan ini?")) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/master/positions?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchData();
            }
        } catch {
            alert("Gagal menghapus data");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Database className="w-5 h-5 text-[var(--primary)]" />
                        Master Data
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Kelola departemen dan struktur jabatan organisasi</p>
                </div>
                <button onClick={handleAdd} className="btn btn-primary">
                    <Plus className="w-4 h-4" /> Tambah {tab === "departments" ? "Departemen" : "Jabatan"}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)]">
                <button
                    onClick={() => setTab("departments")}
                    className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${tab === "departments" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
                >
                    <Building2 className="w-4 h-4" /> Departemen
                </button>
                <button
                    onClick={() => setTab("positions")}
                    className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${tab === "positions" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
                >
                    <Briefcase className="w-4 h-4" /> Jabatan
                </button>
            </div>

            {loading && !showModal && (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)] opacity-50" />
                </div>
            )}

            {!loading && tab === "departments" && (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Kode</th>
                                    <th>Nama Departemen</th>
                                    <th>Jabatan</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {departments.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-12 text-[var(--text-muted)]">Belum ada data departemen</td></tr>
                                ) : (
                                    departments.map((dept) => (
                                        <tr key={dept.id}>
                                            <td className="font-mono text-xs font-bold text-[var(--primary)]">{dept.code || "-"}</td>
                                            <td>
                                                <div className="font-semibold text-[var(--text-primary)]">{dept.name}</div>
                                                <div className="text-[10px] text-[var(--text-muted)] line-clamp-1">{dept.description}</div>
                                            </td>
                                            <td>
                                                <span className="text-xs px-2 py-0.5 bg-[var(--secondary)] rounded-full font-medium">
                                                    {dept._count?.positions || 0} Jabatan
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge ${dept.isActive ? "badge-success" : "badge-error"}`}>
                                                    {dept.isActive ? "Aktif" : "Non-aktif"}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => handleEditDept(dept)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:bg-blue-50">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDeleteDept(dept.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:bg-red-50">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!loading && tab === "positions" && (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Nama Jabatan</th>
                                    <th>Departemen</th>
                                    <th>Level</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {positions.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-12 text-[var(--text-muted)]">Belum ada data jabatan</td></tr>
                                ) : (
                                    positions.map((pos) => (
                                        <tr key={pos.id}>
                                            <td>
                                                <div className="font-semibold text-[var(--text-primary)]">{pos.name}</div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                                                    <Building2 className="w-3.5 h-3.5 opacity-50" />
                                                    {pos.department.name}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="text-xs font-mono">Level {pos.level}</span>
                                            </td>
                                            <td>
                                                <span className={`badge ${pos.isActive ? "badge-success" : "badge-error"}`}>
                                                    {pos.isActive ? "Aktif" : "Non-aktif"}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => handleEditPos(pos)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:bg-blue-50">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDeletePos(pos.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:bg-red-50">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">
                                {editMode ? "Edit" : "Tambah"} {tab === "departments" ? "Departemen" : "Jabatan"}
                            </h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X className="w-4 h-4" /></button>
                        </div>

                        <form onSubmit={tab === "departments" ? handleSubmitDept : handleSubmitPos} className="space-y-4">
                            {msg && (
                                <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                                    {msg.type === "success" ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                    {msg.text}
                                </div>
                            )}

                            {tab === "departments" ? (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Nama Departemen</label>
                                        <input
                                            className="form-input"
                                            placeholder="Contoh: Engineering"
                                            value={deptForm.name}
                                            onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="form-group">
                                            <label className="form-label">Kode (Opsional)</label>
                                            <input
                                                className="form-input"
                                                placeholder="ENG"
                                                value={deptForm.code}
                                                onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Status</label>
                                            <select
                                                className="form-select"
                                                value={deptForm.isActive ? "1" : "0"}
                                                onChange={(e) => setDeptForm({ ...deptForm, isActive: e.target.value === "1" })}
                                            >
                                                <option value="1">Aktif</option>
                                                <option value="0">Non-aktif</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Deskripsi</label>
                                        <textarea
                                            className="form-textarea"
                                            rows={3}
                                            placeholder="Deskripsi singkat..."
                                            value={deptForm.description}
                                            onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Nama Jabatan</label>
                                        <input
                                            className="form-input"
                                            placeholder="Contoh: Senior Developer"
                                            value={posForm.name}
                                            onChange={(e) => setPosForm({ ...posForm, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Departemen</label>
                                        <select
                                            className="form-select"
                                            value={posForm.departmentId}
                                            onChange={(e) => setPosForm({ ...posForm, departmentId: e.target.value })}
                                            required
                                        >
                                            <option value="">Pilih Departemen</option>
                                            {departments.map((d) => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="form-group">
                                            <label className="form-label">Level Hirarki</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={posForm.level}
                                                onChange={(e) => setPosForm({ ...posForm, level: Number(e.target.value) })}
                                                min={1}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Status</label>
                                            <select
                                                className="form-select"
                                                value={posForm.isActive ? "1" : "0"}
                                                onChange={(e) => setPosForm({ ...posForm, isActive: e.target.value === "1" })}
                                            >
                                                <option value="1">Aktif</option>
                                                <option value="0">Non-aktif</option>
                                            </select>
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-[var(--border)]">
                                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" disabled={loading}>Batal</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    Simpan Perubahan
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
