"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
    Search, Filter, RefreshCw, History, X,
    Smartphone, Laptop, Phone, Package,
    User, Users, Building2, UserX,
    CheckCircle, Wrench, TrendingUp, AlertCircle,
} from "lucide-react";
import Pagination from "@/components/ui/Pagination";

// ─── Types ─────────────────────────────────────────────────────

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

const PAGE_SIZE = 20;

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

// ─── History Modal ──────────────────────────────────────────────

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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "white", borderRadius: 14, padding: 24, width: "100%", maxWidth: 560, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px -10px rgba(0,0,0,0.3)" }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>Riwayat Perpindahan</h3>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                            <span style={{ fontFamily: "monospace", background: "#f3f4f6", padding: "1px 6px", borderRadius: 4 }}>{asset.assetCode}</span>
                            {" "}{asset.name}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ padding: 6, border: "none", background: "transparent", cursor: "pointer", borderRadius: 6, color: "var(--text-muted)", display: "flex" }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto" }}>
                    {loading ? (
                        <div style={{ textAlign: "center", padding: 32 }}><div className="spinner" /></div>
                    ) : history.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                            <Package size={32} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
                            <p>Belum ada riwayat perpindahan</p>
                        </div>
                    ) : (
                        <div style={{ position: "relative" }}>
                            {/* Timeline line */}
                            <div style={{ position: "absolute", left: 16, top: 20, bottom: 20, width: 2, background: "var(--border)" }} />
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {history.map((h) => (
                                    <div key={h.id} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                                        {/* Timeline dot */}
                                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#eef2ff", border: "2px solid #6366f1", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1 }}>
                                            <Package size={14} color="#6366f1" />
                                        </div>
                                        {/* Content */}
                                        <div style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                                <div>
                                                    <span style={{ fontWeight: 600 }}>{actionLabel[h.action] ?? h.action}</span>
                                                    <p style={{ color: "var(--text-muted)", marginTop: 3, fontSize: 12 }}>
                                                        <span style={{ color: "#6b7280" }}>{h.fromName ?? "GA Pool"}</span>
                                                        {" → "}
                                                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{h.toName ?? "GA Pool"}</span>
                                                    </p>
                                                    {h.notes && <p style={{ marginTop: 4, color: "#6b7280", fontSize: 12, fontStyle: "italic" }}>"{h.notes}"</p>}
                                                </div>
                                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                                    <KondisiBadge kondisi={h.kondisiSaat} />
                                                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, whiteSpace: "nowrap" }}>
                                                        {new Date(h.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
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

// ─── Main Inner Page ────────────────────────────────────────────

function HrAssetsPageInner() {
    const searchParams = useSearchParams();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [filtered, setFiltered] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterCat, setFilterCat] = useState("ALL");
    const [filterStatus, setFilterStatus] = useState("ALL");
    const [historyTarget, setHistoryTarget] = useState<Asset | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/assets");
            if (res.ok) setAssets(await res.json());
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Sync filter dari URL
    useEffect(() => {
        const cat    = searchParams.get("category") ?? "ALL";
        const status = searchParams.get("status")   ?? "ALL";
        setFilterCat(cat);
        setFilterStatus(status);
        setCurrentPage(1);
    }, [searchParams]);

    // Apply filters
    useEffect(() => {
        let f = [...assets];
        if (filterCat !== "ALL")    f = f.filter(a => a.category === filterCat);
        if (filterStatus !== "ALL") f = f.filter(a => a.status === filterStatus);
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
        setCurrentPage(1);
    }, [assets, search, filterCat, filterStatus]);

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

    const pageItems = filtered.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    const pageTitle = filterCat === "HANDPHONE" ? "Aset Handphone" :
                      filterCat === "LAPTOP"    ? "Aset Laptop"    :
                      filterCat === "NOMOR_HP"  ? "Nomor Indosat"  :
                      filterStatus === "AVAILABLE" ? "Stok Tersedia" :
                      "Aset Perusahaan";

    return (
        <div className="space-y-5">
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700 }}>{pageTitle}</h1>
                    <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                        Monitoring aset perusahaan — read only
                    </p>
                </div>
                <button onClick={load} style={{ height: 35, padding: "0 14px", background: "white", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* Stats Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                <StatCard icon={<Package size={20} />}      label="Total Aset"   value={stats.total}       bg="#eef2ff"  color="#6366f1" />
                <StatCard icon={<CheckCircle size={20} />}  label="Tersedia"     value={stats.available}   bg="#d1fae5"  color="#10b981" />
                <StatCard icon={<TrendingUp size={20} />}   label="Digunakan"    value={stats.inUse}       bg="#dbeafe"  color="#3b82f6" />
                <StatCard icon={<Wrench size={20} />}       label="Perbaikan"    value={stats.maintenance} bg="#fef3c7"  color="#f59e0b" />
                <StatCard icon={<AlertCircle size={20} />}  label="Kondisi Rusak" value={stats.rusak}      bg="#fee2e2"  color="#ef4444" />
            </div>

            {/* Info banner */}
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#1e40af", display: "flex", alignItems: "center", gap: 10 }}>
                <Package size={15} />
                <span>Halaman ini <strong>hanya untuk monitoring</strong>. Untuk request assign, return, atau servis aset — hubungi tim <strong>GA (General Affairs)</strong>.</span>
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

            {/* Search + filter dropdown */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
                    <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Cari nama aset, pemegang, atau nomor..."
                        style={{ height: 36, padding: "0 10px 0 32px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", background: "white", width: "100%", boxSizing: "border-box" }}
                    />
                </div>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "white" }}>
                    <option value="ALL">Semua Status</option>
                    <option value="AVAILABLE">Tersedia</option>
                    <option value="IN_USE">Digunakan</option>
                    <option value="MAINTENANCE">Perbaikan</option>
                    <option value="RETIRED">Retired</option>
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" }}>
                    <Filter size={14} />
                    <span>{filtered.length} dari {assets.length} aset</span>
                </div>
            </div>

            {/* Table */}
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {loading ? (
                    <div style={{ textAlign: "center", padding: 56 }}><div className="spinner" /></div>
                ) : (
                    <>
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: "var(--secondary)" }}>
                                        {["Kode Aset", "Nama Aset", "Kategori", "Kondisi", "Status", "Pemegang Saat Ini", "Riwayat"].map(h => (
                                            <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageItems.length === 0 ? (
                                        <tr><td colSpan={7} style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                                            <Package size={32} style={{ margin: "0 auto 8px", opacity: 0.25 }} />
                                            <p>{search ? `Tidak ada hasil untuk "${search}"` : "Tidak ada aset ditemukan"}</p>
                                        </td></tr>
                                    ) : pageItems.map(a => (
                                        <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                            <td style={{ padding: "10px 14px" }}>
                                                <span style={{ fontFamily: "monospace", background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>{a.assetCode}</span>
                                            </td>
                                            <td style={{ padding: "10px 14px", maxWidth: 220 }}>
                                                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{a.name}</span>
                                                {a.nomorIndosat && (
                                                    <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>{a.nomorIndosat}</span>
                                                )}
                                                {a.expiredDate && (() => {
                                                    const exp = new Date(a.expiredDate);
                                                    const now = new Date();
                                                    const color = exp < now ? "#ef4444" : exp < new Date(now.getTime() + 30 * 86400000) ? "#f59e0b" : "#6b7280";
                                                    return <span style={{ display: "block", fontSize: 11, color }}>Exp: {exp.toLocaleDateString("id-ID", { month: "short", year: "numeric" })}</span>;
                                                })()}
                                                {a.keterangan && (
                                                    <span style={{ display: "block", fontSize: 11, color: "#f59e0b" }} title={a.keterangan}>[!] {a.keterangan.substring(0, 26)}{a.keterangan.length > 26 ? "…" : ""}</span>
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
                                                    style={{ padding: "5px 10px", border: "1px solid var(--border)", background: "white", cursor: "pointer", borderRadius: 7, color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500 }}
                                                >
                                                    <History size={13} /> Riwayat
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            currentPage={currentPage}
                            totalItems={filtered.length}
                            pageSize={PAGE_SIZE}
                            onPageChange={setCurrentPage}
                        />
                    </>
                )}
            </div>

            {historyTarget && <HistoryModal asset={historyTarget} onClose={() => setHistoryTarget(null)} />}
        </div>
    );
}

// ─── Export dengan Suspense ─────────────────────────────────────

export default function HrAssetsPage() {
    return (
        <Suspense fallback={<div style={{ textAlign: "center", padding: 56 }}><div className="spinner" /></div>}>
            <HrAssetsPageInner />
        </Suspense>
    );
}
