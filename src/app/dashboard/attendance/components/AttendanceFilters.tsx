import { Search, Calendar, Building2, Layers, Filter } from "lucide-react";
import { MasterData } from "../types";

interface Props {
    search: string;
    setSearch: (val: string) => void;
    startDate: string;
    setStartDate: (val: string) => void;
    endDate: string;
    setEndDate: (val: string) => void;
    deptFilter: string;
    setDeptFilter: (val: string) => void;
    divFilter: string;
    setDivFilter: (val: string) => void;
    statusFilter: string;
    setStatusFilter: (val: string) => void;
    departments: MasterData[];
    divisions: MasterData[];
}

export function AttendanceFilters({
    search, setSearch,
    startDate, setStartDate,
    endDate, setEndDate,
    deptFilter, setDeptFilter,
    divFilter, setDivFilter,
    statusFilter, setStatusFilter,
    departments, divisions
}: Props) {
    return (
        <div className="card p-5 space-y-4">
            <div className="flex flex-wrap gap-4">
                {/* Search */}
                <div className="relative flex-1 min-w-[300px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                        className="form-input pl-10 h-11"
                        placeholder="Cari ID atau nama karyawan..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {/* Date Range */}
                <div className="flex items-center gap-2 flex-1 min-w-[300px]">
                    <div className="relative flex-1">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="date"
                            className="form-input pl-10 h-11"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            title="Tanggal Mulai"
                        />
                    </div>
                    <span className="text-[var(--text-muted)] font-medium">s/d</span>
                    <div className="relative flex-1">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="date"
                            className="form-input pl-10 h-11"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            title="Tanggal Selesai"
                        />
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-4">
                {/* Dept Filter */}
                <div className="relative flex-1 min-w-[200px]">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <select
                        className="form-select pl-10 h-11"
                        value={deptFilter}
                        onChange={(e) => setDeptFilter(e.target.value)}
                    >
                        <option value="all">Semua Departemen</option>
                        {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                </div>

                {/* Div Filter */}
                <div className="relative flex-1 min-w-[200px]">
                    <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <select
                        className="form-select pl-10 h-11"
                        value={divFilter}
                        onChange={(e) => setDivFilter(e.target.value)}
                    >
                        <option value="all">Semua Divisi</option>
                        {divisions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                </div>

                {/* Status Filter */}
                <div className="relative flex-1 min-w-[200px]">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <select
                        className="form-select pl-10 h-11"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="all">Semua Status</option>
                        <option value="present">Hadir</option>
                        <option value="late">Terlambat</option>
                        <option value="absent">Alpa</option>
                        <option value="leave">Cuti</option>
                        <option value="sick">Sakit</option>
                    </select>
                </div>
            </div>
        </div>
    );
}
