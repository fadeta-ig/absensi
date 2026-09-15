"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, AlertCircle, Zap, FileSpreadsheet, FileText, CheckSquare, Square } from "lucide-react";
import { Employee, Payslip } from "../types";
import DataTablePagination from "@/components/ui/DataTablePagination";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";

export interface PayrollRecapTabProps {
    filteredRecapEmployees: Employee[];
    payslips: Payslip[];
    selectedPeriod: string;
    overtimeRequests: { employeeId: string; date: string; overtimePay: number; status: string }[];
    fmt: (n: number) => string;
    handleBulkGenerate: (targetEmployeeIds?: string[]) => void;
    handleExportRecapExcel: (targetEmployeeIds?: string[]) => void;
    handleExportRecapPdf: () => void;
    handleProsesRecap: (e: Employee) => void;
}

export function PayrollRecapTab({
    filteredRecapEmployees,
    payslips,
    selectedPeriod,
    overtimeRequests,
    fmt,
    handleBulkGenerate,
    handleExportRecapExcel,
    handleExportRecapPdf,
    handleProsesRecap
}: PayrollRecapTabProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [prevDep, setPrevDep] = useState(`${filteredRecapEmployees.length}-${selectedPeriod}-${pageSize}`);
    const currentDep = `${filteredRecapEmployees.length}-${selectedPeriod}-${pageSize}`;
    if (prevDep !== currentDep) {
        setPrevDep(currentDep);
        setCurrentPage(1);
    }

    const totalPages = Math.ceil(filteredRecapEmployees.length / pageSize) || 1;
    const paginatedEmployees = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredRecapEmployees.slice(start, start + pageSize);
    }, [filteredRecapEmployees, currentPage, pageSize]);

    const isAllCurrentPageSelected = paginatedEmployees.length > 0 && paginatedEmployees.every(e => selectedIds.has(e.id));
    const isAllFilteredSelected = filteredRecapEmployees.length > 0 && filteredRecapEmployees.every(e => selectedIds.has(e.id));

    const selectedEmployees = useMemo(() => {
        return filteredRecapEmployees.filter(e => selectedIds.has(e.id));
    }, [filteredRecapEmployees, selectedIds]);

    const unissuedCount = useMemo(() => {
        return selectedEmployees.filter(
            e => !payslips.some(p => p.employeeId === e.employeeId && p.period === selectedPeriod)
        ).length;
    }, [selectedEmployees, payslips, selectedPeriod]);

    const issuedCount = selectedEmployees.length - unissuedCount;

    const toggleSelectAllCurrentPage = () => {
        const next = new Set(selectedIds);
        if (isAllCurrentPageSelected) {
            paginatedEmployees.forEach(e => next.delete(e.id));
        } else {
            paginatedEmployees.forEach(e => next.add(e.id));
        }
        setSelectedIds(next);
    };

    const selectAllFiltered = () => {
        const next = new Set(selectedIds);
        filteredRecapEmployees.forEach(e => next.add(e.id));
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

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--text-muted)]">
                    Total: <strong className="text-[var(--text-primary)]">{filteredRecapEmployees.length}</strong> karyawan pada periode <strong>{selectedPeriod}</strong>
                </p>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleBulkGenerate()} className="btn btn-primary btn-sm" disabled={filteredRecapEmployees.length === 0}>
                        <Zap className="w-3.5 h-3.5" /> Generate Massal
                    </button>
                    <button onClick={() => handleExportRecapExcel()} className="btn btn-secondary btn-sm" disabled={filteredRecapEmployees.length === 0}>
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
                    </button>
                    <button onClick={handleExportRecapPdf} className="btn btn-secondary btn-sm" disabled={filteredRecapEmployees.length === 0}>
                        <FileText className="w-3.5 h-3.5" /> Export PDF Recap
                    </button>
                </div>
            </div>

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
                            <TableHead>Gaji Pokok</TableHead>
                            <TableHead className="hidden lg:table-cell">Tunjangan</TableHead>
                            <TableHead className="hidden lg:table-cell">Lembur</TableHead>
                            <TableHead className="hidden lg:table-cell">Potongan</TableHead>
                            <TableHead>Estimasi Bersih</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                            {filteredRecapEmployees.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-8 text-sm text-[var(--text-muted)]">Data tidak ditemukan</td></tr>
                            ) : (
                                paginatedEmployees.map((e) => {
                                    const hasPayslip = payslips.some(p => p.employeeId === e.employeeId && p.period === selectedPeriod);
                                    const empAllowances = e.payrollComponents?.filter(pc => pc.component.type === "earning").reduce((s, pc) => s + pc.amount, 0) || 0;
                                    const empDeductions = e.payrollComponents?.filter(pc => pc.component.type === "deduction").reduce((s, pc) => s + pc.amount, 0) || 0;
                                    const empOvertime = overtimeRequests
                                        .filter(o => o.employeeId === e.employeeId && o.status === "approved" && o.date.startsWith(selectedPeriod))
                                        .reduce((sum, o) => sum + (o.overtimePay || 0), 0);
                                    const estNet = e.basicSalary + empAllowances + empOvertime - empDeductions;
                                    const isSelected = selectedIds.has(e.id);

                                    return (
                                        <tr key={e.id} className={isSelected ? "bg-[var(--primary)]/5" : undefined}>
                                            <td className="text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSelectOne(e.id)}
                                                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5"
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare className="w-4 h-4 text-[var(--primary)]" />
                                                    ) : (
                                                        <Square className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </td>
                                            <td className="font-medium">
                                                <div>
                                                    <p className="text-xs font-semibold text-[var(--text-primary)]">{e.name}</p>
                                                    <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                                                        <span>{e.employeeId}</span>
                                                        <span>•</span>
                                                        <span>{e.department}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="text-xs">{fmt(e.basicSalary)}</td>
                                            <td className="hidden lg:table-cell text-green-600 font-medium text-xs">+{fmt(empAllowances)}</td>
                                            <td className="hidden lg:table-cell text-blue-600 font-medium text-xs">{empOvertime > 0 ? `+${fmt(empOvertime)}` : "-"}</td>
                                            <td className="hidden lg:table-cell text-red-600 font-medium text-xs">-{fmt(empDeductions)}</td>
                                            <td className="font-bold text-xs text-[var(--text-primary)]">{fmt(estNet)}</td>
                                            <td>
                                                {hasPayslip ? (
                                                    <span className="badge badge-success flex items-center gap-1 !w-fit"><CheckCircle2 className="w-3 h-3" /> Terbit</span>
                                                ) : (
                                                    <span className="badge badge-warning flex items-center gap-1 !w-fit"><AlertCircle className="w-3 h-3" /> Belum</span>
                                                )}
                                            </td>
                                            <td className="text-right">
                                                <button
                                                    onClick={() => handleProsesRecap(e)}
                                                    disabled={hasPayslip}
                                                    className={`btn btn-sm ${hasPayslip ? "btn-ghost opacity-50 cursor-not-allowed" : "btn-primary"}`}
                                                >
                                                    {hasPayslip ? "Tuntas" : "Proses"}
                                                </button>
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
                    totalItems={filteredRecapEmployees.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                    itemLabel="karyawan"
                />
            </div>

            <BulkActionBar
                selectedCount={selectedIds.size}
                totalCount={filteredRecapEmployees.length}
                allSelected={isAllFilteredSelected}
                onSelectAll={selectAllFiltered}
                onClearSelection={clearSelection}
                itemLabel="karyawan"
                subtitle={
                    selectedIds.size > 0
                        ? `${unissuedCount} belum memiliki slip gaji${issuedCount > 0 ? `, ${issuedCount} sudah terbit` : ""}`
                        : undefined
                }
            >
                <button
                    type="button"
                    onClick={() => {
                        const empIdsToGenerate = selectedEmployees.map(e => e.employeeId);
                        handleBulkGenerate(empIdsToGenerate);
                    }}
                    disabled={unissuedCount === 0}
                    className="btn btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={unissuedCount === 0 ? "Semua karyawan terpilih sudah memiliki slip gaji" : `Generate slip untuk ${unissuedCount} karyawan belum terbit`}
                >
                    <Zap className="w-3.5 h-3.5" />
                    Generate Terpilih {unissuedCount > 0 ? `(${unissuedCount} Belum)` : ""}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        const empIds = selectedEmployees.map(e => e.employeeId);
                        handleExportRecapExcel(empIds);
                    }}
                    className="btn btn-secondary btn-sm flex items-center gap-1.5 border border-[var(--border)]"
                >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Ekspor Excel ({selectedIds.size})
                </button>
            </BulkActionBar>
        </div>
    );
}
