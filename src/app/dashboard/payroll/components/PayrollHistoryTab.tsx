"use client";

import { useState, useMemo, useEffect } from "react";
import { FileText, Eye, Download, Trash2, FileSpreadsheet, Loader2, CheckSquare, Square, Printer } from "lucide-react";
import { Payslip, Employee, PayslipItem } from "../types";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import DataTablePagination from "@/components/ui/DataTablePagination";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { exportBatchPayslipsPdf } from "@/lib/export";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

export interface PayrollHistoryTabProps {
    filteredHistoryPayslips: Payslip[];
    employees: Employee[];
    setPayslips: React.Dispatch<React.SetStateAction<Payslip[]>>;
    setSelected: (p: Payslip) => void;
    handlePayslipPdf: (p: Payslip) => void;
    handleExportHistory: () => void;
    fmt: (n: number) => string;
}

export function PayrollHistoryTab({
    filteredHistoryPayslips,
    employees,
    setPayslips,
    setSelected,
    handlePayslipPdf,
    handleExportHistory,
    fmt
}: PayrollHistoryTabProps) {
    const toast = useToast();
    const confirm = useConfirm();
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Multi-select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        setCurrentPage(1);
    }, [filteredHistoryPayslips.length, pageSize]);

    const totalPages = Math.ceil(filteredHistoryPayslips.length / pageSize) || 1;
    const paginatedPayslips = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredHistoryPayslips.slice(start, start + pageSize);
    }, [filteredHistoryPayslips, currentPage, pageSize]);

    const getEmpName = (empId: string) => employees.find((e) => e.employeeId === empId)?.name || empId;

    const isAllCurrentPageSelected = paginatedPayslips.length > 0 && paginatedPayslips.every(p => selectedIds.has(p.id));
    const isAllFilteredSelected = filteredHistoryPayslips.length > 0 && filteredHistoryPayslips.every(p => selectedIds.has(p.id));

    const toggleSelectAllCurrentPage = () => {
        const next = new Set(selectedIds);
        if (isAllCurrentPageSelected) {
            paginatedPayslips.forEach(p => next.delete(p.id));
        } else {
            paginatedPayslips.forEach(p => next.add(p.id));
        }
        setSelectedIds(next);
    };

    const selectAllFiltered = () => {
        const next = new Set(selectedIds);
        filteredHistoryPayslips.forEach(p => next.add(p.id));
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

    const mapToBatchPdfData = (list: Payslip[]) => {
        return list.map(p => ({
            employeeId: p.employeeId,
            employeeName: getEmpName(p.employeeId),
            period: p.period,
            basicSalary: p.basicSalary,
            overtime: p.overtime,
            allowances: (p.items?.filter(i => i.type === "ALLOWANCE") || []).map(i => ({ name: i.name, amount: i.amount })),
            deductions: (p.items?.filter(i => i.type === "DEDUCTION") || []).map(i => ({ name: i.name, amount: i.amount })),
            netSalary: p.netSalary,
            issuedDate: p.issuedDate,
            notes: p.notes,
        }));
    };

    const handleDownloadBatchPdf = (payslipSubset?: Payslip[]) => {
        const targetList = payslipSubset || filteredHistoryPayslips.filter(p => selectedIds.has(p.id));
        if (targetList.length === 0) {
            toast("Tidak ada slip gaji yang dipilih.", "warning");
            return;
        }

        try {
            const batchData = mapToBatchPdfData(targetList);
            const periodLabel = targetList[0]?.period ? `_${targetList[0].period}` : "";
            exportBatchPayslipsPdf(batchData, `Slip_Gaji_Kolektif${periodLabel}`);
            toast(`${targetList.length} slip gaji berhasil digabungkan dan diunduh.`, "success");
        } catch (error) {
            reportClientError("PayrollHistoryTab", "Gagal mengunduh batch slip gaji PDF", error);
            toast("Gagal memproses berkas PDF slip gaji kolektif.", "error");
        }
    };

    const handleBulkDelete = () => {
        const targetList = filteredHistoryPayslips.filter(p => selectedIds.has(p.id));
        if (targetList.length === 0) return;

        confirm({
            title: "Hapus Slip Gaji Terpilih?",
            message: `Sebanyak ${targetList.length} slip gaji akan dihapus permanen dari riwayat.`,
            confirmLabel: "Hapus Semua Terpilih",
            cancelLabel: "Batal",
            variant: "danger",
            onConfirm: async () => {
                setBulkDeleting(true);
                try {
                    for (const p of targetList) {
                        await fetch(`/api/payslips?id=${p.id}`, { method: "DELETE" });
                    }
                    setPayslips(prev => prev.filter(x => !selectedIds.has(x.id)));
                    clearSelection();
                    toast(`${targetList.length} slip gaji berhasil dihapus.`, "success");
                } catch (error) {
                    reportClientError("PayrollHistoryTab", "Gagal menghapus batch slip gaji", error);
                    toast("Sebagian slip gaji gagal dihapus.", "error");
                } finally {
                    setBulkDeleting(false);
                }
            },
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--text-muted)]">
                    Total: <strong className="text-[var(--text-primary)]">{filteredHistoryPayslips.length}</strong> slip gaji terbit
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => handleDownloadBatchPdf(filteredHistoryPayslips)}
                        className="btn btn-primary btn-sm flex items-center gap-1.5"
                        disabled={filteredHistoryPayslips.length === 0}
                        title="Unduh seluruh slip gaji pada daftar ini dalam 1 file PDF gabungan"
                    >
                        <Printer className="w-3.5 h-3.5" />
                        Cetak Semua Slip Gaji (PDF)
                    </button>
                    <button onClick={handleExportHistory} className="btn btn-secondary btn-sm" disabled={filteredHistoryPayslips.length === 0}>
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Export History Excel
                    </button>
                </div>
            </div>

            {filteredHistoryPayslips.length === 0 ? (
                <div className="card p-12 text-center">
                    <FileText className="w-12 h-12 text-[var(--text-muted)] opacity-30 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Data tidak ditemukan</p>
                </div>
            ) : (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
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
                                    <th>Periode</th>
                                    <th className="hidden md:table-cell">Gaji Pokok</th>
                                    <th>Gaji Bersih</th>
                                    <th className="text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedPayslips.map((p) => {
                                    const isSelected = selectedIds.has(p.id);
                                    return (
                                        <tr key={p.id} className={isSelected ? "bg-[var(--primary)]/5" : undefined}>
                                            <td className="text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSelectOne(p.id)}
                                                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5"
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare className="w-4 h-4 text-[var(--primary)]" />
                                                    ) : (
                                                        <Square className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </td>
                                            <td className="font-medium text-[var(--text-primary)]">
                                                <div>
                                                    <p className="text-xs font-semibold">{getEmpName(p.employeeId)}</p>
                                                    <p className="text-[10px] font-mono text-[var(--text-muted)]">{p.employeeId}</p>
                                                </div>
                                            </td>
                                            <td className="text-xs font-mono">{p.period}</td>
                                            <td className="hidden md:table-cell text-xs">{fmt(p.basicSalary)}</td>
                                            <td className="font-bold text-xs text-[var(--primary)]">{fmt(p.netSalary)}</td>
                                            <td className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => setSelected(p)} className="btn btn-ghost btn-sm !p-1.5 text-[var(--primary)]" title="Lihat Detail"><Eye className="w-3.5 h-3.5" /></button>
                                                    <button onClick={() => handlePayslipPdf(p)} className="btn btn-ghost btn-sm !p-1.5 text-red-600" title="Download PDF"><Download className="w-3.5 h-3.5" /></button>
                                                    <button
                                                        onClick={() => {
                                                            confirm({
                                                                title: "Hapus slip gaji?",
                                                                message: `Slip gaji ${getEmpName(p.employeeId)} periode ${p.period} akan dihapus dari riwayat.`,
                                                                confirmLabel: "Hapus",
                                                                cancelLabel: "Batal",
                                                                variant: "danger",
                                                                onConfirm: async () => {
                                                                    setDeletingId(p.id);
                                                                    try {
                                                                        const res = await fetch(`/api/payslips?id=${p.id}`, { method: "DELETE" });
                                                                        if (!res.ok) {
                                                                            throw new Error(await getResponseErrorMessage(res, "Gagal menghapus slip gaji."));
                                                                        }
                                                                        setPayslips(prev => prev.filter(x => x.id !== p.id));
                                                                        toast("Slip gaji berhasil dihapus.", "success");
                                                                    } catch (error) {
                                                                        reportClientError("PayrollHistoryTab", "Gagal menghapus slip gaji", error, { payslipId: p.id, employeeId: p.employeeId, period: p.period });
                                                                        toast(error instanceof Error ? error.message : "Gagal menghapus slip gaji.", "error");
                                                                    } finally {
                                                                        setDeletingId(null);
                                                                    }
                                                                },
                                                            });
                                                        }}
                                                        disabled={deletingId === p.id}
                                                        className="btn btn-ghost btn-sm !p-1.5 text-red-500 hover:!bg-red-50"
                                                        title="Hapus Slip Gaji"
                                                    >
                                                        {deletingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <DataTablePagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filteredHistoryPayslips.length}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={setPageSize}
                        itemLabel="slip gaji"
                    />
                </div>
            )}

            {/* Bulk Action Bar */}
            <BulkActionBar
                selectedCount={selectedIds.size}
                totalCount={filteredHistoryPayslips.length}
                allSelected={isAllFilteredSelected}
                onSelectAll={selectAllFiltered}
                onClearSelection={clearSelection}
                itemLabel="slip gaji"
            >
                <button
                    type="button"
                    onClick={() => handleDownloadBatchPdf()}
                    className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                    <Download className="w-3.5 h-3.5" />
                    Unduh Slip Terpilih (PDF)
                </button>
                <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                    className="btn btn-danger btn-sm flex items-center gap-1.5"
                >
                    {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Hapus Terpilih
                </button>
            </BulkActionBar>
        </div>
    );
}
