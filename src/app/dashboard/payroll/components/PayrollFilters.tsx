import { Search, Filter } from "lucide-react";
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
    return (
        <div className="card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] mb-1">
                <Filter className="w-4 h-4 text-[var(--primary)]" />
                FILTER DATA
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        className="form-input pl-10"
                        placeholder="Cari nama atau ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select className="form-select" value={filterDiv} onChange={(e) => { setFilterDiv(e.target.value); setFilterDept(""); }}>
                    <option value="">Semua Divisi</option>
                    {masterDivisions.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                </select>
                <select className="form-select" value={filterDept} onChange={(e) => setFilterDept(e.target.value)} disabled={!filterDiv}>
                    <option value="">Semua Departemen</option>
                    {availableDepartments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
                <input type="month" className="form-input" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} />
            </div>
        </div>
    );
}
