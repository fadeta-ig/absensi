"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, Loader2, UserPlus, CheckSquare, Square, Users, Trash2 } from "lucide-react";
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

const COMPACT_CHIP_LIMIT = 8;

async function fetchAllActiveEmployees(signal: AbortSignal, excludeEmployeeId?: string | null): Promise<EmployeeOption[]> {
    const params = new URLSearchParams({ limit: "500" });
    if (excludeEmployeeId) params.set("exclude", excludeEmployeeId);
    const res = await fetch(`/api/appointments/employees?${params.toString()}`, { signal });
    if (!res.ok) throw new Error("Gagal memuat daftar karyawan aktif.");
    const data: unknown = await res.json();
    const list = Array.isArray(data)
        ? (data as EmployeeOption[])
        : Array.isArray((data as { data?: unknown }).data)
            ? ((data as { data: EmployeeOption[] }).data as EmployeeOption[])
            : [];
    // Lapis kedua di client: jangan tampilkan diri sendiri (penyelenggara otomatis peserta).
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
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [loadingEmployees, setLoadingEmployees] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [showAllChips, setShowAllChips] = useState(false);

    const loadEmployees = useCallback(
        async (signal?: AbortSignal) => {
            setLoadingEmployees(true);
            setLoadError(null);
            const controller = new AbortController();
            const activeSignal = signal ?? controller.signal;
            try {
                const list = await fetchAllActiveEmployees(activeSignal, excludeEmployeeId);
                if (activeSignal.aborted) return;
                setEmployees(list);
            } catch (err) {
                if (activeSignal.aborted) return;
                setLoadError(err instanceof Error ? err.message : "Gagal memuat daftar karyawan aktif.");
            } finally {
                if (!activeSignal.aborted) {
                    setLoadingEmployees(false);
                }
            }
        },
        [excludeEmployeeId]
    );

    useEffect(() => {
        const controller = new AbortController();
        void loadEmployees(controller.signal);
        return () => controller.abort();
    }, [loadEmployees]);

    const selectedEmployeeIds = useMemo(() => {
        const set = new Set<string>();
        for (const p of value) {
            if (p.employeeId) set.add(p.employeeId);
        }
        return set;
    }, [value]);

    const filteredEmployees = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return employees;
        return employees.filter((e) => {
            const cleanName = stripGelar(e.name).toLowerCase();
            return (
                e.name.toLowerCase().includes(q) ||
                cleanName.includes(q) ||
                e.employeeId.toLowerCase().includes(q) ||
                e.department.toLowerCase().includes(q) ||
                e.position.toLowerCase().includes(q)
            );
        });
    }, [employees, query]);

    const isAllActiveSelected = employees.length > 0 && employees.every((e) => selectedEmployeeIds.has(e.employeeId));
    const isAllFilteredSelected =
        filteredEmployees.length > 0 && filteredEmployees.every((e) => selectedEmployeeIds.has(e.employeeId));

    const toggleEmployee = (e: EmployeeOption) => {
        if (e.employeeId === excludeEmployeeId) return;
        if (selectedEmployeeIds.has(e.employeeId)) {
            onChange(value.filter((p) => p.employeeId !== e.employeeId));
        } else {
            onChange([...value, { key: `e:${e.employeeId}`, employeeId: e.employeeId, name: e.name }]);
        }
    };

    const handleSelectAllActive = () => {
        if (employees.length === 0) return;
        const guests = value.filter((p) => p.employeeId === null);
        if (isAllActiveSelected) {
            onChange(guests);
            return;
        }
        const existingByEmpId = new Map<string, PickedParticipant>();
        for (const p of value) {
            if (p.employeeId) existingByEmpId.set(p.employeeId, p);
        }
        const allInternal: PickedParticipant[] = employees.map(
            (e) => existingByEmpId.get(e.employeeId) ?? { key: `e:${e.employeeId}`, employeeId: e.employeeId, name: e.name }
        );
        onChange([...allInternal, ...guests]);
    };

    const handleSelectFiltered = () => {
        if (filteredEmployees.length === 0) return;
        if (isAllFilteredSelected) {
            const removeSet = new Set(filteredEmployees.map((e) => e.employeeId));
            onChange(value.filter((p) => !p.employeeId || !removeSet.has(p.employeeId)));
            return;
        }
        const next = [...value];
        const existingSet = new Set(selectedEmployeeIds);
        for (const e of filteredEmployees) {
            if (!existingSet.has(e.employeeId)) {
                existingSet.add(e.employeeId);
                next.push({ key: `e:${e.employeeId}`, employeeId: e.employeeId, name: e.name });
            }
        }
        onChange(next);
    };

    const handleClearInternal = () => {
        onChange(value.filter((p) => p.employeeId === null));
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

    const internalCount = selectedEmployeeIds.size;
    const guestCount = value.length - internalCount;
    const visibleChips = showAllChips ? value : value.slice(0, COMPACT_CHIP_LIMIT);
    const hiddenChipCount = Math.max(0, value.length - visibleChips.length);

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="form-label !mb-0" htmlFor="participant-picker-search">
                    <span className="flex items-center gap-1">
                        <UserPlus className="w-3 h-3" /> Peserta (Cari Nama atau Tambah Tamu)
                    </span>
                </label>
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                    Terpilih: <span className="text-[var(--primary)] font-bold">{internalCount}</span>
                    {employees.length > 0 ? `/${employees.length}` : ""} karyawan aktif
                    {guestCount > 0 ? ` + ${guestCount} tamu` : ""}
                </span>
            </div>

            {/* Search Input + Quick Bulk Actions */}
            <div className="space-y-1.5">
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" aria-hidden="true" />
                    <input
                        id="participant-picker-search"
                        className="form-input pl-10 pr-9"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Cari nama, NIP, departemen, atau jabatan…"
                        aria-label="Cari nama karyawan peserta"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 min-w-8 min-h-8 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            aria-label="Bersihkan pencarian peserta"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Action Bar: Pilih Semua Karyawan / Pilih Hasil Cari / Kosongkan */}
                <div className="flex items-center justify-between gap-2 flex-wrap bg-[var(--secondary)]/60 rounded-lg px-2.5 py-1.5 border border-[var(--border)]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            type="button"
                            onClick={handleSelectAllActive}
                            disabled={loadingEmployees || employees.length === 0}
                            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-colors min-h-8 ${
                                isAllActiveSelected
                                    ? "bg-[var(--primary)] text-white"
                                    : "bg-[var(--card)] text-[var(--primary)] border border-[var(--primary)]/30 hover:bg-[var(--primary)]/10"
                            } disabled:opacity-50`}
                        >
                            <Users className="w-3.5 h-3.5" />
                            {isAllActiveSelected
                                ? `Semua Karyawan Terpilih (${employees.length})`
                                : `Pilih Semua Karyawan (${employees.length})`}
                        </button>

                        {query.trim() !== "" && filteredEmployees.length > 0 && filteredEmployees.length < employees.length && (
                            <button
                                type="button"
                                onClick={handleSelectFiltered}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold bg-[var(--card)] text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--primary)] min-h-8"
                            >
                                {isAllFilteredSelected
                                    ? `Batal Pilih Hasil Cari (${filteredEmployees.length})`
                                    : `Pilih Hasil Cari (${filteredEmployees.length})`}
                            </button>
                        )}
                    </div>

                    {internalCount > 0 && (
                        <button
                            type="button"
                            onClick={handleClearInternal}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:underline px-1.5 min-h-8"
                        >
                            <Trash2 className="w-3 h-3" />
                            Reset ({internalCount})
                        </button>
                    )}
                </div>
            </div>

            {/* Active Employee Master List */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                {loadingEmployees ? (
                    <div className="p-4 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" aria-hidden="true" />
                        <span>Memuat daftar karyawan aktif…</span>
                    </div>
                ) : loadError ? (
                    <div className="p-3 flex items-center justify-between gap-2 text-xs text-rose-600">
                        <span>{loadError}</span>
                        <button
                            type="button"
                            onClick={() => void loadEmployees()}
                            className="btn btn-secondary btn-sm shrink-0"
                        >
                            Muat Ulang
                        </button>
                    </div>
                ) : filteredEmployees.length === 0 ? (
                    <p className="p-3 text-xs text-[var(--text-muted)] text-center">
                        {query.trim()
                            ? `Tidak ada karyawan aktif yang cocok dengan "${query.trim()}".`
                            : "Belum ada data karyawan aktif."}
                    </p>
                ) : (
                    <ul
                        className="max-h-52 overflow-y-auto divide-y divide-[var(--border)]"
                        role="listbox"
                        aria-multiselectable="true"
                        aria-label="Daftar karyawan aktif"
                    >
                        {filteredEmployees.map((r) => {
                            const selected = selectedEmployeeIds.has(r.employeeId);
                            return (
                                <li key={r.employeeId}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={selected}
                                        onClick={() => toggleEmployee(r)}
                                        className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 min-h-11 transition-colors ${
                                            selected
                                                ? "bg-[var(--primary)]/10 hover:bg-[var(--primary)]/15"
                                                : "hover:bg-[var(--secondary)]"
                                        }`}
                                    >
                                        <span className="flex items-center gap-2.5 min-w-0">
                                            {selected ? (
                                                <CheckSquare className="w-4 h-4 text-[var(--primary)] shrink-0" aria-hidden="true" />
                                            ) : (
                                                <Square className="w-4 h-4 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
                                            )}
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">
                                                    {stripGelar(r.name)}
                                                </span>
                                                <span className="block text-[11px] text-[var(--text-muted)] truncate">
                                                    {r.employeeId} · {r.department}
                                                    {r.position && r.position !== "-" ? ` · ${r.position}` : ""}
                                                </span>
                                            </span>
                                        </span>
                                        {selected && (
                                            <span className="text-[10px] font-bold text-[var(--primary)] bg-[var(--card)] border border-[var(--primary)]/30 rounded-full px-2 py-0.5 shrink-0">
                                                Terpilih
                                            </span>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* External Guest Input */}
            <div className="flex gap-2">
                <input
                    className="form-input flex-1"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            addGuest();
                        }
                    }}
                    placeholder="Masukkan nama tamu eksternal (opsional)…"
                    aria-label="Nama tamu eksternal"
                />
                <button type="button" onClick={addGuest} disabled={!guestName.trim()} className="btn btn-secondary btn-sm shrink-0">
                    Tambah Tamu
                </button>
            </div>

            {/* Selected Participant Chips (Compact & Collapsible) */}
            {value.length > 0 && (
                <div className="space-y-1.5 pt-0.5">
                    <div className="flex flex-wrap gap-1.5">
                        {visibleChips.map((p) => (
                            <span
                                key={p.key}
                                className="inline-flex items-center gap-1 rounded-full bg-[var(--secondary)] border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]"
                            >
                                {p.employeeId ? stripGelar(p.name) : p.name}
                                {p.employeeId === null && <span className="text-[10px] text-[var(--text-muted)]">(Tamu)</span>}
                                <button
                                    type="button"
                                    onClick={() => onChange(value.filter((v) => v.key !== p.key))}
                                    className="text-[var(--text-muted)] hover:text-[var(--destructive)] min-w-5 min-h-5 flex items-center justify-center"
                                    aria-label={`Hapus ${p.name}`}
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </span>
                        ))}
                        {hiddenChipCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowAllChips(true)}
                                className="inline-flex items-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/30 px-2.5 py-1 text-xs font-bold hover:bg-[var(--primary)]/20"
                            >
                                +{hiddenChipCount} peserta lainnya (Lihat semua)
                            </button>
                        )}
                        {showAllChips && value.length > COMPACT_CHIP_LIMIT && (
                            <button
                                type="button"
                                onClick={() => setShowAllChips(false)}
                                className="inline-flex items-center rounded-full bg-[var(--secondary)] text-[var(--text-secondary)] border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:text-[var(--text-primary)]"
                            >
                                Ringkas tampilan
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
