"use client";

import { useEffect, useState } from "react";
import {
    Database, Plus, Pencil, Trash2, X, Loader2,
    Building2, Briefcase, ChevronRight, AlertCircle, Check, Layers, MapPin, Target, Search
} from "lucide-react";
import dynamic from "next/dynamic";

// Dynamic import for the Map component to avoid SSR issues
const LocationMap = dynamic(() => import("@/components/LocationMap"), {
    ssr: false,
    loading: () => <div className="h-[250px] bg-slate-50 animate-pulse rounded-lg flex items-center justify-center text-xs text-slate-400">Memuat peta...</div>
});

const defaultCenter: [number, number] = [-6.200000, 106.816666];

interface Department {
    id: string;
    name: string;
    code: string | null;
    description: string | null;
    isActive: boolean;
    _count?: { divisions: number };
}

interface Division {
    id: string;
    name: string;
    departmentId: string;
    isActive: boolean;
    department: { name: string };
}

interface Position {
    id: string;
    name: string;
    isActive: boolean;
}

interface Location {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
    isActive: boolean;
}

type Tab = "departments" | "divisions" | "positions" | "locations";

export default function MasterDataPage() {
    const [tab, setTab] = useState<Tab>("departments");
    const [departments, setDepartments] = useState<Department[]>([]);
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Form states
    const [deptForm, setDeptForm] = useState({ id: "", name: "", code: "", description: "", isActive: true });
    const [divForm, setDivForm] = useState({ id: "", name: "", departmentId: "", isActive: true });
    const [posForm, setPosForm] = useState({ id: "", name: "", isActive: true });
    const [locForm, setLocForm] = useState({ id: "", name: "", latitude: "", longitude: "", radius: "100", isActive: true });
    const [searchQuery, setSearchQuery] = useState("");
    const [searchLoading, setSearchLoading] = useState(false);

    const handleDetectLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setLocForm(prev => ({
                        ...prev,
                        latitude: latitude.toString(),
                        longitude: longitude.toString()
                    }));
                },
                () => alert("Gagal mendapatkan lokasi. Pastikan GPS aktif dan izin diberikan.")
            );
        }
    };

    const handleSearchLocation = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!searchQuery.trim()) return;
        setSearchLoading(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                setLocForm(prev => ({
                    ...prev,
                    latitude: lat,
                    longitude: lon
                }));
            } else {
                alert("Lokasi tidak ditemukan");
            }
        } catch (err) {
            console.error(err);
            alert("Terjadi kesalahan saat mencari lokasi");
        } finally {
            setSearchLoading(false);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [deptsRes, divRes, posRes, locRes] = await Promise.all([
                fetch("/api/master/departments"),
                fetch("/api/master/divisions"),
                fetch("/api/master/positions"),
                fetch("/api/master/locations")
            ]);
            if (deptsRes.ok) setDepartments(await deptsRes.json());
            if (divRes.ok) setDivisions(await divRes.json());
            if (posRes.ok) setPositions(await posRes.json());
            if (locRes.ok) setLocations(await locRes.json());
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
        setDivForm({ id: "", name: "", departmentId: "", isActive: true });
        setPosForm({ id: "", name: "", isActive: true });
        setLocForm({ id: "", name: "", latitude: "", longitude: "", radius: "100", isActive: true });
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

    const handleEditDiv = (div: Division) => {
        setDivForm({
            id: div.id,
            name: div.name,
            departmentId: div.departmentId,
            isActive: div.isActive
        });
        setEditMode(true);
        setShowModal(true);
    };

    const handleEditPos = (pos: Position) => {
        setPosForm({
            id: pos.id,
            name: pos.name,
            isActive: pos.isActive
        });
        setEditMode(true);
        setShowModal(true);
    };

    const handleEditLoc = (loc: Location) => {
        setLocForm({
            id: loc.id,
            name: loc.name,
            latitude: loc.latitude.toString(),
            longitude: loc.longitude.toString(),
            radius: loc.radius.toString(),
            isActive: loc.isActive
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

    const handleSubmitDiv = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsg(null);
        try {
            const res = await fetch("/api/master/divisions", {
                method: editMode ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(divForm)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: "success", text: `Divisi berhasil ${editMode ? "diperbarui" : "ditambahkan"}` });
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

    const handleSubmitLoc = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsg(null);
        try {
            const res = await fetch("/api/master/locations", {
                method: editMode ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(locForm)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: "success", text: `Lokasi berhasil ${editMode ? "diperbarui" : "ditambahkan"}` });
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
        if (!confirm("Hapus departemen ini? Ini tidak bisa dihapus jika masih ada divisi didalamnya.")) return;
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

    const handleDeleteDiv = async (id: string) => {
        if (!confirm("Hapus divisi ini?")) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/master/divisions?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchData();
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

    const handleDeleteLoc = async (id: string) => {
        if (!confirm("Hapus lokasi ini?")) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/master/locations?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchData();
            }
        } catch {
            alert("Gagal menghapus data");
        } finally {
            setLoading(false);
        }
    };

    const getTabName = () => {
        if (tab === "departments") return "Departemen";
        if (tab === "divisions") return "Divisi";
        if (tab === "positions") return "Jabatan";
        return "Lokasi";
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Database className="w-5 h-5 text-[var(--primary)]" />
                        Master Data
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Kelola departemen, divisi, dan struktur jabatan organisasi</p>
                </div>
                <button onClick={handleAdd} className="btn btn-primary">
                    <Plus className="w-4 h-4" /> Tambah {getTabName()}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)] overflow-x-auto no-scrollbar">
                <button
                    onClick={() => setTab("departments")}
                    className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${tab === "departments" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
                >
                    <Building2 className="w-4 h-4" /> Departemen
                </button>
                <button
                    onClick={() => setTab("divisions")}
                    className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${tab === "divisions" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
                >
                    <Layers className="w-4 h-4" /> Divisi
                </button>
                <button
                    onClick={() => setTab("positions")}
                    className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${tab === "positions" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
                >
                    <Briefcase className="w-4 h-4" /> Jabatan
                </button>
                <button
                    onClick={() => setTab("locations")}
                    className={`px-6 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${tab === "locations" ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
                >
                    <MapPin className="w-4 h-4" /> Lokasi
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
                                    <th>Divisi</th>
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
                                                    {dept._count?.divisions || 0} Divisi
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

            {!loading && tab === "divisions" && (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Nama Divisi</th>
                                    <th>Departemen</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {divisions.length === 0 ? (
                                    <tr><td colSpan={4} className="text-center py-12 text-[var(--text-muted)]">Belum ada data divisi</td></tr>
                                ) : (
                                    divisions.map((div) => (
                                        <tr key={div.id}>
                                            <td>
                                                <div className="font-semibold text-[var(--text-primary)]">{div.name}</div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                                                    <Building2 className="w-3.5 h-3.5 opacity-50" />
                                                    {div.department.name}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`badge ${div.isActive ? "badge-success" : "badge-error"}`}>
                                                    {div.isActive ? "Aktif" : "Non-aktif"}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => handleEditDiv(div)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:bg-blue-50">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDeleteDiv(div.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:bg-red-50">
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
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {positions.length === 0 ? (
                                    <tr><td colSpan={3} className="text-center py-12 text-[var(--text-muted)]">Belum ada data jabatan</td></tr>
                                ) : (
                                    positions.map((pos) => (
                                        <tr key={pos.id}>
                                            <td>
                                                <div className="font-semibold text-[var(--text-primary)]">{pos.name}</div>
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

            {!loading && tab === "locations" && (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Nama Lokasi</th>
                                    <th>Koordinat</th>
                                    <th>Radius</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {locations.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-12 text-[var(--text-muted)]">Belum ada data lokasi</td></tr>
                                ) : (
                                    locations.map((loc) => (
                                        <tr key={loc.id}>
                                            <td>
                                                <div className="font-semibold text-[var(--text-primary)]">{loc.name}</div>
                                            </td>
                                            <td>
                                                <div className="text-xs font-mono text-[var(--text-secondary)]">
                                                    {loc.latitude}, {loc.longitude}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="text-xs px-2 py-0.5 bg-[var(--secondary)] rounded-full font-medium">
                                                    {loc.radius}m
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge ${loc.isActive ? "badge-success" : "badge-error"}`}>
                                                    {loc.isActive ? "Aktif" : "Non-aktif"}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => handleEditLoc(loc)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:bg-blue-50">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDeleteLoc(loc.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600 hover:bg-red-50">
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
                                {editMode ? "Edit" : "Tambah"} {getTabName()}
                            </h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X className="w-4 h-4" /></button>
                        </div>

                        <form onSubmit={tab === "departments" ? handleSubmitDept : tab === "divisions" ? handleSubmitDiv : tab === "positions" ? handleSubmitPos : handleSubmitLoc} className="space-y-4">
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
                            ) : tab === "divisions" ? (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Nama Divisi</label>
                                        <input
                                            className="form-input"
                                            placeholder="Contoh: HRGA-IT"
                                            value={divForm.name}
                                            onChange={(e) => setDivForm({ ...divForm, name: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Departemen</label>
                                        <select
                                            className="form-select"
                                            value={divForm.departmentId}
                                            onChange={(e) => setDivForm({ ...divForm, departmentId: e.target.value })}
                                            required
                                        >
                                            <option value="">Pilih Departemen</option>
                                            {departments.map((d) => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select
                                            className="form-select"
                                            value={divForm.isActive ? "1" : "0"}
                                            onChange={(e) => setDivForm({ ...divForm, isActive: e.target.value === "1" })}
                                        >
                                            <option value="1">Aktif</option>
                                            <option value="0">Non-aktif</option>
                                        </select>
                                    </div>
                                </>
                            ) : tab === "positions" ? (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Nama Jabatan</label>
                                        <input
                                            className="form-input"
                                            placeholder="Contoh: Staff"
                                            value={posForm.name}
                                            onChange={(e) => setPosForm({ ...posForm, name: e.target.value })}
                                            required
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
                                </>
                            ) : (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Nama Lokasi</label>
                                        <input
                                            className="form-input"
                                            placeholder="Contoh: Kantor Pusat"
                                            value={locForm.name}
                                            onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                                            required
                                        />
                                    </div>

                                    {/* OpenStreetMap Integration */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-semibold text-[var(--text-secondary)]">Pilih di Peta</label>
                                            <button
                                                type="button"
                                                onClick={handleDetectLocation}
                                                className="text-[10px] flex items-center gap-1 text-[var(--primary)] hover:underline font-medium"
                                            >
                                                <Target className="w-3 h-3" /> Dapatkan Lokasi Saya
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                                                <input
                                                    type="text"
                                                    placeholder="Cari alamat atau tempat..."
                                                    className="form-input !pl-8 !py-1.5 !text-xs w-full"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            handleSearchLocation();
                                                        }
                                                    }}
                                                />
                                                {searchLoading && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-[var(--primary)]" />}
                                            </div>

                                            <div className="border border-[var(--border)] rounded-lg overflow-hidden relative h-[250px]">
                                                <LocationMap
                                                    center={locForm.latitude && locForm.longitude ? [parseFloat(locForm.latitude), parseFloat(locForm.longitude)] : defaultCenter}
                                                    zoom={15}
                                                    markerPosition={locForm.latitude && locForm.longitude ? [parseFloat(locForm.latitude), parseFloat(locForm.longitude)] : undefined}
                                                    onMapClick={(lat, lng) => setLocForm(prev => ({ ...prev, latitude: lat.toString(), longitude: lng.toString() }))}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="form-group">
                                            <label className="form-label">Latitude</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-input font-mono text-sm"
                                                placeholder="-6.200000"
                                                value={locForm.latitude}
                                                onChange={(e) => setLocForm({ ...locForm, latitude: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Longitude</label>
                                            <input
                                                type="number"
                                                step="any"
                                                className="form-input font-mono text-sm"
                                                placeholder="106.816666"
                                                value={locForm.longitude}
                                                onChange={(e) => setLocForm({ ...locForm, longitude: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="form-group">
                                            <label className="form-label">Radius (Meter)</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={locForm.radius}
                                                onChange={(e) => setLocForm({ ...locForm, radius: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Status</label>
                                            <select
                                                className="form-select"
                                                value={locForm.isActive ? "1" : "0"}
                                                onChange={(e) => setLocForm({ ...locForm, isActive: e.target.value === "1" })}
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
