"use client";

import { useEffect, useState, useMemo } from "react";
import { Ticket, Search, Filter, MessageSquare, CheckCircle, XCircle, Clock, Package, Monitor, Loader2, ArrowRight, AlertCircle, RotateCcw } from "lucide-react";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
import DataTablePagination from "@/components/ui/DataTablePagination";

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
    const [loadError, setLoadError] = useState("");
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const toast = useToast();

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(9);

    // Modal Action
    const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
    const [newStatus, setNewStatus] = useState<TicketData["status"]>("IN_PROGRESS");
    const [gaResponse, setGaResponse] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const fetchTickets = async () => {
        setLoading(true);
        setLoadError("");
        try {
            const res = await fetch("/api/ga/tickets");
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat data tiket."));
            }

            const data = await res.json();
            setTickets(Array.isArray(data) ? data : []);
        } catch (err) {
            reportClientError("GATicketsPage", "Gagal memuat data tiket GA", err);
            const message = err instanceof Error ? err.message : "Gagal memuat data tiket.";
            setTickets([]);
            setLoadError(message);
            toast(message, "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTickets();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reset pagination to page 1 on filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [search, statusFilter, pageSize]);

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
                toast(await getResponseErrorMessage(res, "Gagal memperbarui status."), "error");
            }
        } catch (error) {
            reportClientError("GATicketsPage", "Gagal memperbarui status tiket GA", error, {
                ticketId: selectedTicket.id,
                status: newStatus,
            });
            toast("Status tiket belum tersimpan karena jaringan bermasalah. Periksa koneksi lalu coba lagi.", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch(status) {
            case "PENDING": return <span className="badge badge-warning flex items-center gap-1"><Clock className="w-3 h-3"/> PENDING</span>;
            case "IN_PROGRESS": return <span className="badge badge-info flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> DIPROSES</span>;
            case "APPROVED": return <span className="badge badge-success flex items-center gap-1"><CheckCircle className="w-3 h-3"/> DISETUJUI</span>;
            case "RESOLVED": return <span className="badge badge-success flex items-center gap-1"><CheckCircle className="w-3 h-3"/> SELESAI</span>;
            case "REJECTED": return <span className="badge badge-error flex items-center gap-1"><XCircle className="w-3 h-3"/> DITOLAK</span>;
            default: return <span className="badge badge-neutral">{status}</span>;
        }
    };

    const filteredTickets = useMemo(() => {
        return tickets.filter(t => {
            const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
                t.ticketCode.toLowerCase().includes(search.toLowerCase()) ||
                t.employee.name.toLowerCase().includes(search.toLowerCase()) ||
                t.employee.employeeId.toLowerCase().includes(search.toLowerCase());
            const matchStatus = statusFilter === "ALL" || t.status === statusFilter;
            return matchSearch && matchStatus;
        });
    }, [tickets, search, statusFilter]);

    const totalPages = Math.ceil(filteredTickets.length / pageSize) || 1;
    const paginatedTickets = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredTickets.slice(start, start + pageSize);
    }, [filteredTickets, currentPage, pageSize]);

    const resetFilters = () => {
        setSearch("");
        setStatusFilter("ALL");
    };

    const hasActiveFilters = search || statusFilter !== "ALL";

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-[var(--primary)]" />
                    Tiket & Permintaan GA
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Kelola permintaan fasilitas dan laporan kerusakan aset dari karyawan
                </p>
            </div>

            {loadError && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Filter Bar */}
            <div className="card p-4 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            placeholder="Cari kode tiket, judul, atau nama karyawan..."
                            className="form-input pl-10 w-full"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {["ALL", "PENDING", "IN_PROGRESS", "APPROVED", "RESOLVED", "REJECTED"].map(status => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    statusFilter === status
                                        ? "bg-[var(--primary)] text-white shadow-sm"
                                        : "bg-[var(--secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                                }`}
                            >
                                {status === "ALL" ? "Semua" : status}
                            </button>
                        ))}
                    </div>
                </div>

                {hasActiveFilters && (
                    <div className="flex justify-end pt-2 border-t border-[var(--border)]">
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reset Filter
                        </button>
                    </div>
                )}
            </div>

            {/* List Tiket Grid */}
            {loading ? (
                <div className="card p-12 text-center text-[var(--text-muted)]">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--primary)] opacity-50" />
                    <p className="text-sm font-medium">Memuat data tiket GA...</p>
                </div>
            ) : filteredTickets.length === 0 ? (
                <div className="card p-12 text-center">
                    <Ticket className="w-12 h-12 text-[var(--text-muted)] opacity-20 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Tidak ada tiket ditemukan</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Coba sesuaikan filter pencarian Anda</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {paginatedTickets.map(ticket => (
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

                    <div className="card overflow-hidden">
                        <DataTablePagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={filteredTickets.length}
                            pageSize={pageSize}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={setPageSize}
                            pageSizeOptions={[6, 9, 18, 36]}
                            itemLabel="tiket"
                        />
                    </div>
                </div>
            )}

            {/* Action Modal */}
            {selectedTicket && (
                <AccessibleModal
                    ariaLabel={`Tindak lanjut tiket ${selectedTicket.title}`}
                    onClose={() => setSelectedTicket(null)}
                    className="max-w-lg"
                    disableClose={submitting}
                >
                    <div className="modal-header">
                        <h2 className="modal-title flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-indigo-500"/> Tindak Lanjut Tiket
                        </h2>
                        <button className="modal-close" onClick={() => !submitting && setSelectedTicket(null)} disabled={submitting} aria-label="Tutup modal tindak lanjut tiket"><XCircle className="w-5 h-5" /></button>
                    </div>
                    <div className="p-4 bg-[var(--secondary)]/50 border-b border-[var(--border)] mb-4 space-y-2">
                        <p className="text-sm font-bold text-[var(--text-primary)]">{selectedTicket.title}</p>
                        <p className="text-xs text-[var(--text-muted)]">Pelapor: <b>{selectedTicket.employee.name}</b> ({selectedTicket.employee.employeeId})</p>
                        <p className="text-xs text-[var(--text-secondary)] italic">{selectedTicket.description}</p>
                    </div>

                    <form onSubmit={handleActionSubmit} className="space-y-4">
                        <div className="form-group">
                            <label className="form-label">Ubah Status</label>
                            <select 
                                className="form-select"
                                value={newStatus}
                                onChange={(e) => setNewStatus(e.target.value as TicketData["status"])}
                                required
                            >
                                <option value="PENDING">PENDING (Menunggu Antrean)</option>
                                <option value="IN_PROGRESS">IN_PROGRESS (Sedang Dikerjakan/Diproses)</option>
                                <option value="APPROVED">APPROVED (Disetujui untuk Pengadaan)</option>
                                <option value="RESOLVED">RESOLVED (Selesai/Tuntas)</option>
                                <option value="REJECTED">REJECTED (Ditolak)</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Tanggapan / Catatan GA</label>
                            <textarea 
                                className="form-textarea"
                                rows={4}
                                placeholder="Berikan keterangan atau instruksi untuk karyawan..."
                                value={gaResponse}
                                onChange={(e) => setGaResponse(e.target.value)}
                                required
                            />
                        </div>

                        <div className="modal-footer">
                            <button 
                                type="button" 
                                className="btn btn-secondary"
                                onClick={() => setSelectedTicket(null)}
                                disabled={submitting}
                            >
                                Batal
                            </button>
                            <button 
                                type="submit" 
                                className="btn btn-primary"
                                disabled={submitting}
                            >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin"/> : "Simpan Perubahan"}
                            </button>
                        </div>
                    </form>
                </AccessibleModal>
            )}
        </div>
    );
}
