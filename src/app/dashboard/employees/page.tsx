"use client";

import { useEffect, useState } from "react";
import { Users, Plus, Search, Pencil, Trash2, X, Loader2, Clock, Mail, Phone, Building, Briefcase, Calendar, Key, Layers } from "lucide-react";

interface WorkShift { id: string; name: string; startTime: string; endTime: string; isDefault: boolean; }
interface Employee {
    id: string; employeeId: string; name: string; email: string; phone: string;
    department: string; division?: string | null; position: string; role: string; isActive: boolean; joinDate: string; shiftId?: string;
    bypassLocation: boolean; locations?: { id: string; name: string }[];
}

interface Location { id: string; name: string; }

interface Department { id: string; name: string; }
interface Division { id: string; name: string; departmentId: string; department: { name: string } }
interface Position { id: string; name: string; }

export default function EmployeesPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [shifts, setShifts] = useState<WorkShift[]>([]);
    const [masterDepts, setMasterDepts] = useState<Department[]>([]);
    const [masterDivisions, setMasterDivisions] = useState<Division[]>([]);
    const [masterPositions, setMasterPositions] = useState<Position[]>([]);
    const [masterLocations, setMasterLocations] = useState<Location[]>([]);
    const [search, setSearch] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [sendingPassword, setSendingPassword] = useState<string | null>(null);
    const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [form, setForm] = useState({
        employeeId: "", name: "", email: "", phone: "", department: "", division: "", position: "",
        role: "employee" as "employee" | "hr", password: "password123", joinDate: new Date().toISOString().split("T")[0],
        totalLeave: 12, usedLeave: 0, isActive: true, shiftId: "",
        bypassLocation: false, locations: [] as { id: string; name: string }[],
    });

    useEffect(() => {
        fetch("/api/employees").then((r) => r.json()).then(setEmployees);
        fetch("/api/master/departments").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setMasterDepts(d); });
        fetch("/api/master/divisions").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setMasterDivisions(d); });
        fetch("/api/master/positions").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setMasterPositions(d); });
        fetch("/api/master/locations").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setMasterLocations(d); });
        fetch("/api/shifts").then((r) => r.json()).then((data: WorkShift[]) => {
            setShifts(data);
            const def = data.find((s: WorkShift) => s.isDefault);
            if (def) setForm((f) => ({ ...f, shiftId: f.shiftId || def.id }));
        });
    }, []);

    const filtered = employees.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.employeeId.toLowerCase().includes(search.toLowerCase()) ||
        e.department.toLowerCase().includes(search.toLowerCase()) ||
        (e.division && e.division.toLowerCase().includes(search.toLowerCase()))
    );

    const availableDivisions = masterDivisions.filter((v) => {
        if (!form.department) return false;
        return v.department.name === form.department;
    });

    const getShiftName = (sId?: string) => {
        if (!sId) return "-";
        const s = shifts.find((sh) => sh.id === sId);
        return s ? `${s.name} (${s.startTime}-${s.endTime})` : "-";
    };

    const resetForm = () => {
        const def = shifts.find((s) => s.isDefault);
        setForm({
            employeeId: "", name: "", email: "", phone: "", department: "", division: "", position: "",
            role: "employee", password: "password123", joinDate: new Date().toISOString().split("T")[0],
            totalLeave: 12, usedLeave: 0, isActive: true, shiftId: def?.id || "",
            bypassLocation: false, locations: [],
        });
        setEditId(null);
    };

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
            resetForm();
        }
        setLoading(false);
    };

    const handleEdit = (emp: Employee) => {
        setForm({
            ...emp,
            division: emp.division || "",
            password: "",
            totalLeave: 12,
            usedLeave: 0,
            shiftId: emp.shiftId || "",
            bypassLocation: emp.bypassLocation || false,
            locations: emp.locations || [],
        } as typeof form);
        setEditId(emp.id);
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Yakin ingin menghapus karyawan ini?")) return;
        const res = await fetch(`/api/employees?id=${id}`, { method: "DELETE" });
        if (res.ok) setEmployees((prev) => prev.filter((e) => e.id !== id));
    };

    const handleSendPassword = async (emp: Employee) => {
        if (!confirm(`Kirim password baru ke email ${emp.name}?`)) return;
        setSendingPassword(emp.id);
        setPasswordMsg(null);
        try {
            const res = await fetch("/api/auth/send-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId: emp.employeeId }),
            });
            const data = await res.json();
            if (res.ok) {
                setPasswordMsg({ type: "success", text: data.message });
            } else {
                setPasswordMsg({ type: "error", text: data.error || "Gagal mengirim password" });
            }
        } catch {
            setPasswordMsg({ type: "error", text: "Terjadi kesalahan koneksi" });
        }
        setSendingPassword(null);
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
                <button className="btn btn-primary" onClick={() => { setShowForm(true); resetForm(); }}>
                    <Plus className="w-4 h-4" /> Tambah Karyawan
                </button>
            </div>

            {/* Password Message */}
            {passwordMsg && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${passwordMsg.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {passwordMsg.text}
                    <button onClick={() => setPasswordMsg(null)} className="ml-auto text-current opacity-60 hover:opacity-100">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input type="text" className="form-input pl-10" placeholder="Cari nama, ID, departemen, atau divisi..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Nama</th>
                                <th className="hidden md:table-cell">Dept / Divisi</th>
                                <th>Jabatan</th>
                                <th className="hidden lg:table-cell">Lokasi</th>
                                <th className="hidden lg:table-cell">Jam Kerja</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-8 text-sm text-[var(--text-muted)]">Tidak ada karyawan ditemukan</td></tr>
                            ) : (
                                filtered.map((e) => (
                                    <tr key={e.id}>
                                        <td className="font-mono text-xs">{e.employeeId}</td>
                                        <td className="font-medium text-[var(--text-primary)]">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">{e.name.charAt(0)}</div>
                                                <div>
                                                    <p>{e.name}</p>
                                                    <p className="text-[10px] text-[var(--text-muted)] md:hidden">{e.department} {e.division ? `/ ${e.division}` : ""}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="hidden md:table-cell">
                                            <div className="text-sm">{e.department}</div>
                                            {e.division && <div className="text-[10px] text-[var(--text-muted)]">{e.division}</div>}
                                        </td>
                                        <td className="hidden lg:table-cell">{e.position}</td>
                                        <td className="hidden lg:table-cell">
                                            {e.bypassLocation ? (
                                                <span className="text-[10px] text-blue-600 font-medium">Bypass</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {e.locations && e.locations.length > 0 ? (
                                                        e.locations.map(l => (
                                                            <span key={l.id} className="text-[10px] px-1.5 py-0.5 bg-[var(--secondary)] rounded text-[var(--text-secondary)]">
                                                                {l.name}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-[10px] text-red-500 font-medium">Belum diset</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="hidden lg:table-cell text-xs">{getShiftName(e.shiftId)}</td>
                                        <td><span className={`badge ${e.isActive ? "badge-success" : "badge-error"}`}>{e.isActive ? "Aktif" : "Nonaktif"}</span></td>
                                        <td>
                                            <div className="flex items-center gap-1.5">
                                                {e.role === "employee" && e.isActive && (
                                                    <button
                                                        onClick={() => handleSendPassword(e)}
                                                        className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:!bg-blue-50"
                                                        disabled={sendingPassword === e.id}
                                                        title="Kirim Password via Email"
                                                    >
                                                        {sendingPassword === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                                                    </button>
                                                )}
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
                    <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editId ? "Edit Karyawan" : "Tambah Karyawan Baru"}</h2>
                            <button className="modal-close" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Employee ID & Name */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group !mb-0">
                                    <label className="form-label"><span className="flex items-center gap-1"><Users className="w-3 h-3" /> ID Karyawan</span></label>
                                    <input className="form-input" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="WIG003" required />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label">Nama Lengkap</label>
                                    <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                                </div>
                            </div>
                            {/* Email & Phone */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group !mb-0">
                                    <label className="form-label"><span className="flex items-center gap-1"><Mail className="w-3 h-3" /> Email</span></label>
                                    <input type="email" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label"><span className="flex items-center gap-1"><Phone className="w-3 h-3" /> Telepon</span></label>
                                    <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
                                </div>
                            </div>
                            {/* Department & Division */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group !mb-0">
                                    <label className="form-label"><span className="flex items-center gap-1"><Building className="w-3 h-3" /> Departemen</span></label>
                                    <select className="form-select" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value, division: "" })} required>
                                        <option value="">Pilih Departemen</option>
                                        {masterDepts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label"><span className="flex items-center gap-1"><Layers className="w-3 h-3" /> Divisi</span></label>
                                    <select className="form-select" value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} required disabled={!form.department}>
                                        <option value="">Pilih Divisi</option>
                                        {availableDivisions.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            {/* Position & Role */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group !mb-0">
                                    <label className="form-label"><span className="flex items-center gap-1"><Briefcase className="w-3 h-3" /> Jabatan</span></label>
                                    <select className="form-select" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} required>
                                        <option value="">Pilih Jabatan</option>
                                        {masterPositions.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label">Role</label>
                                    <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "employee" | "hr" })}>
                                        <option value="employee">Employee</option>
                                        <option value="hr">HR</option>
                                    </select>
                                </div>
                            </div>
                            {/* Shift & Join Date */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group !mb-0">
                                    <label className="form-label"><span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Jam Kerja</span></label>
                                    <select className="form-select" value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })} required>
                                        <option value="">Pilih Shift</option>
                                        {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</option>)}
                                    </select>
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label"><span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Tanggal Bergabung</span></label>
                                    <input type="date" className="form-input" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} required />
                                </div>
                            </div>
                            {/* Leave */}
                            <div className="form-group !mb-0">
                                <label className="form-label">Jatah Cuti / Tahun</label>
                                <input type="number" className="form-input" value={form.totalLeave} onChange={(e) => setForm({ ...form, totalLeave: Number(e.target.value) })} min={0} />
                            </div>

                            {/* Location Settings */}
                            <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-semibold text-[var(--text-primary)]">Pengaturan Lokasi Absensi</label>
                                    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={form.bypassLocation}
                                            onChange={(e) => setForm({ ...form, bypassLocation: e.target.checked })}
                                            className="w-3.5 h-3.5 accent-blue-600"
                                        />
                                        Bypass Lokasi
                                    </label>
                                </div>

                                {!form.bypassLocation && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] text-[var(--text-muted)]">Pilih satu atau beberapa lokasi di bawah ini agar karyawan bisa melakukan absensi.</p>
                                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-1">
                                            {masterLocations.map((loc) => (
                                                <label key={loc.id} className="flex items-center gap-2 p-2 bg-white rounded border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={form.locations.some(l => l.id === loc.id)}
                                                        onChange={(e) => {
                                                            const newLocs = e.target.checked
                                                                ? [...form.locations, { id: loc.id, name: loc.name }]
                                                                : form.locations.filter(l => l.id !== loc.id);
                                                            setForm({ ...form, locations: newLocs });
                                                        }}
                                                        className="w-3.5 h-3.5 accent-[var(--primary)]"
                                                    />
                                                    <span className="text-xs truncate">{loc.name}</span>
                                                </label>
                                            ))}
                                            {masterLocations.length === 0 && (
                                                <div className="col-span-2 text-center py-2 text-[10px] text-red-500 font-medium">
                                                    Belum ada data lokasi. Tambahkan di Master Data.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Active status */}
                            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 accent-[var(--primary)]" />
                                Karyawan aktif
                            </label>

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
