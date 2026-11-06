"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, Trash2, UserCheck } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import { stripGelar } from "@/lib/utils/formatters";

interface ReceptionistInfo {
    employeeId: string;
    name: string | null;
    isActive: boolean;
    email?: string | null;
}

interface EmployeeOption {
    employeeId: string;
    name: string;
    department: string;
    position: string;
}

const MAX_RECEPTIONISTS = 5;

async function fetchEmployees(query: string, signal: AbortSignal): Promise<EmployeeOption[]> {
    const params = new URLSearchParams({ q: query, limit: "8" });
    const res = await fetch(`/api/appointments/employees?${params.toString()}`, { signal });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (Array.isArray(data)) return data as EmployeeOption[];
    if (data && typeof data === "object" && Array.isArray((data as { data?: unknown }).data)) {
        return (data as { data: EmployeeOption[] }).data;
    }
    return [];
}

/**
 * Kartu daftar resepsionis e-meeting max 5 (HANYA WIG002).
 * Tulis ke AppSetting `meeting.receptionists` (JSON array).
 * Resepsionis = penyelenggara untuk semua meeting via modul employee;
 * tanpa force-bentrok, tanpa kelola master; mati sendiri bila nonaktif.
 */
export default function MeetingReceptionistCard() {
    const toast = useToast();
    const [infos, setInfos] = useState<ReceptionistInfo[]>([]);
    const [query, setQuery] = useState("");
    const [manualId, setManualId] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const fetcher = useCallback((q: string, signal: AbortSignal) => fetchEmployees(q, signal), []);
    const { results: options, searching } = useDebouncedSearch<EmployeeOption>(query, fetcher, 300, 2);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/ga/meeting-settings/receptionists");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat resepsionis e-meeting."));
            const json = await res.json();
            setInfos((json.data ?? []) as ReceptionistInfo[]);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat data.";
            toast(msg, "error");
            reportClientError("MeetingReceptionistCard", msg, err);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void fetchAll();
    }, [fetchAll]);

    const handleAdd = useCallback(
        async (id: string) => {
            const clean = id.trim();
            if (!clean) return;
            const currentIds = infos.map((i) => i.employeeId).filter(Boolean);
            if (currentIds.includes(clean)) {
                toast("Karyawan ini sudah ada di daftar.", "error");
                return;
            }
            if (currentIds.length >= MAX_RECEPTIONISTS) {
                toast(`Maksimal ${MAX_RECEPTIONISTS} resepsionis e-meeting.`, "error");
                return;
            }
            setSaving(true);
            try {
                const res = await fetch("/api/ga/meeting-settings/receptionists", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ employeeIds: [...currentIds, clean] }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan resepsionis."));
                const json = await res.json();
                setInfos((json.data.infos ?? []) as ReceptionistInfo[]);
                setQuery("");
                setManualId("");
                toast("Resepsionis e-meeting ditambahkan.", "success");
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal menyimpan.";
                toast(msg, "error");
                reportClientError("MeetingReceptionistCard", msg, err);
            } finally {
                setSaving(false);
            }
        },
        [infos, toast]
    );

    const handleRemove = useCallback(
        async (employeeId: string) => {
            setRemovingId(employeeId);
            try {
                const res = await fetch(`/api/ga/meeting-settings/receptionists?id=${encodeURIComponent(employeeId)}`, {
                    method: "DELETE",
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus."));
                const json = await res.json();
                setInfos((json.data.infos ?? []) as ReceptionistInfo[]);
                toast("Resepsionis dihapus dari daftar.", "success");
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal menghapus.";
                toast(msg, "error");
                reportClientError("MeetingReceptionistCard", msg, err);
            } finally {
                setRemovingId(null);
            }
        },
        [toast]
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-2">
                    Resepsionis saat ini ({infos.length}/{MAX_RECEPTIONISTS})
                </h3>
                {infos.length > 0 ? (
                    <ul className="space-y-2">
                        {infos.map((info) => (
                            <li key={info.employeeId} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                                <div className="space-y-0.5">
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                                        {info.name ? stripGelar(info.name) : info.employeeId}{" "}
                                        <span className="font-mono text-xs text-[var(--text-muted)]">{info.employeeId}</span>
                                    </p>
                                    {!info.isActive && (
                                        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                            Karyawan nonaktif — hak resepsionisnya mati sendiri.
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handleRemove(info.employeeId)}
                                    disabled={removingId === info.employeeId}
                                    aria-label={`Hapus ${info.employeeId}`}
                                    className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-red-600 disabled:opacity-50"
                                >
                                    {removingId === info.employeeId ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                    Hapus
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-xs text-[var(--text-muted)]">Belum ada resepsionis e-meeting yang ditunjuk.</p>
                )}
            </div>

            <div className="rounded-xl border border-[var(--border)] p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Tambah resepsionis
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                    Hanya karyawan internal aktif (maksimal {MAX_RECEPTIONISTS} orang). Resepsionis dapat membuat dan mengelola seluruh meeting dari modul E-Meeting employee (jadwal, ruangan, peserta, batalkan, selesaikan, kehadiran, notulensi) setara penyelenggara — tanpa hak paksa-bentrok dan tanpa kelola master.
                </p>
                <div className="form-group !mb-0">
                    <label className="form-label" htmlFor="receptionist-search">Cari karyawan (minimal 2 huruf)</label>
                    <input
                        id="receptionist-search"
                        className="form-input"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Contoh: daffa"
                        maxLength={50}
                    />
                </div>
                {searching && <p className="text-xs text-[var(--text-muted)]">Mencari…</p>}
                {options.length > 0 && (
                    <ul className="space-y-1">
                        {options.map((opt) => (
                            <li key={opt.employeeId}>
                                <button
                                    type="button"
                                    onClick={() => void handleAdd(opt.employeeId)}
                                    disabled={saving || infos.length >= MAX_RECEPTIONISTS}
                                    className="w-full text-left px-3 py-2 rounded-lg border border-[var(--border)] text-xs hover:border-[var(--primary)] disabled:opacity-50"
                                >
                                    <span className="font-semibold">{stripGelar(opt.name)}</span>{" "}
                                    <span className="font-mono text-[var(--text-muted)]">{opt.employeeId}</span>
                                    <span className="block text-[var(--text-muted)]">{opt.position} · {opt.department}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <div className="form-group !mb-0">
                    <label className="form-label" htmlFor="receptionist-manual">Nomor induk karyawan (manual)</label>
                    <div className="flex gap-2">
                        <input
                            id="receptionist-manual"
                            type="text"
                            className="form-input"
                            value={manualId}
                            onChange={(e) => setManualId(e.target.value)}
                            placeholder="Contoh: ID-25020044"
                            maxLength={100}
                        />
                        <button
                            type="button"
                            onClick={() => void handleAdd(manualId)}
                            disabled={saving || !manualId.trim() || infos.length >= MAX_RECEPTIONISTS}
                            className="btn btn-primary btn-sm shrink-0 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            Tambah
                        </button>
                    </div>
                </div>
                <p className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <UserCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Berlaku langsung (maksimal 60 detik).
                </p>
            </div>
        </div>
    );
}
