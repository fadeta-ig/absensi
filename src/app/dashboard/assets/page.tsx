"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
    Search, Filter, RefreshCw, History, X,
    Smartphone, Laptop, Phone, Package,
    User, Users, Building2, UserX,
} from "lucide-react";

type Asset = {
    id: string; assetCode: string; name: string;
    category: "HANDPHONE" | "LAPTOP" | "NOMOR_HP";
    kondisi: "BAIK" | "KURANG_BAIK" | "RUSAK";
    status: "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "RETIRED";
    holderType: "EMPLOYEE" | "FORMER_EMPLOYEE" | "TEAM" | "GA_POOL";
    assignedToName: string | null;
    nomorIndosat: string | null;
    expiredDate: string | null;
    keterangan: string | null;
};

type HistoryRow = {
    id: string; action: string;
    fromName: string | null; toName: string | null;
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
    };
    const c = map[status] ?? { label: status, color: "#6b7280", bg: "#f3f4f6" };
    return <span style={{ fontSize: 11, fontWeight: 600, color: c.color, background: c.bg, padding: "2px 8px", borderRadius: 999 }}>{c.label}</span>;
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

function HolderIcon({ holderType }: { holderType: string }) {
    const icons: Record<string, React.ReactNode> = {
        EMPLOYEE: <User size={13} color="#3b82f6" />,
        FORMER_EMPLOYEE: <UserX size={13} color="#ef4444" />,
        TEAM: <Users size={13} color="#8b5cf6" />,
        GA_POOL: <Building2 size={13} color="#10b981" />,
    };
    return <span style={{ display: "inline-flex", alignItems: "center" }}>{icons[holderType]}</span>;
}

// ─── History Modal (read-only) ──────────────────────────────────

function HistoryModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/assets/history?assetId=${asset.id}`)
            .then(r => r.json()).then(setHistory).finally(() => setLoading(false));
    }, [asset.id]);

    const actionLabel: Record<string, string> = {
        assigned: "Diberikan ke", returned: "Dikembalikan ke GA",
        sent_to_maintenance: "Dikirim perbaikan", kondisi_changed: "Kondisi diubah", retired: "Di-retire",
    };

    return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "white", borderRadius: 14, padding: 24, width: "100%", maxWidth: 560, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px -10px rgba(0,0,0,0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Riwayat Perpindahan</h3>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{asset.assetCode} — {asset.name}</p>
                    </div>
                    <button onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", borderRadius: 6, color: "var(--text-muted)" }}><X size={18} /></button>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                    {loading ? (
                        <div style={{ textAlign: "center", padding: 32 }}><div className="spinner" /></div>
                    ) : history.length === 0 ? (
                        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: 24 }}>Belum ada riwayat perpindahan</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {history.map((h, i) => (
                                <div key={h.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontSize: 13, position: "relative" }}>
                                    {i < history.length - 1 && (
                                        <div style={{ position: "absolute", left: 21, bottom: -9, width: 2, height: 9, background: "var(--border)" }} />
                                    )}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                        <div>
                                            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{actionLabel[h.action] ?? h.action}</span>
                                            <p style={{ color: "var(--text-muted)", marginTop: 3, fontSize: 12 }}>
                                                <span style={{ color: "#6b7280" }}>{h.fromName ?? "GA Pool"}</span>
                                                {" → "}
                                                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{h.toName ?? "GA Pool"}</span>
                                            </p>
                                            {h.notes && <p style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>📝 {h.notes}</p>}
                                        </div>
                                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                                            <KondisiBadge kondisi={h.kondisiSaat} />
                                            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                                                {new Date(h.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                                            </p>
                                        </div>
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

// ─── Summary Stats ──────────────────────────────────────────────

function StatPill({ label, count, color }: { label: string; count: number; color: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "white", border: "1px solid var(--border)", borderRadius: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
            <span style={{ fontSize: 14, fontWeight: 700, marginLeft: "auto" }}>{count}</span>
        </div>
    );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function HrAssetsPage() {
    const searchParams = useSearchParams();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [filtered, setFiltered] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterCat, setFilterCat] = useState(searchParams.get("category") ?? "ALL");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [historyTarget, setHistoryTarget] = useState<Asset | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/assets");
            if (res.ok) setAssets(await res.json());
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const cat = searchParams.get("category") ?? "ALL";
        setFilterCat(cat);
    }, [searchParams]);

    useEffect(() => {
        let f = [...assets];
        if (filterCat !== "ALL") f = f.filter(a => a.category === filterCat);
        if (filterStatus !== "ALL") f = f.filter(a => a.status === filterStatus);
        if (search.trim()) {
            const q = search.toLowerCase();
            f = f.filter(a =>
                a.name.toLowerCase().includes(q) ||
                a.assetCode.toLowerCase().includes(q) ||
                (a.assignedToName ?? "").toLowerCase().includes(q)
            );
        }
        setFiltered(f);
    }, [assets, search, filterCat, filterStatus]);

    // Stats
    const available = assets.filter(a => a.status === "AVAILABLE").length;
    const inUse = assets.filter(a => a.status === "IN_USE").length;
    const maintenance = assets.filter(a => a.status === "MAINTENANCE").length;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700 }}>Aset Perusahaan</h1>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                        Monitoring aset — untuk pengelolaan hubungi GA
                    </p>
                </div>
                <button onClick={load} style={{ height: 36, padding: "0 12px", background: "white", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* Quick stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <StatPill label="Total Aset" count={assets.length} color="#6366f1" />
                <StatPill label="Tersedia" count={available} color="#10b981" />
                <StatPill label="Digunakan" count={inUse} color="#3b82f6" />
                <StatPill label="Perbaikan" count={maintenance} color="#f59e0b" />
            </div>

            {/* Info banner untuk HR */}
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#1e40af", display: "flex", alignItems: "center", gap: 8 }}>
                <Package size={15} />
                <span>Halaman ini hanya untuk monitoring. Untuk assign, return, atau edit aset, hubungi tim <strong>GA (General Affairs)</strong>.</span>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                    <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Cari nama aset atau pemegang..."
                        style={{ height: 36, padding: "0 10px 0 32px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", background: "white", width: "100%", boxSizing: "border-box" }}
                    />
                </div>
                <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" }}>
                    <option value="ALL">Semua Kategori</option>
                    <option value="HANDPHONE">Handphone</option>
                    <option value="LAPTOP">Laptop</option>
                    <option value="NOMOR_HP">Nomor HP</option>
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" }}>
                    <option value="ALL">Semua Status</option>
                    <option value="AVAILABLE">Tersedia</option>
                    <option value="IN_USE">Digunakan</option>
                    <option value="MAINTENANCE">Perbaikan</option>
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
                    <Filter size={14} />
                    <span>{filtered.length} dari {assets.length}</span>
                </div>
            </div>

            {/* Table */}
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {loading ? (
                    <div style={{ textAlign: "center", padding: 48 }}><div className="spinner" /></div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: "var(--secondary)" }}>
                                    {["Kode Aset", "Nama", "Kategori", "Kondisi", "Status", "Pemegang Saat Ini", "Riwayat"].map(h => (
                                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 36, color: "var(--text-muted)" }}>Tidak ada aset ditemukan</td></tr>
                                ) : filtered.map(a => (
                                    <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                        <td style={{ padding: "10px 14px" }}>
                                            <span style={{ fontFamily: "monospace", background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>{a.assetCode}</span>
                                        </td>
                                        <td style={{ padding: "10px 14px", maxWidth: 220 }}>
                                            <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{a.name}</span>
                                            {a.nomorIndosat && (
                                                <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>{a.nomorIndosat}</span>
                                            )}
                                            {a.expiredDate && (
                                                <span style={{ display: "block", fontSize: 11, color: new Date(a.expiredDate) < new Date() ? "#ef4444" : "#f59e0b" }}>
                                                    Exp: {new Date(a.expiredDate).toLocaleDateString("id-ID", { month: "short", year: "numeric" })}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ padding: "10px 14px" }}><CategoryBadge cat={a.category} /></td>
                                        <td style={{ padding: "10px 14px" }}><KondisiBadge kondisi={a.kondisi} /></td>
                                        <td style={{ padding: "10px 14px" }}><StatusBadge status={a.status} /></td>
                                        <td style={{ padding: "10px 14px" }}>
                                            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                                <HolderIcon holderType={a.holderType} />
                                                <span style={{ color: a.holderType === "GA_POOL" ? "var(--text-muted)" : "var(--text-primary)", fontStyle: a.holderType === "GA_POOL" ? "italic" : "normal" }}>
                                                    {a.assignedToName ?? "Di GA"}
                                                </span>
                                            </span>
                                        </td>
                                        <td style={{ padding: "10px 14px" }}>
                                            <button
                                                onClick={() => setHistoryTarget(a)}
                                                title="Lihat riwayat"
                                                style={{ padding: "4px 8px", border: "1px solid var(--border)", background: "white", cursor: "pointer", borderRadius: 6, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
                                            >
                                                <History size={13} /> Riwayat
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* History Modal */}
            {historyTarget && <HistoryModal asset={historyTarget} onClose={() => setHistoryTarget(null)} />}
        </div>
    );
}
