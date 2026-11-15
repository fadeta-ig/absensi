"use client";

import { useEffect, useState } from "react";
import { Package, Plus, AlertTriangle, CheckCircle, Clock, X, MessageSquare, Monitor, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
import EmptyState from "@/components/ui/EmptyState";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import PageHeader from "@/components/ui/PageHeader";
import StateCard from "@/components/ui/StateCard";
import StatusBadge from "@/components/ui/StatusBadge";

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

    const KONDISI_STYLE: Record<string, { label: string; tone: "success" | "danger" | "neutral" }> = {
        BAIK: { label: "Baik", tone: "success" },
        RUSAK: { label: "Rusak", tone: "danger" },
        BELUM_DINILAI: { label: "Belum dinilai", tone: "neutral" },
    };

    const getStatusBadge = (status: string) => {
        switch(status) {
            case "PENDING": return <StatusBadge tone="warning" icon={Clock}>Pending</StatusBadge>;
            case "IN_PROGRESS": return <StatusBadge tone="info" icon={Loader2} className="[&_svg]:animate-spin">Proses GA</StatusBadge>;
            case "APPROVED": return <StatusBadge tone="success" icon={CheckCircle}>Disetujui</StatusBadge>;
            case "REJECTED": return <StatusBadge tone="danger" icon={X}>Ditolak</StatusBadge>;
            case "RESOLVED": return <StatusBadge tone="success" icon={CheckCircle}>Selesai</StatusBadge>;
            default: return <StatusBadge tone="neutral">{status}</StatusBadge>;
        }
    };

    return (
        <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
            <PageHeader
                title="Aset Saya"
                subtitle="Kelola aset perusahaan yang Anda gunakan."
                icon={Monitor}
                action={
                    <button onClick={() => handleOpenModal("NEW_REQUEST")} className="btn btn-primary">
                        <Plus className="w-4 h-4" /> Request Aset Baru
                    </button>
                }
            />

            {loading ? (
                <div className="flex justify-center py-12"><div className="spinner" /></div>
            ) : loadError ? (
                <StateCard variant="error" title="Gagal memuat aset" description={loadError} />
            ) : (
                <div className="space-y-5">
                    {/* Daftar Aset */}
                    <div className="space-y-4">
                        <h2 className="emp-eyebrow flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5" /> Barang Inventaris
                        </h2>
                        {assets.length === 0 ? (
                            <EmptyState
                                icon={Package}
                                title="Tidak ada aset"
                                description="Anda belum memegang aset perusahaan apapun."
                            />
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {assets.map((asset) => (
                                    <div key={asset.id} className="emp-surface emp-surface-hover p-4 group">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <StatusBadge tone="neutral">{asset.categoryRel.prefix}</StatusBadge>
                                                    <span className="text-[10px] font-mono text-[var(--text-muted)]">{asset.assetCode}</span>
                                                </div>
                                                <h3 className="font-bold text-[var(--text-primary)]">{asset.name}</h3>
                                                <p className="text-xs text-[var(--text-secondary)]">S/N: {asset.serialNumber || "-"}</p>
                                            </div>
                                            <div>
                                                <StatusBadge tone={KONDISI_STYLE[asset.kondisi]?.tone ?? "neutral"}>{KONDISI_STYLE[asset.kondisi]?.label ?? asset.kondisi}</StatusBadge>
                                            </div>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-[var(--border)] flex justify-end">
                                            <button 
                                                onClick={() => handleOpenModal("DAMAGE_REPORT", asset)}
                                                className="btn btn-ghost btn-sm text-[var(--warning)] hover:bg-[var(--warning-bg)] text-xs"
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
                        <h2 className="emp-eyebrow flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5" /> Riwayat Tiket
                        </h2>
                        {tickets.length === 0 ? (
                            <EmptyState
                                icon={MessageSquare}
                                title="Belum ada tiket"
                                description="Riwayat permintaan atau pelaporan aset akan muncul di sini."
                            />
                        ) : (
                            <div className="space-y-3">
                                {tickets.map(t => (
                                    <div key={t.id} className="emp-surface p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono text-[var(--text-muted)]">{t.ticketCode}</span>
                                                    <StatusBadge tone={t.type === "NEW_REQUEST" ? "info" : "warning"}>
                                                        {t.type === "NEW_REQUEST" ? "Request Baru" : "Lapor Kerusakan"}
                                                    </StatusBadge>
                                                </div>
                                                <h4 className="font-bold text-sm text-[var(--text-primary)]">{t.title}</h4>
                                                {t.asset && (
                                                    <p className="text-[10px] text-[var(--text-secondary)] font-medium">Aset: {t.asset.name} ({t.asset.assetCode})</p>
                                                )}
                                            </div>
                                            {getStatusBadge(t.status)}
                                        </div>
                                        <p className="text-xs text-[var(--text-secondary)] p-2.5 bg-[color-mix(in_srgb,var(--secondary)_50%,transparent)] rounded-lg border border-[var(--border)]">
                                            {t.description}
                                        </p>
                                        
                                        {t.gaResponse && (
                                            <FeedbackMessage variant="success" title="Tanggapan GA" compact>
                                                {t.gaResponse}
                                            </FeedbackMessage>
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
                                    <><Plus className="w-5 h-5 text-[var(--primary)]"/> Request Aset Baru</>
                                ) : (
                                    <><AlertTriangle className="w-5 h-5 text-[var(--warning)]"/> Lapor Kerusakan</>
                                )}
                            </h2>
                            <button className="modal-close" onClick={() => !submitting && setShowModal(false)} disabled={submitting} aria-label="Tutup modal tiket aset"><X className="w-4 h-4" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {modalType === "DAMAGE_REPORT" && selectedAsset && (
                                <div className="p-3 bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-xl">
                                    <p className="text-xs font-bold text-[var(--warning)] mb-1">Aset yang dilaporkan:</p>
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedAsset.name}</p>
                                    <p className="text-xs text-[var(--text-secondary)] font-mono">{selectedAsset.assetCode}</p>
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
