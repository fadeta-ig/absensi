"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Users, Plus, Search, Pencil, X, Loader2, Key, Layers, Upload, UserCheck, UserX,
    Filter, RotateCcw, FileSpreadsheet, CheckSquare, Square
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmModal";
import BulkImportModal from "@/components/BulkImportModal";
import EmployeeStatusModal from "@/components/EmployeeStatusModal";
import DataTablePagination from "@/components/ui/DataTablePagination";
import BulkActionBar from "@/components/ui/BulkActionBar";
import { exportToExcel } from "@/lib/export";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

interface ShiftDay { dayOfWeek: number; startTime: string; endTime: string; isOff: boolean; }
interface WorkShift { id: string; name: string; isDefault: boolean; days: ShiftDay[]; }
interface MasterOption { id: string; name: string; divisionId?: string; }
interface Employee {
    id: string; employeeId: string; name: string; email: string; phone: string;
    department: string; division?: string | null; position: string; isActive: boolean; joinDate: string; shiftId?: string;
    employmentType: "PERMANENT" | "CONTRACT" | "PROBATION" | "INTERN";
    bypassLocation: boolean; locations?: { id: string; name: string }[];
}

export default function EmployeesPage() {
    const toast = useToast();
    const confirm = useConfirm();

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [shifts, setShifts] = useState<WorkShift[]>([]);
    const [divisions, setDivisions] = useState<MasterOption[]>([]);
    const [departments, setDepartments] = useState<MasterOption[]>([]);
    
    // Filters
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
    const [divisionFilter, setDivisionFilter] = useState("all");
    const [departmentFilter, setDepartmentFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Multi-Select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [loadingEmployees, setLoadingEmployees] = useState(true);
    const [sendingPassword, setSendingPassword] = useState<string | null>(null);
    const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [showImportModal, setShowImportModal] = useState(false);
    const [statusEmployee, setStatusEmployee] = useState<Employee | null>(null);

    const DAY_LABELS_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

    const fetchEmployees = useCallback(async () => {
        setLoadingEmployees(true);
        try {
            const response = await fetch("/api/employees?status=all");
            if (!response.ok) throw new Error(await getResponseErrorMessage(response, "Gagal memuat data karyawan."));
            const data = await response.json();
            setEmployees(Array.isArray(data) ? data : []);
        } catch (error) {
            reportClientError("EmployeesPage", "Gagal memuat data karyawan", error);
            setEmployees([]);
            setPasswordMsg({ type: "error", text: error instanceof Error ? error.message : "Gagal memuat data karyawan." });
        } finally {
            setLoadingEmployees(false);
        }
    }, []);

    useEffect(() => {
        void fetchEmployees();
        
        Promise.all([
            fetch("/api/shifts").then(r => r.ok ? r.json() : []),
            fetch("/api/master/divisions").then(r => r.ok ? r.json() : []),
            fetch("/api/master/departments").then(r => r.ok ? r.json() : []),
        ]).then(([shiftData, divData, deptData]) => {
            if (Array.isArray(shiftData)) setShifts(shiftData);
            if (Array.isArray(divData)) setDivisions(divData);
            if (Array.isArray(deptData)) setDepartments(deptData);
        }).catch(err => {
            reportClientError("EmployeesPage", "Gagal memuat master referensi karyawan", err);
        });
    }, [fetchEmployees]);

    // Reset pagination to page 1 on filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [search, statusFilter, divisionFilter, departmentFilter, typeFilter, pageSize]);

    const counts = useMemo(() => ({
        all: employees.length,
        active: employees.filter((employee) => employee.isActive).length,
        inactive: employees.filter((employee) => !employee.isActive).length,
    }), [employees]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return employees.filter((employee) => {
            const matchesStatus = statusFilter === "all"
                || (statusFilter === "active" ? employee.isActive : !employee.isActive);
            const matchesDivision = divisionFilter === "all"
                || employee.division === divisionFilter;
            const matchesDepartment = departmentFilter === "all"
                || employee.department === departmentFilter;
            const matchesType = typeFilter === "all"
                || employee.employmentType === typeFilter;
            const matchesSearch = !query
                || employee.name.toLowerCase().includes(query)
                || employee.employeeId.toLowerCase().includes(query)
                || employee.department.toLowerCase().includes(query)
                || Boolean(employee.division?.toLowerCase().includes(query));
            return matchesStatus && matchesDivision && matchesDepartment && matchesType && matchesSearch;
        });
    }, [employees, search, statusFilter, divisionFilter, departmentFilter, typeFilter]);

    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    const paginatedEmployees = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, currentPage, pageSize]);

    // Selection helpers
    const isAllCurrentPageSelected = paginatedEmployees.length > 0 && paginatedEmployees.every(e => selectedIds.has(e.id));
    const isAllFilteredSelected = filtered.length > 0 && filtered.every(e => selectedIds.has(e.id));

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
        filtered.forEach(e => next.add(e.id));
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

    const resetFilters = () => {
        setSearch("");
        setStatusFilter("all");
        setDivisionFilter("all");
        setDepartmentFilter("all");
        setTypeFilter("all");
    };

    const hasActiveFilters = search || statusFilter !== "all" || divisionFilter !== "all" || departmentFilter !== "all" || typeFilter !== "all";

    const getShiftName = (sId?: string) => {
        if (!sId) return "-";
        const s = shifts.find((sh) => sh.id === sId);
        if (!s) return "-";
        const workDays = s.days.filter((d) => !d.isOff);
        if (workDays.length === 0) return s.name;
        const firstDay = workDays[0];
        return `${s.name} (${firstDay.startTime}-${firstDay.endTime})`;
    };

    const getShiftDaysSummary = (sId?: string) => {
        if (!sId) return "-";
        const s = shifts.find((sh) => sh.id === sId);
        if (!s) return "-";
        const workDayNums = s.days.filter((d) => !d.isOff).map((d) => d.dayOfWeek);
        if (workDayNums.length === 0) return "Tidak ada hari kerja";
        if (workDayNums.length === 7) return "Setiap Hari";
        return workDayNums.map((d) => DAY_LABELS_SHORT[d]).join(", ");
    };

    const handleEdit = (emp: Employee) => {
        window.location.href = `/dashboard/employees/${emp.id}/edit`;
    };

    const handleSendPassword = async (emp: Employee) => {
        confirm({
            title: "Kirim Password",
            message: `Kirim password baru ke email ${emp.name}?`,
            variant: "warning",
            confirmLabel: "Kirim",
            onConfirm: async () => {
                setSendingPassword(emp.id);
                setPasswordMsg(null);
                try {
                    const res = await fetch("/api/auth/send-password", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ employeeId: emp.employeeId }),
                    });
                    if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengirim password."));
                    const data = await res.json();
                    setPasswordMsg({ type: "success", text: data.message });
                    toast("Password berhasil dikirim ke email karyawan.", "success");
                } catch (error) {
                    reportClientError("EmployeesPage", "Gagal mengirim password karyawan", error, { employeeId: emp.employeeId });
                    setPasswordMsg({ type: "error", text: "Password belum terkirim karena koneksi bermasalah. Periksa internet lalu coba lagi." });
                    toast("Gagal mengirim password.", "error");
                }
                setSendingPassword(null);
            },
        });
    };

    const handleBulkExportExcel = () => {
        const targetList = employees.filter(e => selectedIds.has(e.id));
        if (targetList.length === 0) return;

        const data = targetList.map(e => ({
            employeeId: e.employeeId,
            name: e.name,
            email: e.email,
            phone: e.phone,
            department: e.department,
            division: e.division || "-",
            position: e.position,
            status: e.isActive ? "Aktif" : "Nonaktif",
            employmentType: ({ PERMANENT: "Tetap", CONTRACT: "Kontrak", PROBATION: "Probation", INTERN: "Magang" } as const)[e.employmentType] || "Tetap",
            joinDate: e.joinDate ? new Date(e.joinDate).toLocaleDateString("id-ID") : "-"
        }));

        exportToExcel(
            data,
            [
                { key: "employeeId", label: "NIP" },
                { key: "name", label: "Nama Lengkap" },
                { key: "email", label: "Email" },
                { key: "phone", label: "No. Telepon" },
                { key: "department", label: "Departemen" },
                { key: "division", label: "Divisi" },
                { key: "position", label: "Jabatan" },
                { key: "employmentType", label: "Status Kerja" },
                { key: "status", label: "Keaktifan" },
                { key: "joinDate", label: "Tanggal Bergabung" }
            ],
            `Data_Karyawan_Export_${new Date().toISOString().slice(0, 10)}`,
            "Karyawan"
        );
        toast(`${targetList.length} data karyawan berhasil diekspor ke Excel.`, "success");
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Users className="w-5 h-5 text-[var(--primary)]" />
                        Manajemen Karyawan
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">{counts.all} karyawan terdaftar · {counts.active} aktif · {counts.inactive} nonaktif</p>
                </div>
                <div className="flex items-center gap-2">
                    <button className="btn btn-secondary border border-[var(--border)]" onClick={() => setShowImportModal(true)}>
                        <Upload className="w-4 h-4 text-[var(--text-muted)]" /> Import Massal
                    </button>
                    <button className="btn btn-primary" onClick={() => window.location.href = "/dashboard/employees/create"}>
                        <Plus className="w-4 h-4" /> Tambah Karyawan
                    </button>
                </div>
            </div>

            {/* Password Message */}
            {passwordMsg && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${passwordMsg.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {passwordMsg.text}
                    <button onClick={() => setPasswordMsg(null)} className="ml-auto text-current opacity-60 hover:opacity-100">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Filters Bar */}
            <div className="card p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {/* Search Input */}
                    <div className="relative lg:col-span-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            className="form-input pl-10 w-full"
                            placeholder="Cari nama, NIP, dept, atau divisi..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    {/* Division Filter */}
                    <div>
                        <select
                            className="form-select w-full"
                            value={divisionFilter}
                            onChange={(e) => setDivisionFilter(e.target.value)}
                        >
                            <option value="all">Semua Divisi</option>
                            {divisions.map(d => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Department Filter */}
                    <div>
                        <select
                            className="form-select w-full"
                            value={departmentFilter}
                            onChange={(e) => setDepartmentFilter(e.target.value)}
                        >
                            <option value="all">Semua Departemen</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.name}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Employment Type Filter */}
                    <div>
                        <select
                            className="form-select w-full"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                        >
                            <option value="all">Semua Status Kerja</option>
                            <option value="PERMANENT">Tetap</option>
                            <option value="CONTRACT">Kontrak</option>
                            <option value="PROBATION">Probation</option>
                            <option value="INTERN">Magang</option>
                        </select>
                    </div>
                </div>

                {/* Secondary row: Status segmented toggle and Reset */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
                    <div className="flex w-fit rounded-xl border border-[var(--border)] bg-[var(--secondary)]/40 p-1">
                        {([
                            { key: "all", label: "Semua", count: counts.all },
                            { key: "active", label: "Aktif", count: counts.active },
                            { key: "inactive", label: "Nonaktif", count: counts.inactive },
                        ] as const).map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setStatusFilter(item.key)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${statusFilter === item.key ? "bg-[var(--card)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                            >
                                {item.label} <span className="ml-1 opacity-70">{item.count}</span>
                            </button>
                        ))}
                    </div>

                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reset Filter
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
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
                                <th>ID</th>
                                <th>Nama</th>
                                <th className="hidden md:table-cell">Dept / Divisi</th>
                                <th>Jabatan</th>
                                <th className="hidden lg:table-cell">Lokasi</th>
                                <th className="hidden lg:table-cell">Jam Kerja</th>
                                <th>Status</th>
                                <th className="text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingEmployees ? (
                                <tr><td colSpan={9} className="text-center py-12 text-sm text-[var(--text-muted)]"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--primary)] opacity-60" />Memuat karyawan...</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={9} className="text-center py-10 text-sm text-[var(--text-muted)]">Tidak ada karyawan yang cocok dengan filter</td></tr>
                            ) : (
                                paginatedEmployees.map((e) => {
                                    const isSelected = selectedIds.has(e.id);
                                    return (
                                        <tr key={e.id} className={`${!e.isActive ? "opacity-75" : ""} ${isSelected ? "bg-[var(--primary)]/5" : ""}`}>
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
                                            <td className="font-mono text-xs">{e.employeeId}</td>
                                            <td className="font-medium text-[var(--text-primary)]">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">{e.name.charAt(0)}</div>
                                                    <div>
                                                        <p className="font-semibold text-xs text-[var(--text-primary)]">{e.name}</p>
                                                        <p className="text-[10px] text-[var(--text-muted)] md:hidden">{e.department} {e.division ? `/ ${e.division}` : ""}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="hidden md:table-cell">
                                                <div className="text-xs font-semibold text-[var(--text-primary)]">{e.department}</div>
                                                {e.division && <div className="text-[10px] text-[var(--text-muted)]">{e.division}</div>}
                                            </td>
                                            <td className="text-xs">{e.position}</td>
                                            <td className="hidden lg:table-cell">
                                                {e.bypassLocation ? (
                                                    <span className="text-[10px] text-blue-600 font-medium">Bypass</span>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1">
                                                        {e.locations && e.locations.length > 0 ? (
                                                            e.locations.map(l => (
                                                                <span key={l.id} className="text-[10px] px-1.5 py-0.5 bg-[var(--secondary)] rounded text-[var(--text-secondary)]">
                                                                    {l.name}
                                                                </span>
                                                            ))
                                                        ) : (
                                                            <span className="text-[10px] text-red-500 font-medium">Belum diset</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="hidden lg:table-cell text-xs">
                                                <div>{getShiftName(e.shiftId)}</div>
                                                <div className="text-[10px] text-[var(--text-muted)]">{getShiftDaysSummary(e.shiftId)}</div>
                                            </td>
                                            <td>
                                                <div className="flex flex-col items-start gap-1">
                                                    <span className={`badge ${e.isActive ? "badge-success" : "badge-error"}`}>{e.isActive ? "Aktif" : "Nonaktif"}</span>
                                                    <span className="text-[10px] text-[var(--text-muted)]">{({ PERMANENT: "Tetap", CONTRACT: "Kontrak", PROBATION: "Probation", INTERN: "Magang" } as const)[e.employmentType] ?? "Tetap"}</span>
                                                </div>
                                            </td>
                                            <td className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    {e.isActive && (
                                                        <button
                                                            onClick={() => handleSendPassword(e)}
                                                            className="btn btn-ghost btn-sm !p-1.5 text-blue-600 hover:!bg-blue-50"
                                                            disabled={sendingPassword === e.id}
                                                            title="Kirim Password via Email"
                                                        >
                                                            {sendingPassword === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => window.location.href = `/dashboard/employees/${e.id}/360-view`}
                                                        className="btn btn-ghost btn-sm !p-1.5 text-emerald-600 hover:!bg-emerald-50"
                                                        title="Lihat Profil 360"
                                                    >
                                                        <Layers className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleEdit(e)} className="btn btn-ghost btn-sm !p-1.5" title="Edit Karyawan">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setStatusEmployee(e)}
                                                        className={`btn btn-ghost btn-sm !p-1.5 ${e.isActive ? "text-red-600 hover:!bg-red-50" : "text-emerald-600 hover:!bg-emerald-50"}`}
                                                        title={e.isActive ? "Nonaktifkan karyawan" : "Aktifkan kembali"}
                                                    >
                                                        {e.isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <DataTablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={filtered.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                    itemLabel="karyawan"
                />
            </div>

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
                    onClick={handleBulkExportExcel}
                    className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Ekspor Excel ({selectedIds.size})
                </button>
            </BulkActionBar>

            <BulkImportModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onSuccess={() => {
                    void fetchEmployees();
                }}
            />

            {statusEmployee && (
                <EmployeeStatusModal
                    employee={statusEmployee}
                    onClose={() => setStatusEmployee(null)}
                    onSuccess={async (message) => {
                        setStatusEmployee(null);
                        setPasswordMsg({ type: "success", text: message });
                        await fetchEmployees();
                    }}
                />
            )}
        </div>
    );
}
