"use client";

import { useState, useMemo } from "react";
import { AlertCircle, CheckCircle, Eye, Loader2, XCircle, LogIn, LogOut, CheckSquare, Square, FileSpreadsheet, Check } from "lucide-react";
import { VisitReport, STATUS_CONFIG } from "../types";
import DataTablePagination from "@/components/ui/DataTablePagination";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { exportToExcel } from "@/lib/export";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { useTablePagination } from "@/hooks/useTablePagination";

interface Props {
    filtered: VisitReport[];
    loading: boolean;
    error: string;
    updating: string | null;
    setSelectedVisit: (v: VisitReport | null) => void;
    handleStatusUpdate: (id: string, isChecked: boolean, options?: { silent?: boolean }) => Promise<boolean>;
}

export function VisitListTable({
    filtered, loading, error, updating, setSelectedVisit, handleStatusUpdate
}: Props) {
    const toast = useToast();
    const confirm = useConfirm();
    const {
        currentPage,
        pageSize,
        setPage: setCurrentPage,
        setPageSize,
    } = useTablePagination({
        storageKey: "visits",
        totalItems: filtered.length,
    });
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkProcessing, setBulkProcessing] = useState(false);

    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    const paginatedVisits = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, currentPage, pageSize]);

    const isAllCurrentPageSelected = paginatedVisits.length > 0 && paginatedVisits.every(v => selectedIds.has(v.id));
    const isAllFilteredSelected = filtered.length > 0 && filtered.every(v => selectedIds.has(v.id));

    const selectedUncheckedVisits = useMemo(() => {
        return filtered.filter(v => selectedIds.has(v.id) && v.status === "clocked_out" && !v.hrChecked);
    }, [filtered, selectedIds]);

    const eligibleVisitsCount = selectedUncheckedVisits.length;
    const skippedVisitsCount = selectedIds.size - eligibleVisitsCount;

    const toggleSelectAllCurrentPage = () => {
        const next = new Set(selectedIds);
        if (isAllCurrentPageSelected) {
            paginatedVisits.forEach(v => next.delete(v.id));
        } else {
            paginatedVisits.forEach(v => next.add(v.id));
        }
        setSelectedIds(next);
    };

    const selectAllFiltered = () => {
        const next = new Set(selectedIds);
        filtered.forEach(v => next.add(v.id));
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

    const handleBulkVerify = async () => {
        if (bulkProcessing) return;
        if (selectedUncheckedVisits.length === 0) {
            toast("Tidak ada kunjungan selesai yang belum dicek.", "warning");
            return;
        }

        confirm({
            title: "Verifikasi Kunjungan Massal?",
            message: `Sebanyak ${eligibleVisitsCount} kunjungan lapangan akan ditandai sudah diperiksa HR.${skippedVisitsCount > 0 ? ` (${skippedVisitsCount} data kunjungan yang belum selesai atau sudah dicek akan dilewati).` : ""}`,
            confirmLabel: "Ya, Tandai Sudah Dicek",
            variant: "info",
            onConfirm: async () => {
                setBulkProcessing(true);
                const succeededIds: string[] = [];
                let failedCount = 0;
                try {
                    for (const v of selectedUncheckedVisits) {
                        const ok = await handleStatusUpdate(v.id, true, { silent: true });
                        if (ok) {
                            succeededIds.push(v.id);
                        } else {
                            failedCount++;
                        }
                    }
                    setSelectedIds(prev => {
                        const next = new Set(prev);
                        succeededIds.forEach(id => next.delete(id));
                        return next;
                    });
                    if (failedCount === 0) {
                        toast(`${succeededIds.length} kunjungan berhasil ditandai sudah dicek.`, "success");
                    } else {
                        toast(`${succeededIds.length} kunjungan berhasil dicek, ${failedCount} gagal.`, "error");
                    }
                } catch {
                    toast("Sebagian verifikasi massal kunjungan gagal.", "error");
                } finally {
                    setBulkProcessing(false);
                }
            },
        });
    };

    const handleBulkExportExcel = () => {
        const targetList = filtered.filter(v => selectedIds.has(v.id));
        if (targetList.length === 0) return;

        const data = targetList.map(v => ({
            employeeId: v.employeeId,
            employeeName: v.employeeName || "-",
            clientName: v.clientName,
            clientAddress: v.clientAddress,
            purpose: v.purpose,
            date: v.date,
            clockIn: v.clockInTime || "-",
            clockOut: v.clockOutTime || "-",
            status: STATUS_CONFIG[v.status]?.label || v.status,
            hrChecked: v.hrChecked ? "Sudah Dicek" : "Belum Dicek"
        }));

        exportToExcel(
            data,
            [
                { key: "employeeId", label: "NIP" },
                { key: "employeeName", label: "Nama Karyawan" },
                { key: "clientName", label: "Klien" },
                { key: "clientAddress", label: "Alamat Klien" },
                { key: "purpose", label: "Tujuan Kunjungan" },
                { key: "date", label: "Tanggal" },
                { key: "clockIn", label: "Clock In" },
                { key: "clockOut", label: "Clock Out" },
                { key: "status", label: "Status" },
                { key: "hrChecked", label: "Verifikasi HR" }
            ],
            `Data_Kunjungan_Export_${new Date().toISOString().slice(0, 10)}`,
            "Kunjungan"
        );
        toast(`${targetList.length} data kunjungan berhasil diekspor ke Excel.`, "success");
    };

    return (
        <div className="card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-10 text-center">
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
                        </TableHead>
                        <TableHead>Karyawan</TableHead>
                        <TableHead>Klien</TableHead>
                        <TableHead className="hidden md:table-cell">Tujuan</TableHead>
                        <TableHead className="hidden lg:table-cell">Tanggal</TableHead>
                        <TableHead className="hidden lg:table-cell">Clock In</TableHead>
                        <TableHead className="hidden lg:table-cell">Clock Out</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                        {loading ? (
                            <tr>
                                <td colSpan={9} className="text-center py-10 text-sm text-[var(--text-muted)]">
                                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--primary)] opacity-50" />
                                    Memuat kunjungan...
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={9} className="py-10 text-center text-[var(--destructive)]">
                                    <div className="flex items-center justify-center gap-2">
                                        <AlertCircle className="w-4 h-4" />
                                        <span>{error}</span>
                                    </div>
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={9} className="text-center py-8 text-sm text-[var(--text-muted)]">Tidak ada kunjungan ditemukan</td></tr>
                        ) : (
                            paginatedVisits.map((v) => {
                                const cfg = STATUS_CONFIG[v.status];
                                const isChecked = v.hrChecked;
                                const isSelected = selectedIds.has(v.id);
                                
                                return (
                                    <tr key={v.id} className={isSelected ? "bg-[var(--primary)]/5" : undefined}>
                                        <td className="text-center">
                                            <button
                                                type="button"
                                                onClick={() => toggleSelectOne(v.id)}
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
                                            <div>
                                                <p className="text-xs font-semibold text-[var(--text-primary)]">{v.employeeName || "-"}</p>
                                                <p className="text-[10px] font-mono text-[var(--text-muted)]">{v.employeeId}</p>
                                            </div>
                                        </td>
                                        <td>
                                            <div>
                                                <p className="font-semibold text-[var(--text-primary)] text-xs">{v.clientName}</p>
                                                <p className="text-[10px] text-[var(--text-muted)] line-clamp-1">{v.clientAddress}</p>
                                            </div>
                                        </td>
                                        <td className="hidden md:table-cell text-xs text-[var(--text-secondary)] max-w-[200px]">
                                            <p className="line-clamp-2">{v.purpose}</p>
                                        </td>
                                        <td className="hidden lg:table-cell text-xs">{v.date}</td>
                                        <td className="hidden lg:table-cell text-xs font-mono">
                                            {v.clockInTime ? (
                                                <span className="flex items-center gap-1 text-blue-600">
                                                    <LogIn className="w-3 h-3" /> {v.clockInTime}
                                                </span>
                                            ) : "-"}
                                        </td>
                                        <td className="hidden lg:table-cell text-xs font-mono">
                                            {v.clockOutTime ? (
                                                <span className="flex items-center gap-1 text-orange-600">
                                                    <LogOut className="w-3 h-3" /> {v.clockOutTime}
                                                </span>
                                            ) : "-"}
                                        </td>
                                        <td>
                                            <div className="flex flex-col gap-1 items-start">
                                                <span className={`badge ${cfg.class}`}>{cfg.label}</span>
                                                {v.status === "clocked_out" && (
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isChecked ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                                        {isChecked ? "✓ Dicek" : "Belum Dicek"}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={() => setSelectedVisit(v)} className="btn btn-ghost btn-sm !p-1.5" title="Detail">
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
                                                {v.status === "clocked_out" && (
                                                    <button
                                                        onClick={() => handleStatusUpdate(v.id, !isChecked)}
                                                        className={`btn btn-ghost btn-sm !p-1.5 ${isChecked ? "text-red-500 hover:!bg-red-50" : "text-emerald-600 hover:!bg-emerald-50"}`}
                                                        disabled={updating === v.id}
                                                        title={isChecked ? "Batal Tandai" : "Tandai Sudah Dicek"}
                                                    >
                                                        {updating === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isChecked ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </TableBody>
            </Table>

            <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filtered.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                itemLabel="kunjungan"
            />

            <BulkActionBar
                selectedCount={selectedIds.size}
                totalCount={filtered.length}
                allSelected={isAllFilteredSelected}
                onSelectAll={selectAllFiltered}
                onClearSelection={clearSelection}
                itemLabel="kunjungan"
                subtitle={
                    selectedIds.size > 0
                        ? `${eligibleVisitsCount} kunjungan selesai belum dicek${skippedVisitsCount > 0 ? `, ${skippedVisitsCount} dilewati` : ""}`
                        : undefined
                }
            >
                <button
                    type="button"
                    onClick={handleBulkVerify}
                    disabled={bulkProcessing || eligibleVisitsCount === 0}
                    className="btn btn-success btn-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={eligibleVisitsCount === 0 ? "Pilih minimal 1 kunjungan selesai yang belum dicek" : `Tandai ${eligibleVisitsCount} kunjungan sudah dicek`}
                >
                    {bulkProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Tandai Sudah Dicek {eligibleVisitsCount > 0 ? `(${eligibleVisitsCount})` : ""}
                </button>
                <button
                    type="button"
                    onClick={handleBulkExportExcel}
                    className="btn btn-secondary btn-sm flex items-center gap-1.5 border border-[var(--border)]"
                >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Ekspor Excel ({selectedIds.size})
                </button>
            </BulkActionBar>
        </div>
    );
}
