"use client";

import { useState } from "react";
import { Check, Eye, FileText, Loader2, CheckSquare, Square, FileSpreadsheet } from "lucide-react";
import { LetterRequest, TYPE_CONFIG, STATUS_CONFIG } from "../types";
import DataTablePagination from "@/components/ui/DataTablePagination";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { exportToExcel } from "@/lib/export";
import { useToast } from "@/components/Toast";

interface Props {
    loading: boolean;
    filteredLength: number;
    paginated: LetterRequest[];
    allFiltered?: LetterRequest[];
    currentPage: number;
    totalPages: number;
    ITEMS_PER_PAGE: number;
    setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
    setItemsPerPage?: React.Dispatch<React.SetStateAction<number>>;
    setDetail: (req: LetterRequest) => void;
    openAction: (req: LetterRequest, type: "PROCESSING" | "READY" | "REJECTED") => void;
    fmtDate: (iso: string) => string;
}

export function LetterRequestTable({
    loading, filteredLength, paginated, allFiltered = [], currentPage, totalPages, ITEMS_PER_PAGE,
    setCurrentPage, setItemsPerPage, setDetail, openAction, fmtDate
}: Props) {
    const toast = useToast();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const isAllCurrentPageSelected = paginated.length > 0 && paginated.every(r => selectedIds.has(r.id));
    const isAllFilteredSelected = allFiltered.length > 0 && allFiltered.every(r => selectedIds.has(r.id));

    const toggleSelectAllCurrentPage = () => {
        const next = new Set(selectedIds);
        if (isAllCurrentPageSelected) {
            paginated.forEach(r => next.delete(r.id));
        } else {
            paginated.forEach(r => next.add(r.id));
        }
        setSelectedIds(next);
    };

    const selectAllFiltered = () => {
        const next = new Set(selectedIds);
        (allFiltered.length > 0 ? allFiltered : paginated).forEach(r => next.add(r.id));
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

    const handleBulkExportExcel = () => {
        const targetList = (allFiltered.length > 0 ? allFiltered : paginated).filter(r => selectedIds.has(r.id));
        if (targetList.length === 0) return;

        const data = targetList.map(r => ({
            employeeId: r.employeeId,
            name: r.employeeName || r.employeeId,
            type: TYPE_CONFIG[r.type]?.label || r.type,
            purpose: r.purpose,
            date: fmtDate(r.createdAt),
            status: STATUS_CONFIG[r.status]?.label || r.status,
        }));

        exportToExcel(
            data,
            [
                { key: "employeeId", label: "NIP" },
                { key: "name", label: "Nama Karyawan" },
                { key: "type", label: "Jenis Surat" },
                { key: "purpose", label: "Tujuan Permohonan" },
                { key: "date", label: "Tanggal Pengajuan" },
                { key: "status", label: "Status" },
            ],
            `Data_Permintaan_Surat_${new Date().toISOString().slice(0, 10)}`,
            "Surat"
        );
        toast(`${targetList.length} data surat berhasil diekspor ke Excel.`, "success");
    };

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)] opacity-40" />
            </div>
        );
    }

    if (filteredLength === 0) {
        return (
            <div className="card p-12 text-center">
                <FileText className="w-12 h-12 text-[var(--text-muted)] opacity-20 mx-auto mb-3" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">Tidak ada permintaan surat ditemukan</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Coba ubah filter pencarian Anda</p>
            </div>
        );
    }

    return (
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
                            <th>Jenis Surat</th>
                            <th className="hidden lg:table-cell">Tujuan</th>
                            <th>Tanggal</th>
                            <th>Status</th>
                            <th className="text-right">Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.map((req) => {
                            const typeCfg = TYPE_CONFIG[req.type];
                            const statusCfg = STATUS_CONFIG[req.status];
                            const TypeIcon = typeCfg.icon;
                            const StatusIcon = statusCfg.icon;
                            const isSelected = selectedIds.has(req.id);

                            return (
                                <tr key={req.id} className={`hover:bg-[var(--secondary)]/50 transition-colors ${isSelected ? "bg-[var(--primary)]/5" : ""}`}>
                                    <td className="text-center">
                                        <button
                                            type="button"
                                            onClick={() => toggleSelectOne(req.id)}
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
                                            <p className="text-xs font-semibold text-[var(--text-primary)]">{req.employeeName ?? req.employeeId}</p>
                                            <p className="text-[10px] font-mono text-[var(--text-muted)]">{req.employeeId}</p>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${typeCfg.bg}`}>
                                                <TypeIcon className={`w-3.5 h-3.5 ${typeCfg.color}`} />
                                            </div>
                                            <span className="text-xs font-semibold text-[var(--text-primary)]">{typeCfg.label}</span>
                                        </div>
                                    </td>
                                    <td className="hidden lg:table-cell">
                                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 max-w-[300px]">{req.purpose}</p>
                                    </td>
                                    <td className="text-xs text-[var(--text-secondary)]">
                                        {fmtDate(req.createdAt)}
                                    </td>
                                    <td>
                                        <span className={`badge ${statusCfg.badge} flex items-center gap-1 !w-fit`}>
                                            <StatusIcon className={`w-3 h-3 ${req.status === "PROCESSING" ? "animate-spin" : ""}`} />
                                            {statusCfg.label}
                                        </span>
                                    </td>
                                    <td className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => setDetail(req)}
                                                className="btn btn-ghost btn-sm !p-1.5 text-[var(--primary)]"
                                                title="Lihat Detail"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                            </button>

                                            {req.status === "PENDING" && (
                                                <>
                                                    <button
                                                        onClick={() => openAction(req, "PROCESSING")}
                                                        className="btn btn-sm bg-blue-500 text-white hover:bg-blue-600 !py-1 !px-2 text-[10px]"
                                                    >
                                                        Proses
                                                    </button>
                                                    <button
                                                        onClick={() => openAction(req, "REJECTED")}
                                                        className="btn btn-sm bg-red-500 text-white hover:bg-red-600 !py-1 !px-2 text-[10px]"
                                                    >
                                                        Tolak
                                                    </button>
                                                </>
                                            )}

                                            {req.status === "PROCESSING" && (
                                                <button
                                                    onClick={() => openAction(req, "READY")}
                                                    className="btn btn-sm bg-emerald-600 text-white hover:bg-emerald-700 !py-1 !px-2 text-[10px] flex items-center gap-1"
                                                >
                                                    <Check className="w-3 h-3" /> Selesai
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Reusable DataTablePagination */}
            <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredLength}
                pageSize={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
                onPageSizeChange={setItemsPerPage}
                itemLabel="permintaan surat"
            />

            {/* Bulk Action Bar */}
            <BulkActionBar
                selectedCount={selectedIds.size}
                totalCount={filteredLength}
                allSelected={isAllFilteredSelected}
                onSelectAll={selectAllFiltered}
                onClearSelection={clearSelection}
                itemLabel="surat"
            >
                <button
                    type="button"
                    onClick={handleBulkExportExcel}
                    className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Ekspor Excel ({selectedIds.size})
                </button>
            </BulkActionBar>
        </div>
    );
}
