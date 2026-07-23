"use client";

import { useEffect, useState } from "react";
import {
    Database, Plus, X, Loader2,
    Building2, Briefcase, AlertCircle, Check, Layers, MapPin, Target, Search
} from "lucide-react";
import dynamic from "next/dynamic";
import { useConfirm } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

// Dynamic import for the Map component to avoid SSR issues
const LocationMap = dynamic(() => import("@/components/LocationMap"), {
    ssr: false,
    loading: () => <div className="h-[250px] bg-[var(--secondary)] animate-pulse rounded-lg flex items-center justify-center text-xs text-[var(--text-muted)]">Memuat peta...</div>
});

const defaultCenter: [number, number] = [-6.200000, 106.816666];

import { DepartmentTab } from "./components/DepartmentTab";
import { DivisionTab } from "./components/DivisionTab";
import { PositionTab } from "./components/PositionTab";
import { LocationTab } from "./components/LocationTab";
import { Department, Division, Position, Location, Tab } from "./types";

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
    const [deptForm, setDeptForm] = useState({ id: "", name: "", code: "", description: "", divisionId: "", isActive: true });
    const [divForm, setDivForm] = useState({ id: "", name: "", isActive: true });
    const [posForm, setPosForm] = useState({ id: "", name: "", isActive: true });
    const [locForm, setLocForm] = useState({ id: "", name: "", latitude: "", longitude: "", radius: "100", isActive: true });
    const [searchQuery, setSearchQuery] = useState("");
    const [searchLoading, setSearchLoading] = useState(false);

    const confirm = useConfirm();
    const toast = useToast();

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
                () => toast("Gagal mendapatkan lokasi. Pastikan GPS aktif dan izin diberikan.", "error")
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
                toast("Lokasi tidak ditemukan", "warning");
            }
        } catch (err) {
            reportClientError("MasterDataPage", "Gagal mencari lokasi", err, { searchQuery });
            toast("Lokasi belum berhasil dicari. Periksa kata kunci atau koneksi lalu coba lagi.", "error");
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
            const failedResponse = [deptsRes, divRes, posRes, locRes].find((res) => !res.ok);
            if (failedResponse) throw new Error(await getResponseErrorMessage(failedResponse, "Gagal memuat master data."));
            if (deptsRes.ok) setDepartments(await deptsRes.json());
            if (divRes.ok) setDivisions(await divRes.json());
            if (posRes.ok) setPositions(await posRes.json());
            if (locRes.ok) setLocations(await locRes.json());
        } catch (error) {
            reportClientError("MasterDataPage", "Gagal memuat master data", error);
            toast(error instanceof Error ? error.message : "Gagal memuat master data.", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const resetForms = () => {
        setDeptForm({ id: "", name: "", code: "", description: "", divisionId: "", isActive: true });
        setDivForm({ id: "", name: "", isActive: true });
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
            divisionId: dept.divisionId,
            isActive: dept.isActive
        });
        setEditMode(true);
        setShowModal(true);
    };

    const handleEditDiv = (div: Division) => {
        setDivForm({
            id: div.id,
            name: div.name,
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
            if (res.ok) {
                setMsg({ type: "success", text: `Departemen berhasil ${editMode ? "diperbarui" : "ditambahkan"}` });
                fetchData();
                setTimeout(() => setShowModal(false), 1000);
            } else {
                setMsg({ type: "error", text: await getResponseErrorMessage(res, "Gagal menyimpan departemen.") });
            }
        } catch (error) {
            reportClientError("MasterDataPage", "Gagal menyimpan departemen", error, { editMode, id: deptForm.id });
            setMsg({ type: "error", text: "Departemen belum tersimpan karena server tidak merespons. Coba lagi beberapa saat lagi." });
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
            if (res.ok) {
                setMsg({ type: "success", text: `Divisi berhasil ${editMode ? "diperbarui" : "ditambahkan"}` });
                fetchData();
                setTimeout(() => setShowModal(false), 1000);
            } else {
                setMsg({ type: "error", text: await getResponseErrorMessage(res, "Gagal menyimpan divisi.") });
            }
        } catch (error) {
            reportClientError("MasterDataPage", "Gagal menyimpan divisi", error, { editMode, id: divForm.id });
            setMsg({ type: "error", text: "Divisi belum tersimpan karena server tidak merespons. Coba lagi beberapa saat lagi." });
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
            if (res.ok) {
                setMsg({ type: "success", text: `Jabatan berhasil ${editMode ? "diperbarui" : "ditambahkan"}` });
                fetchData();
                setTimeout(() => setShowModal(false), 1000);
            } else {
                setMsg({ type: "error", text: await getResponseErrorMessage(res, "Gagal menyimpan jabatan.") });
            }
        } catch (error) {
            reportClientError("MasterDataPage", "Gagal menyimpan jabatan", error, { editMode, id: posForm.id });
            setMsg({ type: "error", text: "Jabatan belum tersimpan karena server tidak merespons. Coba lagi beberapa saat lagi." });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitLoc = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsg(null);
        try {
            const payload = {
                ...locForm,
                latitude:  parseFloat(locForm.latitude),
                longitude: parseFloat(locForm.longitude),
                radius:    parseInt(locForm.radius, 10),
            };
            const res = await fetch("/api/master/locations", {
                method: editMode ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                setMsg({ type: "success", text: `Lokasi berhasil ${editMode ? "diperbarui" : "ditambahkan"}` });
                fetchData();
                setTimeout(() => setShowModal(false), 1000);
            } else {
                setMsg({ type: "error", text: await getResponseErrorMessage(res, "Gagal menyimpan lokasi kerja.") });
            }
        } catch (error) {
            reportClientError("MasterDataPage", "Gagal menyimpan lokasi kerja", error, { editMode, id: locForm.id });
            setMsg({ type: "error", text: "Lokasi kerja belum tersimpan karena server tidak merespons. Coba lagi beberapa saat lagi." });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteDept = async (id: string) => {
        confirm({
            title: "Hapus Departemen",
            message: "Hapus departemen ini?",
            variant: "danger",
            confirmLabel: "Ya, Hapus",
            onConfirm: async () => {
                setLoading(true);
                try {
                    const res = await fetch(`/api/master/departments?id=${id}`, { method: "DELETE" });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus departemen."));
                    await fetchData();
                    toast("Departemen berhasil dihapus.", "success");
                } catch (error) {
                    reportClientError("MasterDataPage", "Gagal menghapus departemen", error, { id });
                    toast(error instanceof Error ? error.message : "Gagal menghapus departemen.", "error");
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    const handleDeleteDiv = async (id: string) => {
        confirm({
            title: "Hapus Divisi",
            message: "Hapus divisi ini? Tidak bisa dihapus jika masih ada departemen di dalamnya.",
            variant: "danger",
            confirmLabel: "Ya, Hapus",
            onConfirm: async () => {
                setLoading(true);
                try {
                    const res = await fetch(`/api/master/divisions?id=${id}`, { method: "DELETE" });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus divisi."));
                    await fetchData();
                    toast("Divisi berhasil dihapus.", "success");
                } catch (error) {
                    reportClientError("MasterDataPage", "Gagal menghapus divisi", error, { id });
                    toast(error instanceof Error ? error.message : "Gagal menghapus divisi.", "error");
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    const handleDeletePos = async (id: string) => {
        confirm({
            title: "Hapus Jabatan",
            message: "Hapus jabatan ini?",
            variant: "danger",
            confirmLabel: "Ya, Hapus",
            onConfirm: async () => {
                setLoading(true);
                try {
                    const res = await fetch(`/api/master/positions?id=${id}`, { method: "DELETE" });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus jabatan."));
                    await fetchData();
                    toast("Jabatan berhasil dihapus.", "success");
                } catch (error) {
                    reportClientError("MasterDataPage", "Gagal menghapus jabatan", error, { id });
                    toast(error instanceof Error ? error.message : "Gagal menghapus jabatan.", "error");
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    const handleDeleteLoc = async (id: string) => {
        confirm({
            title: "Hapus Lokasi",
            message: "Hapus lokasi ini?",
            variant: "danger",
            confirmLabel: "Ya, Hapus",
            onConfirm: async () => {
                setLoading(true);
                try {
                    const res = await fetch(`/api/master/locations?id=${id}`, { method: "DELETE" });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus lokasi."));
                    await fetchData();
                    toast("Lokasi berhasil dihapus.", "success");
                } catch (error) {
                    reportClientError("MasterDataPage", "Gagal menghapus lokasi", error, { id });
                    toast(error instanceof Error ? error.message : "Gagal menghapus lokasi.", "error");
                } finally {
                    setLoading(false);
                }
            },
        });
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
                <DepartmentTab departments={departments} onEdit={handleEditDept} onDelete={handleDeleteDept} />
            )}

            {!loading && tab === "divisions" && (
                <DivisionTab divisions={divisions} onEdit={handleEditDiv} onDelete={handleDeleteDiv} />
            )}

            {!loading && tab === "positions" && (
                <PositionTab positions={positions} onEdit={handleEditPos} onDelete={handleDeletePos} />
            )}

            {!loading && tab === "locations" && (
                <LocationTab locations={locations} onEdit={handleEditLoc} onDelete={handleDeleteLoc} />
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
                                            <label className="form-label">Divisi</label>
                                            <select
                                                className="form-select"
                                                value={deptForm.divisionId}
                                                onChange={(e) => setDeptForm({ ...deptForm, divisionId: e.target.value })}
                                                required
                                            >
                                                <option value="">Pilih Divisi</option>
                                                {divisions.map((d) => (
                                                    <option key={d.id} value={d.id}>{d.name}</option>
                                                ))}
                                            </select>
                                        </div>
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
                                    <div className="form-group">
                                        <label className="form-label">Deskripsi</label>
                                        <textarea
                                            className="form-textarea"
                                            rows={2}
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
            )
            }
        </div >
    );
}
