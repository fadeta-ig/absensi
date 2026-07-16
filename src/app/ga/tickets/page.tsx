"use client";

import { useEffect, useState } from "react";
import { Ticket, Search, Filter, MessageSquare, CheckCircle, XCircle, Clock, Package, Monitor, Loader2, ArrowRight } from "lucide-react";
import { useToast } from "@/components/Toast";

interface TicketData {
    id: string;
    ticketCode: string;
    employeeId: string;
    employee: { name: string; employeeId: string };
    type: "NEW_REQUEST" | "DAMAGE_REPORT";
    assetId: string | null;
    asset: { name: string; assetCode: string; serialNumber: string | null } | null;
    title: string;
    description: string;
    status: "PENDING" | "IN_PROGRESS" | "APPROVED" | "REJECTED" | "RESOLVED";
    gaResponse: string | null;
    createdAt: string;
}

export default function GATicketsPage() {
    const [tickets, setTickets] = useState<TicketData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const toast = useToast();

    // Modal Action
    const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
    const [newStatus, setNewStatus] = useState<TicketData["status"]>("IN_PROGRESS");
    const [gaResponse, setGaResponse] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/ga/tickets");
            if (res.ok) {
                const data = await res.json();
                setTickets(data);
            }
        } catch {
            toast("Gagal memuat data tiket.", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTickets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleActionSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTicket) return;
        setSubmitting(true);
        try {
            const res = await fetch("/api/ga/tickets", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: selectedTicket.id,
                    status: newStatus,
                    gaResponse: gaResponse
                })
            });

            if (res.ok) {
                toast("Status tiket berhasil diperbarui.", "success");
                setSelectedTicket(null);
                fetchTickets();
            } else {
                toast("Gagal memperbarui status.", "error");
            }
        } catch {
            toast("Terjadi kesalahan jaringan.", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch(status) {
            case "PENDING": return <span className="badge badge-warning"><Clock className="w-3 h-3 mr-1"/> PENDING</span>;
            case "IN_PROGRESS": return <span className="badge bg-blue-100 text-blue-700 border-blue-200"><Loader2 className="w-3 h-3 mr-1 animate-spin"/> IN PROGRESS</span>;
            case "APPROVED": return <span className="badge bg-indigo-100 text-indigo-700 border-indigo-200"><CheckCircle className="w-3 h-3 mr-1"/> APPROVED</span>;
            case "REJECTED": return <span className="badge badge-error"><XCircle className="w-3 h-3 mr-1"/> REJECTED</span>;
            case "RESOLVED": return <span className="badge badge-success"><CheckCircle className="w-3 h-3 mr-1"/> RESOLVED</span>;
            default: return <span className="badge badge-ghost">{status}</span>;
        }
    };

    const filteredTickets = tickets.filter(t => {
        const matchesStatus = statusFilter === "ALL" || t.status === statusFilter;
        const matchesSearch = 
            t.employee.name.toLowerCase().includes(search.toLowerCase()) ||
            t.ticketCode.toLowerCase().includes(search.toLowerCase()) ||
            t.title.toLowerCase().includes(search.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Ticket className="w-7 h-7 text-indigo-500" />
                        Asset Ticketing
                    </h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Pusat kendali permintaan dan pelaporan aset karyawan.
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="card p-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input 
                            type="text" 
                            className="form-input pl-10 w-full" 
                            placeholder="Cari no tiket, nama karyawan, judul..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="relative w-full md:w-64">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <select 
                            className="form-select pl-10 w-full appearance-none"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="ALL">Semua Status</option>
                            <option value="PENDING">Pending (Menunggu)</option>
                            <option value="IN_PROGRESS">In Progress (Diproses)</option>
                            <option value="APPROVED">Approved (Disetujui)</option>
                            <option value="REJECTED">Rejected (Ditolak)</option>
                            <option value="RESOLVED">Resolved (Selesai)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Ticket List */}
            {loading ? (
                <div className="flex justify-center py-12"><div className="spinner" /></div>
            ) : filteredTickets.length === 0 ? (
                <div className="card p-12 text-center border-dashed">
                    <Ticket className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Tidak ada tiket</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Sistem ticketing saat ini kosong.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTickets.map(ticket => (
                        <div key={ticket.id} className="card p-5 space-y-4 hover:shadow-md transition-shadow group flex flex-col">
                            {/* Header Tiket */}
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono text-[var(--text-muted)] bg-[var(--secondary)] px-1.5 py-0.5 rounded">{ticket.ticketCode}</span>
                                    </div>
                                    <h3 className="font-bold text-[var(--text-primary)] text-sm">{ticket.title}</h3>
                                </div>
                                {getStatusBadge(ticket.status)}
                            </div>

                            {/* Info Karyawan & Tipe */}
                            <div className="flex items-center gap-3 py-2 border-y border-[var(--border)]">
                                <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold shrink-0">
                                    {ticket.employee.name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-[var(--text-primary)] truncate">{ticket.employee.name}</p>
                                    <p className="text-[10px] text-[var(--text-muted)]">{ticket.employee.employeeId}</p>
                                </div>
                                <div className="shrink-0 text-right">
                                    {ticket.type === "NEW_REQUEST" ? (
                                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full flex items-center gap-1">
                                            <Package className="w-3 h-3" /> REQUEST
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-full flex items-center gap-1">
                                            <Monitor className="w-3 h-3" /> RUSAK
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Aset yg dilaporkan */}
                            {ticket.asset && (
                                <div className="p-2 bg-[var(--secondary)]/50 rounded text-xs border border-[var(--border)]">
                                    <span className="font-semibold text-[var(--text-primary)]">Aset:</span> {ticket.asset.name} <span className="text-[var(--text-muted)] font-mono ml-1">({ticket.asset.assetCode})</span>
                                </div>
                            )}

                            {/* Deskripsi */}
                            <p className="text-xs text-[var(--text-secondary)] line-clamp-3 flex-1">
                                {ticket.description}
                            </p>

                            {/* GA Response Snippet */}
                            {ticket.gaResponse && (
                                <div className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-900/10 dark:text-emerald-400 p-2 rounded line-clamp-2 mt-auto">
                                    <span className="font-bold">GA:</span> {ticket.gaResponse}
                                </div>
                            )}

                            {/* Action Button */}
                            <div className="pt-3 border-t border-[var(--border)] mt-auto flex justify-between items-center">
                                <span className="text-[10px] text-[var(--text-muted)]">
                                    {new Date(ticket.createdAt).toLocaleDateString("id-ID", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <button 
                                    onClick={() => {
                                        setSelectedTicket(ticket);
                                        setNewStatus(ticket.status === "PENDING" ? "IN_PROGRESS" : ticket.status);
                                        setGaResponse(ticket.gaResponse || "");
                                    }}
                                    className="btn btn-primary btn-sm text-xs px-3"
                                >
                                    Tindak Lanjut <ArrowRight className="w-3 h-3 ml-1" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Action Modal */}
            {selectedTicket && (
                <div className="modal-overlay" onClick={() => !submitting && setSelectedTicket(null)}>
                    <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-indigo-500"/> Tindak Lanjut Tiket
                            </h2>
                            <button className="modal-close" onClick={() => !submitting && setSelectedTicket(null)}><XCircle className="w-5 h-5" /></button>
                        </div>
                        <div className="p-4 bg-[var(--secondary)]/50 border-b border-[var(--border)] mb-4 space-y-2">
                            <p className="text-sm font-bold text-[var(--text-primary)]">{selectedTicket.title}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{selectedTicket.description}</p>
                        </div>
                        <form onSubmit={handleActionSubmit} className="space-y-4">
                            <div className="form-group !mb-0">
                                <label className="form-label">Ubah Status</label>
                                <select 
                                    className="form-select"
                                    value={newStatus}
                                    onChange={(e) => setNewStatus(e.target.value as TicketData["status"])}
                                >
                                    <option value="PENDING">PENDING (Menunggu)</option>
                                    <option value="IN_PROGRESS">IN PROGRESS (Sedang Diproses)</option>
                                    <option value="APPROVED">APPROVED (Disetujui)</option>
                                    <option value="REJECTED">REJECTED (Ditolak)</option>
                                    <option value="RESOLVED">RESOLVED (Selesai/Ditutup)</option>
                                </select>
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label">Catatan Tanggapan (Opsional)</label>
                                <textarea 
                                    className="form-textarea min-h-[100px]"
                                    placeholder="Berikan pesan balasan atau instruksi ke karyawan..."
                                    value={gaResponse}
                                    onChange={(e) => setGaResponse(e.target.value)}
                                />
                                <p className="text-[10px] text-[var(--text-muted)] mt-1">Pesan ini akan muncul di portal aset karyawan yang bersangkutan.</p>
                            </div>
                            <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
                                <button type="button" onClick={() => setSelectedTicket(null)} disabled={submitting} className="btn btn-ghost">Batal</button>
                                <button type="submit" disabled={submitting} className="btn btn-primary min-w-[100px]">
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Simpan"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
