"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Ban, CalendarDays, CheckCircle2, Clock, Eye, Loader2, RefreshCw, UserCheck, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import AccessibleModal from "@/components/ui/AccessibleModal";
import { CleaningEvidencePanel } from "@/components/cleaning/CleaningEvidencePanel";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";

interface OverviewRoom {
    roomId: string;
    roomName: string;
}

interface DayParaf {
    roomName: string;
    wibDate: string;
    isFree: boolean;
    holidayDescription: string | null;
    checklist: { exists: boolean; activeCount: number; completedCount: number; unavailableCount: number; percent: number; isComplete: boolean };
    reviewers: {
        inspectedByEmployeeId: string;
        inspectedByName: string;
        knownByEmployeeId: string;
        knownByName: string;
    } | null;
    parafs: Array<{ id: string; role: "INSPECTED_BY" | "KNOWN_BY"; signerName: string; signedAt: string; status: "TEPAT" | "TERLAMBAT" }>;
    missingRoles: Array<"INSPECTED_BY" | "KNOWN_BY">;
}

interface DayChecklist {
    type: "record" | "preview" | "no_record";
    checklist?: {
        wibDate?: string;
        items: Array<{
            id: string;
            itemNameSnapshot: string;
            isActive: boolean;
            isComplete: boolean;
            isUnavailable: boolean;
            lastChangedAt: string | null;
            lastChangedBy: { displayName: string } | null;
        }>;
    };
}

function getWibToday(): string {
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Jakarta",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(new Date());
        const y = parts.find((p) => p.type === "year")?.value ?? "";
        const m = parts.find((p) => p.type === "month")?.value ?? "";
        const d = parts.find((p) => p.type === "day")?.value ?? "";
        if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
        // abaikan, fallback di bawah
    }
    return new Date().toISOString().slice(0, 10);
}

function formatWibDateLabel(dateStr: string): string {
    try {
        return new Date(`${dateStr}T00:00:00+07:00`).toLocaleDateString("id-ID", {
            timeZone: "Asia/Jakarta",
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
        });
    } catch {
        return dateStr;
    }
}

function formatTimeWib(iso: string | null): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
    } catch {
        return "";
    }
}

/** Nama tanpa gelar: "Wahyu Agus Widadi, S.Ak" → "Wahyu Agus Widadi". */
function shortName(name: string | null | undefined): string {
    if (!name) return "-";
    return name.split(",")[0].trim() || name;
}

/**
 * Halaman pantau harian untuk atasan (hanya melihat, tidak bisa mengubah).
 * Fokus memantau kondisi hari yang dipilih: daftar pekerjaan + pemeriksaan.
 * Rincian dibuka sebagai popup (AccessibleModal reuse).
 */
export default function CleaningOverviewPage() {
    const toast = useToast();
    const today = useMemo(() => getWibToday(), []);
    const [rooms, setRooms] = useState<OverviewRoom[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState(getWibToday);
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
    const [dayParaf, setDayParaf] = useState<Record<string, DayParaf | null>>({});
    const [dayChecklist, setDayChecklist] = useState<Record<string, DayChecklist | null>>({});
    const [dayError, setDayError] = useState<Record<string, string | null>>({});
    const [dayLoading, setDayLoading] = useState(false);
    const prefetchKeyRef = useRef<string | null>(null);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"ALL" | "DONE" | "WAITING" | "FREE" | "NONE">("ALL");
    const [refreshTick, setRefreshTick] = useState(0);

    const dayKey = (roomId: string, date: string) => `${roomId}:${date}`;
    const isToday = selectedDate === today;

    const fetchRooms = useCallback(async (monthWib: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/ga/cleaning/overview?monthWib=${monthWib}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat daftar ruangan."));
            const json = await res.json();
            const list = (json.data?.rooms ?? []).map((r: { roomId: string; roomName: string }) => ({
                roomId: r.roomId,
                roomName: r.roomName,
            }));
            setRooms(list);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat data.";
            setError(msg);
            setRooms([]);
            reportClientError("CleaningOverview", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchRooms(selectedDate.slice(0, 7));
    }, [selectedDate, fetchRooms]);

    const fetchDayDetail = useCallback(
        async (roomId: string, date: string, silent = false) => {
            const key = dayKey(roomId, date);
            try {
                const [parafRes, checklistRes] = await Promise.all([
                    fetch(`/api/cleaning/paraf?roomId=${roomId}&wibDate=${date}`),
                    fetch(`/api/ga/cleaning/checklists?roomId=${roomId}&date=${date}`),
                ]);
                if (parafRes.ok) {
                    const pj = await parafRes.json();
                    setDayParaf((prev) => ({ ...prev, [key]: pj.data as DayParaf }));
                } else if (!silent) {
                    const msg = await getResponseErrorMessage(parafRes, "Gagal memuat hasil pemeriksaan hari ini.");
                    setDayError((prev) => ({ ...prev, [key]: msg }));
                    toast(msg, "error");
                } else {
                    const msg = await getResponseErrorMessage(parafRes, "Gagal memuat hasil pemeriksaan hari ini.");
                    setDayError((prev) => ({ ...prev, [key]: prev[key] ? prev[key] : msg }));
                }
                if (checklistRes.ok) {
                    const cj = await checklistRes.json();
                    setDayChecklist((prev) => ({ ...prev, [key]: cj.data as DayChecklist }));
                } else if (!silent) {
                    const msg = await getResponseErrorMessage(checklistRes, "Gagal memuat daftar pekerjaan hari ini.");
                    setDayError((prev) => ({ ...prev, [key]: prev[key] ? `${prev[key]} ` : msg }));
                    toast(msg, "error");
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Gagal memuat rincian hari ini.";
                setDayError((prev) => ({ ...prev, [key]: msg }));
                if (!silent) toast(msg, "error");
            }
        },
        [toast]
    );

    // Muat rincian semua ruangan untuk tanggal yang dipilih agar ringkasan hari ini lengkap.
    // Dibatalkan bila tanggal berganti agar batch basi tidak menimpa indikator.
    useEffect(() => {
        if (rooms.length === 0) return;
        const key = `${selectedDate}:${rooms.map((r) => r.roomId).join(",")}:${refreshTick}`;
        if (prefetchKeyRef.current === key) return;
        prefetchKeyRef.current = key;
        const controller = new AbortController();
        (async () => {
            setDayLoading(true);
            await Promise.allSettled(
                rooms.map((room) => {
                    if (controller.signal.aborted) return Promise.resolve();
                    return fetchDayDetail(room.roomId, selectedDate, true);
                })
            );
            if (!controller.signal.aborted) setDayLoading(false);
        })();
        return () => {
            controller.abort();
        };
    }, [rooms, selectedDate, fetchDayDetail, refreshTick]);

    const handleRefresh = useCallback(() => {
        prefetchKeyRef.current = null;
        setRefreshTick((t) => t + 1);
        void fetchRooms(selectedDate.slice(0, 7));
    }, [fetchRooms, selectedDate]);

    const openRoomDetail = useCallback(
        (roomId: string) => {
            setActiveRoomId(roomId);
            const key = dayKey(roomId, selectedDate);
            if (!dayParaf[key] || !dayChecklist[key]) {
                void fetchDayDetail(roomId, selectedDate);
            }
        },
        [selectedDate, dayParaf, dayChecklist, fetchDayDetail]
    );

    const todaySummary = useMemo(() => {
        let beres = 0;
        let dikerjakan = 0;
        let libur = 0;
        let belumAda = 0;
        let sudahDiperiksa = 0;
        let menungguDiperiksa = 0;
        let loaded = 0;
        for (const r of rooms) {
            const key = dayKey(r.roomId, selectedDate);
            const day = dayParaf[key];
            const detail = dayChecklist[key];
            if (!day && (!detail || detail.type !== "record")) continue;
            loaded += 1;
            if (day?.isFree) {
                libur += 1;
                continue;
            }
            const isComplete = day?.checklist.isComplete ?? false;
            const hasRecord = day?.checklist.exists || detail?.type === "record";
            if (!hasRecord) {
                belumAda += 1;
                continue;
            }
            if (isComplete) beres += 1;
            else dikerjakan += 1;
            sudahDiperiksa += day?.parafs.length ?? 0;
            menungguDiperiksa += day?.missingRoles.length ?? 0;
        }
        return { beres, dikerjakan, libur, belumAda, sudahDiperiksa, menungguDiperiksa, loaded, total: rooms.length };
    }, [rooms, dayParaf, dayChecklist, selectedDate]);

    const activeRoom = activeRoomId ? (rooms.find((r) => r.roomId === activeRoomId) ?? null) : null;
    const activeKey = activeRoomId ? dayKey(activeRoomId, selectedDate) : "";
    const activeDay = activeKey && dayParaf[activeKey]?.wibDate === selectedDate ? dayParaf[activeKey] : undefined;
    const activeDetailRaw = activeKey ? dayChecklist[activeKey] : undefined;
    const activeDetail =
        activeDetailRaw && (activeDetailRaw.type !== "record" || activeDetailRaw.checklist?.wibDate === selectedDate)
            ? activeDetailRaw
            : undefined;
    const activeItems =
        activeDetail?.type === "record" ? (activeDetail.checklist?.items.filter((i) => i.isActive) ?? []) : [];
    const activeSelesai = activeItems.filter((i) => i.isComplete).length;
    const activeTidakAda = activeItems.filter((i) => i.isUnavailable).length;

    const visibleRooms = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rooms.filter((room) => {
            if (q && !room.roomName.toLowerCase().includes(q)) return false;
            if (statusFilter === "ALL") return true;
            const key = dayKey(room.roomId, selectedDate);
            const day = dayParaf[key]?.wibDate === selectedDate ? dayParaf[key] : undefined;
            const detailRaw = dayChecklist[key];
            const hasRecord =
                !!day?.checklist.exists || detailRaw?.type === "record";
            if (statusFilter === "FREE") return !!day?.isFree;
            if (statusFilter === "NONE") return !day?.isFree && !hasRecord;
            if (!hasRecord || day?.isFree) return false;
            const complete = day?.checklist.isComplete ?? false;
            if (statusFilter === "DONE") return complete && (day?.missingRoles.length ?? 0) === 0;
            if (statusFilter === "WAITING") return !complete || (day?.missingRoles.length ?? 0) > 0;
            return true;
        });
    }, [rooms, query, statusFilter, dayParaf, dayChecklist, selectedDate]);

    return (
        <div className="mx-auto px-4 py-6">
            <div className="flex items-start justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Pantau Kebersihan Ruangan</h1>
                    <p className="text-sm text-[var(--text-muted)] mt-0.5">
                        Pantau kerja kebersihan bawahan: ruangan, progres, dan pemeriksaan.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-sm font-medium border border-[var(--border)] rounded-md hover:bg-[var(--secondary)] disabled:opacity-50 shrink-0"
                >
                    <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
                </button>
            </div>

            {/* ===== PANTAU HARIAN ===== */}
            <section aria-label="Kondisi hari ini" className="mb-8">
                <div className="card p-4 mb-4">
                    <EquipmentSearchField
                        id="cari-ruangan"
                        label="Cari ruangan"
                        value={query}
                        onChange={setQuery}
                        placeholder="Cari nama ruangan..."
                    />
                    <div className="flex gap-2 mt-2 overflow-x-auto pb-1" role="group" aria-label="Filter status ruangan">
                        {(
                            [
                                ["ALL", "Semua"],
                                ["DONE", "Beres"],
                                ["WAITING", "Menunggu periksa"],
                                ["FREE", "Libur"],
                                ["NONE", "Belum ada data"],
                            ] as Array<[typeof statusFilter, string]>
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setStatusFilter(key)}
                                aria-pressed={statusFilter === key}
                                className={`shrink-0 px-3 min-h-[44px] inline-flex items-center text-sm font-medium rounded-full border transition-colors ${
                                    statusFilter === key
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--secondary)]"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4 mt-3">
                        <div>
                            <h2 className="text-base font-bold text-[var(--text-primary)]">
                                {isToday ? "Hari ini" : "Tanggal yang dipilih"} — {formatWibDateLabel(selectedDate)}
                            </h2>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                Pilih tanggal lain untuk melihat hari sebelumnya. Data terbaru sampai hari ini.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <CalendarDays aria-hidden="true" className="h-4 w-4 text-[var(--text-muted)]" />
                            <label htmlFor="pantau-tanggal" className="sr-only">Pilih tanggal</label>
                            <input
                                id="pantau-tanggal"
                                type="date"
                                value={selectedDate}
                                max={today}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        setSelectedDate(e.target.value);
                                        setActiveRoomId(null);
                                    }
                                }}
                                className="form-input !w-auto text-sm font-semibold text-center min-h-[44px]"
                            />
                        </div>
                    </div>
                    {!loading && !error && rooms.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                            {(
                                [
                                    ["Beres", todaySummary.beres],
                                    ["Dikerjakan", todaySummary.dikerjakan],
                                    ["Menunggu", todaySummary.menungguDiperiksa],
                                    ["Libur", todaySummary.libur],
                                ] as [string, number][]
                            ).map(([label, value]) => (
                                <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-center">
                                    <p className="text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{label}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                    </div>
                )}
                {error && !loading && (
                    <div className="mb-4 p-4 bg-[var(--destructive-bg)] text-[var(--destructive)] rounded-xl border border-[var(--destructive-border)] text-center">
                        <AlertTriangle className="h-5 w-5 mx-auto mb-2" />
                        <p className="text-sm">{error}</p>
                    </div>
                )}
                {!loading && !error && rooms.length === 0 && (
                    <div className="text-center py-10 border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--card)]">
                        <p className="text-sm text-[var(--text-muted)]">Belum ada ruangan aktif.</p>
                    </div>
                )}

                {!loading &&
                    !error &&
                    visibleRooms.map((room) => {
                        const key = dayKey(room.roomId, selectedDate);
                        const day = dayParaf[key]?.wibDate === selectedDate ? dayParaf[key] : undefined;
                        const detailRaw = dayChecklist[key];
                        const detail =
                            detailRaw && (detailRaw.type !== "record" || detailRaw.checklist?.wibDate === selectedDate)
                                ? detailRaw
                                : undefined;
                        const items = detail?.type === "record" ? (detail.checklist?.items.filter((i) => i.isActive) ?? []) : [];
                        const selesaiCount = items.filter((i) => i.isComplete).length;
                        const tidakAdaCount = items.filter((i) => i.isUnavailable).length;
                        const kurangCount = items.length - selesaiCount - tidakAdaCount;

                        let statusBadge = "Belum ada data";
                        let badgeClass = "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
                        let dotClass = "bg-gray-300 dark:bg-gray-600";
                        if (day?.isFree) {
                            statusBadge = "Libur";
                        } else if (day && detail?.type === "record") {
                            if (day.checklist.isComplete && day.missingRoles.length === 0) {
                                statusBadge = "Sudah beres dan sudah diperiksa";
                                badgeClass = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
                                dotClass = "bg-green-500";
                            } else if (day.checklist.isComplete) {
                                statusBadge = "Sudah beres, menunggu pemeriksaan";
                                badgeClass = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
                                dotClass = "bg-amber-500";
                            } else if (kurangCount > 0) {
                                statusBadge = `Kurang ${kurangCount} pekerjaan`;
                                badgeClass = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
                                dotClass = "bg-amber-500";
                            } else {
                                statusBadge = "Belum dikerjakan";
                            }
                        } else if (dayLoading) {
                            statusBadge = "Memuat…";
                        }

                        return (
                            <div key={room.roomId} className="card p-4 mb-3">
                                <div className="flex items-start gap-2.5">
                                    <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-base font-bold text-[var(--text-primary)] truncate">{room.roomName}</h3>
                                        <p className="mt-1">
                                            <span
                                                className={`inline-flex items-center font-bold px-2 py-0.5 rounded-full text-xs ${badgeClass}`}
                                            >
                                                {statusBadge}
                                            </span>
                                        </p>
                                        <p className="text-xs text-[var(--text-muted)] mt-1">
                                            {day?.isFree
                                                ? "Hari libur, tidak perlu pemeriksaan."
                                                : day && detail?.type === "record"
                                                  ? `${selesaiCount} dari ${items.length - tidakAdaCount} pekerjaan sudah selesai${tidakAdaCount > 0 ? ` · ${tidakAdaCount} tidak ada di ruangan` : ""} · Pemeriksaan: sudah ${day.parafs.length}, menunggu ${day.missingRoles.length}`
                                                  : "Buka rincian untuk melihat daftar pekerjaan dan pemeriksaan."}
                                        </p>
                                    </div>
                                    <span className="inline-flex items-center gap-1 text-xs text-primary shrink-0 mt-1" aria-hidden="true">
                                        <Eye className="h-3.5 w-3.5" /> Rincian
                                    </span>
                                </div>
                                <button
                                    onClick={() => openRoomDetail(room.roomId)}
                                    className="btn btn-secondary mt-3 w-full min-h-[48px]"
                                    type="button"
                                >
                                    Lihat rincian
                                </button>
                            </div>
                        );
                    })}
                {rooms.length > 0 && visibleRooms.length === 0 && (
                    <p className="text-center text-muted-foreground py-6 text-sm">
                        Tidak ketemu. Coba kata kunci atau filter lain.
                    </p>
                )}
            </section>

            {activeRoom && (
                <AccessibleModal
                    ariaLabel={`Rincian ${activeRoom.roomName}`}
                    onClose={() => setActiveRoomId(null)}
                    className="!max-w-2xl"
                >
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">
                                {activeRoom.roomName} · {formatWibDateLabel(selectedDate)}
                            </h2>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                {activeDay?.isFree
                                    ? "Hari libur, tidak perlu pemeriksaan."
                                    : activeDetail?.type === "record"
                                      ? `${activeSelesai} dari ${activeItems.length} pekerjaan sudah selesai · Pemeriksaan: sudah ${activeDay?.parafs.length ?? 0}, menunggu ${activeDay?.missingRoles.length ?? 0}`
                                      : "Memuat rincian…"}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => setActiveRoomId(null)}
                            aria-label="Tutup rincian"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {dayError[activeKey] && !activeDay && !activeDetail ? (
                        <p className="text-xs text-[var(--destructive)]">
                            {dayError[activeKey]} Coba tutup lalu buka lagi.
                        </p>
                    ) : !activeDay && !activeDetail ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
                        </div>
                    ) : activeDay?.isFree ? (
                        <p className="text-sm text-[var(--text-muted)]">
                            Hari libur{activeDay.holidayDescription ? `: ${activeDay.holidayDescription}` : ""}. Tidak perlu
                            pemeriksaan.
                        </p>
                    ) : (
                        <div className="space-y-5">
                            <div>
                                <p className="text-sm font-bold text-[var(--text-primary)] mb-1.5">
                                    Pemeriksaan atasan (sudah {activeDay?.parafs.length ?? 0}, menunggu{" "}
                                    {activeDay?.missingRoles.length ?? 0})
                                </p>
                                {(activeDay?.parafs.length ?? 0) === 0 && (
                                    <p className="text-xs text-[var(--text-muted)]">Belum ada yang memeriksa hari ini.</p>
                                )}
                                <div className="space-y-1.5">
                                    {(activeDay?.parafs ?? []).map((s) => (
                                        <div
                                            key={s.id}
                                            className="flex items-center justify-between gap-2 text-xs border border-[var(--border)] rounded-lg px-3 py-2"
                                        >
                                            <span className="font-medium text-[var(--text-primary)]">
                                                {shortName(s.signerName)} · jam {formatTimeWib(s.signedAt)}
                                            </span>
                                            <span
                                                className={`shrink-0 inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full ${
                                                    s.status === "TERLAMBAT"
                                                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                                        : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                }`}
                                            >
                                                {s.status === "TERLAMBAT" ? "Terlambat" : "Tepat waktu"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                {(activeDay?.missingRoles.length ?? 0) > 0 && (
                                    <p className="text-xs text-[var(--text-muted)] mt-1.5">
                                        Menunggu:{" "}
                                        {(activeDay?.missingRoles ?? [])
                                            .map((role) =>
                                                shortName(
                                                    activeDay?.reviewers
                                                        ? role === "INSPECTED_BY"
                                                            ? activeDay.reviewers.inspectedByName
                                                            : activeDay.reviewers.knownByName
                                                        : role === "INSPECTED_BY"
                                                          ? "Pemeriksa pertama"
                                                          : "Pemeriksa kedua"
                                                )
                                            )
                                            .join(", ")}
                                    </p>
                                )}
                                {activeDay?.reviewers ? (
                                    <p className="text-xs text-[var(--text-muted)] mt-1">
                                        Pemeriksa hari ini: {shortName(activeDay.reviewers.inspectedByName)} dan{" "}
                                        {shortName(activeDay.reviewers.knownByName)}.
                                    </p>
                                ) : (
                                    <p className="text-xs text-[var(--text-muted)] mt-1">Pemeriksa hari ini belum ditentukan.</p>
                                )}
                            </div>
                            <div className="border-t border-[var(--border)] pt-3">
                                <p className="text-sm font-bold text-[var(--text-primary)] mb-1.5">
                                    Daftar pekerjaan ({activeSelesai} dari {activeItems.length - activeTidakAda} selesai
                                    {activeTidakAda > 0 ? ` · ${activeTidakAda} tidak ada di ruangan` : ""})
                                </p>
                                {activeDetail?.type === "record" && activeItems.length > 0 ? (
                                    <div className="space-y-1.5">
                                        {activeItems.map((item) => (
                                            <div key={item.id} className="flex items-start gap-2 text-xs">
                                                {item.isUnavailable ? (
                                                    <Ban className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                                ) : item.isComplete ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                                ) : (
                                                    <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p
                                                        className={
                                                            item.isComplete && !item.isUnavailable ? "line-through text-muted-foreground" : "text-foreground"
                                                        }
                                                    >
                                                        {item.itemNameSnapshot} —{" "}
                                                        {item.isUnavailable ? "tidak ada di ruangan" : item.isComplete ? "sudah dikerjakan" : "belum dikerjakan"}
                                                    </p>
                                                    <p className="text-muted-foreground">
                                                        {item.lastChangedBy
                                                            ? `Oleh ${item.lastChangedBy.displayName} · jam ${formatTimeWib(item.lastChangedAt)}`
                                                            : "Belum ada yang mengerjakan"}
                                                    </p>
                                                    <div className="mt-1.5">
                                                        <CleaningEvidencePanel checklistItemId={item.id} collapsible />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-[var(--text-muted)]">
                                        <UserCheck className="h-3.5 w-3.5 inline mr-1" />
                                        Belum ada data kebersihan untuk tanggal ini.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </AccessibleModal>
            )}
        </div>
    );
}
