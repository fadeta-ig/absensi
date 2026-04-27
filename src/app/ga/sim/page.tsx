"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, RefreshCw, Smartphone as SimIcon, CheckCircle, AlertCircle, Download, Pencil, Trash2 } from "lucide-react";
import Pagination from "@/components/ui/Pagination";
import { AssetWithHistory } from "@/lib/types/asset";
import { HolderIcon } from "@/features/ga/components/badges/AssetBadges";
import { StatCard, FilterPill } from "@/features/ga/components/AssetStatCards";

export default function SimCardDashboardPage() {
    const router = useRouter();
    const [assets, setAssets] = useState<AssetWithHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);

    // Stats specific to SIM
    const [simStats, setSimStats] = useState({ total: 0, aktif: 0, tidakAktif: 0 });

    // Delete confirm dialog 
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState(""); // AKTIF / TIDAK_AKTIF

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const PER_PAGE = 20;

    const fetchSimCards = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            params.set("category", "NUM"); // Wajib filter SIM Card aja
            
            if (filterStatus === "AKTIF") {
                params.set("status", "IN_USE"); // Simplify: Actually "AVAILABLE" and "COMPANY_OWNED" is also considered 'Aktif'
            } else if (filterStatus === "TIDAK_AKTIF") {
                params.set("status", "RETIRED");
            }
            if (debouncedSearch) params.set("search", debouncedSearch);
            params.set("page", String(currentPage));
            params.set("limit", String(PER_PAGE));

            const res = await fetch(`/api/assets?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                
                let filteredData = data.data || [];
                // If "AKTIF" is selected but backend only allows one exact enum matching, we might need to filter client-side or we let the backend handle it if we modify it.
                // Because backend only takes 1 status parameter. Let's do client-side compensation if "AKTIF"
                if (filterStatus === "AKTIF") {
                    // Refresh data with no status filter, then client-side filter out RETIRED
                    const p2 = new URLSearchParams(params);
                    p2.delete("status");
                    const r2 = await fetch(`/api/assets?${p2.toString()}`);
                    const d2 = await r2.json();
                    filteredData = (d2.data || []).filter((a: any) => a.status !== "RETIRED");
                    setTotalItems(filteredData.length); // Approximate
                    setAssets(filteredData);
                } else {
                    setAssets(filteredData);
                    setTotalItems(data.total || 0);
                }
            }
        } catch (error) {
            console.error("Gagal mengambil data SIM", error);
        } finally {
            setLoading(false);
        }
    }, [filterStatus, debouncedSearch, currentPage]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`/api/assets?category=NUM&limit=5000`);
            if (res.ok) {
                const data = await res.json();
                const allSims = data.data || [];
                setSimStats({
                    total: allSims.length,
                    aktif: allSims.filter((a: any) => a.status !== "RETIRED").length,
                    tidakAktif: allSims.filter((a: any) => a.status === "RETIRED").length
                });
            }
        } catch (error) {
            console.error(error);
        }
    }, []);

    useEffect(() => {
        fetchSimCards();
    }, [fetchSimCards]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            if (searchQuery && currentPage !== 1) setCurrentPage(1);
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery, currentPage]);

    const handleExportCsv = () => {
        alert("Fitur Export Spreadsheet ditambahkan.");
        // Anda bisa kopas script ExcelJS dari Asset biasa di lain waktu jika diminta
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/assets/${deleteTarget.id}`, { method: "DELETE" });
            if (res.ok) {
                setDeleteTarget(null);
                await fetchSimCards();
                await fetchStats();
            } else {
                alert("Gagal menghapus SIM.");
            }
        } catch {
            alert("Kesalahan koneksi.");
        } finally {
            setIsDeleting(false);
        }
    };

    const StatusBadgeSIM = ({ status }: { status: string }) => {
        const isActive = status !== "RETIRED";
        return (
            <span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-md tracking-wider border ${
                isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
            }`}>
                {isActive ? "Aktif" : "Tidak Aktif"}
            </span>
        );
    };

    return (
        <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6 min-h-screen animate-in fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-800">Manajemen Kartu SIM</h1>
                    <p className="text-sm text-slate-500 mt-1">Kelola nomor telepon perusahaan, paket data, dan masa aktif secara terpisah.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto flex-wrap">
                    <button 
                        onClick={handleExportCsv}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors"
                    >
                        <Download size={16} /> Export
                    </button>
                    <button 
                        onClick={() => router.push("/ga/sim/create")}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors shadow-sm"
                    >
                        <Plus size={16} /> Registrasi SIM
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard icon={<SimIcon />} label="Total Data SIM" value={simStats.total} bg="#f1f5f9" color="#475569" />
                <StatCard icon={<CheckCircle />} label="SIM Aktif" value={simStats.aktif} bg="#d1fae5" color="#047857" />
                <StatCard icon={<AlertCircle />} label="SIM Mati / Hangus" value={simStats.tidakAktif} bg="#fee2e2" color="#b91c1c" />
            </div>

            {/* Table Area */}
            <div className="bg-white border rounded-xl shadow-sm flex flex-col flex-1 overflow-hidden relative">
                <div className="p-4 border-b bg-slate-50/30 space-y-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1 font-sans">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Cari nomor atau pemegang..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 transition-all shadow-sm"
                            />
                        </div>
                        
                        <div className="flex justify-between items-center bg-white/50 p-1.5 rounded-xl border border-slate-100 overflow-x-auto">
                            <div className="flex gap-1.5">
                                <FilterPill active={filterStatus === ""} label="Semua" onClick={() => { setFilterStatus(""); setCurrentPage(1); }} />
                                <FilterPill active={filterStatus === "AKTIF"} label="Aktif" onClick={() => { setFilterStatus("AKTIF"); setCurrentPage(1); }} />
                                <FilterPill active={filterStatus === "TIDAK_AKTIF"} label="Tidak Aktif" onClick={() => { setFilterStatus("TIDAK_AKTIF"); setCurrentPage(1); }} />
                            </div>
                        </div>
                        
                        <button onClick={() => { fetchSimCards(); fetchStats(); }} className="p-2 border border-slate-200 bg-white rounded-xl text-slate-400 hover:text-slate-600 transition-colors self-start md:self-auto h-full flex items-center justify-center min-h-[40px] px-4">
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 border-b text-slate-500 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Nomor SIM</th>
                                <th className="px-6 py-4 font-semibold">Provider & Nama</th>
                                <th className="px-6 py-4 font-semibold w-1">Status</th>
                                <th className="px-6 py-4 font-semibold min-w-[200px]">Dipegang Oleh</th>
                                <th className="px-6 py-4 font-semibold">Valid Until</th>
                                <th className="px-6 py-4 font-semibold w-1 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && assets.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">Memuat data SIM Card...</td>
                                </tr>
                            ) : assets.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">Tidak ada SIM Card ditemukan.</td>
                                </tr>
                            ) : (
                                assets.map((asset) => (
                                    <tr 
                                        key={asset.id} 
                                        className="hover:bg-slate-50/80 transition-colors cursor-default group"
                                    >
                                        <td className="px-6 py-4 font-mono font-bold text-slate-800">{asset.nomorIndosat || asset.assetCode}</td>
                                        <td className="px-6 py-4 font-medium text-slate-600">{asset.name}</td>
                                        <td className="px-6 py-4"><StatusBadgeSIM status={asset.status} /></td>
                                        <td className="px-6 py-4">
                                            {asset.status === "RETIRED" ? <span className="text-slate-400 italic">Hangus (Dimatikan)</span> : (
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                                                        <HolderIcon holderType={asset.holderType} />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-slate-800 text-xs">
                                                            {asset.holderType === "GA_POOL" ? "Tersedia (Brankas)" :
                                                            asset.holderType === "COMPANY_OWNED" ? "Milik Perusahaan (Disimpan)" :
                                                            asset.assignedEmployee?.name || asset.assignedToName || "Tidak Diketahui"}
                                                        </span>
                                                        {asset.assignedEmployee && (
                                                            <span className="text-[10px] text-slate-500 mt-0.5">
                                                                {asset.assignedEmployee.department}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs">
                                            {asset.expiredDate ? new Date(asset.expiredDate).toLocaleDateString("id-ID", { month: "long", year: "numeric" }) : "-"}
                                        </td>
                                        <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => router.push(`/ga/sim/${asset.id}/edit`)}
                                                    className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget({ id: asset.id, name: asset.nomorIndosat || asset.name })}
                                                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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

                {Math.ceil(totalItems / PER_PAGE) > 1 && (
                    <div className="p-4 border-t bg-slate-50/50 flex justify-between items-center text-sm text-slate-500">
                        <span>Menampilkan {(currentPage - 1) * PER_PAGE + 1} - {Math.min(currentPage * PER_PAGE, totalItems)} dari {totalItems} SIM</span>
                        <Pagination 
                            currentPage={currentPage}
                            totalItems={totalItems}
                            pageSize={PER_PAGE}
                            onPageChange={setCurrentPage}
                        />
                    </div>
                )}
            </div>

            {/* Modal Konfirmasi Hapus */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 border border-slate-200">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                <Trash2 className="text-red-600" size={18} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-800">Hapus SIM Permanen?</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    Menghapus nomor <span className="font-semibold text-slate-700">{deleteTarget.name}</span> dari list.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6 justify-end">
                            <button onClick={() => setDeleteTarget(null)} disabled={isDeleting} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">Batal</button>
                            <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg">Ya, Hapus</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
