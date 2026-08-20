"use client";

import { useState, useMemo, useEffect } from "react";
import { AlertCircle, Loader2, CheckSquare, Square, Check, X } from "lucide-react";
import { AttendanceCorrection } from "../types";
import DataTablePagination from "@/components/ui/DataTablePagination";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { useToast } from "@/components/Toast";

interface Props {
    corrections: AttendanceCorrection[];
    loading: boolean;
    error: string;
    processingId: string | null;
    getEmpInfo: (id: string) => { name: string; department: string; division: string };
    handleCorrectionAction: (id: string, s: "APPROVED" | "REJECTED") => void;
}

export function AttendanceCorrectionTab({
    corrections, loading, error, processingId, getEmpInfo, handleCorrectionAction
}: Props) {
    const toast = useToast();
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkProcessing, setBulkProcessing] = useState(false);

    useEffect(() => {
        setCurrentPage(1);
    }, [corrections.length, pageSize]);

    const totalPages = Math.ceil(corrections.length / pageSize) || 1;
    const paginatedCorrections = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return corrections.slice(start, start + pageSize);
    }, [corrections, currentPage, pageSize]);

    const isAllCurrentPageSelected = paginatedCorrections.length > 0 && paginatedCorrections.every(c => selectedIds.has(c.id));
    const isAllFilteredSelected = corrections.length > 0 && corrections.every(c => selectedIds.has(c.id));

    const toggleSelectAllCurrentPage = () => {
        const next = new Set(selectedIds);
        if (isAllCurrentPageSelected) {
            paginatedCorrections.forEach(c => next.delete(c.id));
        } else {
            paginatedCorrections.forEach(c => next.add(c.id));
        }
        setSelectedIds(next);
    };

    const selectAllFiltered = () => {
        const next = new Set(selectedIds);
        corrections.forEach(c => next.add(c.id));
        setSelectedIds(next);
    };

    const toggleSelectOne = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const clearSelection = () => setSelectedIds(new Set());

    const handleBulkAction = async (status: "APPROVED" | "REJECTED") => {
        const targetList = corrections.filter(c => selectedIds.has(c.id) && c.status === "PENDING");
        if (targetList.length === 0) {
            toast("Tidak ada pengajuan koreksi berstatus PENDING yang dipilih.", "warning");
            return;
        }

        setBulkProcessing(true);
        try {
            for (const item of targetList) {
                await handleCorrectionAction(item.id, status);
            }
            clearSelection();
            toast(`${targetList.length} koreksi absensi berhasil ${status === "APPROVED" ? "disetujui" : "ditolak"}.`, "success");
        } catch {
            toast("Sebagian proses koreksi massal gagal.", "error");
        } finally {
            setBulkProcessing(false);
        }
    };

    return (
        <div className="card overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-[var(--secondary)]/50 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Daftar Pengajuan Susulan Karyawan
                </h2>
                <span className="text-xs text-[var(--text-muted)]">
                    Total: <strong className="text-[var(--text-primary)]">{corrections.length}</strong> pengajuan
                </span>
            </div>
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead className="bg-[#F9FAFB]">
                        <tr>
                            <th className="w-10 text-center">
                                <button
                                    type="button"
                                    onClick={toggleSelectAllCurrentPage}
                                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5"
                                    title={isAllCurrentPageSelected ? "Batalkan halaman ini" : "Pilih halaman ini"}
                                >
                                    {isAllCurrentPageSelected ? (
                                        <CheckSquare className="w-4 h-4 text-[var(--primary)]" />
                                    ) : (
                                        <Square className="w-4 h-4" />
                                    )}
                                </button>
                            </th>
                            <th>Karyawan</th>
                            <th>Target Tanggal</th>
                            <th>Waktu Pengajuan</th>
                            <th>Alasan</th>
                            <th>Status</th>
                            <th className="text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="text-center py-10 text-[var(--text-muted)]">
                                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--primary)] opacity-50" />
                                    Memuat pengajuan koreksi...
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={7} className="py-10 text-center text-[var(--destructive)]">
                                    <div className="flex items-center justify-center gap-2">
                                        <AlertCircle className="w-4 h-4" />
                                        <span>{error}</span>
                                    </div>
                                </td>
                            </tr>
                        ) : corrections.length === 0 ? (
                            <tr><td colSpan={7} className="text-center py-10 text-[var(--text-muted)] italic">Tidak ada pengajuan koreksi masuk.</td></tr>
                        ) : (
                            paginatedCorrections.map(c => {
                                const ei = getEmpInfo(c.employeeId);
                                const isSelected = selectedIds.has(c.id);
                                return (
                                    <tr key={c.id} className={isSelected ? "bg-[var(--primary)]/5" : undefined}>
                                        <td className="text-center">
                                            <button
                                                type="button"
                                                onClick={() => toggleSelectOne(c.id)}
                                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5"
                                            >
                                                {isSelected ? (
                                                    <CheckSquare className="w-4 h-4 text-[var(--primary)]" />
                                                ) : (
                                                    <Square className="w-4 h-4" />
                                                )}
                                            </button>
                                        </td>
                                        <td>
                                            <div className="font-semibold text-xs text-[var(--text-primary)]">{ei.name}</div>
                                            <div className="text-[10px] font-mono text-[var(--text-muted)]">{c.employeeId}</div>
                                        </td>
                                        <td className="font-medium text-xs text-[var(--text-secondary)]">{c.targetDate}</td>
                                        <td className="font-mono text-xs text-blue-600">
                                            {(c.proposedClockIn ? new Date(c.proposedClockIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--')}
                                            {" - "}
                                            {(c.proposedClockOut ? new Date(c.proposedClockOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--')}
                                        </td>
                                        <td className="text-xs max-w-[200px] truncate text-[var(--text-secondary)]" title={c.reason}>{c.reason}</td>
                                        <td>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${c.status === "PENDING" ? "bg-orange-100 text-orange-700" : c.status === "APPROVED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                                {c.status}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            {c.status === "PENDING" ? (
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => handleCorrectionAction(c.id, "APPROVED")}
                                                        disabled={processingId === c.id}
                                                        className="btn btn-success btn-sm !py-1 !px-2.5 flex items-center gap-1"
                                                    >
                                                        {processingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                        Terima
                                                    </button>
                                                    <button
                                                        onClick={() => handleCorrectionAction(c.id, "REJECTED")}
                                                        disabled={processingId === c.id}
                                                        className="btn btn-danger btn-sm !py-1 !px-2.5 flex items-center gap-1"
                                                    >
                                                        {processingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                                        Tolak
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-[var(--text-muted)] italic">Selesai</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={corrections.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                itemLabel="koreksi"
            />

            <BulkActionBar
                selectedCount={selectedIds.size}
                totalCount={corrections.length}
                allSelected={isAllFilteredSelected}
                onSelectAll={selectAllFiltered}
                onClearSelection={clearSelection}
                itemLabel="koreksi"
            >
                <button
                    type="button"
                    onClick={() => handleBulkAction("APPROVED")}
                    disabled={bulkProcessing}
                    className="btn btn-success btn-sm flex items-center gap-1.5"
                >
                    {bulkProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Setujui Terpilih
                </button>
                <button
                    type="button"
                    onClick={() => handleBulkAction("REJECTED")}
                    disabled={bulkProcessing}
                    className="btn btn-danger btn-sm flex items-center gap-1.5"
                >
                    {bulkProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    Tolak Terpilih
                </button>
            </BulkActionBar>
        </div>
    );
}
