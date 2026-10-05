"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Clock,
    FileCheck2,
    X,
    PenTool,
    ShieldAlert,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { CleaningEvidencePanel } from "@/components/cleaning/CleaningEvidencePanel";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import SignaturePad from "@/components/ui/SignaturePad";
import AccessibleModal from "@/components/ui/AccessibleModal";

interface EmployeeApprovalTask {
    approvalId: string;
    roomId: string;
    roomName: string;
    monthWib: string;
    role: "INSPECTED_BY" | "KNOWN_BY";
    roleLabel: string;
    isSigned: boolean;
    signedAt: string | null;
    derivedStatus: "WAITING_FOR_SIGNATURES" | "PARTIALLY_SIGNED" | "COMPLETE";
    hasChangedAfterSigning: boolean;
    latestChange: { timestamp: string; actorName: string | null } | null;
    isSignable?: boolean;
    opensOnWibDate?: string;
}

interface DetailTaskModalData {
    id: string;
    roomId: string;
    roomName: string;
    monthWib: string;
    dates: string[];
    days: Array<{
        date: string;
        status: "SELESAI" | "BELUM" | "FUTURE" | "LIBUR";
        activeCount: number;
        completedCount: number;
    }>;
    inspectedByEmployeeName: string;
    knownByEmployeeName: string;
    userRoles: Array<{
        role: "INSPECTED_BY" | "KNOWN_BY";
        roleLabel: string;
        isSigned: boolean;
        signature: {
            id: string;
            version: number;
            signedAt: string;
            signaturePayload: string;
            hasChangedAfter: boolean;
        } | null;
    }>;
    derivedStatus: "WAITING_FOR_SIGNATURES" | "PARTIALLY_SIGNED" | "COMPLETE";
    latestChange: { timestamp: string; actorName: string | null } | null;
    signable?: { isSignable: boolean; opensOnWibDate: string; wibToday: string };
}

function formatOpensOnShort(wibDate: string | undefined): string {
    if (!wibDate) return "";
    const [y, m, d] = wibDate.split("-").map(Number);
    const short = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    if (!y || !m || !d || m < 1 || m > 12) return wibDate;
    return `${d} ${short[m - 1]} ${y}`;
}

function getCurrentMonth(): string {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value ?? "2026";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    return `${year}-${month}`;
}

function formatMonthLabel(monthStr: string): string {
    const [y, m] = monthStr.split("-");
    const months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function shiftMonth(monthStr: string, delta: number): string {
    const [y, m] = monthStr.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(isoString: string | null | undefined): string {
    if (!isoString) return "-";
    const d = new Date(isoString);
    return d.toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }) + " WIB";
}

// ─── Paraf Harian reviewer (dashboard employee bos) ─────────────────────
// Kontrak GET /api/cleaning/paraf?roomId=&wibDate= (reviewer-self guard):
// 200 bila WIG002 atau employee-self yang terdaftar sebagai reviewer bulan
// berjalan; 403 bila bukan reviewer; 404 bila ruangan hilang. POST
// /api/cleaning/paraf {roomId, wibDate, idempotencyKey?} (+ header
// x-idempotency-key) memaraf sebagai diri sendiri; status TEPAT bila WIB
// hari ini <= wibDate, TERLAMBAT bila lewat tengah malam WIB. Kunci: isFree
// (Sabtu/Minggu/libur) 422, checklist belum 100% 409, duplikat peran 409.

type DailyParafRole = "INSPECTED_BY" | "KNOWN_BY";

interface DailyParafStatus {
    roomId: string;
    roomName: string;
    wibDate: string;
    monthWib: string;
    isWeekend: boolean;
    isHoliday: boolean;
    isFree: boolean;
    holidayDescription: string | null;
    checklist: {
        exists: boolean;
        activeCount: number;
        completedCount: number;
        percent: number;
        isComplete: boolean;
    };
    reviewers: {
        inspectedByEmployeeId: string;
        inspectedByName: string;
        knownByEmployeeId: string;
        knownByName: string;
    } | null;
    parafs: Array<{
        id: string;
        role: DailyParafRole;
        signerEmployeeId: string;
        signerName: string;
        signedAt: string;
        status: "TEPAT" | "TERLAMBAT";
    }>;
    missingRoles: DailyParafRole[];
}

interface DailyChecklistDetail {
    type: "record" | "preview" | "no_record";
    checklist?: {
        id: string;
        wibDate: string;
        roomNameSnapshot: string;
        derivedStatus: "SELESAI" | "BELUM";
        items: {
            id: string;
            itemNameSnapshot: string;
            isActive: boolean;
            isComplete: boolean;
            lastChangedAt: string | null;
            lastChangedBy: { id: string; displayName: string } | null;
        }[];
    };
    preview?: {
        roomName: string;
        date: string;
        templateName: string;
        items: { name: string; sortOrder: number }[];
    };
    message?: string;
}

function dailyRoleLabel(role: DailyParafRole): string {
    return role === "INSPECTED_BY" ? "Diperiksa Oleh" : "Mengetahui";
}

function reviewerNameFor(paraf: DailyParafStatus, role: DailyParafRole): string {
    if (!paraf.reviewers) return dailyRoleLabel(role);
    const fallbackId = role === "INSPECTED_BY" ? paraf.reviewers.inspectedByEmployeeId : paraf.reviewers.knownByEmployeeId;
    const name =
        (role === "INSPECTED_BY" ? paraf.reviewers.inspectedByName : paraf.reviewers.knownByName) || fallbackId;
    return `${name} (${dailyRoleLabel(role)})`;
}

function getWibToday(): string {
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Jakarta",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(new Date());
        const year = parts.find((p) => p.type === "year")?.value ?? "";
        const monthPart = parts.find((p) => p.type === "month")?.value ?? "";
        const day = parts.find((p) => p.type === "day")?.value ?? "";
        if (year && monthPart && day) return `${year}-${monthPart}-${day}`;
    } catch {
        // abaikan, fallback di bawah
    }
    return new Date().toISOString().slice(0, 10);
}

function shiftWibDate(dateStr: string, delta: number): string {
    const d = new Date(`${dateStr}T00:00:00+07:00`);
    d.setDate(d.getDate() + delta);
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(d);
    const year = parts.find((p) => p.type === "year")?.value ?? dateStr.slice(0, 4);
    const monthPart = parts.find((p) => p.type === "month")?.value ?? dateStr.slice(5, 7);
    const day = parts.find((p) => p.type === "day")?.value ?? dateStr.slice(8, 10);
    return `${year}-${monthPart}-${day}`;
}

function formatWibDateLabel(dateStr: string): string {
    try {
        return new Date(`${dateStr}T00:00:00+07:00`).toLocaleDateString("id-ID", {
            timeZone: "Asia/Jakarta",
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    } catch {
        return dateStr;
    }
}

function formatTimeWib(iso: string | null): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Jakarta",
        });
    } catch {
        return "";
    }
}

function DailyParafSection() {
    const toast = useToast();
    const [selectedDate, setSelectedDate] = useState(getWibToday);
    const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
    const [rooms, setRooms] = useState<Array<{ roomId: string; roomName: string }>>([]);
    const [roomsLoading, setRoomsLoading] = useState(true);
    const [roomsError, setRoomsError] = useState<string | null>(null);
    const [parafMap, setParafMap] = useState<Record<string, DailyParafStatus>>({});
    const [parafLoading, setParafLoading] = useState(false);
    const [dailyFilter, setDailyFilter] = useState<"ALL" | "PENDING" | "SIGNED">("ALL");

    // Detail modal (checklist + foto + paraf kedua peran + konfirmasi)
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
    const [detailParaf, setDetailParaf] = useState<DailyParafStatus | null>(null);
    const [detailChecklist, setDetailChecklist] = useState<DailyChecklistDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [signing, setSigning] = useState(false);
    const [idempotencyKey, setIdempotencyKey] = useState("");

    const dailyMonth = selectedDate.slice(0, 7);
    const wibToday = getWibToday();
    const canGoNextDay = selectedDate < wibToday;

    const fetchRooms = useCallback(async (monthWib: string) => {
        setRoomsLoading(true);
        setRoomsError(null);
        try {
            const res = await fetch(`/api/employee/cleaning/approvals?monthWib=${monthWib}&limit=100`);
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat ruangan paraf harian."));
            }
            const json = await res.json();
            const list: EmployeeApprovalTask[] = json.data || [];
            const seen = new Map<string, string>();
            for (const t of list) {
                if (!seen.has(t.roomId)) seen.set(t.roomId, t.roomName);
            }
            setRooms(Array.from(seen.entries()).map(([roomId, roomName]) => ({ roomId, roomName })));
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat ruangan.";
            setRoomsError(msg);
            setRooms([]);
            reportClientError("EmployeeDailyParafRooms", msg, err);
        } finally {
            setRoomsLoading(false);
        }
    }, []);

    const parafCache = useRef<Record<string, Record<string, DailyParafStatus>>>({});
    const parafAbort = useRef<AbortController | null>(null);

    const fetchParafs = useCallback(
        async (roomList: Array<{ roomId: string }>, wibDate: string) => {
            if (roomList.length === 0) {
                setParafMap({});
                return;
            }
            const cached = parafCache.current[wibDate];
            if (cached && roomList.every((r) => cached[r.roomId])) {
                setParafMap(cached);
                return;
            }
            parafAbort.current?.abort();
            const controller = new AbortController();
            parafAbort.current = controller;
            setParafLoading(true);
            try {
                const settled = await Promise.allSettled(
                    roomList.map(async (r) => {
                        const res = await fetch(`/api/cleaning/paraf?roomId=${r.roomId}&wibDate=${wibDate}`, {
                            signal: controller.signal,
                        });
                        if (!res.ok) {
                            throw new Error(await getResponseErrorMessage(res, "Gagal memuat status paraf."));
                        }
                        const json = await res.json();
                        return json.data as DailyParafStatus;
                    })
                );
                if (controller.signal.aborted) return;
                const next: Record<string, DailyParafStatus> = {};
                settled.forEach((s, idx) => {
                    if (s.status === "fulfilled" && s.value) {
                        next[roomList[idx].roomId] = s.value;
                    }
                });
                parafCache.current[wibDate] = next;
                setParafMap(next);
            } finally {
                if (!controller.signal.aborted) setParafLoading(false);
            }
        },
        []
    );

    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch("/api/auth/me");
                if (res.ok) {
                    const json = await res.json();
                    if (typeof json.employeeId === "string" && json.employeeId) {
                        setMyEmployeeId(json.employeeId);
                    }
                }
            } catch {
                // Abaikan: fallback ke tampilan semua peran tertunda.
            }
        })();
    }, []);

    useEffect(() => {
        void fetchRooms(dailyMonth);
    }, [dailyMonth, fetchRooms]);

    useEffect(() => {
        void fetchParafs(rooms, selectedDate);
    }, [rooms, selectedDate, fetchParafs]);

    const myRoleFor = useCallback(
        (paraf: DailyParafStatus | null): DailyParafRole | null => {
            if (!paraf?.reviewers || !myEmployeeId) return null;
            if (paraf.reviewers.inspectedByEmployeeId === myEmployeeId) return "INSPECTED_BY";
            if (paraf.reviewers.knownByEmployeeId === myEmployeeId) return "KNOWN_BY";
            return null;
        },
        [myEmployeeId]
    );

    const openDetail = useCallback(
        async (roomId: string) => {
            const cached = parafMap[roomId] ?? null;
            setActiveRoomId(roomId);
            setDetailParaf(cached);
            setDetailChecklist(null);
            setDetailLoading(true);
            setIdempotencyKey(`idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
            try {
                const cachedParaf = parafCache.current[selectedDate]?.[roomId] ?? null;
                const [parafRes, checklistRes] = await Promise.all([
                    cachedParaf
                        ? null
                        : fetch(`/api/cleaning/paraf?roomId=${roomId}&wibDate=${selectedDate}`),
                    fetch(`/api/ga/cleaning/checklists?roomId=${roomId}&date=${selectedDate}`),
                ]);
                if (cachedParaf) {
                    setDetailParaf(cachedParaf);
                    setParafMap((prev) => ({ ...prev, [roomId]: cachedParaf }));
                }
                if (parafRes && parafRes.ok) {
                    const pj = await parafRes.json();
                    const fresh = pj.data as DailyParafStatus;
                    setDetailParaf(fresh);
                    setParafMap((prev) => ({ ...prev, [roomId]: fresh }));
                    parafCache.current[selectedDate] = {
                        ...(parafCache.current[selectedDate] ?? {}),
                        [roomId]: fresh,
                    };
                }
                if (checklistRes.ok) {
                    const cj = await checklistRes.json();
                    setDetailChecklist(cj.data as DailyChecklistDetail);
                } else {
                    const msg = await getResponseErrorMessage(checklistRes, "Gagal memuat detail checklist.");
                    toast(msg, "error");
                }
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal memuat detail.", "error");
            } finally {
                setDetailLoading(false);
            }
        },
        [parafMap, selectedDate, toast]
    );

    const handleConfirmParaf = useCallback(async () => {
        if (!activeRoomId) return;
        setSigning(true);
        try {
            const res = await fetch("/api/cleaning/paraf", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-idempotency-key": idempotencyKey,
                },
                body: JSON.stringify({
                    roomId: activeRoomId,
                    wibDate: selectedDate,
                    idempotencyKey,
                }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan paraf."));
            }
            toast("Paraf harian berhasil disimpan.", "success");
            const refresh = await fetch(`/api/cleaning/paraf?roomId=${activeRoomId}&wibDate=${selectedDate}`);
            if (refresh.ok) {
                const json = await refresh.json();
                const updated = json.data as DailyParafStatus;
                setDetailParaf(updated);
                setParafMap((prev) => ({ ...prev, [activeRoomId]: updated }));
                parafCache.current[selectedDate] = {
                    ...(parafCache.current[selectedDate] ?? {}),
                    [activeRoomId]: updated,
                };
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal menyimpan paraf.";
            toast(msg, "error");
            reportClientError("EmployeeDailyParafSign", msg, err);
        } finally {
            setSigning(false);
        }
    }, [activeRoomId, idempotencyKey, selectedDate, toast]);

    const visibleRooms = rooms.filter((r) => parafMap[r.roomId]);
    const filteredRooms = visibleRooms.filter((r) => {
        const p = parafMap[r.roomId];
        if (dailyFilter === "PENDING") return !p.isFree && p.missingRoles.length > 0;
        if (dailyFilter === "SIGNED") return p.parafs.length > 0;
        return true;
    });
    const myHistory = visibleRooms
        .flatMap((r) => {
            const p = parafMap[r.roomId];
            return p.parafs
                .filter((s) => (myEmployeeId ? s.signerEmployeeId === myEmployeeId : true))
                .map((s) => ({ roomName: p.roomName, wibDate: p.wibDate, ...s }));
        })
        .sort((a, b) => (a.signedAt < b.signedAt ? 1 : -1));

    return (
        <div>
            <div className="card p-4 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSelectedDate((d) => shiftWibDate(d, -1))}
                            className="btn btn-secondary !p-2"
                            title="Tanggal sebelumnya"
                            type="button"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <input
                            type="date"
                            value={selectedDate}
                            max={wibToday}
                            onChange={(e) => {
                                if (e.target.value) setSelectedDate(e.target.value);
                            }}
                            className="form-input !w-auto text-sm font-semibold text-center"
                            aria-label="Tanggal paraf harian"
                        />
                        <button
                            onClick={() => canGoNextDay && setSelectedDate((d) => shiftWibDate(d, 1))}
                            disabled={!canGoNextDay}
                            className="btn btn-secondary !p-2 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Tanggal berikutnya"
                            type="button"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setSelectedDate(getWibToday())}
                            className="btn btn-secondary btn-sm"
                            type="button"
                        >
                            Hari ini
                        </button>
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">{formatWibDateLabel(selectedDate)}</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                    {(["ALL", "PENDING", "SIGNED"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setDailyFilter(f)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                dailyFilter === f ? "bg-[var(--primary)] text-white" : "btn btn-secondary !p-1.5"
                            }`}
                            type="button"
                        >
                            {f === "ALL" ? "Semua" : f === "PENDING" ? "Menunggu Paraf Saya" : "Riwayat Saya"}
                        </button>
                    ))}
                </div>
            </div>

            {(roomsLoading || parafLoading) && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                </div>
            )}

            {roomsError && !roomsLoading && (
                <div className="mb-6 p-4 bg-[var(--destructive-bg)] text-[var(--destructive)] rounded-xl border border-[var(--destructive-border)] text-center">
                    <AlertTriangle className="h-5 w-5 mx-auto mb-2" />
                    <p className="text-sm">{roomsError}</p>
                </div>
            )}

            {!roomsLoading && !parafLoading && !roomsError && filteredRooms.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--card)]">
                    <FileCheck2 className="h-10 w-10 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
                    <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Tidak Ada Paraf Harian</h3>
                    <p className="text-sm text-[var(--text-muted)] max-w-sm mx-auto">
                        Tidak ada ruangan-tanggal yang menunggu paraf Anda pada {formatWibDateLabel(selectedDate)}.
                    </p>
                </div>
            )}

            {!roomsLoading && !parafLoading && filteredRooms.length > 0 && (
                <div className="space-y-4" data-testid="paraf-harian-list">
                    {filteredRooms.map((r) => {
                        const p = parafMap[r.roomId];
                        const myRole = myRoleFor(p);
                        const myPending = myRole ? p.missingRoles.includes(myRole) : p.missingRoles.length > 0;
                        return (
                            <div key={r.roomId} className="card p-5" data-testid={`paraf-harian-item-${r.roomId}`}>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                                    <div>
                                        <h3 className="text-base font-bold text-[var(--text-primary)]">{p.roomName}</h3>
                                        <p className="text-xs text-[var(--text-muted)]">{formatWibDateLabel(p.wibDate)}</p>
                                    </div>
                                    <div>
                                        {p.isFree ? (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--secondary)] text-[var(--text-muted)] border border-[var(--border)]">
                                                Bebas paraf{p.isHoliday && p.holidayDescription ? ` · ${p.holidayDescription}` : " · Hari libur"}
                                            </span>
                                        ) : p.missingRoles.length === 0 ? (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)]">
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Lengkap
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning-border)]">
                                                <Clock className="h-3.5 w-3.5" /> Menunggu paraf
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-[var(--text-muted)] mb-2">
                                    Checklist {p.checklist.percent}% ({p.checklist.completedCount}/{p.checklist.activeCount})
                                    {p.reviewers ? ` · Diperiksa oleh ${p.reviewers.inspectedByName ?? p.reviewers.inspectedByEmployeeId}, diketahui ${p.reviewers.knownByName ?? p.reviewers.knownByEmployeeId}` : " · Atasan pemeriksa bulan ini belum ditentukan"}
                                    {myRole ? ` · Tugas Anda: ${dailyRoleLabel(myRole)}` : ""}
                                </p>
                                {p.parafs.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {p.parafs.map((s) => (
                                            <span
                                                key={s.id}
                                                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                                                    s.status === "TERLAMBAT"
                                                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                                        : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                }`}
                                            >
                                                {dailyRoleLabel(s.role)}: {s.status === "TERLAMBAT" ? "Terlambat" : "Tepat waktu"} · {s.signerName}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {!p.checklist.isComplete && !p.isFree && (
                                    <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
                                        Paraf dikunci hingga checklist 100% selesai.
                                    </p>
                                )}
                                <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                                    <span className="text-xs text-[var(--text-muted)]">
                                        {myRole && !myPending && p.parafs.length > 0
                                            ? "Anda sudah memaraf tanggal ini"
                                            : "Tanda tangan harian diperlukan"}
                                    </span>
                                    <button onClick={() => void openDetail(r.roomId)} className="btn btn-sm btn-primary" type="button">
                                        <PenTool className="h-3.5 w-3.5" /> Lihat Detail &amp; Paraf
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {!roomsLoading && !parafLoading && myHistory.length > 0 && (
                <div className="mt-8">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] mb-3">Riwayat paraf saya</h2>
                    <div className="space-y-2">
                        {myHistory.map((h) => (
                            <div key={h.id} className="card px-4 py-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                        {h.roomName} · {formatWibDateLabel(h.wibDate)}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        {dailyRoleLabel(h.role)} · {h.signerName} · {formatDateTime(h.signedAt)}
                                    </p>
                                </div>
                                <span
                                    className={`shrink-0 inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                                        h.status === "TERLAMBAT"
                                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                            : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                    }`}
                                >
                                    {h.status === "TERLAMBAT" ? "Terlambat" : "Tepat waktu"}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeRoomId && (
                <AccessibleModal ariaLabel="Detail dan paraf harian" onClose={() => setActiveRoomId(null)} className="!max-w-2xl !p-6">
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">
                                {detailParaf ? `${detailParaf.roomName} · ${formatWibDateLabel(detailParaf.wibDate)}` : "Memuat..."}
                            </h2>
                            {detailParaf && (
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                    Checklist {detailParaf.checklist.percent}% ({detailParaf.checklist.completedCount}/{detailParaf.checklist.activeCount})
                                </p>
                            )}
                        </div>
                        <button type="button" className="modal-close" onClick={() => setActiveRoomId(null)} aria-label="Tutup modal">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {detailLoading && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                        </div>
                    )}

                    {!detailLoading && detailParaf && (
                        <div className="space-y-5">
                            {detailChecklist?.type === "record" && detailChecklist.checklist && (
                                <div>
                                    <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                                        Checklist item · {detailChecklist.checklist.derivedStatus}
                                    </h4>
                                    <div className="space-y-1.5">
                                        {detailChecklist.checklist.items
                                            .filter((i) => i.isActive)
                                            .map((item) => (
                                                <div key={item.id} className="flex items-start gap-2 text-xs">
                                                    {item.isComplete ? (
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                                    ) : (
                                                        <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className={item.isComplete ? "line-through text-muted-foreground" : "text-foreground"}>
                                                            {item.itemNameSnapshot}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            {item.lastChangedBy
                                                                ? `${item.lastChangedBy.displayName} · ${formatTimeWib(item.lastChangedAt)}`
                                                                : "Belum diubah"}
                                                        </p>
                                                        <div className="mt-1.5">
                                                            <CleaningEvidencePanel checklistItemId={item.id} collapsible />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                            {detailChecklist?.type === "preview" && detailChecklist.preview && (
                                <div>
                                    <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                                        Pratinjau template: {detailChecklist.preview.templateName}
                                    </h4>
                                    <div className="space-y-1">
                                        {detailChecklist.preview.items.map((item, idx) => (
                                            <p key={idx} className="text-xs text-muted-foreground">
                                                {idx + 1}. {item.name}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {(!detailChecklist || detailChecklist.type === "no_record") && (
                                <p className="text-xs text-muted-foreground">
                                    {detailChecklist?.message ?? "Detail checklist belum tersedia untuk tanggal ini."}
                                </p>
                            )}

                            <div className="border-t border-[var(--border)] pt-3" data-testid="paraf-harian-section">
                                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                    Paraf harian atasan
                                </h4>
                                {detailParaf.isFree ? (
                                    <p className="text-xs text-muted-foreground">
                                        Bebas paraf{detailParaf.isHoliday && detailParaf.holidayDescription ? ` · ${detailParaf.holidayDescription}` : " · Hari libur"}.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-xs text-muted-foreground">
                                            Atasan pemeriksa:{" "}
                                            {detailParaf.reviewers
                                                ? `Diperiksa oleh ${detailParaf.reviewers.inspectedByName ?? detailParaf.reviewers.inspectedByEmployeeId}, diketahui ${detailParaf.reviewers.knownByName ?? detailParaf.reviewers.knownByEmployeeId}`
                                                : "belum ditentukan untuk bulan ini"}
                                        </p>
                                        {detailParaf.parafs.length > 0 ? (
                                            <div className="space-y-1.5">
                                                {detailParaf.parafs.map((s) => (
                                                    <div key={s.id} className="flex items-center justify-between gap-2 text-xs border border-[var(--border)] rounded-lg px-3 py-2">
                                                        <span className="font-medium text-[var(--text-primary)]">
                                                            {dailyRoleLabel(s.role)} · {s.signerName} · {formatDateTime(s.signedAt)}
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
                                        ) : (
                                            <p className="text-xs text-muted-foreground">Belum ada paraf untuk tanggal ini.</p>
                                        )}
                                        {detailParaf.missingRoles.length > 0 && (
                                            <p className="text-xs text-muted-foreground">
                                                Menunggu paraf dari: {detailParaf.missingRoles.map((role) => reviewerNameFor(detailParaf, role)).join(", ")}
                                            </p>
                                        )}
                                        {!detailParaf.checklist.isComplete && (
                                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                                Paraf dikunci hingga checklist 100% selesai.
                                            </p>
                                        )}
                                        {!detailParaf.reviewers && (
                                            <p className="text-xs text-muted-foreground">
                                                Paraf dikunci hingga reviewer bulanan ditetapkan.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {!detailParaf.isFree && (
                                <div className="border-t border-[var(--border)] pt-3 space-y-2">
                                        <p className="text-xs text-muted-foreground">
                                            Tepat bila Anda memaraf di hari yang sama sebelum jam 00.00 malam waktu Jakarta; lewat dari itu tercatat terlambat.
                                        </p>
                                    {(() => {
                                        const myRole = myRoleFor(detailParaf);
                                        const locked =
                                            !detailParaf.checklist.isComplete ||
                                            !detailParaf.reviewers ||
                                            (myRole ? !detailParaf.missingRoles.includes(myRole) : detailParaf.missingRoles.length === 0);
                                        return (
                                            <div className="flex gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => void handleConfirmParaf()}
                                                    disabled={signing || locked}
                                                    title={locked ? "Paraf terkunci" : "Simpan paraf harian"}
                                                    className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                                                >
                                                    {signing ? "Menyimpan..." : "Simpan Paraf"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveRoomId(null)}
                                                    disabled={signing}
                                                    className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                                                >
                                                    Batal
                                                </button>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    )}
                </AccessibleModal>
            )}
        </div>
    );
}

export default function EmployeeCleaningApprovalsPage() {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<"monthly" | "daily">("daily");
    const [month, setMonth] = useState(getCurrentMonth);
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [tasks, setTasks] = useState<EmployeeApprovalTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state
    const [activeApprovalId, setActiveApprovalId] = useState<string | null>(null);
    const [activeRole, setActiveRole] = useState<"INSPECTED_BY" | "KNOWN_BY">("INSPECTED_BY");
    const [modalData, setModalData] = useState<DetailTaskModalData | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [signing, setSigning] = useState(false);
    const [signError, setSignError] = useState<string | null>(null);
    const [idempotencyKey, setIdempotencyKey] = useState<string>("");
    // Drill-down harian di modal bulanan: item + foto + paraf per tanggal.
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [dayParaf, setDayParaf] = useState<DailyParafStatus | null>(null);
    const [dayChecklist, setDayChecklist] = useState<DailyChecklistDetail | null>(null);
    const [dayLoading, setDayLoading] = useState(false);

    const fetchTasks = useCallback(async (targetMonth: string, status: string) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (targetMonth) params.set("monthWib", targetMonth);
            if (status !== "ALL") params.set("status", status);

            const res = await fetch(`/api/employee/cleaning/approvals?${params.toString()}`);
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat tugas persetujuan."));
            }
            const json = await res.json();
            setTasks(json.data || []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat tugas.";
            setError(msg);
            reportClientError("EmployeeCleaningApprovals", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchTasks(month, statusFilter);
    }, [month, statusFilter, fetchTasks]);

    const openSigningModal = async (approvalId: string, role: "INSPECTED_BY" | "KNOWN_BY") => {
        setActiveApprovalId(approvalId);
        setActiveRole(role);
        setModalLoading(true);
        setModalData(null);
        setSignError(null);
        setSelectedDay(null);
        setDayParaf(null);
        setDayChecklist(null);
        setIdempotencyKey(`idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

        try {
            const res = await fetch(`/api/employee/cleaning/approvals?approvalId=${approvalId}`);
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat detail periode persetujuan."));
            }
            const json = await res.json();
            setModalData(json.data);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memuat detail.", "error");
            setActiveApprovalId(null);
        } finally {
            setModalLoading(false);
        }
    };

    const openDayDetail = async (roomId: string, date: string) => {
        setSelectedDay(date);
        setDayParaf(null);
        setDayChecklist(null);
        setDayLoading(true);
        try {
            const [parafRes, checklistRes] = await Promise.all([
                fetch(`/api/cleaning/paraf?roomId=${roomId}&wibDate=${date}`),
                fetch(`/api/ga/cleaning/checklists?roomId=${roomId}&date=${date}`),
            ]);
            if (parafRes.ok) {
                const pj = await parafRes.json();
                setDayParaf(pj.data as DailyParafStatus);
            }
            if (checklistRes.ok) {
                const cj = await checklistRes.json();
                setDayChecklist(cj.data as DailyChecklistDetail);
            } else {
                toast(await getResponseErrorMessage(checklistRes, "Gagal memuat detail checklist."), "error");
            }
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memuat detail harian.", "error");
        } finally {
            setDayLoading(false);
        }
    };

    const handleSaveSignature = async (payload: string) => {
        if (!activeApprovalId) return;

        setSigning(true);
        setSignError(null);

        try {
            const res = await fetch("/api/employee/cleaning/approvals/sign", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-idempotency-key": idempotencyKey,
                },
                body: JSON.stringify({
                    approvalId: activeApprovalId,
                    role: activeRole,
                    signaturePayload: payload,
                    idempotencyKey,
                }),
            });

            if (!res.ok) {
                const errMsg = await getResponseErrorMessage(res, "Gagal menyimpan tanda tangan.");
                throw new Error(errMsg);
            }

            toast("Tanda tangan berhasil disimpan.", "success");
            const detailRes = await fetch(`/api/employee/cleaning/approvals?approvalId=${activeApprovalId}`);
            if (detailRes.ok) {
                const json = await detailRes.json();
                setModalData(json.data);
            }
            await fetchTasks(month, statusFilter);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal menyimpan tanda tangan.";
            setSignError(msg);
            toast(msg, "error");
        } finally {
            setSigning(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">Tanda Tangan Inspeksi</h1>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                    Periksa dan tanda tangani checklist inspeksi bulanan ruangan yang ditugaskan kepada Anda.
                </p>
            </div>

            <div className="flex items-center gap-2 mb-6" role="tablist" aria-label="Jenis persetujuan">
                <button
                    onClick={() => setActiveTab("daily")}
                    role="tab"
                    aria-selected={activeTab === "daily"}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        activeTab === "daily" ? "bg-[var(--primary)] text-white" : "btn btn-secondary !p-1.5"
                    }`}
                    type="button"
                >
                    Paraf Harian
                </button>
                <button
                    onClick={() => setActiveTab("monthly")}
                    role="tab"
                    aria-selected={activeTab === "monthly"}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        activeTab === "monthly" ? "bg-[var(--primary)] text-white" : "btn btn-secondary !p-1.5"
                    }`}
                    type="button"
                >
                    Tanda Tangan Bulanan
                </button>
            </div>

            {activeTab === "daily" ? (
                <DailyParafSection />
            ) : (
            <>
            {/* Filter controls */}
            <div className="card flex flex-wrap items-center justify-between gap-4 p-4 mb-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setMonth(shiftMonth(month, -1))}
                        className="btn btn-secondary !p-2"
                        title="Bulan sebelumnya"
                        type="button"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-base font-semibold min-w-[150px] text-center text-[var(--text-primary)]">
                        {formatMonthLabel(month)}
                    </span>
                    <button
                        onClick={() => setMonth(shiftMonth(month, 1))}
                        className="btn btn-secondary !p-2"
                        title="Bulan berikutnya"
                        type="button"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setStatusFilter("ALL")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            statusFilter === "ALL"
                                ? "bg-[var(--primary)] text-white"
                                : "btn btn-secondary !p-1.5"
                        }`}
                        type="button"
                    >
                        Semua
                    </button>
                    <button
                        onClick={() => setStatusFilter("PENDING")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            statusFilter === "PENDING"
                                ? "bg-[var(--primary)] text-white"
                                : "btn btn-secondary !p-1.5"
                        }`}
                        type="button"
                    >
                        Menunggu Tanda Tangan
                    </button>
                    <button
                        onClick={() => setStatusFilter("SIGNED")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            statusFilter === "SIGNED"
                                ? "bg-[var(--primary)] text-white"
                                : "btn btn-secondary !p-1.5"
                        }`}
                        type="button"
                    >
                        Selesai
                    </button>
                </div>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                </div>
            )}

            {error && !loading && (
                <div className="mb-6 p-4 bg-[var(--destructive-bg)] text-[var(--destructive)] rounded-xl border border-[var(--destructive-border)] text-center">
                    <AlertTriangle className="h-5 w-5 mx-auto mb-2" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {!loading && !error && tasks.length === 0 && (
                <div className="text-center py-16 border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--card)]">
                    <FileCheck2 className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
                    <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Tidak Ada Tugas Tanda Tangan</h3>
                    <p className="text-sm text-[var(--text-muted)] max-w-sm mx-auto">
                        Tidak ada tugas penandatanganan inspeksi untuk Anda pada bulan {formatMonthLabel(month)}.
                    </p>
                </div>
            )}

            {!loading && !error && tasks.length > 0 && (
                <div className="space-y-4">
                    {tasks.map((task) => (
                        <div
                            key={`${task.approvalId}_${task.role}`}
                            className="card p-5 hover:shadow-md transition-shadow"
                        >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-bold text-[var(--text-primary)]">
                                            {task.roomName}
                                        </h3>
                                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--secondary)] text-[var(--text-secondary)] border border-[var(--border)]">
                                            {task.roleLabel}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                        Periode: {formatMonthLabel(task.monthWib)}
                                    </p>
                                </div>

                                <div>
                                    {task.isSigned ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)]">
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Sudah Ditandatangani
                                        </span>
                                    ) : task.isSignable === false ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-[var(--warning-border)]">
                                            <Clock className="h-3.5 w-3.5" /> Menunggu akhir bulan — dibuka {formatOpensOnShort(task.opensOnWibDate)}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning-border)]">
                                            <Clock className="h-3.5 w-3.5" /> Menunggu Tanda Tangan Anda
                                        </span>
                                    )}
                                </div>
                            </div>

                            {task.latestChange && (
                                <div className="text-xs text-[var(--text-muted)] mb-3 flex items-center gap-1">
                                    <span>Pembaruan checklist terakhir: {formatDateTime(task.latestChange.timestamp)}</span>
                                </div>
                            )}

                            {task.hasChangedAfterSigning && (
                                <div className="p-2.5 mb-3 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning-border)] text-xs text-[var(--warning)] font-medium flex items-start gap-2">
                                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[var(--warning)]" />
                                    <span>
                                        Perhatian: Terdapat perubahan data checklist inspeksi setelah Anda menandatangani dokumen ini.
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                                <span className="text-xs text-[var(--text-muted)]">
                                    {task.isSigned && task.signedAt
                                        ? `Ditandatangani pada ${formatDateTime(task.signedAt)}`
                                        : task.isSignable === false
                                          ? `Tanda tangan dibuka ${formatOpensOnShort(task.opensOnWibDate)} pukul 00.00 WIB (akhir bulan)`
                                          : "Tanda tangan diperlukan"}
                                </span>
                                <button
                                    onClick={() => openSigningModal(task.approvalId, task.role)}
                                    className={`btn btn-sm ${
                                        task.isSigned || task.isSignable === false
                                            ? "btn-secondary"
                                            : "btn-primary"
                                    }`}
                                    type="button"
                                >
                                    <PenTool className="h-3.5 w-3.5" />
                                    {task.isSigned || task.isSignable === false ? "Lihat Detail" : "Tanda Tangani Dokumen"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal Tanda Tangan & Detail */}
            {activeApprovalId && (
                <AccessibleModal
                    ariaLabel="Persetujuan Inspeksi Ruangan"
                    onClose={() => setActiveApprovalId(null)}
                    className="!max-w-2xl !p-6"
                >
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">
                                {modalData ? `Persetujuan ${modalData.roomName}` : "Memuat..."}
                            </h2>
                            {modalData && (
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                    Bulan: {formatMonthLabel(modalData.monthWib)}
                                </p>
                            )}
                            {modalData && (
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                    Diperiksa oleh {modalData.inspectedByEmployeeName}, diketahui {modalData.knownByEmployeeName}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => setActiveApprovalId(null)}
                            aria-label="Tutup modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {modalLoading && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                        </div>
                    )}

                    {!modalLoading && modalData && (
                        <div>
                            {modalData.signable && !modalData.signable.isSignable && (
                                <div className="mb-4 p-3 rounded-xl bg-amber-100/60 dark:bg-amber-900/20 border border-amber-300/60 dark:border-amber-800/50 text-xs text-amber-900 dark:text-amber-200">
                                    Tanda tangan untuk periode {formatMonthLabel(modalData.monthWib)} baru dapat dilakukan
                                    mulai {formatOpensOnShort(modalData.signable.opensOnWibDate)} pukul 00.00 WIB (akhir
                                    bulan). Anda tetap bisa melihat rincian di bawah ini.
                                </div>
                            )}
                            {/* Checklist summary dates — ketuk tanggal untuk detail item + foto + paraf */}
                            {modalData.days && modalData.days.length > 0 && (
                                <div className="mb-5">
                                    <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                                        Status Checklist Harian
                                    </h4>
                                    <p className="text-[11px] text-[var(--text-muted)] mb-2">
                                        Ketuk tanggal untuk melihat item, foto bukti, dan paraf hari itu.
                                    </p>
                                    <div className="overflow-x-auto border border-[var(--border)] rounded-xl p-2.5 bg-[var(--secondary)]/30">
                                        <div className="flex gap-1.5 min-w-max">
                                            {modalData.days.map((d) => (
                                                <button
                                                    key={d.date}
                                                    type="button"
                                                    disabled={d.status === "FUTURE"}
                                                    onClick={() => void openDayDetail(modalData.roomId, d.date)}
                                                    title={`${d.date}: ${d.status}`}
                                                    aria-pressed={selectedDay === d.date}
                                                    className={`w-7 h-10 rounded-lg flex flex-col items-center justify-center text-[9px] font-medium border disabled:opacity-40 disabled:cursor-not-allowed ${
                                                        selectedDay === d.date
                                                            ? "ring-2 ring-[var(--primary)]"
                                                            : ""
                                                    } ${
                                                        d.status === "SELESAI"
                                                            ? "bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]"
                                                            : d.status === "FUTURE"
                                                                ? "bg-[var(--secondary)] text-[var(--text-muted)] border-[var(--border)]"
                                                                : d.status === "LIBUR"
                                                                    ? "bg-gray-100 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400 border-[var(--border)]"
                                                                    : "bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]"
                                                    }`}
                                                >
                                                    <span className="font-semibold">{parseInt(d.date.split("-")[2], 10)}</span>
                                                    <span className="text-[7px] font-bold">
                                                        {d.status === "SELESAI" ? "OK" : d.status === "FUTURE" ? "-" : d.status === "LIBUR" ? "L" : "!"}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {selectedDay && (
                                        <div className="mt-3 rounded-xl border border-[var(--border)] p-3 space-y-3">
                                            <p className="text-xs font-semibold text-[var(--text-primary)]">
                                                Detail {formatWibDateLabel(selectedDay)}
                                            </p>
                                            {dayLoading && (
                                                <div className="flex items-center justify-center py-6">
                                                    <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
                                                </div>
                                            )}
                                            {!dayLoading && dayParaf && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {dayParaf.isFree ? (
                                                        <span className="text-xs text-[var(--text-muted)]">
                                                            Bebas paraf{dayParaf.isHoliday && dayParaf.holidayDescription ? ` · ${dayParaf.holidayDescription}` : " · Hari libur"}.
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <span className="text-xs text-[var(--text-muted)]">
                                                                Checklist {dayParaf.checklist.percent}% ({dayParaf.checklist.completedCount}/{dayParaf.checklist.activeCount})
                                                            </span>
                                                            {dayParaf.parafs.map((s) => (
                                                                <span
                                                                    key={s.id}
                                                                    className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                                                                        s.status === "TERLAMBAT"
                                                                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                                                            : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                                    }`}
                                                                >
                                                                    {dailyRoleLabel(s.role)}: {s.status === "TERLAMBAT" ? "Terlambat" : "Tepat waktu"} · {s.signerName}
                                                                </span>
                                                            ))}
                                                            {dayParaf.missingRoles.length > 0 && (
                                                                <span className="text-xs text-[var(--text-muted)]">
                                                                    Menunggu paraf dari: {dayParaf.missingRoles.map((role) => reviewerNameFor(dayParaf, role)).join(", ")}
                                                                </span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                            {!dayLoading && dayChecklist?.type === "record" && dayChecklist.checklist && (
                                                <div className="space-y-1.5">
                                                    {dayChecklist.checklist.items
                                                        .filter((item) => item.isActive)
                                                        .map((item) => (
                                                            <div key={item.id} className="flex items-start gap-2 text-xs">
                                                                {item.isComplete ? (
                                                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                                                ) : (
                                                                    <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={item.isComplete ? "line-through text-muted-foreground" : "text-foreground"}>
                                                                        {item.itemNameSnapshot}
                                                                    </p>
                                                                    <p className="text-muted-foreground">
                                                                        {item.lastChangedBy
                                                                            ? `${item.lastChangedBy.displayName} · ${formatTimeWib(item.lastChangedAt)}`
                                                                            : "Belum dikerjakan"}
                                                                    </p>
                                                                    <div className="mt-1.5">
                                                                        <CleaningEvidencePanel checklistItemId={item.id} collapsible />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            )}
                                            {!dayLoading && dayChecklist?.type === "preview" && dayChecklist.preview && (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-[var(--text-muted)]">
                                                        Checklist belum diisi petugas. Daftar pekerjaan hari itu:
                                                    </p>
                                                    {dayChecklist.preview.items.map((item, idx) => (
                                                        <p key={idx} className="text-xs text-muted-foreground">
                                                            {idx + 1}. {item.name}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                            {!dayLoading && (!dayChecklist || dayChecklist.type === "no_record") && (
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    Detail checklist belum tersedia untuk tanggal ini.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Kedua slot peran — reviewer wajib bisa melihat TTD,
                                status, dan peringatan perubahan milik peran lainnya */}
                            <div className="space-y-4">
                                {modalData.userRoles.map((roleInfo) => {
                                    const isMine = roleInfo.role === activeRole;
                                    if (roleInfo.isSigned && roleInfo.signature) {
                                        return (
                                            <div key={roleInfo.role} className="space-y-4">
                                                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/20 text-center">
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                                                        Tanda Tangan {roleInfo.roleLabel}{isMine ? " (Anda)" : ""}
                                                    </h4>
                                                    <div className="bg-white dark:bg-[#0D0D11] border border-[var(--border)] rounded-lg p-3 max-w-sm mx-auto h-36 flex items-center justify-center mb-2">
                                                        <img
                                                            src={roleInfo.signature.signaturePayload}
                                                            alt={`Tanda tangan ${roleInfo.roleLabel}`}
                                                            className="max-h-full max-w-full object-contain"
                                                        />
                                                    </div>
                                                    <p className="text-xs text-[var(--text-muted)]">
                                                        Tersimpan pada: {formatDateTime(roleInfo.signature.signedAt)}
                                                    </p>
                                                </div>

                                                {roleInfo.signature.hasChangedAfter && (
                                                    <div className="p-3 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning-border)] text-xs text-[var(--warning)] font-medium flex items-start gap-2">
                                                        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[var(--warning)]" />
                                                        <div>
                                                            <div className="font-bold">Perhatian: Checklist Berubah</div>
                                                            <div className="mt-0.5">
                                                                Terdapat perubahan data checklist inspeksi setelah tanda tangan {roleInfo.roleLabel} disimpan pada {formatDateTime(roleInfo.signature.signedAt)}.
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }

                                    if (!isMine) {
                                        return (
                                            <div key={roleInfo.role} className="p-4 rounded-xl border border-[var(--border)] text-center">
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    {roleInfo.roleLabel} belum menandatangani periode ini.
                                                </p>
                                            </div>
                                        );
                                    }

                                    if (modalData.signable && !modalData.signable.isSignable) {
                                        return (
                                            <div key={roleInfo.role} className="p-4 rounded-xl border border-amber-300/60 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 text-center">
                                                <p className="text-xs text-amber-900 dark:text-amber-200 font-medium">
                                                    Tanda tangan dibuka {formatOpensOnShort(modalData.signable.opensOnWibDate)} pukul
                                                    00.00 WIB (akhir bulan).
                                                </p>
                                                <p className="text-xs text-[var(--text-muted)] mt-1">
                                                    Tombol tanda tangan akan aktif setelah tanggal tersebut.
                                                </p>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={roleInfo.role}>
                                            <div className="mb-3">
                                                <h4 className="text-sm font-bold text-[var(--text-primary)] mb-1">
                                                    Bubuhkan Tanda Tangan ({roleInfo.roleLabel})
                                                </h4>
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    Gunakan jari atau mouse untuk menandatangani di bawah ini:
                                                </p>
                                            </div>

                                            <SignaturePad
                                                onSave={handleSaveSignature}
                                                saving={signing}
                                                error={signError}
                                                onClearError={() => setSignError(null)}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </AccessibleModal>
            )}
            </>
            )}
        </div>
    );
}
