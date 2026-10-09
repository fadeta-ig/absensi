"use client";

import { useCallback, useState } from "react";
import { Search, X, Loader2, UserPlus } from "lucide-react";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import { stripGelar } from "@/lib/utils/formatters";

export interface PickedParticipant {
    key: string;
    employeeId: string | null;
    name: string;
}

interface EmployeeOption {
    employeeId: string;
    name: string;
    department: string;
    position: string;
}

async function fetchEmployees(query: string, signal: AbortSignal, excludeEmployeeId?: string | null): Promise<EmployeeOption[]> {
    const params = new URLSearchParams({ q: query, limit: "8" });
    if (excludeEmployeeId) params.set("exclude", excludeEmployeeId);
    const res = await fetch(`/api/appointments/employees?${params.toString()}`, { signal });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const list = Array.isArray(data) ? (data as EmployeeOption[]) : [];
    // Lapis kedua di client (anti race/paste): jangan tampilkan diri sendiri.
    return excludeEmployeeId ? list.filter((e) => e.employeeId !== excludeEmployeeId) : list;
}

export default function ParticipantPicker({
    value,
    onChange,
    excludeEmployeeId,
}: {
    value: PickedParticipant[];
    onChange: (next: PickedParticipant[]) => void;
    excludeEmployeeId?: string | null;
}) {
    const [query, setQuery] = useState("");
    const [guestName, setGuestName] = useState("");
    const fetcher = useCallback((q: string, signal: AbortSignal) => fetchEmployees(q, signal, excludeEmployeeId), [excludeEmployeeId]);
    const { results, searching } = useDebouncedSearch<EmployeeOption>(query, fetcher, 300, 2);

    const addEmployee = (e: EmployeeOption) => {
        if (e.employeeId === excludeEmployeeId) {
            setQuery("");
            return;
        }
        if (value.some((p) => p.employeeId === e.employeeId)) {
            setQuery("");
            return;
        }
        onChange([...value, { key: `e:${e.employeeId}`, employeeId: e.employeeId, name: e.name }]);
        setQuery("");
    };

    const addGuest = () => {
        const name = guestName.trim();
        if (!name) return;
        if (value.some((p) => p.employeeId === null && p.name.toLowerCase() === name.toLowerCase())) {
            setGuestName("");
            return;
        }
        onChange([...value, { key: `g:${name.toLowerCase()}`, employeeId: null, name }]);
        setGuestName("");
    };

    return (
        <div>
            <label className="form-label">
                <span className="flex items-center gap-1">
                    <UserPlus className="w-3 h-3" /> Peserta (Cari Nama atau Tambah Tamu)
                </span>
            </label>
            <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                <input
                    className="form-input pl-10"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ketik minimal 2 huruf nama karyawan…"
                    aria-label="Cari nama karyawan peserta"
                />
                {searching && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />}
            </div>
            {results.length > 0 && (
                <ul className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
                    {results.map((r) => (
                        <li key={r.employeeId}>
                            <button
                                type="button"
                                onClick={() => addEmployee(r)}
                                className="w-full text-left px-3 py-2 hover:bg-[var(--secondary)] flex items-center justify-between gap-2 min-h-11"
                            >
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">{stripGelar(r.name)}</span>
                                    <span className="block text-[11px] text-[var(--text-muted)] truncate">{r.employeeId} · {r.department}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <div className="mt-2 flex gap-2">
                <input
                    className="form-input flex-1"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Masukkan nama tamu eksternal…"
                    aria-label="Nama tamu eksternal"
                />
                <button type="button" onClick={addGuest} disabled={!guestName.trim()} className="btn btn-secondary btn-sm shrink-0">
                    Tambah Tamu
                </button>
            </div>
            {value.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {value.map((p) => (
                        <span key={p.key} className="inline-flex items-center gap-1 rounded-full bg-[var(--secondary)] border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]">
                            {p.employeeId ? stripGelar(p.name) : p.name}
                            {p.employeeId === null && <span className="text-[10px] text-[var(--text-muted)]">(Tamu)</span>}
                            <button
                                type="button"
                                onClick={() => onChange(value.filter((v) => v.key !== p.key))}
                                className="text-[var(--text-muted)] hover:text-[var(--destructive)] min-w-6 min-h-6 flex items-center justify-center"
                                aria-label={`Hapus ${p.name}`}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
