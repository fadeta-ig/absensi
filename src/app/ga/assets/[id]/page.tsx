"use client";

import { useEffect, useState, useCallback, use, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ArrowLeft, Edit3, ArrowRightLeft, Package, QrCode,
    History, ClipboardCheck, Trash2, Download, Clock,
    ArrowRight, CheckCircle, AlertCircle, Wrench, UserCheck, Upload, FileText, Loader2
} from "lucide-react";
import { AssetWithHistory, AssetHistoryRow, AssetCondition } from "@/lib/types/asset";
import { KondisiBadge, StatusBadge, CategoryBadge, HolderIcon } from "@/features/ga/components/badges/AssetBadges";
import { formatRupiah } from "@/lib/utils/formatters";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// ─── Types ──────────────────────────────────────────────────────

type InspectionRow = {
    id: string;
    assetId: string;
    kondisiSaat: AssetCondition;
    checklist: Record<string, boolean>;
    notes: string | null;
    performedBy: string;
    inspectedAt: string;
};

type TabKey = "spec" | "history" | "inspections" | "maintenance";

type MaintenanceRow = {
    id: string;
    assetId: string;
    vendorName: string;
    cost: number;
    startDate: string;
    estimatedEndDate: string | null;
    actualEndDate: string | null;
    status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    notes: string | null;
    attachmentUrl: string | null;
    createdAt: string;
};

// ─── Page ───────────────────────────────────────────────────────

function AssetDetailContent({ id }: { id: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [asset, setAsset] = useState<AssetWithHistory | null>(null);
    const [loading, setLoading] = useState(true);
    const [qrUrl, setQrUrl] = useState<string | null>(null);

    // Tabs
    const [activeTab, setActiveTab] = useState<TabKey>("spec");
    const [history, setHistory] = useState<AssetHistoryRow[]>([]);
    const [inspections, setInspections] = useState<InspectionRow[]>([]);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [inspLoaded, setInspLoaded] = useState(false);

    // Maintenance
    const [maintenances, setMaintenances] = useState<MaintenanceRow[]>([]);
    const [maintLoaded, setMaintLoaded] = useState(false);

    // Retire dialog
    const [showRetire, setShowRetire] = useState(false);
    const [retiring, setRetiring] = useState(false);

    // Inspection dialog
    const [showInspection, setShowInspection] = useState(false);
    const [submittingInsp, setSubmittingInsp] = useState(false);
    const [inspData, setInspData] = useState<{kondisi: AssetCondition, notes: string, chk: Record<string, boolean>}>({
        kondisi: "BAIK",
        notes: "",
        chk: { "Fisik & Body": true, "Fungsi/Sistem": true, "Kelengkapan": true }
    });

    // Maintenance dialog
    const [showMaintenance, setShowMaintenance] = useState(false);
    const [submittingMaint, setSubmittingMaint] = useState(false);
    const [maintData, setMaintData] = useState({
        vendorName: "",
        cost: 0,
        startDate: new Date().toISOString().split("T")[0],
        estimatedEndDate: "",
        status: "IN_PROGRESS",
        notes: "",
        attachmentUrl: ""
    });

    const fetchAsset = useCallback(async () => {
        try {
            const res = await fetch(`/api/assets/${id}`);
            if (res.status === 401 || res.status === 403) {
                router.replace(`/scan/${id}`);
                return;
            }
            if (res.ok) {
                setAsset(await res.json());
                setQrUrl(`/api/assets/qr?assetId=${id}&v=2`);
            }
        } catch (error) {
            console.error("Gagal load aset", error);
        } finally {
            setLoading(false);
        }
    }, [id, router]);

    useEffect(() => { fetchAsset(); }, [fetchAsset]);

    // Handle incoming tab from URL params
    useEffect(() => {
        const tab = searchParams.get("tab");
        if (tab === "inspections") {
            setActiveTab("inspections");
            setShowInspection(true);
        } else if (tab === "maintenance") {
            setActiveTab("maintenance");
            setShowMaintenance(true);
        }
    }, [searchParams]);

    const fetchHistory = useCallback(async () => {
        try {
            const res = await fetch(`/api/assets/history?assetId=${id}`);
            if (res.ok) setHistory(await res.json());
        } catch (err) {
            console.error(err);
        }
    }, [id]);

    // Lazy-load history & inspections when tab switches
    useEffect(() => {
        if (activeTab === "history" && !historyLoaded) {
            fetchHistory().then(() => setHistoryLoaded(true));
        }
        if (activeTab === "inspections" && !inspLoaded) {
            fetch(`/api/assets/${id}/inspect`)
                .then(r => r.ok ? r.json() : [])
                .then(data => { setInspections(data); setInspLoaded(true); });
        }
        if (activeTab === "maintenance" && !maintLoaded) {
            fetch(`/api/assets/${id}/maintenance`)
                .then(r => r.ok ? r.json() : [])
                .then(data => { setMaintenances(data); setMaintLoaded(true); });
        }
    }, [activeTab, id, historyLoaded, inspLoaded, maintLoaded]);

    const handleRetire = async () => {
        setRetiring(true);
        try {
            const res = await fetch(`/api/assets/${id}/retire`, { method: "POST" });
            if (res.ok) router.push("/ga/assets");
            else alert("Gagal mempensiunkan aset");
        } catch (err) {
            console.error(err);
        } finally {
            setRetiring(false);
            setShowRetire(false);
        }
    };

    const handleInspect = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmittingInsp(true);
        try {
            const res = await fetch(`/api/assets/${id}/inspect`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    kondisiSaat: inspData.kondisi,
                    checklist: inspData.chk,
                    notes: inspData.notes
                })
            });
            if (res.ok) {
                const data = await res.json();
                setInspections([data, ...inspections]);
                setShowInspection(false);
                setInspData({ kondisi: "BAIK", notes: "", chk: { "Fisik & Body": true, "Fungsi/Sistem": true, "Kelengkapan": true } });
            } else {
                alert("Gagal menyimpan inspeksi");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSubmittingInsp(false);
        }
    };

    const handleMaintenanceSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmittingMaint(true);
        try {
            const res = await fetch(`/api/assets/${id}/maintenance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vendorName: maintData.vendorName,
                    cost: Number(maintData.cost),
                    startDate: maintData.startDate,
                    estimatedEndDate: maintData.estimatedEndDate || null,
                    status: maintData.status,
                    notes: maintData.notes,
                    attachmentUrl: maintData.attachmentUrl || null
                })
            });
            if (res.ok) {
                const data = await res.json();
                setMaintenances([data, ...maintenances]);
                setShowMaintenance(false);
                setMaintData({ vendorName: "", cost: 0, startDate: new Date().toISOString().split("T")[0], estimatedEndDate: "", status: "IN_PROGRESS", notes: "", attachmentUrl: "" });
                fetchAsset(); // refresh to update asset status if changed
            } else {
                alert("Gagal menyimpan data maintenance");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSubmittingMaint(false);
        }
    };

    if (loading) return <div className="p-6">Memuat aset...</div>;
    if (!asset) return <div className="p-6">Aset tidak ditemukan.</div>;

    const SpecRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
        <div className="flex flex-col py-3 border-b border-[var(--border)] last:border-0">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{label}</span>
            <span className="text-sm font-medium text-[var(--text-primary)] mt-1">{value || <span className="text-[var(--text-muted)] italic">Kosong</span>}</span>
        </div>
    );

    const TABS: { key: TabKey; label: string; icon: any }[] = [
        { key: "spec", label: "Spesifikasi", icon: Package },
        { key: "history", label: "Riwayat Mutasi", icon: History },
        { key: "inspections", label: "Inspeksi", icon: ClipboardCheck },
        { key: "maintenance", label: "Servis & Perawatan", icon: Wrench },
    ];

    return (
        <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push("/ga/assets")} className="p-2 border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--secondary)]">
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{asset.name}</h1>
                            <CategoryBadge prefix={asset.category?.prefix} name={asset.category?.name || "Aset"} />
                        </div>
                        <p className="text-sm font-mono text-[var(--text-secondary)]">{asset.assetCode}</p>
                    </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button onClick={() => router.push(`/ga/assets/${id}/assign`)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-100 transition-colors">
                        <ArrowRightLeft size={16} /> Serah Terima
                    </button>
                    <button onClick={() => router.push(`/ga/assets/${id}/edit`)} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-[var(--foreground)] text-[var(--background)] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[var(--primary-light)] transition-colors">
                        <Edit3 size={16} /> Edit
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex flex-col gap-6">
                    {/* Status & Pemegang */}
                    <div className="bg-[var(--card)] border rounded-xl p-6 shadow-sm">
                        <h2 className="text-md font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                            <Package size={18} className="text-[var(--text-muted)]" /> Profil Status
                        </h2>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="flex flex-col gap-2">
                                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase">Status & Kondisi</span>
                                <div className="flex items-center gap-2">
                                    <StatusBadge status={asset.status} />
                                    <KondisiBadge kondisi={asset.kondisi} />
                                </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase">Pemegang Saat Ini</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-[var(--secondary)] flex items-center justify-center border border-[var(--border)]">
                                        <HolderIcon holderType={asset.holderType} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-medium text-[var(--text-primary)] text-sm">
                                            {asset.assignedEmployee?.name || asset.assignedToName || (asset.holderType === "GA_POOL" ? "GA Pool" : "Perusahaan")}
                                        </span>
                                        {asset.assignedEmployee && <span className="text-xs text-[var(--text-secondary)]">{asset.assignedEmployee.position}</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="bg-[var(--card)] border rounded-xl shadow-sm overflow-hidden">
                        <div className="flex border-b">
                            {TABS.map(tab => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.key;
                                return (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key)}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-colors border-b-2 ${
                                            isActive
                                                ? "text-[var(--text-primary)] border-slate-800 bg-[var(--secondary)]/50"
                                                : "text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]"
                                        }`}
                                    >
                                        <Icon size={15} />
                                        <span className="hidden sm:inline">{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="p-6">
                            {activeTab === "spec" && (
                                <div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                                        <SpecRow label="Manufaktur (Brand)" value={asset.manufacturer} />
                                        <SpecRow label="Model Spesifik" value={asset.modelName} />
                                        <SpecRow label="Serial Number (S/N)" value={asset.serialNumber} />
                                        <SpecRow label="IMEI" value={asset.imei} />
                                        {asset.category?.prefix === "NUM" && (
                                            <>
                                                <SpecRow label="Nomor Telepon" value={asset.nomorIndosat} />
                                                <SpecRow label="Masa Aktif Terakhir" value={asset.expiredDate ? new Date(asset.expiredDate).toLocaleDateString("id-ID") : null} />
                                            </>
                                        )}
                                    </div>
                                    {asset.keterangan && (
                                        <div className="mt-4 pt-4 border-t border-[var(--border)]">
                                            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Catatan</span>
                                            <p className="text-sm text-[var(--text-secondary)] mt-1 bg-[var(--secondary)] p-3 rounded-lg border">{asset.keterangan}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === "history" && (
                                <HistoryTab history={history} loaded={historyLoaded} onRefresh={fetchHistory} />
                            )}

                            {activeTab === "inspections" && (
                                <InspectionTab inspections={inspections} loaded={inspLoaded} onAdd={() => setShowInspection(true)} />
                            )}

                            {activeTab === "maintenance" && (
                                <MaintenanceTab maintenances={maintenances} loaded={maintLoaded} onAdd={() => setShowMaintenance(true)} />
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-6">
                    {/* QR Code */}
                    <div className="bg-[var(--card)] border rounded-xl p-6 shadow-sm flex flex-col items-center text-center">
                        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4 w-full text-left flex items-center gap-2">
                            <QrCode size={16} className="text-[var(--text-muted)]" /> Tag Pintar
                        </h2>
                        {qrUrl && (
                            <div className="p-2 border-2 border-dashed border-[var(--border)] rounded-xl mb-4 bg-[var(--card)] w-48 h-48 flex items-center justify-center overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`/api/assets/qr?assetId=${asset.id}&v=2`} alt="QR Code" className="w-full h-full object-contain" />
                            </div>
                        )}
                        <p className="text-xs text-[var(--text-secondary)]">Scan QR Code ini untuk akses mandiri via perangkat cerdas.</p>
                        <button onClick={() => window.open(qrUrl || "")} className="mt-4 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
                            Buka Gambar Bersih
                        </button>
                    </div>

                    {/* Finansial */}
                    <div className="bg-[var(--card)] border rounded-xl p-6 shadow-sm">
                        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Lifecycle & Finansial</h2>
                        <div className="flex flex-col">
                            <SpecRow label="Tanggal Beli" value={asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString("id-ID") : null} />
                            <SpecRow label="Harga Beli" value={asset.purchasePrice ? formatRupiah(asset.purchasePrice) : null} />
                            <SpecRow label="Batas Garansi" value={asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toLocaleDateString("id-ID") : null} />
                        </div>
                    </div>

                    {/* Danger Zone */}
                    {asset.status !== "RETIRED" && (
                        <div className="bg-[var(--card)] border border-red-200 rounded-xl p-5 shadow-sm">
                            <h2 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
                                <Trash2 size={14} /> Zona Berbahaya
                            </h2>
                            <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                                Tindakan ini tidak dapat dibatalkan. Aset akan dipensiunkan dari sistem operasional.
                            </p>
                            <button
                                onClick={() => setShowRetire(true)}
                                className="w-full py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors"
                            >
                                Retire Aset
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Retire Confirm Dialog */}
            <ConfirmDialog
                open={showRetire}
                title="Retire Aset?"
                message={`Aset "${asset.name}" (${asset.assetCode}) akan dipensiunkan dan tidak lagi tersedia untuk operasional.`}
                confirmLabel="Ya, Retire"
                variant="danger"
                loading={retiring}
                onConfirm={handleRetire}
                onCancel={() => setShowRetire(false)}
            />

            {/* Inspect Dialog */}
            {showInspection && (
               <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--foreground)] text-[var(--background)]/50 backdrop-blur-sm">
                   <div className="bg-[var(--card)] rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                       <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
                           <h2 className="text-lg font-bold text-[var(--text-primary)]">Catat Inspeksi Baru</h2>
                       </div>
                       <form onSubmit={handleInspect} className="p-6 flex flex-col gap-5">
                           <div>
                               <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block">Kondisi Fisik Saat Ini</label>
                               <select required value={inspData.kondisi} onChange={e => setInspData(prev => ({...prev, kondisi: e.target.value as AssetCondition}))} className="form-input">
                                   <option value="BAIK">Baik</option>
                                   <option value="KURANG_BAIK">Kurang Baik</option>
                                   <option value="RUSAK">Rusak</option>
                               </select>
                           </div>
                           <div>
                               <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block">Checklist Standar</label>
                               <div className="space-y-2 bg-[var(--secondary)] border border-[var(--border)] p-3 rounded-lg">
                                   {Object.entries(inspData.chk).map(([key, val]) => (
                                       <label key={key} className="flex items-center gap-3 p-1 cursor-pointer">
                                           <input type="checkbox" checked={val} onChange={(e) => setInspData(prev => ({...prev, chk: {...prev.chk, [key]: e.target.checked}}))} className="w-4 h-4 rounded text-[var(--text-primary)] focus:ring-[var(--ring)]" />
                                           <span className="text-sm font-medium text-[var(--text-secondary)]">{key}</span>
                                       </label>
                                   ))}
                               </div>
                           </div>
                           <div>
                               <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block">Catatan Tambahan</label>
                               <textarea value={inspData.notes} onChange={e => setInspData(prev => ({...prev, notes: e.target.value}))} rows={3} placeholder="Ada kerusakan spesifik?" className="form-input" />
                           </div>
                           <div className="flex justify-end gap-3 pt-2">
                               <button type="button" onClick={() => setShowInspection(false)} className="px-4 py-2 border border-[var(--border)] bg-[var(--card)] rounded-lg text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--secondary)] transition-colors">Batal</button>
                               <button type="submit" disabled={submittingInsp} className="px-4 py-2 bg-[var(--foreground)] text-[var(--background)] rounded-lg text-sm font-semibold  hover:bg-[var(--primary-light)] transition-colors disabled:opacity-50 flex items-center gap-2">
                                   {submittingInsp ? "Menyimpan" : "Simpan Inspeksi"}
                               </button>
                           </div>
                       </form>
                   </div>
               </div>
            )}

            {/* Maintenance Dialog */}
            {showMaintenance && (
               <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--foreground)] text-[var(--background)]/50 backdrop-blur-sm">
                   <div className="bg-[var(--card)] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                       <div className="p-6 border-b border-[var(--border)] flex items-center justify-between shrink-0">
                           <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2"><Wrench size={20} className="text-[var(--text-secondary)]"/> Catat Maintenance/Servis</h2>
                       </div>
                       <form onSubmit={handleMaintenanceSubmit} className="p-6 flex flex-col gap-5 overflow-y-auto">
                           <div>
                               <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block">Nama Vendor / Tempat Servis *</label>
                               <input type="text" required value={maintData.vendorName} onChange={e => setMaintData(prev => ({...prev, vendorName: e.target.value}))} placeholder="Contoh: iColor Service Center" className="form-input" />
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                               <div>
                                   <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block">Tanggal Mulai *</label>
                                   <input type="date" required value={maintData.startDate} onChange={e => setMaintData(prev => ({...prev, startDate: e.target.value}))} className="form-input" />
                               </div>
                               <div>
                                   <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block">Estimasi Selesai</label>
                                   <input type="date" value={maintData.estimatedEndDate} onChange={e => setMaintData(prev => ({...prev, estimatedEndDate: e.target.value}))} className="form-input" />
                               </div>
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                               <div>
                                   <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block">Estimasi Biaya (Rp)</label>
                                   <input type="number" min="0" value={maintData.cost} onChange={e => setMaintData(prev => ({...prev, cost: Number(e.target.value)}))} className="form-input" />
                               </div>
                               <div>
                                   <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block">Status Progres</label>
                                   <select required value={maintData.status} onChange={e => setMaintData(prev => ({...prev, status: e.target.value}))} className="form-input">
                                       <option value="IN_PROGRESS">Sedang Dikerjakan</option>
                                       <option value="COMPLETED">Selesai</option>
                                       <option value="CANCELLED">Dibatalkan</option>
                                   </select>
                               </div>
                           </div>
                           <div>
                               <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block">Keluhan / Catatan</label>
                               <textarea value={maintData.notes} onChange={e => setMaintData(prev => ({...prev, notes: e.target.value}))} rows={2} placeholder="Kerusakan pada baterai kembung..." className="form-input" />
                           </div>
                           <div>
                               <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2 block">Link / Upload Nota (Opsional)</label>
                               <input type="text" value={maintData.attachmentUrl} onChange={e => setMaintData(prev => ({...prev, attachmentUrl: e.target.value}))} placeholder="Link Google Drive foto nota..." className="form-input" />
                           </div>
                           <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)] shrink-0">
                               <button type="button" onClick={() => setShowMaintenance(false)} className="px-4 py-2 border border-[var(--border)] bg-[var(--card)] rounded-lg text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--secondary)] transition-colors">Batal</button>
                               <button type="submit" disabled={submittingMaint} className="px-4 py-2 bg-[var(--foreground)] text-[var(--background)] rounded-lg text-sm font-semibold  hover:bg-[var(--primary-light)] transition-colors disabled:opacity-50 flex items-center gap-2">
                                   {submittingMaint ? "Menyimpan" : "Simpan Data"}
                               </button>
                           </div>
                       </form>
                   </div>
               </div>
            )}
        </div>
    );
}

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return (
        <Suspense fallback={<div className="p-6">Loading...</div>}>
            <AssetDetailContent id={id} />
        </Suspense>
    );
}

// ─── History Tab ────────────────────────────────────────────────

function HistoryTab({ history, loaded, onRefresh }: { history: AssetHistoryRow[]; loaded: boolean; onRefresh: () => void }) {
    const [uploadingId, setUploadingId] = useState<string | null>(null);

    const handleUploadBast = async (e: React.ChangeEvent<HTMLInputElement>, historyId: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingId(historyId);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("historyId", historyId);

        try {
            const res = await fetch("/api/assets/bast", { method: "POST", body: formData });
            if (res.ok) {
                onRefresh();
            } else {
                const data = await res.json();
                alert(data.error || "Gagal upload BAST");
            }
        } catch (err) {
            console.error(err);
            alert("Terjadi kesalahan jaringan.");
        } finally {
            setUploadingId(null);
            e.target.value = ""; // reset input
        }
    };

    const handleDeleteBast = async (bastId: string) => {
        if (!confirm("Hapus dokumen BAST ini?")) return;
        try {
            const res = await fetch(`/api/assets/bast/${bastId}`, { method: "DELETE" });
            if (res.ok) onRefresh();
            else alert("Gagal menghapus BAST");
        } catch (err) {
            console.error(err);
        }
    };

    if (!loaded) return <div className="py-8 text-center text-[var(--text-muted)] text-sm">Memuat riwayat...</div>;
    if (history.length === 0) return <div className="py-8 text-center text-[var(--text-muted)] text-sm">Belum ada riwayat mutasi.</div>;

    const ACTION_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
        assigned: { icon: UserCheck, label: "Diserahkan", color: "text-blue-600 bg-blue-50 border-blue-100" },
        returned: { icon: ArrowRight, label: "Dikembalikan", color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
        retired: { icon: Trash2, label: "Di-retire", color: "text-red-600 bg-red-50 border-red-100" },
        sent_to_maintenance: { icon: Wrench, label: "Maintenance", color: "text-amber-600 bg-amber-50 border-amber-100" },
        kondisi_changed: { icon: AlertCircle, label: "Kondisi Berubah", color: "text-purple-600 bg-purple-50 border-purple-100" },
    };

    return (
        <div className="space-y-3">
            {history.map(h => {
                const cfg = ACTION_CONFIG[h.action] ?? { icon: Clock, label: h.action, color: "text-[var(--text-secondary)] bg-[var(--secondary)] border-[var(--border)]" };
                const Icon = cfg.icon;
                const requiresBast = h.action === "assigned" || h.action === "returned";

                return (
                    <div key={h.id} className="flex flex-col p-3 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)]/50 transition-colors">
                        <div className="flex gap-3 w-full">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${cfg.color}`}>
                                <Icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-[var(--text-primary)]">{cfg.label}</span>
                                    <KondisiBadge kondisi={h.kondisiSaat} />
                                </div>
                                <div className="text-xs text-[var(--text-secondary)] mt-1">
                                    {h.fromName ?? "GA Pool"} <span className="mx-1">→</span> {h.toName ?? "GA Pool"}
                                </div>
                                {h.notes && <p className="text-xs text-[var(--text-muted)] mt-1 italic">{h.notes}</p>}
                            </div>
                            <div className="text-right shrink-0">
                                <span className="text-[10px] text-[var(--text-muted)] block">{new Date(h.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                                <span className="text-[10px] text-[var(--text-muted)] block">{h.performedBy}</span>
                            </div>
                        </div>

                        {/* BAST Section */}
                        {requiresBast && (
                            <div className="mt-3 pl-12 border-t border-dashed border-[var(--border)] pt-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Dokumen BAST</span>
                                    <label className="cursor-pointer flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
                                        {uploadingId === h.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                        {h.bastDocuments && h.bastDocuments.length > 0 ? "Upload Revisi" : "Upload BAST"}
                                        <input type="file" className="hidden" accept=".pdf,image/png,image/jpeg" onChange={(e) => handleUploadBast(e, h.id)} disabled={uploadingId === h.id} />
                                    </label>
                                </div>
                                
                                {h.bastDocuments && h.bastDocuments.length > 0 ? (
                                    <div className="flex flex-col gap-1.5 mt-2">
                                        {h.bastDocuments.map((doc, idx) => (
                                            <div key={doc.id} className="flex items-center justify-between bg-[var(--card)] border border-[var(--border)] p-2 rounded text-xs group">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <FileText size={14} className="text-indigo-500 shrink-0" />
                                                    <a href={`/api/assets/bast/${doc.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--text-primary)] hover:text-indigo-600 hover:underline truncate">
                                                        {doc.fileName}
                                                    </a>
                                                    {idx === 0 && <span className="shrink-0 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">Terbaru</span>}
                                                </div>
                                                <button onClick={() => handleDeleteBast(doc.id)} className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 shrink-0 transition-all p-1">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-xs text-[var(--text-muted)] italic">Belum ada dokumen BAST yang diunggah.</div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Inspection Tab ─────────────────────────────────────────────

function InspectionTab({ inspections, loaded, onAdd }: { inspections: InspectionRow[]; loaded: boolean; onAdd: () => void }) {
    if (!loaded) return <div className="py-8 text-center text-[var(--text-muted)] text-sm">Memuat inspeksi...</div>;

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button onClick={onAdd} className="bg-[var(--foreground)] text-[var(--background)] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--primary-light)] transition-colors">
                    <ClipboardCheck size={14} /> Catat Inspeksi Baru
                </button>
            </div>
            {inspections.length === 0 ? (
                <div className="py-8 text-center text-[var(--text-muted)] text-sm">Belum ada inspeksi. Scan QR atau Catat Baru untuk mulai.</div>
            ) : (
                <div className="space-y-3">
            {inspections.map(ins => {
                const passed = Object.values(ins.checklist).filter(Boolean).length;
                const total = Object.keys(ins.checklist).length;
                const allOk = passed === total;
                return (
                    <div key={ins.id} className="p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)]/50 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${allOk ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20 text-amber-600 dark:text-amber-400"}`}>
                                    {allOk ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                </div>
                                <div>
                                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                                        {new Date(ins.inspectedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                                    </span>
                                    <div className="text-[10px] text-[var(--text-muted)]">{ins.performedBy}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <KondisiBadge kondisi={ins.kondisiSaat} />
                                <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--secondary)] px-2 py-0.5 rounded-full">
                                    {passed}/{total}
                                </span>
                            </div>
                        </div>
                        {/* Checklist Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                            {Object.entries(ins.checklist).map(([key, ok]) => (
                                <div key={key} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium ${ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                                    {ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                                    {key}
                                </div>
                            ))}
                        </div>
                        {ins.notes && <p className="text-xs text-[var(--text-secondary)] mt-2 italic border-t border-[var(--border)] pt-2">{ins.notes}</p>}
                    </div>
                );
            })}
        </div>
            )}
        </div>
    );
}

// ─── Maintenance Tab ─────────────────────────────────────────────

function MaintenanceTab({ maintenances, loaded, onAdd }: { maintenances: MaintenanceRow[]; loaded: boolean; onAdd: () => void }) {
    if (!loaded) return <div className="py-8 text-center text-[var(--text-muted)] text-sm">Memuat riwayat servis...</div>;

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <button onClick={onAdd} className="bg-[var(--foreground)] text-[var(--background)] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-[var(--primary-light)] transition-colors">
                    <Wrench size={14} /> Catat Servis/Maintenance
                </button>
            </div>
            {maintenances.length === 0 ? (
                <div className="py-8 text-center text-[var(--text-muted)] text-sm">Belum ada catatan servis/perawatan.</div>
            ) : (
                <div className="space-y-3">
                    {maintenances.map(maint => {
                        const isDone = maint.status === "COMPLETED";
                        const isCancel = maint.status === "CANCELLED";
                        return (
                            <div key={maint.id} className="p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)]/50 transition-colors flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${isDone ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : isCancel ? "bg-[var(--secondary)] border-[var(--border)] text-[var(--text-muted)]" : "bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20 text-amber-600 dark:text-amber-400"}`}>
                                            <Wrench size={16} />
                                        </div>
                                        <div>
                                            <span className="text-sm font-semibold text-[var(--text-primary)] block">{maint.vendorName}</span>
                                            <span className="text-[10px] text-[var(--text-secondary)]">Mulai: {new Date(maint.startDate).toLocaleDateString("id-ID")}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-flex ${isDone ? "bg-emerald-100 text-emerald-700" : isCancel ? "bg-[var(--secondary)] text-[var(--text-secondary)]" : "bg-amber-100 text-amber-700"}`}>
                                            {maint.status === "IN_PROGRESS" ? "Proses Servis" : maint.status === "COMPLETED" ? "Selesai" : "Dibatalkan"}
                                        </div>
                                        <div className="text-sm font-bold text-[var(--text-primary)] mt-1">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(maint.cost)}</div>
                                    </div>
                                </div>
                                {maint.notes && (
                                    <div className="text-xs text-[var(--text-secondary)] bg-[var(--secondary)] p-2.5 rounded-lg border border-[var(--border)]">
                                        {maint.notes}
                                    </div>
                                )}
                                {maint.attachmentUrl && (
                                    <div className="text-right">
                                        <a href={maint.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-semibold text-indigo-600 hover:underline">
                                            Lihat Bukti/Nota →
                                        </a>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
