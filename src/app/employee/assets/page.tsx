"use client";

import { useEffect, useState } from "react";
import { Package, Plus, AlertTriangle, CheckCircle, Clock, X, MessageSquare, Monitor, Loader2, Info } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";

interface Asset {
    id: string;
    assetCode: string;
    name: string;
    serialNumber: string | null;
    kondisi: string;
    categoryRel: { name: string; prefix: string };
}

interface Ticket {
    id: string;
    ticketCode: string;
    type: "NEW_REQUEST" | "DAMAGE_REPORT";
    asset?: { name: string; assetCode: string } | null;
    title: string;
    description: string;
    status: "PENDING" | "IN_PROGRESS" | "APPROVED" | "REJECTED" | "RESOLVED";
    gaResponse: string | null;
    createdAt: string;
}

export default function EmployeeAssetsPage() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [loadError, setLoadError] = useState("");
    const toast = useToast();

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState<"NEW_REQUEST" | "DAMAGE_REPORT">("NEW_REQUEST");
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [form, setForm] = useState({ title: "", description: "" });

    const fetchData = async () => {
        setLoading(true);
        setLoadError("");
        try {
            const res = await fetch("/api/employee/assets");
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal mengambil data aset."));
            }

            const data = await res.json();
            setAssets(Array.isArray(data.assets) ? data.assets : []);
            setTickets(Array.isArray(data.tickets) ? data.tickets : []);
        } catch (err) {
            reportClientError("EmployeeAssetsPage", "Gagal mengambil data aset employee", err);
            const message = err instanceof Error ? err.message : "Gagal mengambil data aset.";
            setAssets([]);
            setTickets([]);
            setLoadError(message);
            toast(message, "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleOpenModal = (type: "NEW_REQUEST" | "DAMAGE_REPORT", asset: Asset | null = null) => {
        setModalType(type);
        setSelectedAsset(asset);
        setForm({ title: type === "DAMAGE_REPORT" ? `Lapor Kerusakan: ${asset?.name}` : "", description: "" });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch("/api/employee/assets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: modalType,
                    assetId: selectedAsset?.id,
                    title: form.title,
                    description: form.description
                })
            });

            if (res.ok) {
                toast(modalType === "NEW_REQUEST" ? "Permintaan berhasil diajukan." : "Laporan kerusakan berhasil dikirim.", "success");
                setShowModal(false);
                fetchData();
            } else {
                toast(await getResponseErrorMessage(res, "Gagal mengirim tiket aset."), "error");
            }
        } catch (error) {
            reportClientError("EmployeeAssetsPage", "Gagal mengirim tiket aset", error, { type: modalType, assetId: selectedAsset?.id });
            toast("Tiket aset belum terkirim karena jaringan bermasalah. Periksa koneksi lalu coba lagi.", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch(status) {
            case "PENDING": return <span className="badge badge-warning"><Clock className="w-3 h-3 mr-1"/> Pending</span>;
            case "IN_PROGRESS": return <span className="badge bg-blue-100 text-blue-700 border-blue-200"><Loader2 className="w-3 h-3 mr-1 animate-spin"/> Proses GA</span>;
            case "APPROVED": return <span className="badge bg-indigo-100 text-indigo-700 border-indigo-200"><CheckCircle className="w-3 h-3 mr-1"/> Disetujui</span>;
            case "REJECTED": return <span className="badge badge-error"><X className="w-3 h-3 mr-1"/> Ditolak</span>;
            case "RESOLVED": return <span className="badge badge-success"><CheckCircle className="w-3 h-3 mr-1"/> Selesai</span>;
            default: return <span className="badge badge-ghost">{status}</span>;
        }
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease] pb-20 lg:pb-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Monitor className="w-6 h-6 text-[var(--primary)]" />
                        Aset Saya
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Kelola aset perusahaan yang Anda gunakan.</p>
                </div>
                <button onClick={() => handleOpenModal("NEW_REQUEST")} className="btn btn-primary shadow-md">
                    <Plus className="w-4 h-4" /> Request Aset Baru
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><div className="spinner" /></div>
            ) : loadError ? (
                <div className="card p-8 text-center">
                    <AlertTriangle className="w-12 h-12 text-[var(--destructive)] opacity-60 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--destructive)]">{loadError}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Daftar Aset */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <Package className="w-5 h-5 text-indigo-500" /> Barang Inventaris
                        </h2>
                        {assets.length === 0 ? (
                            <div className="card p-8 text-center bg-[var(--secondary)]/30 border-dashed">
                                <Package className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                                <p className="text-sm font-semibold text-[var(--text-primary)]">Tidak ada aset</p>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Anda belum memegang aset perusahaan apapun.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {assets.map((asset) => (
                                    <div key={asset.id} className="card p-4 hover:shadow-md transition-shadow group">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="badge bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">{asset.categoryRel.prefix}</span>
                                                    <span className="text-[10px] font-mono text-[var(--text-muted)]">{asset.assetCode}</span>
                                                </div>
                                                <h3 className="font-bold text-[var(--text-primary)]">{asset.name}</h3>
                                                <p className="text-xs text-[var(--text-secondary)]">S/N: {asset.serialNumber || "-"}</p>
                                            </div>
                                            <div>
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded border ${
                                                    asset.kondisi === "BAIK" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                    "bg-orange-50 text-orange-700 border-orange-200"
                                                }`}>{asset.kondisi}</span>
                                            </div>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-[var(--border)] flex justify-end">
                                            <button 
                                                onClick={() => handleOpenModal("DAMAGE_REPORT", asset)}
                                                className="btn btn-ghost btn-sm text-orange-600 hover:!bg-orange-50 hover:text-orange-700 text-xs"
                                            >
                                                <AlertTriangle className="w-3.5 h-3.5" /> Lapor Kendala
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Riwayat Tiket */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-emerald-500" /> Riwayat Tiket
                        </h2>
                        {tickets.length === 0 ? (
                            <div className="card p-8 text-center bg-[var(--secondary)]/30 border-dashed">
                                <MessageSquare className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                                <p className="text-sm font-semibold text-[var(--text-primary)]">Belum ada tiket</p>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Riwayat permintaan atau pelaporan aset akan muncul di sini.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {tickets.map(t => (
                                    <div key={t.id} className="card p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono text-[var(--text-muted)]">{t.ticketCode}</span>
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${t.type === "NEW_REQUEST" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
                                                        {t.type === "NEW_REQUEST" ? "REQUEST BARU" : "LAPOR KERUSAKAN"}
                                                    </span>
                                                </div>
                                                <h4 className="font-bold text-sm text-[var(--text-primary)]">{t.title}</h4>
                                                {t.asset && (
                                                    <p className="text-[10px] text-[var(--text-secondary)] font-medium">Aset: {t.asset.name} ({t.asset.assetCode})</p>
                                                )}
                                            </div>
                                            {getStatusBadge(t.status)}
                                        </div>
                                        <p className="text-xs text-[var(--text-secondary)] p-2.5 bg-[var(--secondary)]/50 rounded-lg border border-[var(--border)]">
                                            {t.description}
                                        </p>
                                        
                                        {t.gaResponse && (
                                            <div className="flex items-start gap-2 p-2.5 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 rounded-lg">
                                                <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                                <div className="flex-1">
                                                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-500 mb-0.5">Tanggapan GA:</p>
                                                    <p className="text-xs text-emerald-800 dark:text-emerald-400">{t.gaResponse}</p>
                                                </div>
                                            </div>
                                        )}
                                        
                                        <div className="text-[10px] text-[var(--text-muted)] text-right">
                                            {new Date(t.createdAt).toLocaleDateString("id-ID", { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal Form */}
            {showModal && (
                <AccessibleModal
                    ariaLabel={modalType === "NEW_REQUEST" ? "Request aset baru" : "Lapor kerusakan aset"}
                    onClose={() => setShowModal(false)}
                    disableClose={submitting}
                >
                        <div className="modal-header">
                            <h2 className="modal-title flex items-center gap-2">
                                {modalType === "NEW_REQUEST" ? (
                                    <><Plus className="w-5 h-5 text-blue-500"/> Request Aset Baru</>
                                ) : (
                                    <><AlertTriangle className="w-5 h-5 text-orange-500"/> Lapor Kerusakan</>
                                )}
                            </h2>
                            <button className="modal-close" onClick={() => !submitting && setShowModal(false)} disabled={submitting} aria-label="Tutup modal tiket aset"><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {modalType === "DAMAGE_REPORT" && selectedAsset && (
                                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                    <p className="text-xs font-bold text-orange-800 mb-1">Aset yang dilaporkan:</p>
                                    <p className="text-sm font-semibold text-orange-900">{selectedAsset.name}</p>
                                    <p className="text-xs text-orange-700 font-mono">{selectedAsset.assetCode}</p>
                                </div>
                            )}
                            <div className="form-group !mb-0">
                                <label className="form-label">Subjek / Judul</label>
                                <input 
                                    className="form-input" 
                                    placeholder={modalType === "NEW_REQUEST" ? "Contoh: Request Mouse Wireless" : "Contoh: Layar Laptop Bergaris"}
                                    value={form.title}
                                    onChange={e => setForm({...form, title: e.target.value})}
                                    required
                                    minLength={3}
                                />
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label">Deskripsi Detail</label>
                                <textarea 
                                    className="form-textarea min-h-[100px]" 
                                    placeholder={modalType === "NEW_REQUEST" ? "Jelaskan alasan kebutuhan aset ini..." : "Jelaskan kronologi dan kondisi kerusakan secara detail..."}
                                    value={form.description}
                                    onChange={e => setForm({...form, description: e.target.value})}
                                    required
                                    minLength={10}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} disabled={submitting} className="btn btn-ghost">Batal</button>
                                <button type="submit" disabled={submitting} className="btn btn-primary min-w-[120px]">
                                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Mengirim...</> : "Kirim"}
                                </button>
                            </div>
                        </form>
                </AccessibleModal>
            )}
        </div>
    );
}
