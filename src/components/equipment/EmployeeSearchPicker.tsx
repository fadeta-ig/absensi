"use client";

import { useCallback, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import { stripGelar } from "@/lib/utils/formatters";

export interface EmployeePick {
    employeeId: string;
    name: string;
    department?: string;
}

async function fetchEmployees(query: string, signal: AbortSignal): Promise<EmployeePick[]> {
    const params = new URLSearchParams({ q: query, limit: "8" });
    const res = await fetch(`/api/appointments/employees?${params.toString()}`, { signal });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as EmployeePick[]) : [];
}

export default function EmployeeSearchPicker({
    label,
    value,
    onChange,
    placeholder = "Ketik minimal 2 huruf nama / ID…",
}: {
    label: string;
    value: EmployeePick | null;
    onChange: (next: EmployeePick | null) => void;
    placeholder?: string;
}) {
    const [query, setQuery] = useState("");
    const fetcher = useCallback((q: string, signal: AbortSignal) => fetchEmployees(q, signal), []);
    const { results, searching } = useDebouncedSearch<EmployeePick>(query, fetcher, 300, 2);

    if (value) {
        return (
            <div>
                <span className="form-label">{label}</span>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2">
                    <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">
                            {stripGelar(value.name)}
                        </span>
                        <span className="block text-[11px] text-[var(--text-muted)] truncate">
                            {value.employeeId}
                            {value.department ? ` · ${value.department}` : ""}
                        </span>
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            onChange(null);
                            setQuery("");
                        }}
                        className="text-[var(--text-muted)] hover:text-[var(--destructive)] min-w-9 min-h-9 flex items-center justify-center shrink-0"
                        aria-label={`Ganti ${label}`}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <span className="form-label">{label}</span>
            <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                <input
                    className="form-input pl-10"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={placeholder}
                    aria-label={label}
                />
                {searching && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />}
            </div>
            {results.length > 0 && (
                <ul className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
                    {results.map((r) => (
                        <li key={r.employeeId}>
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(r);
                                    setQuery("");
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-[var(--secondary)] min-h-11"
                            >
                                <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">{stripGelar(r.name)}</span>
                                <span className="block text-[11px] text-[var(--text-muted)] truncate">
                                    {r.employeeId}
                                    {r.department ? ` · ${r.department}` : ""}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
