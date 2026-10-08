"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Loader2, AlertCircle, CalendarDays, LayoutList, Search, X } from "lucide-react";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import AppointmentCalendar, { type CalendarAppointment } from "@/components/appointments/AppointmentCalendar";
import AppointmentFormModal from "@/components/appointments/AppointmentFormModal";
import AppointmentDetailModal from "@/components/appointments/AppointmentDetailModal";
import { AppointmentStatusBadge } from "@/components/appointments/AppointmentBadges";
import { fetchMonthAppointments, fetchUpcomingAppointments, type AppointmentListItem } from "@/components/appointments/useAppointments";
import { toDateString, formatIndonesianDate } from "@/lib/utils";

type ViewMode = "upcoming" | "day" | "month";
type ModalState = { type: "none" } | { type: "create" } | { type: "edit"; item: AppointmentListItem } | { type: "detail"; item: AppointmentListItem };

function fmtTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function EmployeeAppointmentsPage() {
    const toast = useToast();
    const router = useRouter();
    const [view, setView] = useState<ViewMode>("upcoming");
    const [selectedDate, setSelectedDate] = useState(() => toDateString(new Date()));
    const [month, setMonth] = useState(() => {
        const t = new Date();
        return { year: t.getFullYear(), month: t.getMonth() };
    });
    const [items, setItems] = useState<AppointmentListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [modal, setModal] = useState<ModalState>({ type: "none" });
    const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
    const fetchedRef = useRef("");

    useEffect(() => {
        let cancelled = false;
        fetch("/api/auth/me", { credentials: "same-origin" })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: unknown) => {
                if (!cancelled && data && typeof data === "object" && "employeeId" in data) {
                    setMyEmployeeId(String((data as { employeeId: unknown }).employeeId ?? ""));
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const [filterQ, setFilterQ] = useState("");
    const [filterRoom, setFilterRoom] = useState("");
    const [filterStatus, setFilterStatus] = useState("");
    const [filterRooms, setFilterRooms] = useState<Array<{ id: string; name: string }>>([]);
    const [debouncedQ, setDebouncedQ] = useState("");

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQ(filterQ.trim()), 400);
        return () => clearTimeout(timer);
    }, [filterQ]);

    useEffect(() => {
        fetch("/api/appointments/rooms")
            .then((res) => (res.ok ? res.json() : null))
            .then((json: unknown) => {
                if (json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)) {
                    setFilterRooms((json as { data: Array<{ id: string; name: string }> }).data);
                }
            })
            .catch(() => undefined);
    }, []);

    const loadMonth = useCallback(
        async (year: number, mon: number) => {
            const key = `${year}-${mon}`;
            fetchedRef.current = key;
            setLoading(true);
            setLoadError(null);
            const controller = new AbortController();
            const { items: data, error } = await fetchMonthAppointments(year, mon, controller.signal, {
                q: debouncedQ || undefined,
                roomId: filterRoom || undefined,
                status: filterStatus || undefined,
            });
            if (fetchedRef.current !== key) return;
            setItems(data);
            setLoadError(error);
            setLoading(false);
        },
        [debouncedQ, filterRoom, filterStatus]
    );

    type Scope = "all" | "mine" | "invited";
    const [scope, setScope] = useState<Scope>("all");

    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (view === "upcoming") {
            const key = `upcoming-${debouncedQ}-${filterRoom}-${filterStatus}-${scope}`;
            fetchedRef.current = key;
            setLoading(true);
            setLoadError(null);
            const controller = new AbortController();
            void fetchUpcomingAppointments(controller.signal, {
                q: debouncedQ || undefined,
                roomId: filterRoom || undefined,
                status: filterStatus || undefined,
            }).then(({ items: data, error }) => {
                if (fetchedRef.current !== key) return;
                setItems(data);
                setLoadError(error);
                setLoading(false);
            });
            return () => controller.abort();
        }
        void loadMonth(month.year, month.month);
    }, [view, month, loadMonth, debouncedQ, filterRoom, filterStatus, scope, refreshKey]);

    const hasActiveFilter = debouncedQ !== "" || filterRoom !== "" || filterStatus !== "";
    const clearFilters = useCallback(() => {
        setFilterQ("");
        setDebouncedQ("");
        setFilterRoom("");
        setFilterStatus("");
    }, []);

    const scopedItems = useMemo(() => {
        if (scope === "all" || !myEmployeeId) return items;
        if (scope === "mine") return items.filter((a) => a.requesterEmployeeId === myEmployeeId);
        return items.filter((a) => a.requesterEmployeeId !== myEmployeeId && a.participants.some((p) => p.employeeId === myEmployeeId));
    }, [items, scope, myEmployeeId]);

    const scopeCounts = useMemo(() => {
        if (!myEmployeeId) return { all: items.length, mine: 0, invited: 0 };
        let mine = 0;
        let invited = 0;
        for (const a of items) {
            if (a.requesterEmployeeId === myEmployeeId) mine++;
            else if (a.participants.some((p) => p.employeeId === myEmployeeId)) invited++;
        }
        return { all: items.length, mine, invited };
    }, [items, myEmployeeId]);

    const appointmentsByDate = useMemo(() => {
        const map = new Map<string, CalendarAppointment[]>();
        for (const a of scopedItems) {
            const key = toDateString(a.startAt);
            const cur = map.get(key) || [];
            cur.push({ id: a.id, title: a.title, status: a.status, lifecycle: a.lifecycle, startAt: a.startAt, endAt: a.endAt, isFullDay: a.isFullDay, room: a.room });
            map.set(key, cur);
        }
        for (const list of map.values()) list.sort((x, y) => x.startAt.localeCompare(y.startAt));
        return map;
    }, [scopedItems]);

    const dayItems = useMemo(() => {
        const list = appointmentsByDate.get(selectedDate) || [];
        return [...list].sort((x, y) => x.startAt.localeCompare(y.startAt));
    }, [appointmentsByDate, selectedDate]);

    const handleSaved = useCallback(() => {
        toast("Meeting berhasil disimpan.", "success");
        setRefreshKey((k) => k + 1);
    }, [toast]);

    const openDetail = useCallback(
        async (id: string) => {
            try {
                const res = await fetch(`/api/appointments/${id}`);
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat detail."));
                const json: unknown = await res.json();
                const data = json && typeof json === "object" ? (json as { data: AppointmentListItem }).data : null;
                if (data) setModal({ type: "detail", item: data });
            } catch (error) {
                reportClientError("EmployeeAppointmentsPage", "Gagal memuat detail", error);
                toast(error instanceof Error ? error.message : "Gagal memuat detail.", "error");
            }
        },
        [toast]
    );

    const detailItem = modal.type === "detail" ? modal.item : null;
    const editingItem = modal.type === "edit" ? modal.item : null;

    const [showBusy, setShowBusy] = useState(false);
    const [blocks, setBlocks] = useState<Array<{ id: string; startAt: string; endAt: string; reason: string | null }>>([]);
    const [busyFrom, setBusyFrom] = useState("");
    const [busyTo, setBusyTo] = useState("");
    const [busyReason, setBusyReason] = useState("");
    const [savingBusy, setSavingBusy] = useState(false);

    const loadBlocks = useCallback(async () => {
        try {
            const res = await fetch("/api/appointments/unavailability");
            if (!res.ok) return;
            const json = (await res.json()) as { data: Array<{ id: string; startAt: string; endAt: string; reason: string | null }> };
            setBlocks(Array.isArray(json.data) ? json.data : []);
        } catch {
            /* abaikan */
        }
    }, []);

    useEffect(() => {
        if (showBusy) void loadBlocks();
    }, [showBusy, loadBlocks]);

    async function handleSaveBusy(e: React.FormEvent) {
        e.preventDefault();
        if (!busyFrom || !busyTo || savingBusy) return;
        setSavingBusy(true);
        try {
            const res = await fetch("/api/appointments/unavailability", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ startDate: busyFrom, endDate: busyTo, reason: busyReason.trim() || null }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan."));
            setBusyFrom("");
            setBusyTo("");
            setBusyReason("");
            toast("Periode sibuk berhasil disimpan. Anda tidak tersedia pada rentang tanggal tersebut.", "success");
            await loadBlocks();
        } catch (error) {
            reportClientError("EmployeeAppointmentsPage", "Gagal simpan sibuk", error);
            toast(error instanceof Error ? error.message : "Gagal menyimpan.", "error");
        } finally {
            setSavingBusy(false);
        }
    }

    async function handleDeleteBusy(id: string) {
        try {
            const res = await fetch(`/api/appointments/unavailability?id=${encodeURIComponent(id)}`, { method: "DELETE" });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus."));
            toast("Periode sibuk berhasil dihapus.", "success");
            await loadBlocks();
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal menghapus.", "error");
        }
    }

    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        const inviteId = params.get("invite");
        if (inviteId) {
            window.history.replaceState(null, "", window.location.pathname);
            void openDetail(inviteId);
            return;
        }
        const presetDate = params.get("date");
        if (presetDate && /^\d{4}-\d{2}-\d{2}$/.test(presetDate)) {
            setSelectedDate(presetDate);
            const [y, m] = presetDate.split("-").map(Number);
            setMonth({ year: y, month: m - 1 });
            if (params.get("create") === "1") {
                window.history.replaceState(null, "", window.location.pathname);
                setModal({ type: "create" });
            }
        }
    }, [openDetail]);

    return (
        <div className="w-full min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-lg font-extrabold text-[var(--text-primary)] truncate">E Meeting</h1>
                    <p className="text-xs text-[var(--text-muted)]">Kelola meeting, ruangan, dan ketersediaan Anda</p>
                </div>
                <button type="button" onClick={() => setModal({ type: "create" })} className="btn btn-primary shrink-0">
                    <Plus className="w-4 h-4" /> Buat Meeting
                </button>
            </div>

            <Link href="/employee/appointments/tasks" className="card p-4 flex items-center justify-between gap-2">
                <span>
                    <span className="block text-sm font-bold text-[var(--text-primary)]">Task Meeting Saya</span>
                    <span className="block text-[11px] text-[var(--text-muted)]">Kumpulan semua task dari hasil meeting untuk Anda</span>
                </span>
                <span className="text-[11px] font-bold text-[var(--primary)] shrink-0">Lihat</span>
            </Link>

            <div className="card overflow-hidden">
                <button
                    type="button"
                    onClick={() => setShowBusy(!showBusy)}
                    aria-expanded={showBusy}
                    className="w-full flex items-center justify-between gap-2 p-4 min-h-11 text-left"
                >
                    <span>
                        <span className="block text-sm font-bold text-[var(--text-primary)]">Tandai Periode Sibuk</span>
                        <span className="block text-[11px] text-[var(--text-muted)]">Contoh: tidak menerima meeting hingga minggu depan — nama Anda tetap dapat dicari</span>
                    </span>
                    <span className="text-[11px] font-bold text-[var(--primary)] shrink-0">{showBusy ? "Tutup" : blocks.length > 0 ? `${blocks.length} periode aktif` : "Kelola"}</span>
                </button>
                {showBusy && (
                    <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)] pt-3">
                        {blocks.length > 0 && (
                            <ul className="space-y-1.5">
                                {blocks.map((b) => (
                                    <li key={b.id} className="flex items-center justify-between gap-2 text-xs rounded-lg bg-[var(--secondary)] px-3 py-2">
                                        <span className="min-w-0 truncate">
                                            {new Date(b.startAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – {new Date(b.endAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                            {b.reason ? ` · ${b.reason}` : ""}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => { void handleDeleteBusy(b.id); }}
                                            className="text-rose-600 text-[11px] font-bold shrink-0 min-h-9 px-2"
                                        >
                                            Hapus
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <form onSubmit={handleSaveBusy} className="grid grid-cols-2 gap-2">
                            <div className="form-group !mb-0">
                                <label className="form-label" htmlFor="busy-from">Tanggal Mulai *</label>
                                <input id="busy-from" type="date" className="form-input" value={busyFrom} onChange={(e) => setBusyFrom(e.target.value)} required />
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label" htmlFor="busy-to">Tanggal Selesai *</label>
                                <input id="busy-to" type="date" className="form-input" value={busyTo} onChange={(e) => setBusyTo(e.target.value)} required />
                            </div>
                            <div className="form-group !mb-0 col-span-2">
                                <label className="form-label" htmlFor="busy-reason">Alasan (opsional)</label>
                                <input id="busy-reason" className="form-input" value={busyReason} onChange={(e) => setBusyReason(e.target.value)} placeholder="Contoh: fokus kerja, dinas luar" maxLength={500} />
                            </div>
                            <button type="submit" disabled={savingBusy || !busyFrom || !busyTo} className="btn btn-secondary col-span-2">
                                {savingBusy ? "Menyimpan…" : "Simpan Periode Sibuk"}
                            </button>
                        </form>
                    </div>
                )}
            </div>

            <div className="flex gap-1.5 rounded-2xl bg-[var(--secondary)] p-1.5" role="tablist" aria-label="Kategori meeting">
                {(
                    [
                        { key: "all", label: `Semua (${scopeCounts.all})` },
                        { key: "mine", label: `Yang Saya Selenggarakan (${scopeCounts.mine})` },
                        { key: "invited", label: `Undangan untuk Saya (${scopeCounts.invited})` },
                    ] as const
                ).map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={scope === t.key}
                        onClick={() => setScope(t.key)}
                        className={`flex-1 min-h-11 rounded-xl px-2 text-xs font-bold transition-colors ${
                            scope === t.key ? "bg-[var(--card)] text-[var(--primary)] shadow-sm" : "text-[var(--text-muted)]"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="flex gap-1.5" role="tablist" aria-label="Mode tampilan">
                {(
                    [
                        { key: "upcoming", label: "Akan Datang", icon: LayoutList },
                        { key: "day", label: "Harian", icon: CalendarDays },
                        { key: "month", label: "Bulanan", icon: CalendarDays },
                    ] as const
                ).map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={view === t.key}
                        onClick={() => setView(t.key)}
                        className={`flex-1 min-h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 ${
                            view === t.key ? "bg-[var(--primary)] text-white" : "bg-[var(--secondary)] text-[var(--text-secondary)]"
                        }`}
                    >
                        <t.icon className="w-4 h-4" /> {t.label}
                    </button>
                ))}
            </div>

            {loadError && (
                <FeedbackMessage variant="error" title="Gagal memuat">
                    {loadError}
                </FeedbackMessage>
            )}

            <div className="card p-3 space-y-2">
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
                    <input
                        className="form-input pl-10 pr-9"
                        value={filterQ}
                        onChange={(e) => setFilterQ(e.target.value)}
                        placeholder="Cari topik meeting…"
                        aria-label="Cari topik meeting"
                    />
                    {filterQ && (
                        <button
                            type="button"
                            onClick={() => setFilterQ("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 min-w-9 min-h-9 flex items-center justify-center text-[var(--text-muted)]"
                            aria-label="Hapus pencarian"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="form-label sr-only" htmlFor="filter-room">Ruangan</label>
                        <select
                            id="filter-room"
                            className="form-input"
                            value={filterRoom}
                            onChange={(e) => setFilterRoom(e.target.value)}
                            aria-label="Filter ruangan"
                        >
                            <option value="">Semua ruangan</option>
                            {filterRooms.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                            <option value="__online__">Daring</option>
                        </select>
                    </div>
                    <div>
                        <label className="form-label sr-only" htmlFor="filter-status">Status</label>
                        <select
                            id="filter-status"
                            className="form-input"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            aria-label="Filter status"
                        >
                            <option value="">Semua status</option>
                            <option value="SCHEDULED">Terjadwal</option>
                            <option value="IN_PROGRESS">Sedang Berlangsung</option>
                            <option value="COMPLETED">Selesai</option>
                            <option value="CANCELLED">Dibatalkan</option>
                        </select>
                    </div>
                </div>
                {hasActiveFilter && (
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-[var(--text-muted)]" aria-live="polite">
                            {loading ? "Memfilter data…" : `${scopedItems.length} hasil ditemukan${debouncedQ ? ` untuk "${debouncedQ}"` : ""}`}
                        </p>
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="text-[11px] font-bold text-[var(--primary)] min-h-9 px-2"
                        >
                            Atur Ulang Filter
                        </button>
                    </div>
                )}
            </div>

            {view === "upcoming" && (
                <div className="space-y-3">
                    {loading ? (
                        [0, 1, 2].map((i) => (
                            <div key={i} className="card p-4 animate-pulse" role="status" aria-label="Memuat meeting">
                                <div className="h-4 w-2/3 rounded bg-[var(--secondary)]" />
                                <div className="h-3 w-1/3 rounded bg-[var(--secondary)] mt-2" />
                            </div>
                        ))
                    ) : scopedItems.length === 0 ? (
                        <div className="card p-12 text-center border-dashed">
                            <p className="text-sm font-medium text-[var(--text-muted)]">
                                {hasActiveFilter || scope !== "all"
                                    ? "Tidak ada meeting mendatang yang sesuai."
                                    : "Belum ada meeting mendatang."}
                            </p>
                            {(hasActiveFilter || scope !== "all") && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        clearFilters();
                                        setScope("all");
                                    }}
                                    className="btn btn-secondary btn-sm mt-3"
                                >
                                    Tampilkan Semua Data
                                </button>
                            )}
                        </div>
                    ) : (
                        scopedItems.map((a) => {
                            const accepted = a.participants.filter((p) => p.inviteStatus === "ACCEPTED").length;
                            const isMine = myEmployeeId !== null && a.requesterEmployeeId === myEmployeeId;
                            return (
                                <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => { void openDetail(a.id); }}
                                    className="card w-full text-left p-4 hover:border-[var(--primary)]/40 transition-colors"
                                >
                                    <p className="text-[11px] font-bold text-[var(--primary)]">
                                        {formatIndonesianDate(a.startAt)} · {a.isFullDay ? "Seharian Penuh" : `${fmtTime(a.startAt)}–${fmtTime(a.endAt)}`}
                                    </p>
                                    <p className="text-sm font-bold text-[var(--text-primary)] truncate mt-1">{a.title}</p>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                                        {a.room ? a.room.name : "Daring"} · {a.participants.length} peserta · {accepted} menerima
                                        {isMine ? " · Diselenggarakan oleh Anda" : ""}
                                    </p>
                                    <span className="mt-1.5 inline-block">
                                        <AppointmentStatusBadge status={a.status} lifecycle={a.lifecycle} />
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            )}

            {view === "month" && (
                <AppointmentCalendar
                    appointmentsByDate={appointmentsByDate}
                    selectedDate={selectedDate}
                    onSelectDate={(d) => {
                        router.push(`/employee/appointments/${d}`);
                    }}
                />
            )}

            {view === "day" && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            className="form-input flex-1"
                            value={selectedDate}
                            onChange={(e) => {
                                if (!e.target.value) return;
                                setSelectedDate(e.target.value);
                                const [y, m] = e.target.value.split("-").map(Number);
                                if (y !== month.year || m - 1 !== month.month) setMonth({ year: y, month: m - 1 });
                            }}
                            aria-label="Pilih tanggal"
                        />
                    </div>

                    {loading ? (
                        <div className="card p-12 text-center">
                            <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)] mx-auto" />
                            <span className="sr-only">Memuat jadwal</span>
                        </div>
                    ) : dayItems.length === 0 ? (
                        <div className="card p-12 text-center border-dashed">
                            <p className="text-sm font-medium text-[var(--text-muted)]">
                                {hasActiveFilter
                                    ? "Tidak ada hasil untuk filter ini."
                                    : scope === "mine"
                                        ? "Belum ada meeting yang Anda selenggarakan pada tanggal ini."
                                        : scope === "invited"
                                            ? "Belum ada undangan meeting untuk Anda pada tanggal ini."
                                            : "Belum ada meeting pada tanggal ini."}
                            </p>
                            {hasActiveFilter ? (
                                <button type="button" onClick={clearFilters} className="btn btn-secondary btn-sm mt-3">
                                    Reset Filter
                                </button>
                            ) : (
                                <button type="button" onClick={() => setModal({ type: "create" })} className="btn btn-secondary btn-sm mt-3">
                                    <Plus className="w-3.5 h-3.5" /> Buat dari tanggal ini
                                </button>
                            )}
                        </div>
                    ) : (
                        dayItems.map((a) => (
                            <button
                                key={a.id}
                                type="button"
                                onClick={() => { void openDetail(a.id); }}
                                className="card w-full text-left p-4 hover:border-[var(--primary)]/40 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">{a.title}</p>
                                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                            {a.isFullDay ? "Seharian Penuh" : `${fmtTime(a.startAt)} – ${fmtTime(a.endAt)}`}
                                            {a.room ? ` · ${a.room.name}` : " · Daring"}
                                        </p>
                                    </div>
                                    <AppointmentStatusBadge status={a.status} lifecycle={a.lifecycle} />
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}

            {!loading && dayItems.length === 0 && view === "day" && loadError === null && items.length === 0 && (
                <p className="text-[11px] text-[var(--text-muted)] text-center flex items-center justify-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Catatan: ruangan dan peserta tersedia berdasarkan urutan pemesanan; perubahan jadwal hanya untuk keperluan mendesak melalui PIC.
                </p>
            )}

            {modal.type === "create" && (
                <AppointmentFormModal initialDate={selectedDate} editing={null} onClose={() => setModal({ type: "none" })} onSaved={handleSaved} />
            )}
            {editingItem && (
                <AppointmentFormModal
                    initialDate={selectedDate}
                    editing={editingItem}
                    onClose={() => setModal({ type: "none" })}
                    onSaved={handleSaved}
                />
            )}
            {detailItem && (
                <AppointmentDetailModal
                    item={detailItem}
                    canManage={myEmployeeId !== null && detailItem.requesterEmployeeId === myEmployeeId}
                    myEmployeeId={myEmployeeId}
                    onClose={() => setModal({ type: "none" })}
                    onChanged={() => {
                        setRefreshKey((k) => k + 1);
                        void openDetail(detailItem.id);
                    }}
                    onEdit={() => setModal({ type: "edit", item: detailItem })}
                />
            )}
        </div>
    );
}
