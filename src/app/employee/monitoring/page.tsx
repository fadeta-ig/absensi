"use client";

import { useEffect, useState, useMemo } from "react";
import { Users, Search, Activity, Layers, RotateCcw } from "lucide-react";
import Link from "next/link";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import DataTablePagination from "@/components/ui/DataTablePagination";
import EmptyState from "@/components/ui/EmptyState";
import StateCard from "@/components/ui/StateCard";
import StatusBadge from "@/components/ui/StatusBadge";

const MONITORING_FILTER_KEY = "employee-monitoring-filter";

function readMonitoringFilter(): { search?: string; dept?: string } {
    try {
        const raw = window.sessionStorage.getItem(MONITORING_FILTER_KEY);
        if (!raw) return {};
        const p = JSON.parse(raw) as Record<string, unknown>;
        const out: { search?: string; dept?: string } = {};
        if (typeof p.search === "string" && p.search.length > 0) out.search = p.search.slice(0, 100);
        if (typeof p.dept === "string" && p.dept.length > 0) out.dept = p.dept;
        return out;
    } catch {
        return {};
    }
}

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
    const [search, setSearch] = useState(() => readMonitoringFilter().search ?? "");
    const [deptFilter, setDeptFilter] = useState(() => readMonitoringFilter().dept ?? "all");

    useEffect(() => {
        if (!search && deptFilter === "all") return;
        try {
            window.sessionStorage.setItem(MONITORING_FILTER_KEY, JSON.stringify({ search, dept: deptFilter }));
        } catch {
            // abaikan (mode privat)
        }
    }, [search, deptFilter]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [forbidden, setForbidden] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(8);

    useEffect(() => {
        const loadEmployees = async () => {
            setLoading(true);
            setLoadError("");
            setForbidden(false);
            try {
                const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
                if (meRes.ok) {
                    const me = await meRes.json();
                    if (!Array.isArray(me?.subordinates) || me.subordinates.length === 0) {
                        setForbidden(true);
                        return;
                    }
                }
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

    if (forbidden) {
        return (
            <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
                <div className="emp-surface p-6 text-center">
                    <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)]">Monitoring Tim tidak tersedia untuk akun Anda.</h1>
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                        Halaman ini hanya untuk atasan yang memiliki bawahan. Hubungi admin HR bila Anda seharusnya memiliki akses.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-xl font-extrabold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                        <Activity className="w-5 h-5 text-[var(--primary)]" />
                        Monitoring Tim
                    </h1>
                    <p className="text-[11px] font-medium text-[var(--text-secondary)] mt-1">
                        Monitoring performa dan profil anggota tim Anda secara real-time.
                    </p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="emp-surface p-4 space-y-3">
                <div className="space-y-2.5">
                    <div className="relative">
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
                <StateCard variant="error" title="Gagal memuat tim" description={loadError} />
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title="Tidak ada anggota tim yang cocok"
                    description="Coba sesuaikan kata kunci pencarian Anda"
                />
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3">
                        {paginatedEmployees.map((e) => (
                            <div
                                key={e.id}
                                className="emp-surface p-4 flex flex-col justify-between space-y-3 border-l-4 border-l-[var(--primary)]"
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
                                    <StatusBadge tone={e.isActive ? "success" : "danger"} className="shrink-0">
                                        {e.isActive ? "Aktif" : "Nonaktif"}
                                    </StatusBadge>
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
                                        <Layers className="w-3.5 h-3.5 text-[var(--success)]" />
                                        Lihat Profil 360
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="emp-surface overflow-hidden">
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
