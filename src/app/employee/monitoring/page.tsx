"use client";

import { useEffect, useState, useMemo } from "react";
import { Users, Search, Activity, Layers, AlertCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import DataTablePagination from "@/components/ui/DataTablePagination";

interface Employee {
    id: string;
    employeeId: string;
    name: string;
    department: string;
    division?: string | null;
    position: string;
    level: string;
    isActive: boolean;
}

export default function MonitoringPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [search, setSearch] = useState("");
    const [deptFilter, setDeptFilter] = useState("all");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(8);

    useEffect(() => {
        const loadEmployees = async () => {
            setLoading(true);
            setLoadError("");
            try {
                const res = await fetch("/api/employees");
                if (!res.ok) {
                    throw new Error(await getResponseErrorMessage(res, "Gagal memuat data monitoring tim."));
                }

                const data = await res.json();
                setEmployees(Array.isArray(data) ? data : []);
            } catch (err) {
                reportClientError("MonitoringPage", "Gagal memuat data monitoring tim", err);
                setEmployees([]);
                setLoadError(err instanceof Error ? err.message : "Gagal memuat data monitoring tim.");
            } finally {
                setLoading(false);
            }
        };

        void loadEmployees();
    }, []);

    // Reset page to 1 on filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [search, deptFilter, pageSize]);

    const departments = useMemo(() => {
        const set = new Set(employees.map(e => e.department).filter(Boolean));
        return Array.from(set);
    }, [employees]);

    const filtered = useMemo(() => {
        return employees.filter((e) => {
            const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
                e.employeeId.toLowerCase().includes(search.toLowerCase()) ||
                e.department.toLowerCase().includes(search.toLowerCase());
            const matchDept = deptFilter === "all" || e.department === deptFilter;
            return matchSearch && matchDept;
        });
    }, [employees, search, deptFilter]);

    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    const paginatedEmployees = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, currentPage, pageSize]);

    const resetFilters = () => {
        setSearch("");
        setDeptFilter("all");
    };

    const hasActiveFilters = search || deptFilter !== "all";

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Activity className="w-5 h-5 text-[var(--primary)]" />
                        Monitoring Tim
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Monitoring performa dan profil anggota tim Anda secara real-time.
                    </p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="card p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="relative sm:col-span-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            className="form-input pl-10 w-full"
                            placeholder="Cari nama, NIP, atau departemen..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div>
                        <select
                            className="form-select w-full"
                            value={deptFilter}
                            onChange={(e) => setDeptFilter(e.target.value)}
                        >
                            <option value="all">Semua Departemen</option>
                            {departments.map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>
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

            {/* Grid kartu karyawan */}
            {loadError ? (
                <div className="card p-12 text-center text-[var(--destructive)]">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-70" />
                    <p className="font-semibold text-sm">{loadError}</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="card p-12 text-center text-[var(--text-muted)]">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Tidak ada anggota tim yang cocok</p>
                    <p className="text-xs mt-1">Coba sesuaikan kata kunci pencarian Anda</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {paginatedEmployees.map((e) => (
                            <div
                                key={e.id}
                                className="card p-4 flex flex-col justify-between space-y-3 border-l-4 border-l-[var(--primary)] hover:shadow-md transition-shadow"
                            >
                                {/* Card Header */}
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-9 h-9 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold text-xs shrink-0">
                                            {e.name.charAt(0)}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-xs text-[var(--text-primary)] truncate">{e.name}</p>
                                            <p className="text-[10px] text-[var(--text-muted)] font-mono">{e.employeeId}</p>
                                        </div>
                                    </div>
                                    <span className={`badge ${e.isActive ? "badge-success" : "badge-error"} text-[9px]`}>
                                        {e.isActive ? "Aktif" : "Nonaktif"}
                                    </span>
                                </div>

                                {/* Card Content */}
                                <div className="space-y-1 text-xs py-1 border-y border-[var(--border)]">
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-muted)]">Departemen</span>
                                        <span className="font-medium text-[var(--text-primary)]">{e.department}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-muted)]">Jabatan</span>
                                        <span className="font-medium text-[var(--text-primary)] truncate max-w-[120px]">{e.position}</span>
                                    </div>
                                </div>

                                {/* Action */}
                                <div className="pt-1">
                                    <Link
                                        href={`/employee/monitoring/${e.id}`}
                                        className="btn btn-secondary btn-sm w-full flex items-center justify-center gap-1.5 text-xs"
                                    >
                                        <Layers className="w-3.5 h-3.5 text-emerald-600" />
                                        Lihat Profil 360
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="card overflow-hidden">
                        <DataTablePagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={filtered.length}
                            pageSize={pageSize}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={setPageSize}
                            pageSizeOptions={[4, 8, 16, 32]}
                            itemLabel="anggota tim"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
