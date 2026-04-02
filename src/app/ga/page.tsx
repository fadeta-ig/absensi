"use client";

import { useEffect, useState } from "react";
import {
    Package, Smartphone, Laptop, Phone,
    CheckCircle, AlertCircle, Wrench, TrendingUp, Clock,
} from "lucide-react";

type AssetStats = {
    total: number;
    available: number;
    inUse: number;
    maintenance: number;
    rusak: number;
    byCategory: { HANDPHONE: number; LAPTOP: number; NOMOR_HP: number };
    expiringNomor: number;
};

type RecentAsset = {
    id: string; assetCode: string; name: string;
    category: string; status: string; holderType: string; assignedToName: string | null;
};

export default function GaDashboard() {
    const [stats, setStats] = useState<AssetStats | null>(null);
    const [recent, setRecent] = useState<RecentAsset[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch("/api/assets");
                if (!res.ok) return;
                const assets: RecentAsset[] = await res.json();

                const now = new Date();
                const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const fullAssets: any[] = assets;

                const s: AssetStats = {
                    total: assets.length,
                    available: assets.filter(a => a.status === "AVAILABLE").length,
                    inUse: assets.filter(a => a.status === "IN_USE").length,
                    maintenance: assets.filter(a => a.status === "MAINTENANCE").length,
                    rusak: fullAssets.filter(a => a.kondisi === "RUSAK").length,
                    byCategory: {
                        HANDPHONE: assets.filter(a => a.category === "HANDPHONE").length,
                        LAPTOP: assets.filter(a => a.category === "LAPTOP").length,
                        NOMOR_HP: assets.filter(a => a.category === "NOMOR_HP").length,
                    },
                    expiringNomor: fullAssets.filter(a =>
                        a.category === "NOMOR_HP" && a.expiredDate &&
                        new Date(a.expiredDate) <= in30Days
                    ).length,
                };

                setStats(s);
                setRecent(assets.filter(a => a.status === "AVAILABLE").slice(0, 8));
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="spinner" />
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">Dashboard GA</h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Manajemen aset perusahaan WIG</p>
            </div>

            {/* Alert expiry */}
            {stats && stats.expiringNomor > 0 && (
                <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                    <Clock size={18} color="#d97706" />
                    <span style={{ fontSize: 14, color: "#92400e", fontWeight: 500 }}>
                        ⚠️ {stats.expiringNomor} nomor Indosat akan expired dalam 30 hari ke depan
                    </span>
                    <a href="/ga/nomor" style={{ marginLeft: "auto", fontSize: 13, color: "#d97706", textDecoration: "underline" }}>Lihat</a>
                </div>
            )}

            {/* Stats Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
                <StatCard icon={<Package size={22} color="#6366f1" />} label="Total Aset" value={stats?.total ?? 0} bg="#eef2ff" />
                <StatCard icon={<CheckCircle size={22} color="#10b981" />} label="Tersedia" value={stats?.available ?? 0} bg="#d1fae5" />
                <StatCard icon={<TrendingUp size={22} color="#3b82f6" />} label="Digunakan" value={stats?.inUse ?? 0} bg="#dbeafe" />
                <StatCard icon={<Wrench size={22} color="#f59e0b" />} label="Perbaikan" value={stats?.maintenance ?? 0} bg="#fef3c7" />
                <StatCard icon={<AlertCircle size={22} color="#ef4444" />} label="Rusak" value={stats?.rusak ?? 0} bg="#fee2e2" />
            </div>

            {/* Category breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                <CategoryCard icon={<Smartphone size={20} color="#6366f1" />} label="Handphone" count={stats?.byCategory.HANDPHONE ?? 0} />
                <CategoryCard icon={<Laptop size={20} color="#0ea5e9" />} label="Laptop" count={stats?.byCategory.LAPTOP ?? 0} />
                <CategoryCard icon={<Phone size={20} color="#10b981" />} label="Nomor Indosat" count={stats?.byCategory.NOMOR_HP ?? 0} />
            </div>

            {/* Stok Available */}
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600 }}>Aset Tersedia di GA</h2>
                    <a href="/ga/assets?filter=available" style={{ fontSize: 13, color: "var(--primary)", textDecoration: "none" }}>Lihat semua →</a>
                </div>
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: "var(--secondary)" }}>
                                <th style={thStyle}>Kode</th>
                                <th style={thStyle}>Nama Aset</th>
                                <th style={thStyle}>Kategori</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recent.length === 0 ? (
                                <tr><td colSpan={3} style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>Tidak ada aset tersedia</td></tr>
                            ) : recent.map(a => (
                                <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                    <td style={tdStyle}><span style={{ fontFamily: "monospace", background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>{a.assetCode}</span></td>
                                    <td style={tdStyle}>{a.name}</td>
                                    <td style={tdStyle}><CategoryBadge cat={a.category} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: number; bg: string }) {
    return (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
            <p style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{value}</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</p>
        </div>
    );
}

function CategoryCard({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
    return (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            {icon}
            <div>
                <p style={{ fontSize: 18, fontWeight: 700 }}>{count}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</p>
            </div>
        </div>
    );
}

function CategoryBadge({ cat }: { cat: string }) {
    const map: Record<string, { label: string; color: string; bg: string }> = {
        HANDPHONE: { label: "HP", color: "#6366f1", bg: "#eef2ff" },
        LAPTOP: { label: "Laptop", color: "#0ea5e9", bg: "#e0f2fe" },
        NOMOR_HP: { label: "Nomor", color: "#10b981", bg: "#d1fae5" },
    };
    const c = map[cat] ?? { label: cat, color: "#6b7280", bg: "#f3f4f6" };
    return <span style={{ fontSize: 11, fontWeight: 600, color: c.color, background: c.bg, padding: "2px 8px", borderRadius: 999 }}>{c.label}</span>;
}

const thStyle: React.CSSProperties = { padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" };
const tdStyle: React.CSSProperties = { padding: "10px 16px", color: "var(--text-primary)" };
