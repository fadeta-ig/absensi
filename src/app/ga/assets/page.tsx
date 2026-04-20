"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
    Search, Plus, Filter, RefreshCw,
    Smartphone, Laptop, Phone, Package,
    User, Users, Building2, Archive, UserX,
    Edit3, ArrowRightLeft, Trash2, History, X,
    CheckCircle, Wrench, TrendingUp, AlertCircle
} from "lucide-react";
import Pagination from "@/components/ui/Pagination";

type Asset = {
    id: string; assetCode: string; name: string;
    category: "HANDPHONE" | "LAPTOP" | "NOMOR_HP";
    kondisi: "BAIK" | "KURANG_BAIK" | "RUSAK";
    status: "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "RETIRED" | "COMPANY_OWNED";
    holderType: "EMPLOYEE" | "FORMER_EMPLOYEE" | "TEAM" | "GA_POOL" | "COMPANY_OWNED";
    assignedToName: string | null;
    assignedToId: string | null;
    assignedAt: string | null;
    assignedEmployee: {
        employeeId: string;
        name: string;
        department: string;
        position: string;
    } | null;
    nomorIndosat: string | null;
    expiredDate: string | null;
    keterangan: string | null;
    updatedAt: string;
};

type HistoryRow = {
    id: string; action: string;
    fromName: string | null; toName: string | null;
    fromHolderType: string | null; toHolderType: string;
    kondisiSaat: string; notes: string | null;
    performedBy: string; createdAt: string;
};

// ─── Badge Helpers ──────────────────────────────────────────────

function KondisiBadge({ kondisi }: { kondisi: string }) {
    const map: Record<string, { label: string; color: string; bg: string }> = {
        BAIK: { label: "Baik", color: "#10b981", bg: "#d1fae5" },
        KURANG_BAIK: { label: "Kurang Baik", color: "#f59e0b", bg: "#fef3c7" },
        RUSAK: { label: "Rusak", color: "#ef4444", bg: "#fee2e2" },
    };
    const c = map[kondisi] ?? { label: kondisi, color: "#6b7280", bg: "#f3f4f6" };
    return <span style={{ fontSize: 11, fontWeight: 600, color: c.color, background: c.bg, padding: "2px 8px", borderRadius: 999 }}>{c.label}</span>;
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { label: string; color: string; bg: string }> = {
        AVAILABLE: { label: "Tersedia", color: "#10b981", bg: "#d1fae5" },
        IN_USE: { label: "Digunakan", color: "#3b82f6", bg: "#dbeafe" },
        MAINTENANCE: { label: "Perbaikan", color: "#f59e0b", bg: "#fef3c7" },
        RETIRED: { label: "Retired", color: "#6b7280", bg: "#f3f4f6" },
        COMPANY_OWNED: { label: "Perusahaan", color: "#8b5cf6", bg: "#ede9fe" },
    };
    const c = map[status] ?? { label: status, color: "#6b7280", bg: "#f3f4f6" };
    return <span style={{ fontSize: 11, fontWeight: 600, color: c.color, background: c.bg, padding: "2px 8px", borderRadius: 999 }}>{c.label}</span>;
}

function HolderIcon({ holderType }: { holderType: string }) {
    const icons: Record<string, React.ReactNode> = {
        EMPLOYEE: <User size={13} color="#3b82f6" />,
        FORMER_EMPLOYEE: <UserX size={13} color="#ef4444" />,
        TEAM: <Users size={13} color="#8b5cf6" />,
        GA_POOL: <Building2 size={13} color="#10b981" />,
        COMPANY_OWNED: <Archive size={13} color="#6b7280" />,
    };
    return <span style={{ display: "inline-flex", alignItems: "center" }}>{icons[holderType]}</span>;
}

function CategoryBadge({ cat }: { cat: string }) {
    const map: Record<string, { label: string; icon: React.ReactNode }> = {
        HANDPHONE: { label: "HP", icon: <Smartphone size={11} /> },
        LAPTOP: { label: "Laptop", icon: <Laptop size={11} /> },
        NOMOR_HP: { label: "Nomor", icon: <Phone size={11} /> },
    };
    const c = map[cat] ?? { label: cat, icon: <Package size={11} /> };
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#6366f1", background: "#eef2ff", padding: "2px 8px", borderRadius: 999 }}>
            {c.icon}{c.label}
        </span>
    );
}

// ─── Stat Card ──────────────────────────────────────────────────

function StatCard({ icon, label, value, bg, color }: { icon: React.ReactNode; label: string; value: number; bg: string; color: string }) {
    return (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color }}>
                {icon}
            </div>
            <div>
                <p style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{value}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{label}</p>
            </div>
        </div>
    );
}

// ─── Filter Pill (quick filter tabs) ───────────────────────────

function FilterPill({ label, icon, active, onClick, count }: { label: string; icon?: React.ReactNode; active: boolean; onClick: () => void; count: number }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500,
                border: active ? "none" : "1px solid var(--border)",
                background: active ? "var(--primary)" : "white",
                color: active ? "white" : "var(--text-secondary)",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.15s",
            }}
        >
            {icon && <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>}
            {label}
            <span style={{ background: active ? "rgba(255,255,255,0.25)" : "var(--secondary)", borderRadius: 999, padding: "1px 7px", fontSize: 11, fontWeight: 700, color: active ? "white" : "var(--text-secondary)" }}>
                {count}
            </span>
        </button>
    );
}

// ─── Modal: CREATE ──────────────────────────────────────────────

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const [form, setForm] = useState({
        name: "",
        category: "HANDPHONE" as "HANDPHONE" | "LAPTOP" | "NOMOR_HP",
        kondisi: "BAIK" as "BAIK" | "KURANG_BAIK" | "RUSAK",
        holderType: "GA_POOL" as string,
        assignedToName: "",
        assignedToId: "",
        nomorIndosat: "",
        expiredDate: "",
        keterangan: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // ── Employee list dari HR master data ──────────────────────────
    const [employees, setEmployees] = useState<{ name: string; employeeId: string; position: string }[]>([]);
    const [empLoading, setEmpLoading] = useState(true);

    useEffect(() => {
        fetch("/api/employees")
            .then(r => r.json())
            .then((data: Array<{ name: string; employeeId: string; position: string; isActive?: boolean }>) => {
                setEmployees(data.filter(e => e.isActive !== false));
            })
            .catch(() => setEmployees([]))
            .finally(() => setEmpLoading(false));
    }, []);

    const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));
    // Reset nama & id saat ganti tipe
    const setHolderType = (val: string) => setForm(prev => ({ ...prev, holderType: val, assignedToName: "", assignedToId: "" }));

    const needsName = form.holderType !== "GA_POOL" && form.holderType !== "COMPANY_OWNED";
    const isEmployeeDropdown = form.holderType === "EMPLOYEE";
    const isTextInput = form.holderType === "TEAM" || form.holderType === "FORMER_EMPLOYEE";
    const isNomor = form.category === "NOMOR_HP";

    const submit = async () => {
        if (!form.name.trim()) { setError("Nama aset harus diisi"); return; }
        if (needsName && !form.assignedToName.trim()) { setError("Nama pemegang harus diisi"); return; }
        setLoading(true); setError("");
        try {
            const res = await fetch("/api/assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name,
                    category: form.category,
                    kondisi: form.kondisi,
                    holderType: form.holderType,
                    assignedToName: needsName ? form.assignedToName : null,
                    assignedToId: isEmployeeDropdown && form.assignedToId ? form.assignedToId : null,
                    nomorIndosat: isNomor ? (form.nomorIndosat || null) : null,
                    expiredDate: isNomor ? (form.expiredDate || null) : null,
                    keterangan: form.keterangan || null,
                }),
            });
            if (!res.ok) { const e = await res.json(); setError(e.error ?? "Gagal membuat aset"); return; }
            onDone();
        } finally { setLoading(false); }
    };

    return (
        <div style={overlayStyle}>
            <div style={{ ...modalStyle, maxWidth: 520 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div>
                        <h3 style={{ fontSize: 17, fontWeight: 700 }}>Tambah Aset Baru</h3>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Kode aset akan digenerate otomatis</p>
                    </div>
                    <button onClick={onClose} style={iconBtnStyle}><X size={18} /></button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ gridColumn: "1/-1", ...fieldStyle }}>
                        <label style={labelStyle}>Nama Aset *</label>
                        <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Contoh: iPhone 13 128GB / ThinkPad E14" style={inputStyle} />
                    </div>

                    <div style={fieldStyle}>
                        <label style={labelStyle}>Kategori *</label>
                        <select value={form.category} onChange={e => set("category", e.target.value)} style={inputStyle}>
                            <option value="HANDPHONE">Handphone / Tablet</option>
                            <option value="LAPTOP">Laptop</option>
                            <option value="NOMOR_HP">Nomor Indosat (SIM)</option>
                        </select>
                    </div>

                    <div style={fieldStyle}>
                        <label style={labelStyle}>Kondisi *</label>
                        <select value={form.kondisi} onChange={e => set("kondisi", e.target.value)} style={inputStyle}>
                            <option value="BAIK">Baik</option>
                            <option value="KURANG_BAIK">Kurang Baik</option>
                            <option value="RUSAK">Rusak</option>
                        </select>
                    </div>

                    <div style={fieldStyle}>
                        <label style={labelStyle}>Pemegang Awal *</label>
                        <select value={form.holderType} onChange={e => setHolderType(e.target.value)} style={inputStyle}>
                            <option value="GA_POOL">GA — Brankas GA</option>
                            <option value="EMPLOYEE">Karyawan Aktif</option>
                            <option value="TEAM">Tim</option>
                            <option value="FORMER_EMPLOYEE">Mantan Karyawan</option>
                            <option value="COMPANY_OWNED">Milik Perusahaan</option>
                        </select>
                    </div>

                    {/* Dropdown karyawan aktif (dari HR master data) */}
                    {isEmployeeDropdown && (
                        <div style={{ gridColumn: "1/-1", ...fieldStyle }}>
                            <label style={labelStyle}>
                                Pilih Karyawan *
                                {empLoading && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>Memuat...</span>}
                            </label>
                            <select
                                value={form.assignedToId}
                                onChange={e => {
                                    const selectedEmp = employees.find(emp => emp.employeeId === e.target.value);
                                    if (selectedEmp) {
                                        setForm(prev => ({ ...prev, assignedToId: selectedEmp.employeeId, assignedToName: selectedEmp.name }));
                                    } else {
                                        setForm(prev => ({ ...prev, assignedToId: "", assignedToName: "" }));
                                    }
                                }}
                                style={{ ...inputStyle, height: "auto", padding: "8px 10px" }}
                                disabled={empLoading}
                            >
                                <option value="">-- Pilih Karyawan --</option>
                                {employees.map(emp => (
                                    <option key={emp.employeeId} value={emp.employeeId}>
                                        {emp.name}{emp.position ? ` — ${emp.position}` : ""}
                                    </option>
                                ))}
                            </select>
                            {employees.length === 0 && !empLoading && (
                                <p style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>⚠ Gagal memuat data karyawan dari HR</p>
                            )}
                        </div>
                    )}

                    {/* Input manual untuk Tim atau Mantan Karyawan */}
                    {isTextInput && (
                        <div style={{ gridColumn: "1/-1", ...fieldStyle }}>
                            <label style={labelStyle}>
                                {form.holderType === "TEAM" ? "Nama Tim *" : "Nama Mantan Karyawan *"}
                            </label>
                            <input
                                value={form.assignedToName}
                                onChange={e => set("assignedToName", e.target.value)}
                                placeholder={form.holderType === "TEAM" ? "cth: Tim Warehouse / Tim Creative" : "Nama lengkap mantan karyawan"}
                                style={inputStyle}
                            />
                        </div>
                    )}

                    {isNomor && <>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Nomor Indosat</label>
                            <input value={form.nomorIndosat} onChange={e => set("nomorIndosat", e.target.value)} placeholder="08163344xx" style={inputStyle} />
                        </div>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Tanggal Expired</label>
                            <input type="date" value={form.expiredDate} onChange={e => set("expiredDate", e.target.value)} style={inputStyle} />
                        </div>
                    </>}

                    <div style={{ gridColumn: "1/-1", ...fieldStyle }}>
                        <label style={labelStyle}>Keterangan (opsional)</label>
                        <textarea value={form.keterangan} onChange={e => set("keterangan", e.target.value)} placeholder="Catatan kondisi, lokasi, atau informasi tambahan..." style={{ ...inputStyle, height: 72, resize: "vertical" as const }} />
                    </div>
                </div>

                {error && <p style={{ fontSize: 13, color: "#ef4444", marginTop: 4 }}>{error}</p>}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                    <button onClick={onClose} style={outlineBtnStyle}>Batal</button>
                    <button onClick={submit} disabled={loading} style={primaryBtnStyle}>
                        <Plus size={14} /> {loading ? "Menyimpan..." : "Tambah Aset"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Modal: Assign ──────────────────────────────────────────────

function AssignModal({ asset, onClose, onDone }: { asset: Asset; onClose: () => void; onDone: () => void }) {
    const [holderType, setHolderType] = useState<string>(asset.holderType === "GA_POOL" ? "EMPLOYEE" : "GA_POOL");
    const [toName, setToName] = useState("");
    const [toEmployeeId, setToEmployeeId] = useState("");
    const [kondisi, setKondisi] = useState(asset.kondisi);
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // ── Employee list from HR master data ─────────────────────────
    const [employees, setEmployees] = useState<{ name: string; employeeId: string; position: string; department: string }[]>([]);
    const [empLoading, setEmpLoading] = useState(true);

    useEffect(() => {
        fetch("/api/employees")
            .then(r => r.json())
            .then((data: Array<{ name: string; employeeId: string; position: string; department: string; isActive?: boolean }>) => {
                setEmployees(data.filter(e => e.isActive !== false));
            })
            .catch(() => setEmployees([]))
            .finally(() => setEmpLoading(false));
    }, []);

    const isReturning = holderType === "GA_POOL";
    const needsEmployeeDropdown = holderType === "EMPLOYEE";
    const needsTextInput = holderType === "FORMER_EMPLOYEE" || holderType === "TEAM";

    const submit = async () => {
        if (!isReturning && !toName.trim()) { setError("Nama pemegang harus diisi"); return; }
        setLoading(true);
        try {
            const res = await fetch("/api/assets/assign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    assetId: asset.id, 
                    toHolderType: holderType, 
                    toName: isReturning ? null : toName, 
                    toEmployeeId: holderType === "EMPLOYEE" ? toEmployeeId : null,
                    kondisi, 
                    notes 
                }),
            });
            if (!res.ok) { const e = await res.json(); setError(e.error ?? "Gagal"); return; }
            onDone();
        } finally { setLoading(false); }
    };

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>Assign / Return Aset</h3>
                    <button onClick={onClose} style={iconBtnStyle}><X size={18} /></button>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                    <strong>{asset.assetCode}</strong> — {asset.name}
                    {asset.assignedToName && <><br />Saat ini: <strong>{asset.assignedToName}</strong></>}
                </p>
                <div style={fieldStyle}>
                    <label style={labelStyle}>Aksi</label>
                    <select value={holderType} onChange={e => { setHolderType(e.target.value); setToName(""); setToEmployeeId(""); }} style={inputStyle}>
                        <option value="EMPLOYEE">Assign ke Karyawan Aktif</option>
                        <option value="FORMER_EMPLOYEE">Assign ke Mantan Karyawan</option>
                        <option value="TEAM">Assign ke Tim</option>
                        <option value="GA_POOL">Kembalikan ke GA (Brankas)</option>
                    </select>
                </div>

                {/* Dropdown karyawan aktif dari sistem HR */}
                {needsEmployeeDropdown && (
                    <div style={fieldStyle}>
                        <label style={labelStyle}>
                            Pilih Karyawan *
                            {empLoading && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>Memuat data karyawan...</span>}
                        </label>
                        <select
                            value={toEmployeeId}
                            onChange={e => {
                                const selectedEmp = employees.find(emp => emp.employeeId === e.target.value);
                                if (selectedEmp) {
                                    setToEmployeeId(selectedEmp.employeeId);
                                    setToName(selectedEmp.name);
                                } else {
                                    setToEmployeeId("");
                                    setToName("");
                                }
                            }}
                            style={{ ...inputStyle, height: "auto", padding: "8px 10px" }}
                            disabled={empLoading}
                        >
                            <option value="">-- Pilih Karyawan --</option>
                            {employees.map(emp => (
                                <option key={emp.employeeId} value={emp.employeeId}>
                                    {emp.name}{emp.position ? ` — ${emp.position}` : ""}
                                </option>
                            ))}
                        </select>
                        {employees.length === 0 && !empLoading && (
                            <p style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>⚠ Gagal memuat data karyawan</p>
                        )}
                    </div>
                )}

                {/* Input teks manual untuk Tim atau Mantan Karyawan */}
                {needsTextInput && (
                    <div style={fieldStyle}>
                        <label style={labelStyle}>
                            {holderType === "TEAM" ? "Nama Tim *" : "Nama Mantan Karyawan *"}
                        </label>
                        <input
                            value={toName}
                            onChange={e => setToName(e.target.value)}
                            placeholder={holderType === "TEAM" ? "cth: Tim Warehouse / Tim Creative" : "Nama lengkap mantan karyawan"}
                            style={inputStyle}
                        />
                    </div>
                )}

                <div style={fieldStyle}>
                    <label style={labelStyle}>Kondisi Saat Ini</label>
                    <select value={kondisi} onChange={e => setKondisi(e.target.value as typeof kondisi)} style={inputStyle}>
                        <option value="BAIK">Baik</option>
                        <option value="KURANG_BAIK">Kurang Baik</option>
                        <option value="RUSAK">Rusak</option>
                    </select>
                </div>
                <div style={fieldStyle}>
                    <label style={labelStyle}>Catatan (opsional)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Keterangan perpindahan..." style={{ ...inputStyle, height: 68, resize: "vertical" as const }} />
                </div>
                {error && <p style={{ fontSize: 13, color: "#ef4444", marginBottom: 8 }}>{error}</p>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                    <button onClick={onClose} style={outlineBtnStyle}>Batal</button>
                    <button onClick={submit} disabled={loading} style={primaryBtnStyle}>
                        {loading ? "Menyimpan..." : isReturning ? "Kembalikan ke GA" : "Assign"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Modal: Edit ────────────────────────────────────────────────

function EditModal({ asset, onClose, onDone }: { asset: Asset; onClose: () => void; onDone: () => void }) {
    const [name, setName] = useState(asset.name);
    const [kondisi, setKondisi] = useState(asset.kondisi);
    const [status, setStatus] = useState(asset.status);
    const [keterangan, setKeterangan] = useState(asset.keterangan ?? "");
    const [nomorIndosat, setNomorIndosat] = useState(asset.nomorIndosat ?? "");
    const [expiredDate, setExpiredDate] = useState(asset.expiredDate ? asset.expiredDate.split("T")[0] : "");
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/assets/${asset.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, kondisi, status, keterangan: keterangan || null, nomorIndosat: nomorIndosat || null, expiredDate: expiredDate || null }),
            });
            if (res.ok) onDone();
        } finally { setLoading(false); }
    };

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>Edit Aset — {asset.assetCode}</h3>
                    <button onClick={onClose} style={iconBtnStyle}><X size={18} /></button>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>Nama Aset</label><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></div>
                <div style={fieldStyle}><label style={labelStyle}>Kondisi</label>
                    <select value={kondisi} onChange={e => setKondisi(e.target.value as typeof kondisi)} style={inputStyle}>
                        <option value="BAIK">Baik</option><option value="KURANG_BAIK">Kurang Baik</option><option value="RUSAK">Rusak</option>
                    </select>
                </div>
                <div style={fieldStyle}><label style={labelStyle}>Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value as typeof status)} style={inputStyle}>
                        <option value="AVAILABLE">Tersedia</option><option value="IN_USE">Digunakan</option>
                        <option value="MAINTENANCE">Perbaikan</option><option value="COMPANY_OWNED">Milik Perusahaan</option>
                    </select>
                </div>
                {asset.category === "NOMOR_HP" && <>
                    <div style={fieldStyle}><label style={labelStyle}>Nomor Indosat</label><input value={nomorIndosat} onChange={e => setNomorIndosat(e.target.value)} style={inputStyle} /></div>
                    <div style={fieldStyle}><label style={labelStyle}>Tanggal Expired</label><input type="date" value={expiredDate} onChange={e => setExpiredDate(e.target.value)} style={inputStyle} /></div>
                </>}
                <div style={fieldStyle}><label style={labelStyle}>Keterangan</label><textarea value={keterangan} onChange={e => setKeterangan(e.target.value)} style={{ ...inputStyle, height: 68, resize: "vertical" as const }} /></div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                    <button onClick={onClose} style={outlineBtnStyle}>Batal</button>
                    <button onClick={submit} disabled={loading} style={primaryBtnStyle}>{loading ? "Menyimpan..." : "Simpan"}</button>
                </div>
            </div>
        </div>
    );
}

// ─── Modal: History ─────────────────────────────────────────────

function HistoryModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/assets/history?assetId=${asset.id}`)
            .then(r => r.json()).then(setHistory).finally(() => setLoading(false));
    }, [asset.id]);

    const actionLabel: Record<string, string> = {
        assigned: "Diberikan ke", returned: "Dikembalikan",
        sent_to_maintenance: "Dikirim perbaikan", kondisi_changed: "Kondisi diubah", retired: "Di-retire",
    };

    return (
        <div style={overlayStyle}>
            <div style={{ ...modalStyle, maxWidth: 600, maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>Riwayat — {asset.assetCode}</h3>
                    <button onClick={onClose} style={iconBtnStyle}><X size={18} /></button>
                </div>
                <div style={{ flex: 1, overflow: "auto" }}>
                    {loading ? <p style={{ textAlign: "center", color: "var(--text-muted)" }}>Memuat...</p> : history.length === 0 ? (
                        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>Belum ada riwayat</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {history.map(h => (
                                <div key={h.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <strong>{actionLabel[h.action] ?? h.action}</strong>
                                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{new Date(h.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                                    </div>
                                    <p style={{ color: "var(--text-muted)", marginTop: 4, fontSize: 12 }}>
                                        {h.fromName ?? "GA"} → {h.toName ?? "GA"}
                                    </p>
                                    {h.notes && <p style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>📝 {h.notes}</p>}
                                    <div style={{ marginTop: 4 }}><KondisiBadge kondisi={h.kondisiSaat} /></div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Page (inner — uses useSearchParams) ───────────────────

const PAGE_SIZE = 20;

function AssetsPageInner() {
    const searchParams = useSearchParams();

    const [assets, setAssets] = useState<Asset[]>([]);
    const [filtered, setFiltered] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    // Filter state — diinisialisasi dari URL, lalu di-sync via useEffect
    const [filterCat, setFilterCat] = useState("ALL");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [filterKondisi, setFilterKondisi] = useState("ALL");

    const [showCreate, setShowCreate] = useState(false);
    const [assignTarget, setAssignTarget] = useState<Asset | null>(null);
    const [editTarget, setEditTarget] = useState<Asset | null>(null);
    const [historyTarget, setHistoryTarget] = useState<Asset | null>(null);
    const [retireConfirm, setRetireConfirm] = useState<Asset | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    // ── Sync state dari URL params setiap kali URL berubah ─────
    useEffect(() => {
        const cat    = searchParams.get("category") ?? "ALL";
        const status = searchParams.get("status")   ?? "ALL";
        setFilterCat(cat);
        setFilterStatus(status);
        setCurrentPage(1); // reset ke halaman 1 saat filter dari URL berubah
    }, [searchParams]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/assets");
            if (res.ok) setAssets(await res.json());
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    // ── Apply filters ───────────────────────────────────────────
    useEffect(() => {
        let f = [...assets];
        if (filterCat !== "ALL")    f = f.filter(a => a.category === filterCat);
        if (filterStatus !== "ALL") f = f.filter(a => a.status === filterStatus);
        if (filterKondisi !== "ALL") f = f.filter(a => a.kondisi === filterKondisi);
        if (search.trim()) {
            const q = search.toLowerCase();
            f = f.filter(a =>
                a.name.toLowerCase().includes(q) ||
                a.assetCode.toLowerCase().includes(q) ||
                (a.assignedToName ?? "").toLowerCase().includes(q) ||
                (a.nomorIndosat ?? "").includes(q)
            );
        }
        setFiltered(f);
        setCurrentPage(1); // reset ke halaman 1 setiap filter/search berubah
    }, [assets, search, filterCat, filterStatus, filterKondisi]);

    const handleRetire = async (asset: Asset) => {
        const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
        if (res.ok) { load(); setRetireConfirm(null); }
    };

    // Judul halaman dinamis berdasarkan filter aktif
    const pageTitle = filterCat === "HANDPHONE" ? "Handphone" :
                      filterCat === "LAPTOP"    ? "Laptop"    :
                      filterCat === "NOMOR_HP"  ? "Nomor Indosat" :
                      filterStatus === "AVAILABLE"   ? "Stok Tersedia" :
                      filterStatus === "MAINTENANCE" ? "Dalam Perbaikan" :
                      "Semua Aset";

    // Stats
    const stats = {
        total: assets.length,
        available: assets.filter(a => a.status === "AVAILABLE").length,
        inUse: assets.filter(a => a.status === "IN_USE").length,
        maintenance: assets.filter(a => a.status === "MAINTENANCE").length,
        rusak: assets.filter(a => a.kondisi === "RUSAK").length,
    };

    const byCat = {
        HANDPHONE: assets.filter(a => a.category === "HANDPHONE").length,
        LAPTOP: assets.filter(a => a.category === "LAPTOP").length,
        NOMOR_HP: assets.filter(a => a.category === "NOMOR_HP").length,
    };

    // Slice untuk pagination
    const pageItems = filtered.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    return (
        <div className="space-y-5">
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700 }}>{pageTitle}</h1>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                        Kelola dan pantau seluruh aset perusahaan
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={load} style={{ height: 35, padding: "0 14px", background: "white", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button onClick={() => setShowCreate(true)} style={primaryBtnStyle}>
                        <Plus size={15} /> Tambah Aset
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                <StatCard icon={<Package size={20} />}      label="Total Aset"   value={stats.total}       bg="#eef2ff"  color="#6366f1" />
                <StatCard icon={<CheckCircle size={20} />}  label="Tersedia"     value={stats.available}   bg="#d1fae5"  color="#10b981" />
                <StatCard icon={<TrendingUp size={20} />}   label="Digunakan"    value={stats.inUse}       bg="#dbeafe"  color="#3b82f6" />
                <StatCard icon={<Wrench size={20} />}       label="Perbaikan"    value={stats.maintenance} bg="#fef3c7"  color="#f59e0b" />
                <StatCard icon={<AlertCircle size={20} />}  label="Kondisi Rusak" value={stats.rusak}      bg="#fee2e2"  color="#ef4444" />
            </div>

            {/* Quick filter pills berdasarkan kategori */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Kategori:</span>
                <FilterPill label="Semua" active={filterCat === "ALL" && filterStatus === "ALL"} onClick={() => { setFilterCat("ALL"); setFilterStatus("ALL"); }} count={stats.total} />
                <FilterPill label="Handphone" icon={<Smartphone size={12} />} active={filterCat === "HANDPHONE"} onClick={() => { setFilterCat("HANDPHONE"); setFilterStatus("ALL"); }} count={byCat.HANDPHONE} />
                <FilterPill label="Laptop" icon={<Laptop size={12} />} active={filterCat === "LAPTOP"} onClick={() => { setFilterCat("LAPTOP"); setFilterStatus("ALL"); }} count={byCat.LAPTOP} />
                <FilterPill label="Nomor Indosat" icon={<Phone size={12} />} active={filterCat === "NOMOR_HP"} onClick={() => { setFilterCat("NOMOR_HP"); setFilterStatus("ALL"); }} count={byCat.NOMOR_HP} />
                <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
                <FilterPill label="Stok Tersedia" icon={<CheckCircle size={12} />} active={filterStatus === "AVAILABLE" && filterCat === "ALL"} onClick={() => { setFilterCat("ALL"); setFilterStatus("AVAILABLE"); }} count={stats.available} />
            </div>

            {/* Search + Select Filters */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                    <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Cari nama, kode, pemegang, nomor..."
                        style={{ ...inputStyle, paddingLeft: 32, width: "100%", boxSizing: "border-box" as const }}
                    />
                </div>
                <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                    <option value="ALL">Semua Kategori</option>
                    <option value="HANDPHONE">Handphone</option>
                    <option value="LAPTOP">Laptop</option>
                    <option value="NOMOR_HP">Nomor HP</option>
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                    <option value="ALL">Semua Status</option>
                    <option value="AVAILABLE">Tersedia</option>
                    <option value="IN_USE">Digunakan</option>
                    <option value="MAINTENANCE">Perbaikan</option>
                    <option value="COMPANY_OWNED">Milik Perusahaan</option>
                    <option value="RETIRED">Retired</option>
                </select>
                <select value={filterKondisi} onChange={e => setFilterKondisi(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
                    <option value="ALL">Semua Kondisi</option>
                    <option value="BAIK">Baik</option>
                    <option value="KURANG_BAIK">Kurang Baik</option>
                    <option value="RUSAK">Rusak</option>
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
                    <Filter size={14} /><span>{filtered.length} hasil</span>
                </div>
            </div>

            {/* Table */}
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {loading ? (
                    <div style={{ textAlign: "center", padding: 40 }}><div className="spinner" /></div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: "var(--secondary)" }}>
                                    <th style={thStyle}>Kode</th>
                                    <th style={thStyle}>Nama Aset</th>
                                    <th style={thStyle}>Kategori</th>
                                    <th style={thStyle}>Kondisi</th>
                                    <th style={thStyle}>Status</th>
                                    <th style={thStyle}>Pemegang</th>
                                    <th style={thStyle}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageItems.length === 0 ? (
                                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                                        {search ? `Tidak ada aset cocok dengan "${search}"` : "Tidak ada aset ditemukan"}
                                    </td></tr>
                                ) : pageItems.map(a => (
                                    <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                        <td style={tdStyle}>
                                            <span style={{ fontFamily: "monospace", background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>{a.assetCode}</span>
                                        </td>
                                        <td style={{ ...tdStyle, maxWidth: 200 }}>
                                            <span style={{ fontWeight: 500 }}>{a.name}</span>
                                            {a.nomorIndosat && <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>{a.nomorIndosat}</span>}
                                            {a.keterangan && <span style={{ display: "block", fontSize: 11, color: "#f59e0b" }} title={a.keterangan}>[!] {a.keterangan.substring(0, 28)}{a.keterangan.length > 28 ? "…" : ""}</span>}
                                        </td>
                                        <td style={tdStyle}><CategoryBadge cat={a.category} /></td>
                                        <td style={tdStyle}><KondisiBadge kondisi={a.kondisi} /></td>
                                        <td style={tdStyle}><StatusBadge status={a.status} /></td>
                                        <td style={tdStyle}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <div style={{ padding: 4, background: "#f3f4f6", borderRadius: 6, display: "flex" }}>
                                                    <HolderIcon holderType={a.holderType} />
                                                </div>
                                                <div>
                                                    <span style={{ color: a.holderType === "GA_POOL" ? "var(--text-muted)" : "var(--text-primary)", fontStyle: a.holderType === "GA_POOL" ? "italic" : "normal", fontWeight: 500 }}>
                                                        {a.assignedEmployee ? 
                                                            a.assignedEmployee.name : 
                                                            (a.assignedToName ?? "GA — Tersedia")}
                                                    </span>
                                                    {a.assignedEmployee && (
                                                        <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                                            {a.assignedEmployee.department} — {a.assignedEmployee.position}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ display: "flex", gap: 5 }}>
                                                <button onClick={() => setEditTarget(a)} title="Edit" style={iconBtnSmall}><Edit3 size={14} /></button>
                                                {a.status !== "RETIRED" && <button onClick={() => setAssignTarget(a)} title="Assign/Return" style={iconBtnSmall}><ArrowRightLeft size={14} /></button>}
                                                <button onClick={() => setHistoryTarget(a)} title="Riwayat" style={iconBtnSmall}><History size={14} /></button>
                                                {a.status !== "RETIRED" && (
                                                    <button onClick={() => setRetireConfirm(a)} title="Retire" style={{ ...iconBtnSmall, color: "#ef4444", borderColor: "#fecaca" }}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <Pagination
                    currentPage={currentPage}
                    totalItems={filtered.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setCurrentPage}
                />
            </div>

            {/* Modals */}
            {showCreate   && <CreateModal  onClose={() => setShowCreate(false)}   onDone={() => { setShowCreate(false);   load(); }} />}
            {assignTarget && <AssignModal  asset={assignTarget}  onClose={() => setAssignTarget(null)}  onDone={() => { setAssignTarget(null);  load(); }} />}
            {editTarget   && <EditModal    asset={editTarget}    onClose={() => setEditTarget(null)}    onDone={() => { setEditTarget(null);    load(); }} />}
            {historyTarget && <HistoryModal asset={historyTarget} onClose={() => setHistoryTarget(null)} />}

            {/* Retire Confirm */}
            {retireConfirm && (
                <div style={overlayStyle}>
                    <div style={{ ...modalStyle, maxWidth: 380 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Retire Aset?</h3>
                        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                            <strong>{retireConfirm.assetCode}</strong> — {retireConfirm.name}<br />
                            Aset akan ditandai Retired dan tidak bisa di-assign lagi.
                        </p>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button onClick={() => setRetireConfirm(null)} style={outlineBtnStyle}>Batal</button>
                            <button onClick={() => handleRetire(retireConfirm)} style={{ ...primaryBtnStyle, background: "#ef4444" }}>
                                <Trash2 size={14} /> Retire
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Export (wrapped dalam Suspense agar useSearchParams aman) ──

export default function AssetsPage() {
    return (
        <Suspense fallback={<div style={{ textAlign: "center", padding: 48 }}><div className="spinner" /></div>}>
            <AssetsPageInner />
        </Suspense>
    );
}

// ─── Style Constants ────────────────────────────────────────────
const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "10px 14px", color: "var(--text-primary)", verticalAlign: "middle" };
const inputStyle: React.CSSProperties = { height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", background: "white" };
const fieldStyle: React.CSSProperties = { marginBottom: 12, display: "flex", flexDirection: "column", gap: 5 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" };
const primaryBtnStyle: React.CSSProperties = { height: 36, padding: "0 16px", background: "var(--primary)", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 };
const outlineBtnStyle: React.CSSProperties = { height: 36, padding: "0 14px", background: "white", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 };
const iconBtnStyle: React.CSSProperties = { padding: 6, border: "none", background: "transparent", cursor: "pointer", borderRadius: 6, color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center" };
const iconBtnSmall: React.CSSProperties = { ...iconBtnStyle, padding: 5, border: "1px solid var(--border)", background: "white", color: "var(--text-secondary)" };
const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const modalStyle: React.CSSProperties = { background: "white", borderRadius: 14, padding: 24, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px -10px rgba(0,0,0,0.3)", maxHeight: "90vh", overflowY: "auto" };
