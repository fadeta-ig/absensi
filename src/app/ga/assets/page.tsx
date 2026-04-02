"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
    Search, Plus, Filter, RefreshCw,
    Smartphone, Laptop, Phone, Package,
    User, Users, Building2, Archive, UserX,
    Edit3, ArrowRightLeft, Trash2, History, X, Check
} from "lucide-react";

type Asset = {
    id: string; assetCode: string; name: string;
    category: "HANDPHONE" | "LAPTOP" | "NOMOR_HP";
    kondisi: "BAIK" | "KURANG_BAIK" | "RUSAK";
    status: "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "RETIRED" | "COMPANY_OWNED";
    holderType: "EMPLOYEE" | "FORMER_EMPLOYEE" | "TEAM" | "GA_POOL" | "COMPANY_OWNED";
    assignedToName: string | null;
    assignedAt: string | null;
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
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{icons[holderType]}</span>;
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

// ─── Modal: Assign ──────────────────────────────────────────────

function AssignModal({ asset, onClose, onDone }: { asset: Asset; onClose: () => void; onDone: () => void }) {
    const [holderType, setHolderType] = useState<string>(asset.holderType === "GA_POOL" ? "EMPLOYEE" : "GA_POOL");
    const [toName, setToName] = useState("");
    const [kondisi, setKondisi] = useState(asset.kondisi);
    const [notes, setNotes] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const isReturning = holderType === "GA_POOL";

    const submit = async () => {
        if (!isReturning && !toName.trim()) { setError("Nama pemegang harus diisi"); return; }
        setLoading(true);
        try {
            const res = await fetch("/api/assets/assign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetId: asset.id, toHolderType: holderType, toName: isReturning ? null : toName, kondisi, notes }),
            });
            if (!res.ok) { const e = await res.json(); setError(e.error ?? "Gagal"); return; }
            onDone();
        } finally {
            setLoading(false);
        }
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
                    {asset.assignedToName && <><br />Saat ini dipegang: <strong>{asset.assignedToName}</strong></>}
                </p>
                <div style={fieldStyle}>
                    <label style={labelStyle}>Aksi</label>
                    <select value={holderType} onChange={e => setHolderType(e.target.value)} style={inputStyle}>
                        <option value="EMPLOYEE">Assign ke Karyawan</option>
                        <option value="FORMER_EMPLOYEE">Assign ke Mantan Karyawan</option>
                        <option value="TEAM">Assign ke Tim</option>
                        <option value="GA_POOL">Kembalikan ke GA</option>
                    </select>
                </div>
                {!isReturning && (
                    <div style={fieldStyle}>
                        <label style={labelStyle}>Nama Pemegang</label>
                        <input value={toName} onChange={e => setToName(e.target.value)} placeholder="Nama lengkap / Tim Warehouse / dst" style={inputStyle} />
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
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Keterangan perpindahan..." style={{ ...inputStyle, height: 72, resize: "vertical" }} />
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
                body: JSON.stringify({
                    name, kondisi, status, keterangan: keterangan || null,
                    nomorIndosat: nomorIndosat || null,
                    expiredDate: expiredDate || null,
                }),
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
                <div style={fieldStyle}><label style={labelStyle}>Keterangan</label><textarea value={keterangan} onChange={e => setKeterangan(e.target.value)} style={{ ...inputStyle, height: 72, resize: "vertical" }} /></div>
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
        assigned: "Diberikan ke", returned: "Dikembalikan", sent_to_maintenance: "Dikirim perbaikan",
        kondisi_changed: "Kondisi diubah", retired: "Di-retire",
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
                                    <p style={{ color: "var(--text-muted)", marginTop: 4 }}>
                                        {h.fromName ? `${h.fromName}` : "GA Pool"} → {h.toName ?? "GA Pool"}
                                    </p>
                                    {h.notes && <p style={{ marginTop: 4, color: "#6b7280" }}>📝 {h.notes}</p>}
                                    <div style={{ marginTop: 4 }}>
                                        <KondisiBadge kondisi={h.kondisiSaat} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function AssetsPage() {
    const searchParams = useSearchParams();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [filtered, setFiltered] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterCat, setFilterCat] = useState(searchParams.get("category") ?? "ALL");
    const [filterStatus, setFilterStatus] = useState(searchParams.get("filter") === "available" ? "AVAILABLE" : searchParams.get("filter") === "maintenance" ? "MAINTENANCE" : "ALL");
    const [filterKondisi, setFilterKondisi] = useState("ALL");

    const [assignTarget, setAssignTarget] = useState<Asset | null>(null);
    const [editTarget, setEditTarget] = useState<Asset | null>(null);
    const [historyTarget, setHistoryTarget] = useState<Asset | null>(null);
    const [retireConfirm, setRetireConfirm] = useState<Asset | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/assets");
            if (res.ok) setAssets(await res.json());
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        let f = [...assets];
        if (filterCat !== "ALL") f = f.filter(a => a.category === filterCat);
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
    }, [assets, search, filterCat, filterStatus, filterKondisi]);

    const handleRetire = async (asset: Asset) => {
        const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
        if (res.ok) { load(); setRetireConfirm(null); }
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700 }}>Manajemen Aset</h1>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>Total: {filtered.length} dari {assets.length} aset</p>
                </div>
                <button onClick={load} style={outlineBtnStyle} title="Refresh"><RefreshCw size={15} /></button>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                    <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama, kode, pemegang..." style={{ ...inputStyle, paddingLeft: 32, width: "100%", boxSizing: "border-box" }} />
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
                    <Filter size={14} />
                    <span>{filtered.length} hasil</span>
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
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>Tidak ada aset ditemukan</td></tr>
                                ) : filtered.map(a => (
                                    <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                        <td style={tdStyle}><span style={{ fontFamily: "monospace", background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>{a.assetCode}</span></td>
                                        <td style={{ ...tdStyle, maxWidth: 200 }}>
                                            <span style={{ fontWeight: 500 }}>{a.name}</span>
                                            {a.nomorIndosat && <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>{a.nomorIndosat}</span>}
                                            {a.keterangan && <span style={{ display: "block", fontSize: 11, color: "#f59e0b" }} title={a.keterangan}>⚠ {a.keterangan.substring(0, 30)}{a.keterangan.length > 30 ? "..." : ""}</span>}
                                        </td>
                                        <td style={tdStyle}><CategoryBadge cat={a.category} /></td>
                                        <td style={tdStyle}><KondisiBadge kondisi={a.kondisi} /></td>
                                        <td style={tdStyle}><StatusBadge status={a.status} /></td>
                                        <td style={tdStyle}>
                                            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                                <HolderIcon holderType={a.holderType} />
                                                <span style={{ color: a.holderType === "GA_POOL" ? "var(--text-muted)" : "var(--text-primary)" }}>
                                                    {a.assignedToName ?? "—"}
                                                </span>
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ display: "flex", gap: 6 }}>
                                                <button onClick={() => setEditTarget(a)} title="Edit" style={iconBtnSmall}><Edit3 size={14} /></button>
                                                {a.status !== "RETIRED" && <button onClick={() => setAssignTarget(a)} title="Assign / Return" style={iconBtnSmall}><ArrowRightLeft size={14} /></button>}
                                                <button onClick={() => setHistoryTarget(a)} title="Riwayat" style={iconBtnSmall}><History size={14} /></button>
                                                {a.status !== "RETIRED" && <button onClick={() => setRetireConfirm(a)} title="Retire" style={{ ...iconBtnSmall, color: "#ef4444" }}><Trash2 size={14} /></button>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modals */}
            {assignTarget && <AssignModal asset={assignTarget} onClose={() => setAssignTarget(null)} onDone={() => { setAssignTarget(null); load(); }} />}
            {editTarget && <EditModal asset={editTarget} onClose={() => setEditTarget(null)} onDone={() => { setEditTarget(null); load(); }} />}
            {historyTarget && <HistoryModal asset={historyTarget} onClose={() => setHistoryTarget(null)} />}

            {/* Retire Confirm */}
            {retireConfirm && (
                <div style={overlayStyle}>
                    <div style={{ ...modalStyle, maxWidth: 380 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Retire Aset?</h3>
                        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
                            <strong>{retireConfirm.assetCode}</strong> — {retireConfirm.name}<br />
                            Aset akan ditandai sebagai Retired dan tidak bisa di-assign.
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

// ─── Style Constants ────────────────────────────────────────────
const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "10px 14px", color: "var(--text-primary)", verticalAlign: "middle" };
const inputStyle: React.CSSProperties = { height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", background: "white" };
const fieldStyle: React.CSSProperties = { marginBottom: 12, display: "flex", flexDirection: "column", gap: 5 };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" };
const primaryBtnStyle: React.CSSProperties = { height: 36, padding: "0 16px", background: "var(--primary)", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 };
const outlineBtnStyle: React.CSSProperties = { height: 36, padding: "0 16px", background: "white", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 };
const iconBtnStyle: React.CSSProperties = { padding: 6, border: "none", background: "transparent", cursor: "pointer", borderRadius: 6, color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center" };
const iconBtnSmall: React.CSSProperties = { ...iconBtnStyle, padding: 4, border: "1px solid var(--border)", background: "white", color: "var(--text-secondary)" };
const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const modalStyle: React.CSSProperties = { background: "white", borderRadius: 14, padding: 24, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px -10px rgba(0,0,0,0.3)", maxHeight: "90vh", overflowY: "auto" };
