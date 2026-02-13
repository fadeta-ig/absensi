"use client";

import { useEffect, useState } from "react";
import {
    Settings, Plus, Pencil, Trash2, X, Loader2,
    Wallet, TrendingUp, TrendingDown, AlertCircle, Check, Info
} from "lucide-react";

interface PayrollComponent {
    id: string;
    name: string;
    type: string; // "allowance" | "deduction"
    defaultAmount: number;
    isActive: boolean;
    description: string | null;
}

export default function MasterPayrollPage() {
    const [components, setComponents] = useState<PayrollComponent[]>([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [form, setForm] = useState({
        id: "",
        name: "",
        type: "allowance",
        defaultAmount: 0,
        isActive: true,
        description: ""
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/master/payroll-components");
            if (res.ok) setComponents(await res.json());
        } catch (error) {
            console.error("Failed to fetch components", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAdd = () => {
        setForm({ id: "", name: "", type: "allowance", defaultAmount: 0, isActive: true, description: "" });
        setEditMode(false);
        setMsg(null);
        setShowModal(true);
    };

    const handleEdit = (comp: PayrollComponent) => {
        setForm({
            id: comp.id,
            name: comp.name,
            type: comp.type,
            defaultAmount: comp.defaultAmount,
            isActive: comp.isActive,
            description: comp.description || ""
        });
        setEditMode(true);
        setMsg(null);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsg(null);
        try {
            const res = await fetch("/api/master/payroll-components", {
                method: editMode ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: "success", text: `Komponen berhasil ${editMode ? "diperbarui" : "ditambahkan"}` });
                fetchData();
                setTimeout(() => setShowModal(false), 1000);
            } else {
                setMsg({ type: "error", text: data.error || "Gagal menyimpan" });
            }
        } catch {
            setMsg({ type: "error", text: "Kesalahan server" });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Hapus komponen ini?")) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/master/payroll-components?id=${id}`, { method: "DELETE" });
            if (res.ok) fetchData();
        } catch {
            alert("Gagal menghapus data");
        } finally {
            setLoading(false);
        }
    };

    const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Settings className="w-5 h-5 text-[var(--primary)]" />
                        Master Payroll
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Atur komponen standar gaji, tunjangan, dan potongan</p>
                </div>
                <button onClick={handleAdd} className="btn btn-primary">
                    <Plus className="w-4 h-4" /> Tambah Komponen
                </button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="card p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                        <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xl font-bold">{components.filter(c => c.type === "allowance").length}</p>
                        <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Tipe Tunjangan</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                        <TrendingDown className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xl font-bold">{components.filter(c => c.type === "deduction").length}</p>
                        <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Tipe Potongan</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-4 bg-[var(--primary)]/5 border-[var(--primary)]/20">
                    <div className="w-10 h-10 rounded-full bg-[var(--primary)] text-white flex items-center justify-center shrink-0">
                        <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xl font-bold">{components.filter(c => c.isActive).length}</p>
                        <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Komponen Aktif</p>
                    </div>
                </div>
            </div>

            {loading && !showModal ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
                </div>
            ) : (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Nama Komponen</th>
                                    <th>Tipe</th>
                                    <th>Nilai Default</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {components.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-12 text-[var(--text-muted)]">Belum ada komponen payroll</td></tr>
                                ) : (
                                    components.map((comp) => (
                                        <tr key={comp.id}>
                                            <td>
                                                <div className="font-semibold text-[var(--text-primary)]">{comp.name}</div>
                                                <div className="text-[10px] text-[var(--text-muted)] line-clamp-1 italic">{comp.description || "-"}</div>
                                            </td>
                                            <td>
                                                <span className={`text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold uppercase ${comp.type === "allowance" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                                                    {comp.type === "allowance" ? <TrendingUp className="w-3" /> : <TrendingDown className="w-3" />}
                                                    {comp.type === "allowance" ? "Tunjangan" : "Potongan"}
                                                </span>
                                            </td>
                                            <td className="font-medium">{fmt(comp.defaultAmount)}</td>
                                            <td>
                                                <span className={`badge ${comp.isActive ? "badge-success" : "badge-error"}`}>
                                                    {comp.isActive ? "Aktif" : "Mati"}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => handleEdit(comp)} className="btn btn-ghost btn-sm !p-1.5 text-blue-600">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDelete(comp.id)} className="btn btn-ghost btn-sm !p-1.5 text-red-600">
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

            <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-3">
                <Info className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-800 leading-relaxed">
                    <strong>Tip:</strong> Komponen yang ditandai <b>Aktif</b> akan muncul secara otomatis sebagai pilihan saat Anda membuat slip gaji baru. Jika komponen memiliki nilai default, nilai tersebut akan otomatis terisi namun tetap dapat Anda ubah secara manual.
                </p>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editMode ? "Edit" : "Tambah"} Komponen Payroll</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X className="w-4 h-4" /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {msg && (
                                <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${msg.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                                    {msg.type === "success" ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                    {msg.text}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Nama Komponen</label>
                                <input
                                    className="form-input"
                                    placeholder="Contoh: Tunjangan Transport"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label className="form-label">Tipe</label>
                                    <select
                                        className="form-select"
                                        value={form.type}
                                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                                    >
                                        <option value="allowance">Tunjangan (+)</option>
                                        <option value="deduction">Potongan (-)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Status</label>
                                    <select
                                        className="form-select"
                                        value={form.isActive ? "1" : "0"}
                                        onChange={(e) => setForm({ ...form, isActive: e.target.value === "1" })}
                                    >
                                        <option value="1">Aktif</option>
                                        <option value="0">Non-aktif</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Nilai Default (Rp)</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    placeholder="0"
                                    value={form.defaultAmount || ""}
                                    onChange={(e) => setForm({ ...form, defaultAmount: Number(e.target.value) })}
                                />
                                <p className="text-[10px] text-[var(--text-muted)] mt-1">Gunakan 0 jika nilai bervariasi setiap bulan.</p>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Keterangan</label>
                                <textarea
                                    className="form-textarea"
                                    rows={2}
                                    placeholder="Keterangan komponen..."
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                />
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-[var(--border)]">
                                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" disabled={loading}>Batal</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    Simpan Komponen
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
