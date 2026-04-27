"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, RefreshCw, QrCode, Package, TrendingUp, CheckCircle, Wrench, AlertCircle, Download, Pencil, Trash2 } from "lucide-react";
import Pagination from "@/components/ui/Pagination";
import { AssetWithHistory } from "@/lib/types/asset";
import { KondisiBadge, StatusBadge, HolderIcon, CategoryBadge } from "@/features/ga/components/badges/AssetBadges";
import { StatCard, FilterPill } from "@/features/ga/components/AssetStatCards";
import { formatRupiah } from "@/lib/utils/formatters";

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
    const [assets, setAssets] = useState<AssetWithHistory[]>([]);
    const [stats, setStats] = useState<AssetStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    // Delete confirm dialog state
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; code: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

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
            if (res.ok) setCategories(await res.json());
        } catch (error) {
            console.error("Gagal mengambil kategori", error);
        }
    }, []);

    const fetchAssets = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (filterCategory) params.set("category", filterCategory);
            if (filterStatus && filterStatus !== "ALL") params.set("status", filterStatus);
            if (filterKondisi && filterKondisi !== "ALL") params.set("kondisi", filterKondisi);
            if (debouncedSearch) params.set("search", debouncedSearch);
            params.set("page", String(currentPage));
            params.set("limit", String(PER_PAGE));
            params.set("excludeCategory", "NUM");

            const res = await fetch(`/api/assets?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setAssets(data.data || []);
                setTotalItems(data.total || 0);
            }
        } catch (error) {
            console.error("Gagal mengambil data aset", error);
        } finally {
            setLoading(false);
        }
    }, [filterCategory, filterStatus, filterKondisi, debouncedSearch, currentPage]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch("/api/assets/stats?excludeCategory=NUM");
            if (res.ok) setStats(await res.json());
        } catch (error) {
            console.error("Gagal mengambil data statistik", error);
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
            if (searchQuery && currentPage !== 1) {
                setCurrentPage(1);
            }
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const handleExportXlsx = async () => {
        setExporting(true);
        try {
            // Fetch all matching without pagination for export
            const params = new URLSearchParams();
            if (filterCategory) params.set("category", filterCategory);
            if (filterStatus) params.set("status", filterStatus);
            if (filterKondisi) params.set("kondisi", filterKondisi);
            if (searchQuery) params.set("search", searchQuery);
            params.set("excludeCategory", "NUM");
            params.set("limit", "5000"); // large limit

            const res = await fetch(`/api/assets?${params.toString()}`);
            if (!res.ok) throw new Error("Gagal load export");
            const data = await res.json();
            const items: AssetWithHistory[] = data.data || [];

            // Dynamically import exceljs to shrink bundle size
            const ExcelJS = (await import("exceljs")).default;
            const workbook = new ExcelJS.Workbook();
            workbook.creator = "WIG IT System";
            workbook.created = new Date();

            const worksheet = workbook.addWorksheet("Data Aset", {
                views: [{ showGridLines: false }]
            });

            // 1. Add Title / Report Header
            worksheet.mergeCells("A1:K1");
            const titleCell = worksheet.getCell("A1");
            titleCell.value = "LAPORAN DATA INVENTARIS ASET WIG";
            titleCell.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
            titleCell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF1E293B" } // slate-800
            };
            titleCell.alignment = { vertical: "middle", horizontal: "center" };

            worksheet.mergeCells("A2:K2");
            const subtitleCell = worksheet.getCell("A2");
            subtitleCell.value = `Tanggal Cetak: ${new Date().toLocaleDateString("id-ID")} | Total Aset: ${items.length}`;
            subtitleCell.font = { name: "Arial", size: 10, italic: true };
            subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
            
            worksheet.addRow([]); // empty row A3

            // 2. Define Table Header
            const headers = ["No", "Kode Aset", "Nama Aset", "Kategori", "Manufaktur", "S/N", "Kondisi", "Status", "Lokasi/Pemegang", "Tgl Beli", "Harga (Rp)"];
            const headerRow = worksheet.addRow(headers);
            
            headerRow.eachCell((cell) => {
                cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FF475569" } // slate-600
                };
                cell.alignment = { vertical: "middle", horizontal: "center" };
                cell.border = {
                    top: { style: "thin", color: { argb: "FFCBD5E1" } },
                    left: { style: "thin", color: { argb: "FFCBD5E1" } },
                    bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
                    right: { style: "thin", color: { argb: "FFCBD5E1" } }
                };
            });

            // 3. Add Data Rows
            items.forEach((a, index) => {
                const dipegangOleh = a.holderType === "GA_POOL" ? "GA Pool (Tersedia)" :
                                     a.holderType === "COMPANY_OWNED" ? "Milik Perusahaan (Disimpan)" :
                                     a.assignedEmployee?.name || a.assignedToName || a.holderType;
                
                const dept = a.assignedEmployee?.department ? ` (${a.assignedEmployee.department})` : "";

                const row = worksheet.addRow([
                    index + 1,
                    a.assetCode,
                    a.name,
                    a.category?.name || "-",
                    a.manufacturer || "-",
                    a.serialNumber || "-",
                    a.kondisi,
                    a.status,
                    `${dipegangOleh}${dept}`,
                    a.purchaseDate ? new Date(a.purchaseDate).toLocaleDateString("id-ID") : "-",
                    a.purchasePrice || 0
                ]);

                row.eachCell((cell, colNumber) => {
                    cell.font = { name: "Arial", size: 10 };
                    cell.border = {
                        top: { style: "thin", color: { argb: "FFCBD5E1" } },
                        left: { style: "thin", color: { argb: "FFCBD5E1" } },
                        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
                        right: { style: "thin", color: { argb: "FFCBD5E1" } }
                    };
                    
                    // Alignment
                    if ([1, 10].includes(colNumber)) { // No, Tgl Beli
                        cell.alignment = { vertical: "middle", horizontal: "center" };
                    } else if (colNumber === 11) { // Harga
                        cell.alignment = { vertical: "middle", horizontal: "right" };
                        cell.numFmt = '"Rp"#,##0.00';
                    } else {
                        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
                    }

                    // Alternate row color
                    if (index % 2 === 1) {
                        cell.fill = {
                            type: "pattern",
                            pattern: "solid",
                            fgColor: { argb: "FFF8FAFC" } // slate-50
                        };
                    }
                });
            });

            // 4. Adjust Column Widths
            worksheet.columns = [
                { width: 5 },  // No
                { width: 15 }, // Kode
                { width: 30 }, // Nama
                { width: 15 }, // Kategori
                { width: 15 }, // Manufaktur
                { width: 20 }, // S/N
                { width: 15 }, // Kondisi
                { width: 15 }, // Status
                { width: 35 }, // Pemegang
                { width: 15 }, // Tgl
                { width: 20 }  // Harga
            ];

            // 5. Generate and Download
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `Data_Aset_WIG_${new Date().toISOString().split("T")[0]}.xlsx`;
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error(err);
            alert("Gagal mengexport file.");
        } finally {
            setExporting(false);
        }
    };

    const totalPages = Math.ceil(totalItems / PER_PAGE);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/assets/${deleteTarget.id}`, { method: "DELETE" });
            if (res.ok) {
                setDeleteTarget(null);
                await fetchAssets();
                await fetchStats();
            } else {
                const data = await res.json();
                alert(data.error || "Gagal menghapus aset.");
            }
        } catch {
            alert("Terjadi kesalahan koneksi.");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-800">Manajemen Aset</h1>
                    <p className="text-sm text-slate-500 mt-1">Kelola data inventaris, alokasi karyawan, dan pemeliharaan WIG.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto flex-wrap">
                    <button 
                        onClick={() => router.push("/ga/scan")}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                    >
                        <QrCode size={16} /> Scan
                    </button>
                    <button 
                        onClick={() => router.push("/ga/assets/import")}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors"
                    >
                        Import Massal
                    </button>
                    <button 
                        disabled={exporting}
                        onClick={handleExportXlsx}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                        <Download size={16} /> {exporting ? "Mengekspor..." : "Export XLSX"}
                    </button>
                    <button 
                        onClick={() => router.push("/ga/sim")}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors shadow-sm"
                    >
                        Kelola Kartu SIM
                    </button>
                    <button 
                        onClick={() => router.push("/ga/assets/create")}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors shadow-sm"
                    >
                        <Plus size={16} /> Tambah Aset
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <StatCard icon={<Package />} label="Total Aset" value={stats?.total ?? 0} bg="#f1f5f9" color="#475569" />
                <StatCard icon={<TrendingUp />} label="Total Nilai (Rp)" value={stats?.totalNilai ? formatRupiah(stats.totalNilai) : "0"} bg="#e0f2fe" color="#0369a1" />
                <StatCard icon={<CheckCircle />} label="Tersedia (Pool)" value={stats?.available ?? 0} bg="#d1fae5" color="#047857" />
                <StatCard icon={<Wrench />} label="Maintenance" value={stats?.maintenance ?? 0} bg="#fef3c7" color="#b45309" />
                <StatCard icon={<AlertCircle />} label="Kondisi Rusak" value={stats?.rusak ?? 0} bg="#fee2e2" color="#b91c1c" />
            </div>

            {/* Table Area */}
            <div className="bg-white border rounded-xl shadow-sm flex flex-col flex-1 overflow-hidden relative">
                {/* Filters */}
                <div className="p-4 border-b bg-slate-50/30 space-y-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Search */}
                        <div className="relative flex-1 font-sans">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Cari nama, kode aset, atau S/N..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all shadow-sm"
                            />
                        </div>
                        
                        {/* Dropdowns */}
                        <div className="flex flex-wrap gap-2">
                            <select 
                                value={filterCategory} 
                                onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
                                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                            >
                                <option value="">Semua Kategori</option>
                                {categories.filter(c => c.prefix !== "NUM").map(cat => (
                                    <option key={cat.id} value={cat.prefix}>{cat.name}</option>
                                ))}
                            </select>

                            <select 
                                value={filterKondisi} 
                                onChange={(e) => { setFilterKondisi(e.target.value); setCurrentPage(1); }}
                                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
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
                                className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-red-600 transition-colors"
                            >
                                Reset
                            </button>
                        </div>
                    </div>

                    {/* Status Pills */}
                    <div className="flex justify-between items-center bg-white/50 p-1.5 rounded-xl border border-slate-100">
                        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar">
                            <FilterPill active={filterStatus === ""} label="Semua Status" onClick={() => { setFilterStatus(""); setCurrentPage(1); }} />
                            <FilterPill active={filterStatus === "AVAILABLE"} label="Tersedia" onClick={() => { setFilterStatus("AVAILABLE"); setCurrentPage(1); }} />
                            <FilterPill active={filterStatus === "IN_USE"} label="Digunakan" onClick={() => { setFilterStatus("IN_USE"); setCurrentPage(1); }} />
                            <FilterPill active={filterStatus === "MAINTENANCE"} label="Perbaikan" onClick={() => { setFilterStatus("MAINTENANCE"); setCurrentPage(1); }} />
                            <FilterPill active={filterStatus === "RETIRED"} label="Retired" onClick={() => { setFilterStatus("RETIRED"); setCurrentPage(1); }} />
                        </div>
                        
                        <button onClick={() => { fetchAssets(); fetchStats(); }} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 border-b text-slate-500 text-xs uppercase tracking-wider">
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
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">Memuat data secara langsung (server-side)...</td>
                                </tr>
                            ) : assets.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">Tidak ada aset ditemukan.</td>
                                </tr>
                            ) : (
                                assets.map((asset) => (
                                    <tr 
                                        key={asset.id} 
                                        onClick={() => router.push(`/ga/assets/${asset.id}`)}
                                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                                    >
                                        <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-600 group-hover:text-slate-900 transition-colors">{asset.assetCode}</td>
                                        <td className="px-6 py-4 font-medium text-slate-900">{asset.name}</td>
                                        <td className="px-6 py-4"><CategoryBadge prefix={asset.category?.prefix} name={asset.category?.name || "-"} /></td>
                                        <td className="px-6 py-4"><KondisiBadge kondisi={asset.kondisi} /></td>
                                        <td className="px-6 py-4"><StatusBadge status={asset.status} /></td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                                                    <HolderIcon holderType={asset.holderType} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-slate-800 text-xs">
                                                        {asset.holderType === "GA_POOL" ? "GA Pool (Tersedia)" :
                                                         asset.holderType === "COMPANY_OWNED" ? "Milik Perusahaan (Disimpan)" :
                                                         asset.assignedEmployee?.name || asset.assignedToName || "Tidak Diketahui"}
                                                    </span>
                                                    {asset.assignedEmployee && (
                                                        <span className="text-[10px] text-slate-500 border-l-2 border-slate-200 pl-1.5 mt-0.5">
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
                                                    className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                    title="Edit Aset"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget({ id: asset.id, name: asset.name, code: asset.assetCode })}
                                                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
                    <div className="p-4 border-t bg-slate-50/50 flex justify-between items-center text-sm text-slate-500">
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

            {/* Delete Confirm Dialog */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 border border-slate-200">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                <Trash2 className="text-red-600" size={18} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-800">Hapus Aset Secara Permanen?</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    Anda akan menghapus aset <span className="font-semibold text-slate-700">{deleteTarget.name}</span> ({deleteTarget.code}). 
                                    Tindakan ini <span className="text-red-600 font-semibold">tidak dapat dibatalkan</span> dan akan menghapus semua riwayat terkait.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6 justify-end">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                <Trash2 size={14} />
                                {isDeleting ? "Menghapus..." : "Ya, Hapus Permanen"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
