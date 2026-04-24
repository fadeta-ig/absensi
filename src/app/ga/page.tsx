"use client";

import { useEffect, useState } from "react";
import {
    Package, Smartphone, Laptop, Phone,
    CheckCircle, AlertCircle, Wrench, TrendingUp, Clock, AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { AssetWithHistory } from "@/lib/types/asset";
import { StatCard, CategoryStat } from "@/features/ga/components/AssetStatCards";
import { CategoryBadge } from "@/features/ga/components/badges/AssetBadges";
import { formatRupiah } from "@/lib/utils/formatters";

type AssetStats = {
    total: number;
    available: number;
    inUse: number;
    maintenance: number;
    rusak: number;
    totalNilai: number;
    byCategory: Array<{ name: string; prefix: string; count: number }>;
    expiringNomor: number;
    expiringWarranty: number;
};

// Helper for UI icons based on category prefix/name
function getCategoryIcon(prefix: string, name: string) {
    const p = prefix.toUpperCase();
    const n = name.toUpperCase();
    if (p === "LT" || n.includes("LAPTOP")) return { icon: <Laptop size={20} />, color: "#0ea5e9" };
    if (p === "HP" || n.includes("HP") || n.includes("HANDPHONE") || n.includes("MOBILE")) return { icon: <Smartphone size={20} />, color: "#6366f1" };
    if (p === "NUM" || n.includes("NOMOR") || n.includes("SIM") || n.includes("IDN")) return { icon: <Phone size={20} />, color: "#10b981" };
    return { icon: <Package size={20} />, color: "#94a3b8" };
}
export default function GaDashboard() {
    const [stats, setStats] = useState<AssetStats | null>(null);
    const [recent, setRecent] = useState<AssetWithHistory[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const [statsRes, recentRes] = await Promise.all([
                    fetch("/api/assets/stats"),
                    fetch("/api/assets?status=AVAILABLE&limit=8")
                ]);

                if (statsRes.ok) {
                    const statsData = await statsRes.json();
                    setStats(statsData);
                }

                if (recentRes.ok) {
                    const recentData = await recentRes.json();
                    // Since API returns { data: [...], ... } for paginated assets
                    setRecent(recentData.data ? recentData.data.slice(0, 8) : recentData.slice(0, 8));
                }
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
        <div className="space-y-6 p-6 max-w-7xl mx-auto min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between border-b border-slate-100 pb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-800">Dashboard GA</h1>
                    <p className="text-sm text-slate-500 mt-1">Manajemen aset perusahaan WIG</p>
                </div>
                <div className="mt-4 md:mt-0">
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">Operational Mode: Active</span>
                </div>
            </div>

            {/* Alert expiry */}
            <div className="flex flex-col gap-3">
                {stats && stats.expiringNomor > 0 && (
                    <div className="bg-amber-50 border border-amber-500 rounded-xl px-4 py-3 flex items-center gap-3">
                        <AlertTriangle size={18} className="text-amber-600" />
                        <span className="text-sm text-amber-800 font-medium">
                            {stats.expiringNomor} nomor SIM akan expired dalam 30 hari ke depan
                        </span>
                        <Link href="/ga/nomor" className="ml-auto text-sm text-amber-600 underline font-medium hover:text-amber-700">Lihat</Link>
                    </div>
                )}
                {stats && stats.expiringWarranty > 0 && (
                    <div className="bg-red-50 border border-red-500 rounded-xl px-4 py-3 flex items-center gap-3">
                        <AlertCircle size={18} className="text-red-700" />
                        <span className="text-sm text-red-800 font-medium">
                            Peringatan: {stats.expiringWarranty} aset akan habis masa garansinya bulan ini!
                        </span>
                        <Link href="/ga/assets" className="ml-auto text-sm text-red-700 underline font-medium hover:text-red-800">Lihat</Link>
                    </div>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard icon={<Package />} label="Total Aset" value={stats?.total ?? 0} bg="#eef2ff" color="#6366f1" />
                <StatCard icon={<TrendingUp />} label="Total Kapital" value={stats?.totalNilai ? formatRupiah(stats.totalNilai) : "Rp 0"} bg="#e0f2fe" color="#0284c7" />
                <StatCard icon={<CheckCircle />} label="Tersedia" value={stats?.available ?? 0} bg="#d1fae5" color="#10b981" />
                <StatCard icon={<Clock />} label="Digunakan" value={stats?.inUse ?? 0} bg="#dbeafe" color="#3b82f6" />
                <StatCard icon={<Wrench />} label="Perbaikan" value={stats?.maintenance ?? 0} bg="#fef3c7" color="#f59e0b" />
                <StatCard icon={<AlertCircle />} label="Rusak" value={stats?.rusak ?? 0} bg="#fee2e2" color="#ef4444" />
            </div>

            {/* Category breakdown (Synchronized with DB) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats?.byCategory.map((cat, idx) => {
                    const { icon, color } = getCategoryIcon(cat.prefix, cat.name);
                    return (
                        <CategoryStat 
                            key={idx}
                            icon={icon}
                            color={color}
                            label={cat.name} 
                            count={cat.count} 
                        />
                    );
                })}
            </div>

            {/* Stok Available */}
            <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-[0_2px_15px_-3px_rgba(0,0,0,0.04)]">
                <div className="px-5 py-4 border-b flex justify-between items-center">
                    <h2 className="text-[15px] font-semibold text-slate-800">Aset Tersedia di GA</h2>
                    <Link href="/ga/assets?status=AVAILABLE" className="text-[13px] font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">Lihat semua &rarr;</Link>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Kode Aset</th>
                                <th className="px-6 py-4 font-semibold">Nama Aset</th>
                                <th className="px-6 py-4 font-semibold">Kategori</th>
                                <th className="px-6 py-4 font-semibold">Tipe Entitas</th>
                                <th className="px-6 py-4 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {recent.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-6 text-slate-400">Tidak ada aset tersedia saat ini.</td></tr>
                            ) : recent.map(asset => (
                                <tr key={asset.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-600">{asset.assetCode}</td>
                                    <td className="px-6 py-4 font-medium text-slate-800">{asset.name}</td>
                                    <td className="px-6 py-4">
                                        <CategoryBadge prefix={asset.category?.prefix} name={asset.category?.name || "-"} />
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-md font-medium border border-slate-200">
                                            {asset.holderType === "GA_POOL" ? "GA Pool" : "Company"}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Link href={`/ga/assets/${asset.id}`} className="text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">Detail</Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}




