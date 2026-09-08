import { useMemo } from "react";
import { Search, Calendar, Building2, Layers, Filter, RotateCcw } from "lucide-react";
import { MasterData } from "../types";
import { getToday, getYesterday, getThisWeekRange, getThisMonthRange } from "@/lib/datePresets";

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
    const today = getToday();
    const yesterday = getYesterday();
    const thisWeek = getThisWeekRange();
    const thisMonth = getThisMonthRange();

    // Cascading: departments filtered by selected division
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
    };

    const handlePreset = (preset: "today" | "yesterday" | "this_week" | "this_month") => {
        if (preset === "today") {
            setStartDate(today);
            setEndDate(today);
        } else if (preset === "yesterday") {
            setStartDate(yesterday);
            setEndDate(yesterday);
        } else if (preset === "this_week") {
            setStartDate(thisWeek.start);
            setEndDate(thisWeek.end);
        } else if (preset === "this_month") {
            setStartDate(thisMonth.start);
            setEndDate(thisMonth.end);
        }
    };

    const isToday = startDate === today && endDate === today;
    const isYesterday = startDate === yesterday && endDate === yesterday;
    const isThisWeek = startDate === thisWeek.start && endDate === thisWeek.end;
    const isThisMonth = startDate === thisMonth.start && endDate === thisMonth.end;

    const hasActiveFilters = Boolean(
        search ||
        !isToday ||
        deptFilter !== "all" ||
        divFilter !== "all" ||
        statusFilter !== "all"
    );

    const activeFilterCount = [
        Boolean(search),
        !isToday,
        deptFilter !== "all",
        divFilter !== "all",
        statusFilter !== "all",
    ].filter(Boolean).length;

    const handleReset = () => {
        setSearch("");
        setStartDate(today);
        setEndDate(today);
        setDeptFilter("all");
        setDivFilter("all");
        setStatusFilter("all");
    };

    return (
        <div className="card p-5 space-y-4">
            {/* Row 1: Search & Date Range */}
            <div className="flex flex-wrap gap-4">
                {/* Search */}
                <div className="relative flex-1 min-w-[280px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                        className="form-input pl-10 h-11 w-full"
                        placeholder="Cari NIP atau nama karyawan..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                {/* Date Range */}
                <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                    <div className="relative flex-1">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="date"
                            className="form-input pl-10 h-11 w-full text-xs"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            title="Tanggal Mulai"
                        />
                    </div>
                    <span className="text-[var(--text-muted)] font-medium text-xs">s/d</span>
                    <div className="relative flex-1">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="date"
                            className="form-input pl-10 h-11 w-full text-xs"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            title="Tanggal Selesai"
                        />
                    </div>
                </div>
            </div>

            {/* Row 2: Cascading Division ➔ Department & Status */}
            <div className="flex flex-wrap gap-4">
                {/* Div Filter */}
                <div className="relative flex-1 min-w-[200px]">
                    <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <select
                        className="form-select pl-10 h-11 w-full"
                        value={divFilter}
                        onChange={(e) => handleDivisionChange(e.target.value)}
                    >
                        <option value="all">Semua Divisi</option>
                        {divisions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                </div>

                {/* Dept Filter */}
                <div className="relative flex-1 min-w-[200px]">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <select
                        className="form-select pl-10 h-11 w-full"
                        value={deptFilter}
                        onChange={(e) => setDeptFilter(e.target.value)}
                    >
                        <option value="all">
                            {divFilter === "all" ? "Semua Departemen" : `Semua Dept (${divFilter})`}
                        </option>
                        {availableDepartments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                </div>

                {/* Status Filter */}
                <div className="relative flex-1 min-w-[200px]">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <select
                        className="form-select pl-10 h-11 w-full"
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

            {/* Row 3: Presets & Reset */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-muted)] mr-1 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        Periode Cepat:
                    </span>
                    {[
                        { key: "today", label: "Hari Ini", active: isToday },
                        { key: "yesterday", label: "Kemarin", active: isYesterday },
                        { key: "this_week", label: "Minggu Ini", active: isThisWeek },
                        { key: "this_month", label: "Bulan Ini", active: isThisMonth },
                    ].map((preset) => (
                        <button
                            key={preset.key}
                            type="button"
                            onClick={() => handlePreset(preset.key as "today" | "yesterday" | "this_week" | "this_month")}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                preset.active
                                    ? "bg-[var(--primary)] text-white shadow-sm"
                                    : "bg-[var(--secondary)]/50 text-[var(--text-secondary)] hover:bg-[var(--secondary)]"
                            }`}
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    {activeFilterCount > 0 && (
                        <span className="text-xs font-medium text-[var(--primary)] bg-[var(--primary)]/10 px-2.5 py-0.5 rounded-full">
                            {activeFilterCount} filter aktif
                        </span>
                    )}
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={handleReset}
                            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reset Filter
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
