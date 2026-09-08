import { Search, Filter, RotateCcw, Calendar } from "lucide-react";
import { Division, Department } from "../types";

export interface PayrollFiltersProps {
    search: string;
    setSearch: (val: string) => void;
    filterDiv: string;
    setFilterDiv: (val: string) => void;
    filterDept: string;
    setFilterDept: (val: string) => void;
    selectedPeriod: string;
    setSelectedPeriod: (val: string) => void;
    masterDivisions: Division[];
    availableDepartments: Department[];
    tab: "recap" | "history";
}

export function PayrollFilters({
    search, setSearch,
    filterDiv, setFilterDiv,
    filterDept, setFilterDept,
    selectedPeriod, setSelectedPeriod,
    masterDivisions, availableDepartments,
    tab
}: PayrollFiltersProps) {
    const currentMonth = new Date().toISOString().slice(0, 7);

    const getPreviousMonth = () => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().slice(0, 7);
    };

    const resetFilters = () => {
        setSearch("");
        setFilterDiv("");
        setFilterDept("");
        setSelectedPeriod(currentMonth);
    };

    const hasActiveFilters = Boolean(
        search ||
        filterDiv ||
        filterDept ||
        (selectedPeriod && selectedPeriod !== currentMonth)
    );

    const activeFilterCount = [
        Boolean(search),
        Boolean(filterDiv),
        Boolean(filterDept),
        Boolean(selectedPeriod && selectedPeriod !== currentMonth),
    ].filter(Boolean).length;

    return (
        <div className="card p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Filter className="w-4 h-4 text-[var(--primary)]" />
                FILTER DATA
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
                <div className="relative sm:col-span-2 lg:col-span-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        className="form-input pl-10 w-full"
                        placeholder="Cari nama atau ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="lg:col-span-3">
                    <select
                        className="form-select w-full"
                        value={filterDiv}
                        onChange={(e) => { setFilterDiv(e.target.value); setFilterDept(""); }}
                    >
                        <option value="">Semua Divisi</option>
                        {masterDivisions.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                    </select>
                </div>
                <div className="lg:col-span-3">
                    <select
                        className="form-select w-full"
                        value={filterDept}
                        onChange={(e) => setFilterDept(e.target.value)}
                        disabled={!filterDiv}
                    >
                        <option value="">{filterDiv ? `Semua Dept (${filterDiv})` : "Pilih Divisi Terlebih Dahulu"}</option>
                        {availableDepartments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                </div>
                <div className="lg:col-span-2">
                    <input
                        type="month"
                        className="form-input w-full"
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(e.target.value)}
                        title="Pilih Bulan Periode"
                    />
                </div>
            </div>

            {/* Secondary Row: Quick Period Presets & Reset */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-muted)] mr-1 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        Periode:
                    </span>
                    <button
                        type="button"
                        onClick={() => setSelectedPeriod(currentMonth)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                            selectedPeriod === currentMonth
                                ? "bg-[var(--primary)] text-white shadow-sm"
                                : "bg-[var(--secondary)]/50 text-[var(--text-secondary)] hover:bg-[var(--secondary)]"
                        }`}
                    >
                        Bulan Ini
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedPeriod(getPreviousMonth())}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                            selectedPeriod === getPreviousMonth()
                                ? "bg-[var(--primary)] text-white shadow-sm"
                                : "bg-[var(--secondary)]/50 text-[var(--text-secondary)] hover:bg-[var(--secondary)]"
                        }`}
                    >
                        Bulan Lalu
                    </button>
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
                            onClick={resetFilters}
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
