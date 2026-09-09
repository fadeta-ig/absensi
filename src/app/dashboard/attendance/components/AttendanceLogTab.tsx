"use client";

import { useState } from "react";
import { Camera, CheckSquare, Square, FileSpreadsheet, Wifi, ShieldCheck, MapPin } from "lucide-react";
import { AttendanceRecord, Employee } from "../types";
import DataTablePagination from "@/components/ui/DataTablePagination";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { exportToExcel } from "@/lib/export";
import { useToast } from "@/components/Toast";

interface Props {
    paginatedRecords: AttendanceRecord[];
    filteredRecords?: AttendanceRecord[];
    filteredLength: number;
    currentPage: number;
    itemsPerPage: number;
    totalPages: number;
    setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
    setItemsPerPage?: React.Dispatch<React.SetStateAction<number>>;
    getEmpInfo: (id: string) => { name: string; department: string; division: string };
    formatTime: (time?: string) => string;
    statusLabel: (status: string) => string;
    setPhotoPreview: (val: { url: string; label: string } | null) => void;
}

export function AttendanceLogTab({
    paginatedRecords, filteredRecords = [], filteredLength, currentPage, itemsPerPage, totalPages,
    setCurrentPage, setItemsPerPage, getEmpInfo, formatTime, statusLabel, setPhotoPreview
}: Props) {
    const toast = useToast();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const isAllCurrentPageSelected = paginatedRecords.length > 0 && paginatedRecords.every(r => selectedIds.has(r.id));
    const isAllFilteredSelected = filteredRecords.length > 0 && filteredRecords.every(r => selectedIds.has(r.id));

    const toggleSelectAllCurrentPage = () => {
        const next = new Set(selectedIds);
        if (isAllCurrentPageSelected) {
            paginatedRecords.forEach(r => next.delete(r.id));
        } else {
            paginatedRecords.forEach(r => next.add(r.id));
        }
        setSelectedIds(next);
    };

    const selectAllFiltered = () => {
        const next = new Set(selectedIds);
        (filteredRecords.length > 0 ? filteredRecords : paginatedRecords).forEach(r => next.add(r.id));
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
        const targetList = (filteredRecords.length > 0 ? filteredRecords : paginatedRecords).filter(r => selectedIds.has(r.id));
        if (targetList.length === 0) return;

        const data = targetList.map(r => {
            const info = getEmpInfo(r.employeeId);
            const loc = (typeof r.clockInLocation === "object" ? r.clockInLocation : null) ||
                        (typeof r.clockOutLocation === "object" ? r.clockOutLocation : null);
            const verification = loc?.isOfficeWifi ? `Wi-Fi Kantor (${loc.clientIp || "192.168.20.1"})` :
                                 loc?.networkName ? loc.networkName :
                                 loc?.lat ? `GPS (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})` : "-";
            return {
                employeeId: r.employeeId,
                name: info.name,
                department: info.department,
                division: info.division,
                date: r.date,
                clockIn: r.clockIn ? formatTime(r.clockIn) : "-",
                clockOut: r.clockOut ? formatTime(r.clockOut) : "-",
                verification,
                status: statusLabel(r.status),
            };
        });

        exportToExcel(
            data,
            [
                { key: "employeeId", label: "NIP" },
                { key: "name", label: "Nama Karyawan" },
                { key: "department", label: "Departemen" },
                { key: "division", label: "Divisi" },
                { key: "date", label: "Tanggal" },
                { key: "clockIn", label: "Jam Masuk" },
                { key: "clockOut", label: "Jam Pulang" },
                { key: "verification", label: "Verifikasi Jaringan" },
                { key: "status", label: "Status" },
            ],
            `Log_Presensi_Terpilih_${new Date().toISOString().slice(0, 10)}`,
            "Presensi"
        );
        toast(`${targetList.length} data presensi berhasil diekspor ke Excel.`, "success");
    };

    return (
        <div className="card overflow-hidden border border-[var(--border)] shadow-sm">
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
                            <th className="w-32">ID Karyawan</th>
                            <th>Nama</th>
                            <th className="hidden lg:table-cell">Departemen</th>
                            <th className="w-32">Tanggal</th>
                            <th className="w-24">Clock In</th>
                            <th className="w-24">Clock Out</th>
                            <th className="w-28 text-center">Verifikasi</th>
                            <th className="w-20 text-center hidden md:table-cell">Foto</th>
                            <th className="w-32 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                        {paginatedRecords.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="text-center py-12 text-[var(--text-muted)] italic">
                                    Tidak ada data absensi ditemukan untuk kriteria ini.
                                </td>
                            </tr>
                        ) : (
                            paginatedRecords.map((r) => {
                                const info = getEmpInfo(r.employeeId);
                                const isSelected = selectedIds.has(r.id);
                                const loc = (typeof r.clockInLocation === "object" ? r.clockInLocation : null) ||
                                            (typeof r.clockOutLocation === "object" ? r.clockOutLocation : null);
                                return (
                                    <tr key={r.id} className={`hover:bg-[var(--secondary)]/50 transition-colors ${isSelected ? "bg-[var(--primary)]/5" : ""}`}>
                                        <td className="text-center">
                                            <button
                                                type="button"
                                                onClick={() => toggleSelectOne(r.id)}
                                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5"
                                            >
                                                {isSelected ? (
                                                    <CheckSquare className="w-4 h-4 text-[var(--primary)]" />
                                                ) : (
                                                    <Square className="w-4 h-4" />
                                                )}
                                            </button>
                                        </td>
                                        <td className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                                            {r.employeeId}
                                        </td>
                                        <td className="font-medium text-[var(--text-primary)]">
                                            {info.name}
                                        </td>
                                        <td className="hidden lg:table-cell text-xs text-[var(--text-secondary)]">
                                            {info.department}
                                        </td>
                                        <td className="text-sm text-[var(--text-secondary)]">
                                            {r.date}
                                        </td>
                                        <td className="text-sm font-medium text-blue-600">
                                            {formatTime(r.clockIn)}
                                        </td>
                                        <td className="text-sm font-medium text-orange-600">
                                            {formatTime(r.clockOut)}
                                        </td>
                                        <td className="text-center">
                                            {loc?.isOfficeWifi ? (
                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                                                    title={`Terverifikasi Wi-Fi Kantor WIG (IP: ${loc.clientIp || "192.168.20.1"})`}
                                                >
                                                    <Wifi className="w-3 h-3 shrink-0" />
                                                    Wi-Fi WIG
                                                </span>
                                            ) : loc?.networkName === "Bypass Khusus" ? (
                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                                                    title="Bypass Lokasi / Jaringan Khusus"
                                                >
                                                    <ShieldCheck className="w-3 h-3 shrink-0" />
                                                    Bypass
                                                </span>
                                            ) : loc?.lat ? (
                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                                                    title={`Koordinat GPS: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}
                                                >
                                                    <MapPin className="w-3 h-3 shrink-0" />
                                                    GPS
                                                </span>
                                            ) : (
                                                <span className="text-xs text-[var(--text-muted)]">-</span>
                                            )}
                                        </td>
                                        <td className="hidden md:table-cell">
                                            <div className="flex items-center justify-center gap-1">
                                                {r.clockInPhoto ? (
                                                    <button
                                                        onClick={() => setPhotoPreview({ url: r.clockInPhoto!, label: `Clock In — ${info.name} (${r.date})` })}
                                                        className="w-8 h-8 rounded-md overflow-hidden border border-blue-200 hover:border-blue-400 transition-colors cursor-pointer"
                                                        title="Lihat foto masuk"
                                                    >
                                                        <img src={r.clockInPhoto} alt="In" className="w-full h-full object-cover" />
                                                    </button>
                                                ) : (
                                                    <div className="w-8 h-8 rounded-md bg-[var(--secondary)] flex items-center justify-center">
                                                        <Camera className="w-3 h-3 text-gray-300" />
                                                    </div>
                                                )}
                                                {r.clockOutPhoto ? (
                                                    <button
                                                        onClick={() => setPhotoPreview({ url: r.clockOutPhoto!, label: `Clock Out — ${info.name} (${r.date})` })}
                                                        className="w-8 h-8 rounded-md overflow-hidden border border-orange-200 hover:border-orange-400 transition-colors cursor-pointer"
                                                        title="Lihat foto pulang"
                                                    >
                                                        <img src={r.clockOutPhoto} alt="Out" className="w-full h-full object-cover" />
                                                    </button>
                                                ) : (
                                                    <div className="w-8 h-8 rounded-md bg-[var(--secondary)] flex items-center justify-center">
                                                        <Camera className="w-3 h-3 text-gray-300" />
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${r.status === "present" ? "bg-green-100 text-green-700" :
                                                r.status === "late" ? "bg-orange-100 text-orange-700" :
                                                    r.status === "absent" ? "bg-red-100 text-red-700" :
                                                        "bg-blue-100 text-blue-700"
                                                }`}>
                                                {statusLabel(r.status)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Reusable Pagination Controls */}
            <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredLength}
                pageSize={itemsPerPage}
                onPageChange={setCurrentPage}
                onPageSizeChange={setItemsPerPage}
                itemLabel="catatan absensi"
            />

            {/* Bulk Action Bar */}
            <BulkActionBar
                selectedCount={selectedIds.size}
                totalCount={filteredLength}
                allSelected={isAllFilteredSelected}
                onSelectAll={selectAllFiltered}
                onClearSelection={clearSelection}
                itemLabel="absensi"
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
