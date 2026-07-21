"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, RefreshCw, QrCode, Package, TrendingUp, CheckCircle, Wrench, AlertCircle, Download, Pencil, Trash2 } from "lucide-react";
import Pagination from "@/components/ui/Pagination";
import { AssetWithHistory } from "@/lib/types/asset";
import { KondisiBadge, StatusBadge, HolderIcon, CategoryBadge } from "@/features/ga/components/badges/AssetBadges";
import { StatCard, FilterPill } from "@/features/ga/components/AssetStatCards";
import { formatRupiah } from "@/lib/utils/formatters";
import { getResponseErrorMessage } from "@/lib/clientErrors";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";

// Define AssetStats from our new deduped API
type AssetStats = {
    total: number;
    available: number;
    inUse: number;
    maintenance: number;
    rusak: number;
    totalNilai: number;
};

export default function AssetsPage() {
    const router = useRouter();
    const toast = useToast();
    const confirm = useConfirm();
    const [assets, setAssets] = useState<AssetWithHistory[]>([]);
    const [stats, setStats] = useState<AssetStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [loadError, setLoadError] = useState("");

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [filterCategory, setFilterCategory] = useState("");
    const [filterStatus, setFilterStatus] = useState("");
    const [filterKondisi, setFilterKondisi] = useState("");
    
    // Pagination (Server-Side)
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [categories, setCategories] = useState<{ id: string; name: string; prefix: string }[]>([]);
    const PER_PAGE = 20;

    const fetchCategories = useCallback(async () => {
        try {
            const res = await fetch("/api/assets/categories");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat kategori aset."));
            setCategories(await res.json());
        } catch (error) {
            console.error("Gagal mengambil kategori", error);
            setCategories([]);
            setLoadError(error instanceof Error ? error.message : "Gagal memuat kategori aset.");
        }
    }, []);

    const fetchAssets = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError("");
            const params = new URLSearchParams();
            if (filterCategory) params.set("category", filterCategory);
            if (filterStatus && filterStatus !== "ALL") params.set("status", filterStatus);
            if (filterKondisi && filterKondisi !== "ALL") params.set("kondisi", filterKondisi);
            if (debouncedSearch) params.set("search", debouncedSearch);
            params.set("page", String(currentPage));
            params.set("limit", String(PER_PAGE));
            params.set("excludeCategory", "NUM");

            const res = await fetch(`/api/assets?${params.toString()}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat daftar aset."));
            const data = await res.json();
            setAssets(data.data || []);
            setTotalItems(data.total || 0);
        } catch (error) {
            console.error("Gagal mengambil data aset", error);
            setAssets([]);
            setTotalItems(0);
            setLoadError(error instanceof Error ? error.message : "Gagal memuat daftar aset.");
        } finally {
            setLoading(false);
        }
    }, [filterCategory, filterStatus, filterKondisi, debouncedSearch, currentPage]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch("/api/assets/stats?excludeCategory=NUM");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat statistik aset."));
            setStats(await res.json());
        } catch (error) {
            console.error("Gagal mengambil data statistik", error);
            setStats(null);
            setLoadError(error instanceof Error ? error.message : "Gagal memuat statistik aset.");
        }
    }, []);

    useEffect(() => {
        fetchAssets();
    }, [fetchAssets]);

    useEffect(() => {
        fetchStats();
        fetchCategories();
    }, [fetchStats, fetchCategories]);

    // Handle search debounce
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            if (searchQuery) setCurrentPage((page) => page === 1 ? page : 1);
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const handleExportXlsx = async () => {
        setExporting(true);
        try {
            const params = new URLSearchParams();
            if (filterCategory) params.set("category", filterCategory);
            if (filterStatus) params.set("status", filterStatus);
            if (filterKondisi) params.set("kondisi", filterKondisi);
            if (searchQuery) params.set("search", searchQuery);
            params.set("excludeCategory", "NUM");

            // Fetch as blob
            const res = await fetch(`/api/assets/export?${params.toString()}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengexport data aset."));

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `Data_Aset_WIG_${new Date().toISOString().split("T")[0]}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast("Export aset berhasil dibuat.", "success");
        } catch (err) {
            console.error(err);
            toast(err instanceof Error ? err.message : "Gagal mengexport file.", "error");
        } finally {
            setExporting(false);
        }
    };

    const totalPages = Math.ceil(totalItems / PER_PAGE);

    const handleDelete = (asset: AssetWithHistory) => {
        confirm({
            title: "Hapus aset secara permanen?",
            message: `Aset "${asset.name}" (${asset.assetCode}) akan dihapus beserta riwayat terkait. Tindakan ini tidak dapat dibatalkan.`,
            confirmLabel: "Hapus Permanen",
            cancelLabel: "Batal",
            variant: "danger",
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
                    if (!res.ok) {
                        throw new Error(await getResponseErrorMessage(res, "Gagal menghapus aset."));
                    }
                    await fetchAssets();
                    await fetchStats();
                    toast("Aset berhasil dihapus.", "success");
                } catch (error) {
                    toast(error instanceof Error ? error.message : "Aset belum terhapus karena koneksi bermasalah. Periksa internet lalu coba lagi.", "error");
                }
            },
        });
    };

    return (
        <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Manajemen Aset</h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">Kelola data inventaris, alokasi karyawan, dan pemeliharaan WIG.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto flex-wrap">
                    <button 
                        onClick={() => router.push("/ga/scan")}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--secondary)] transition-colors"
                    >
                        <QrCode size={16} /> Scan
                    </button>
                    <button 
                        onClick={() => router.push("/ga/assets/import")}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[var(--category-1-bg)] border border-[var(--category-1)]/20 text-[var(--category-1)] px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-colors"
                    >
                        Import Massal
                    </button>
                    <button 
                        disabled={exporting}
                        onClick={handleExportXlsx}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[var(--success-bg)] border border-[var(--success-border)] text-[var(--success)] px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-50"
                    >
                        <Download size={16} /> {exporting ? "Mengekspor..." : "Export XLSX"}
                    </button>
                    <button 
                        onClick={() => router.push("/ga/sim")}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[var(--info-bg)] border border-[var(--info-border)] text-[var(--info)] px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-colors shadow-sm"
                    >
                        Kelola Kartu SIM
                    </button>
                    <button 
                        onClick={() => router.push("/ga/assets/create")}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[var(--foreground)] text-[var(--background)] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--primary-light)] transition-colors shadow-sm"
                    >
                        <Plus size={16} /> Tambah Aset
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard icon={<Package />} label="Total Aset" value={stats?.total ?? 0} bg="var(--neutral-bg)" color="var(--neutral)" />
                <StatCard icon={<TrendingUp />} label="Total Nilai (Rp)" value={stats?.totalNilai ? formatRupiah(stats.totalNilai) : "0"} bg="var(--info-bg)" color="var(--info)" />
                <StatCard icon={<CheckCircle />} label="Tersedia (Pool)" value={stats?.available ?? 0} bg="var(--success-bg)" color="var(--success)" />
                <StatCard icon={<Wrench />} label="Maintenance" value={stats?.maintenance ?? 0} bg="var(--warning-bg)" color="var(--warning)" />
                <StatCard icon={<AlertCircle />} label="Kondisi Rusak" value={stats?.rusak ?? 0} bg="var(--destructive-bg)" color="var(--destructive)" />
            </div>

            {loadError && (
                <div className="rounded-xl border border-[var(--destructive)]/20 bg-[var(--destructive)]/10 px-4 py-3 flex items-start gap-2 text-sm text-[var(--destructive)]">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Table Area */}
            <div className="bg-[var(--card)] border rounded-xl shadow-sm flex flex-col flex-1 overflow-hidden relative">
                {/* Filters */}
                <div className="p-4 border-b bg-[var(--secondary)]/30 space-y-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Search */}
                        <div className="relative flex-1 font-sans">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
                            <input
                                type="text"
                                placeholder="Cari nama, kode aset, atau S/N..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all shadow-sm"
                            />
                        </div>
                        
                        {/* Dropdowns */}
                        <div className="flex flex-wrap gap-2">
                            <select 
                                value={filterCategory} 
                                onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
                                className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                            >
                                <option value="">Semua Kategori</option>
                                {categories.filter(c => c.prefix !== "NUM").map(cat => (
                                    <option key={cat.id} value={cat.prefix}>{cat.name}</option>
                                ))}
                            </select>

                            <select 
                                value={filterKondisi} 
                                onChange={(e) => { setFilterKondisi(e.target.value); setCurrentPage(1); }}
                                className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                            >
                                <option value="">Semua Kondisi</option>
                                <option value="BAIK">Kondisi Baik</option>
                                <option value="KURANG_BAIK">Kurang Baik</option>
                                <option value="RUSAK">Rusak</option>
                            </select>

                            <button 
                                onClick={() => {
                                    setSearchQuery("");
                                    setFilterCategory("");
                                    setFilterStatus("");
                                    setFilterKondisi("");
                                    setCurrentPage(1);
                                }}
                                className="px-3 py-2 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--destructive)] transition-colors"
                            >
                                Reset
                            </button>
                        </div>
                    </div>

                    {/* Status Pills */}
                    <div className="flex justify-between items-center bg-[var(--card)]/50 p-1.5 rounded-xl border border-[var(--border)]">
                        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
                            <FilterPill active={filterStatus === ""} label="Semua Status" onClick={() => { setFilterStatus(""); setCurrentPage(1); }} />
                            <FilterPill active={filterStatus === "AVAILABLE"} label="Tersedia" onClick={() => { setFilterStatus("AVAILABLE"); setCurrentPage(1); }} />
                            <FilterPill active={filterStatus === "IN_USE"} label="Digunakan" onClick={() => { setFilterStatus("IN_USE"); setCurrentPage(1); }} />
                            <FilterPill active={filterStatus === "MAINTENANCE"} label="Perbaikan" onClick={() => { setFilterStatus("MAINTENANCE"); setCurrentPage(1); }} />
                            <FilterPill active={filterStatus === "RETIRED"} label="Retired" onClick={() => { setFilterStatus("RETIRED"); setCurrentPage(1); }} />
                        </div>
                        
                        <button onClick={() => { fetchAssets(); fetchStats(); }} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-[var(--secondary)] border-b text-[var(--text-secondary)] text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Kode Aset</th>
                                <th className="px-6 py-4 font-semibold">Nama Aset</th>
                                <th className="px-6 py-4 font-semibold w-1">Kategori</th>
                                <th className="px-6 py-4 font-semibold w-1">Kondisi</th>
                                <th className="px-6 py-4 font-semibold w-1">Status</th>
                                <th className="px-6 py-4 font-semibold min-w-[200px]">Dipegang Oleh</th>
                                <th className="px-6 py-4 font-semibold w-1 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && assets.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-[var(--text-muted)]">Memuat data secara langsung (server-side)...</td>
                                </tr>
                            ) : loadError ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-[var(--destructive)]">{loadError}</td>
                                </tr>
                            ) : assets.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-[var(--text-muted)]">Tidak ada aset ditemukan.</td>
                                </tr>
                            ) : (
                                assets.map((asset) => (
                                    <tr 
                                        key={asset.id} 
                                        onClick={() => router.push(`/ga/assets/${asset.id}`)}
                                        className="hover:bg-[var(--secondary)]/80 transition-colors cursor-pointer group"
                                    >
                                        <td className="px-6 py-4 font-mono text-xs font-semibold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">{asset.assetCode}</td>
                                        <td className="px-6 py-4 font-medium text-[var(--text-primary)]">{asset.name}</td>
                                        <td className="px-6 py-4"><CategoryBadge prefix={asset.category?.prefix} name={asset.category?.name || "-"} /></td>
                                        <td className="px-6 py-4"><KondisiBadge kondisi={asset.kondisi} /></td>
                                        <td className="px-6 py-4"><StatusBadge status={asset.status} /></td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--secondary)] flex items-center justify-center border border-[var(--border)]">
                                                    <HolderIcon holderType={asset.holderType} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-[var(--text-primary)] text-xs">
                                                        {asset.holderType === "GA_POOL" ? "GA Pool (Tersedia)" :
                                                         asset.holderType === "COMPANY_OWNED" ? "Milik Perusahaan (Disimpan)" :
                                                         asset.assignedEmployee?.name || asset.assignedToName || "Tidak Diketahui"}
                                                    </span>
                                                    {asset.assignedEmployee && (
                                                        <span className="text-[10px] text-[var(--text-secondary)] border-l-2 border-[var(--border)] pl-1.5 mt-0.5">
                                                            {asset.assignedEmployee.department}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        {/* Aksi */}
                                        <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => router.push(`/ga/assets/${asset.id}/edit`)}
                                                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--category-1)] hover:bg-[var(--category-1-bg)] transition-colors"
                                                    title="Edit Aset"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(asset)}
                                                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-bg)] transition-colors"
                                                    title="Hapus Aset"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Pagination */}
                {totalPages > 1 && (
                    <div className="p-4 border-t bg-[var(--secondary)]/50 flex justify-between items-center text-sm text-[var(--text-secondary)]">
                        <span>Menampilkan {(currentPage - 1) * PER_PAGE + 1} - {Math.min(currentPage * PER_PAGE, totalItems)} dari {totalItems} aset</span>
                        <Pagination 
                            currentPage={currentPage}
                            totalItems={totalItems}
                            pageSize={PER_PAGE}
                            onPageChange={setCurrentPage}
                        />
                    </div>
                )}
            </div>

        </div>
    );
}

