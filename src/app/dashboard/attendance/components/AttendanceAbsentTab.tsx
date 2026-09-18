"use client";

import { useState, useMemo } from "react";
import {
    Search, Filter, Building2, Layers, Calendar,
    UserX, CalendarX, CalendarClock, MessageCircle,
    FileSpreadsheet, Download, RefreshCw, CheckSquare, Square
} from "lucide-react";
import { AbsentEmployee, MasterData } from "../types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import DataTablePagination from "@/components/ui/DataTablePagination";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { exportToExcel, exportToPdfTable } from "@/lib/export";
import { useToast } from "@/components/Toast";

interface Props {
    targetDate: string;
    onTargetDateChange: (newDate: string) => void;
    absentEmployees: AbsentEmployee[];
    departments: MasterData[];
    divisions: MasterData[];
    onRefresh?: () => void;
}

export function AttendanceAbsentTab({
    targetDate,
    onTargetDateChange,
    absentEmployees,
    departments,
    divisions,
    onRefresh,
}: Props) {
    const toast = useToast();

    // Local filters
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [divFilter, setDivFilter] = useState("all");
    const [deptFilter, setDeptFilter] = useState("all");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Multi-select for bulk action
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Cascading departments
    const availableDepartments = useMemo(() => {
        if (divFilter === "all") return departments;
        const selectedDiv = divisions.find(d => d.name === divFilter);
        return departments.filter(d => {
            if (d.division?.name) return d.division.name === divFilter;
            if (selectedDiv && d.divisionId) return d.divisionId === selectedDiv.id;
            return true;
        });
    }, [departments, divisions, divFilter]);

    const handleDivisionChange = (newDiv: string) => {
        setDivFilter(newDiv);
        setDeptFilter("all");
        setCurrentPage(1);
    };

    // Filtered data
    const filtered = useMemo(() => {
        return absentEmployees.filter((emp) => {
            const matchSearch =
                emp.employeeId.toLowerCase().includes(search.toLowerCase()) ||
                emp.name.toLowerCase().includes(search.toLowerCase());

            const matchCategory =
                categoryFilter === "all" || emp.statusType === categoryFilter;

            const matchDiv = divFilter === "all" || emp.division === divFilter;
            const matchDept = deptFilter === "all" || emp.department === deptFilter;

            return matchSearch && matchCategory && matchDiv && matchDept;
        });
    }, [absentEmployees, search, categoryFilter, divFilter, deptFilter]);

    // Paginated
    const paginated = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filtered.slice(start, start + itemsPerPage);
    }, [filtered, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filtered.length / itemsPerPage);

    // Selection handlers
    const isAllCurrentPageSelected =
        paginated.length > 0 && paginated.every((r) => selectedIds.has(r.employeeId));
    const isAllFilteredSelected =
        filtered.length > 0 && filtered.every((r) => selectedIds.has(r.employeeId));

    const toggleSelectAllCurrentPage = () => {
        const next = new Set(selectedIds);
        if (isAllCurrentPageSelected) {
            paginated.forEach((r) => next.delete(r.employeeId));
        } else {
            paginated.forEach((r) => next.add(r.employeeId));
        }
        setSelectedIds(next);
    };

    const selectAllFiltered = () => {
        const next = new Set(selectedIds);
        filtered.forEach((r) => next.add(r.employeeId));
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

    // Stats
    const stats = useMemo(() => {
        return {
            total: absentEmployees.length,
            unpresent: absentEmployees.filter((e) => e.statusType === "unpresent").length,
            onLeave: absentEmployees.filter((e) => e.statusType === "on_leave").length,
            offDay: absentEmployees.filter((e) => e.statusType === "off_day").length,
        };
    }, [absentEmployees]);

    // Format WA link
    const getWhatsAppUrl = (phone: string | null, name: string) => {
        if (!phone) return null;
        let clean = phone.replace(/[^0-9]/g, "");
        if (clean.startsWith("0")) {
            clean = "62" + clean.slice(1);
        }
        const text = encodeURIComponent(
            `Halo Rekan ${name}, kami menginformasikan Anda belum melakukan presensi hari ini (${targetDate}). Mohon segera melakukan presensi melalui portal HRIS atau konfirmasi kepada HR jika berhalangan. Terima kasih.`
        );
        return `https://wa.me/${clean}?text=${text}`;
    };

    // Export handlers
    const handleExportExcel = (onlySelected = false) => {
        const targetList = onlySelected
            ? filtered.filter((r) => selectedIds.has(r.employeeId))
            : filtered;

        if (targetList.length === 0) {
            toast("Tidak ada data karyawan belum hadir untuk diekspor.", "error");
            return;
        }

        const data = targetList.map((e) => ({
            employeeId: e.employeeId,
            name: e.name,
            department: e.department,
            division: e.division,
            position: e.position,
            phone: e.phone || "-",
            statusLabel: e.statusLabel,
            notes: e.notes || "-",
        }));

        exportToExcel(
            data,
            [
                { key: "employeeId", label: "NIP" },
                { key: "name", label: "Nama Karyawan" },
                { key: "department", label: "Departemen" },
                { key: "division", label: "Divisi" },
                { key: "position", label: "Jabatan" },
                { key: "phone", label: "No. HP" },
                { key: "statusLabel", label: "Status Ketidakhadiran" },
                { key: "notes", label: "Keterangan Tambahan" },
            ],
            `Karyawan_Belum_Hadir_${targetDate}`,
            "Belum Hadir"
        );
        toast(`${targetList.length} data karyawan belum hadir berhasil diekspor ke Excel.`, "success");
    };

    const handleExportPdf = () => {
        if (filtered.length === 0) {
            toast("Tidak ada data karyawan belum hadir untuk diekspor.", "error");
            return;
        }

        const data = filtered.map((e) => [
            e.employeeId,
            e.name,
            e.department,
            e.division,
            e.position,
            e.phone || "-",
            e.statusLabel,
        ]);

        exportToPdfTable(
            data,
            ["NIP", "Nama", "Departemen", "Divisi", "Jabatan", "No. HP", "Status"],
            `Daftar Karyawan Belum Hadir (${targetDate})`,
            `Laporan_Belum_Hadir_${targetDate}`,
            `Tanggal Evaluasi: ${targetDate} • Total Belum Hadir: ${filtered.length} Karyawan`
        );
    };

    return (
        <div className="space-y-4">
            {/* Top Toolbar: Date Selector & Quick Metrics */}
            <div className="card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--card)] border border-[var(--border)] shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[var(--primary)] shrink-0" />
                        <span className="text-xs font-bold text-[var(--text-primary)]">Tanggal Evaluasi:</span>
                        <input
                            type="date"
                            value={targetDate}
                            onChange={(e) => {
                                onTargetDateChange(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="form-input text-xs py-1 px-2.5 h-8 font-semibold w-auto"
                            title="Ganti tanggal evaluasi"
                        />
                    </div>
                    {onRefresh && (
                        <button
                            type="button"
                            onClick={onRefresh}
                            className="btn btn-secondary btn-sm h-8 px-2 text-xs flex items-center gap-1"
                            title="Muat Ulang Data"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Quick Action Export Buttons */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => handleExportExcel(false)}
                        className="btn btn-secondary btn-sm text-xs flex items-center gap-1.5"
                        disabled={filtered.length === 0}
                    >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                        Excel ({filtered.length})
                    </button>
                    <button
                        type="button"
                        onClick={handleExportPdf}
                        className="btn btn-secondary btn-sm text-xs flex items-center gap-1.5"
                        disabled={filtered.length === 0}
                    >
                        <Download className="w-3.5 h-3.5 text-red-500" />
                        PDF
                    </button>
                </div>
            </div>

            {/* Quick Filter Chips / Stat Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                    type="button"
                    onClick={() => { setCategoryFilter("all"); setCurrentPage(1); }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                        categoryFilter === "all"
                            ? "border-[var(--primary)] bg-[var(--primary)]/10 shadow-sm"
                            : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)]"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-muted)]">Total Belum Hadir</span>
                        <UserX className="w-4 h-4 text-red-500" />
                    </div>
                    <p className="text-xl font-extrabold text-[var(--text-primary)] mt-1">{stats.total}</p>
                </button>

                <button
                    type="button"
                    onClick={() => { setCategoryFilter("unpresent"); setCurrentPage(1); }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                        categoryFilter === "unpresent"
                            ? "border-red-500 bg-red-50 dark:bg-red-950/20 shadow-sm"
                            : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)]"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400">Belum Presensi (Alpa)</span>
                        <UserX className="w-4 h-4 text-red-600" />
                    </div>
                    <p className="text-xl font-extrabold text-red-600 mt-1">{stats.unpresent}</p>
                </button>

                <button
                    type="button"
                    onClick={() => { setCategoryFilter("on_leave"); setCurrentPage(1); }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                        categoryFilter === "on_leave"
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 shadow-sm"
                            : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)]"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Sedang Cuti / Sakit</span>
                        <CalendarX className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-xl font-extrabold text-blue-600 mt-1">{stats.onLeave}</p>
                </button>

                <button
                    type="button"
                    onClick={() => { setCategoryFilter("off_day"); setCurrentPage(1); }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                        categoryFilter === "off_day"
                            ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20 shadow-sm"
                            : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-strong)]"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">Libur Shift</span>
                        <CalendarClock className="w-4 h-4 text-purple-600" />
                    </div>
                    <p className="text-xl font-extrabold text-purple-600 mt-1">{stats.offDay}</p>
                </button>
            </div>

            {/* Filter Controls */}
            <div className="card p-4 space-y-3 bg-[var(--card)] border border-[var(--border)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            className="form-input pl-9 h-10 w-full text-xs"
                            placeholder="Cari NIP atau nama karyawan..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setCurrentPage(1);
                            }}
                        />
                    </div>

                    {/* Div Filter */}
                    <div className="relative">
                        <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <select
                            className="form-select pl-9 h-10 w-full text-xs"
                            value={divFilter}
                            onChange={(e) => handleDivisionChange(e.target.value)}
                        >
                            <option value="all">Semua Divisi</option>
                            {divisions.map((d) => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Dept Filter */}
                    <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <select
                            className="form-select pl-9 h-10 w-full text-xs"
                            value={deptFilter}
                            onChange={(e) => {
                                setDeptFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                        >
                            <option value="all">
                                {divFilter === "all" ? "Semua Departemen" : `Semua Dept (${divFilter})`}
                            </option>
                            {availableDepartments.map((d) => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Category Filter */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <select
                            className="form-select pl-9 h-10 w-full text-xs"
                            value={categoryFilter}
                            onChange={(e) => {
                                setCategoryFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                        >
                            <option value="all">Semua Kategori</option>
                            <option value="unpresent">Belum Presensi (Alpa)</option>
                            <option value="on_leave">Sedang Cuti / Sakit / Izin</option>
                            <option value="off_day">Libur Shift</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <div className="card overflow-hidden border border-[var(--border)] shadow-sm">
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
                            <TableHead className="w-32">NIP</TableHead>
                            <TableHead>Nama Karyawan</TableHead>
                            <TableHead className="hidden md:table-cell">Departemen</TableHead>
                            <TableHead className="hidden lg:table-cell">Jabatan</TableHead>
                            <TableHead className="w-44 text-center">Status Ketidakhadiran</TableHead>
                            <TableHead className="w-28 text-center">Tindakan</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-[var(--border)]">
                        {paginated.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-12 text-[var(--text-muted)] italic">
                                    Tidak ada karyawan belum hadir untuk kriteria ini.
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginated.map((emp) => {
                                const isSelected = selectedIds.has(emp.employeeId);
                                const waUrl = getWhatsAppUrl(emp.phone, emp.name);

                                return (
                                    <TableRow
                                        key={emp.employeeId}
                                        className={isSelected ? "bg-[var(--primary)]/5" : ""}
                                    >
                                        <TableCell className="text-center">
                                            <button
                                                type="button"
                                                onClick={() => toggleSelectOne(emp.employeeId)}
                                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5"
                                            >
                                                {isSelected ? (
                                                    <CheckSquare className="w-4 h-4 text-[var(--primary)]" />
                                                ) : (
                                                    <Square className="w-4 h-4" />
                                                )}
                                            </button>
                                        </TableCell>
                                        <td className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                                            {emp.employeeId}
                                        </td>
                                        <td className="font-medium text-[var(--text-primary)]">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                                    emp.statusType === "unpresent"
                                                        ? "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                                                        : emp.statusType === "on_leave"
                                                        ? "bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                                                        : "bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400"
                                                }`}>
                                                    {emp.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold">{emp.name}</p>
                                                    {emp.phone && (
                                                        <p className="text-[11px] text-[var(--text-muted)] font-mono">{emp.phone}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="hidden md:table-cell text-xs text-[var(--text-secondary)]">
                                            <div>
                                                <p className="font-medium">{emp.department}</p>
                                                <p className="text-[10px] text-[var(--text-muted)]">{emp.division}</p>
                                            </div>
                                        </td>
                                        <td className="hidden lg:table-cell text-xs text-[var(--text-secondary)]">
                                            {emp.position || "-"}
                                        </td>
                                        <TableCell className="text-center">
                                            {emp.statusType === "unpresent" ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900">
                                                    <UserX className="w-3 h-3 shrink-0" />
                                                    Belum Hadir
                                                </span>
                                            ) : emp.statusType === "on_leave" ? (
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                                                        <CalendarX className="w-3 h-3 shrink-0" />
                                                        {emp.statusLabel}
                                                    </span>
                                                    {emp.notes && (
                                                        <span className="text-[10px] text-[var(--text-muted)] italic max-w-[150px] truncate" title={emp.notes}>
                                                            {emp.notes}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-900">
                                                    <CalendarClock className="w-3 h-3 shrink-0" />
                                                    Libur Shift
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {waUrl ? (
                                                <a
                                                    href={waUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors"
                                                    title="Kirim pengingat WhatsApp"
                                                >
                                                    <MessageCircle className="w-3.5 h-3.5" />
                                                    WhatsApp
                                                </a>
                                            ) : (
                                                <span className="text-xs text-[var(--text-muted)]">-</span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>

                {/* Pagination Controls */}
                <DataTablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={filtered.length}
                    pageSize={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setItemsPerPage}
                    itemLabel="karyawan belum hadir"
                />

                {/* Bulk Action Bar */}
                <BulkActionBar
                    selectedCount={selectedIds.size}
                    totalCount={filtered.length}
                    allSelected={isAllFilteredSelected}
                    onSelectAll={selectAllFiltered}
                    onClearSelection={clearSelection}
                    itemLabel="karyawan"
                >
                    <button
                        type="button"
                        onClick={() => handleExportExcel(true)}
                        className="btn btn-primary btn-sm flex items-center gap-1.5"
                    >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Ekspor Excel Terpilih ({selectedIds.size})
                    </button>
                </BulkActionBar>
            </div>
        </div>
    );
}
