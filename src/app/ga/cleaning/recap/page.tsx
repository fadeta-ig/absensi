"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, CheckCircle2, Circle, Clock, FileCheck2, FileDown, PenLine, X, CalendarOff } from "lucide-react";
import { useToast } from "@/components/Toast";
import { CleaningEvidencePanel } from "@/components/cleaning/CleaningEvidencePanel";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
// exportCleaningPdf (jspdf) dimuat dinamis saat tombol diklik agar tidak
// membebani bundle halaman.
async function renderCleaningMatrixPdf(data: Parameters<typeof import("@/lib/exportCleaningPdf").exportCleaningMatrixPdf>[0]) {
    const { exportCleaningMatrixPdf } = await import("@/lib/exportCleaningPdf");
    exportCleaningMatrixPdf(data);
}
import AccessibleModal from "@/components/ui/AccessibleModal";

interface RecapRoom {
    id: string;
    name: string;
}

interface DayCell {
    date: string;
    status: "SELESAI" | "BELUM" | "FUTURE" | "LIBUR";
}

interface RoomRow {
    room: RecapRoom;
    days: DayCell[];
}

interface RecapData {
    month: string;
    dates: string[];
    matrix: RoomRow[];
}

interface ChecklistDetail {
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

type ParafRole = "INSPECTED_BY" | "KNOWN_BY";

interface ParafStatusData {
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
        inspectedByName?: string;
        knownByEmployeeId: string;
        knownByName?: string;
    } | null;
    parafs: Array<{
        id: string;
        role: ParafRole;
        signerEmployeeId: string;
        signerName: string;
        signedAt: string;
        status: "TEPAT" | "TERLAMBAT";
    }>;
    missingRoles: ParafRole[];
}

function roleLabel(role: ParafRole): string {
    return role === "INSPECTED_BY" ? "Diperiksa Oleh" : "Mengetahui";
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

function getCurrentMonth(): string {
    const now = new Date();
    // Use Asia/Jakarta timezone
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

function formatMonthLabel(month: string): string {
    const [y, m] = month.split("-");
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CleaningRecapPage() {
    const toast = useToast();
    const [month, setMonth] = useState(getCurrentMonth);
    const [recap, setRecap] = useState<RecapData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Detail panel
    const [detail, setDetail] = useState<ChecklistDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailRoom, setDetailRoom] = useState<RecapRoom | null>(null);
    const [detailDate, setDetailDate] = useState<string | null>(null);
    const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);
    // Tahap 3: viewer foto bukti per item di detail atasan (lazy-mount per item).

    // Paraf harian (Tahap 2)
    const [paraf, setParaf] = useState<ParafStatusData | null>(null);
    const [parafLoading, setParafLoading] = useState(false);
    const [showParafModal, setShowParafModal] = useState(false);
    const [parafRole, setParafRole] = useState<ParafRole>("INSPECTED_BY");
    const [parafSigning, setParafSigning] = useState(false);
    const [meEmployeeId, setMeEmployeeId] = useState<string | null>(null);
    const [meIsWig002, setMeIsWig002] = useState(false);

    useEffect(() => {
        fetch("/api/auth/me")
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                const data = json?.data ?? {};
                if (typeof data.employeeId === "string") setMeEmployeeId(data.employeeId);
                if (data.username === "WIG002") setMeIsWig002(true);
            })
            .catch(() => undefined);
    }, []);

    const handleExportPdf = useCallback(async (roomId: string, targetMonth: string) => {
        setExportingPdfId(roomId);
        try {
            const res = await fetch(`/api/ga/cleaning/approvals/export-pdf?roomId=${roomId}&monthWib=${targetMonth}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengunduh berkas PDF."));
            const json = await res.json();
            await renderCleaningMatrixPdf(json.data);
            toast("Formulir PDF inspeksi berhasil diunduh.", "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal mengunduh PDF.", "error");
        } finally {
            setExportingPdfId(null);
        }
    }, [toast]);

    const fetchRecap = useCallback(async (m: string) => {
        setLoading(true);
        setError(null);
        setDetail(null);
        setParaf(null);
        try {
            const res = await fetch(`/api/ga/cleaning/recap?month=${m}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat rekap."));
            const json = await res.json();
            setRecap(json.data);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat rekap.";
            setError(msg);
            reportClientError("CleaningRecap", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchRecap(month); }, [month, fetchRecap]);

    const fetchParaf = useCallback(async (roomId: string, wibDate: string) => {
        setParafLoading(true);
        setParaf(null);
        try {
            const res = await fetch(`/api/cleaning/paraf?roomId=${roomId}&wibDate=${wibDate}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat status paraf."));
            const json = await res.json();
            setParaf(json.data as ParafStatusData);
        } catch (err) {
            reportClientError("CleaningRecapParaf", "Gagal memuat status paraf", err);
        } finally {
            setParafLoading(false);
        }
    }, []);

    const openDetail = useCallback(async (room: RecapRoom, date: string) => {
        setDetailRoom(room);
        setDetailDate(date);
        setDetailLoading(true);
        setDetail(null);
        setParaf(null);
        try {
            const [checklistSettled, parafSettled] = await Promise.allSettled([
                fetch(`/api/ga/cleaning/checklists?roomId=${room.id}&date=${date}`),
                fetch(`/api/cleaning/paraf?roomId=${room.id}&wibDate=${date}`),
            ]);
            if (checklistSettled.status === "rejected" || !checklistSettled.value.ok) {
                const failed = checklistSettled.status === "rejected" ? null : checklistSettled.value;
                throw new Error(
                    failed
                        ? await getResponseErrorMessage(failed, "Gagal memuat detail.")
                        : "Gagal memuat detail."
                );
            }
            const json = await checklistSettled.value.json();
            setDetail(json.data);
            if (parafSettled.status === "fulfilled" && parafSettled.value.ok) {
                const parafJson = await parafSettled.value.json();
                setParaf(parafJson.data as ParafStatusData);
            } else {
                reportClientError("CleaningRecapParaf", "Gagal memuat status paraf", { roomId: room.id, date });
            }
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memuat detail.", "error");
        } finally {
            setDetailLoading(false);
        }
    }, [toast]);

    const handleConfirmParaf = useCallback(async () => {
        if (!detailRoom || !detailDate || !paraf?.reviewers) return;
        const signerEmployeeId =
            parafRole === "INSPECTED_BY"
                ? paraf.reviewers.inspectedByEmployeeId
                : paraf.reviewers.knownByEmployeeId;
        if (!signerEmployeeId) {
            toast("Reviewer untuk peran ini belum ditetapkan.", "error");
            return;
        }
        setParafSigning(true);
        try {
            // Kunci stabil per ruangan+tanggal+peran: klik ganda mengulang respons
            // sukses yang sama (replay), bukan 409.
            const idempotencyKey = `paraf-${detailRoom.id}-${detailDate}-${parafRole}`;
            const res = await fetch("/api/cleaning/paraf", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-idempotency-key": idempotencyKey,
                },
                body: JSON.stringify({
                    roomId: detailRoom.id,
                    wibDate: detailDate,
                    signerEmployeeId,
                    idempotencyKey,
                }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan paraf."));
            toast("Paraf harian berhasil disimpan.", "success");
            setShowParafModal(false);
            await fetchParaf(detailRoom.id, detailDate);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal menyimpan paraf.";
            toast(msg, "error");
            reportClientError("CleaningRecapParaf", msg, err);
        } finally {
            setParafSigning(false);
        }
    }, [detailRoom, detailDate, paraf, parafRole, toast, fetchParaf]);

    const canGoNext = month < getCurrentMonth();

    return (
        <div className="max-w-full mx-auto px-4 py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground mb-1">Rekap Inspeksi</h1>
                    <p className="text-sm text-muted-foreground">Matriks bulanan per ruangan.</p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Link
                        href="/ga/cleaning/holidays"
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-card hover:bg-accent text-sm font-medium text-foreground transition-colors"
                    >
                        <CalendarOff className="h-4 w-4 text-amber-600" /> Libur
                    </Link>
                    <Link
                        href="/ga/cleaning/approvals"
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-card hover:bg-accent text-sm font-medium text-foreground transition-colors"
                    >
                        <FileCheck2 className="h-4 w-4 text-red-600" /> Tanda Tangan Bulanan
                    </Link>
                </div>
            </div>

            {/* Month selector */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    onClick={() => setMonth(shiftMonth(month, -1))}
                    className="p-1.5 rounded border border-border hover:bg-accent/50"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium min-w-[140px] text-center">{formatMonthLabel(month)}</span>
                <button
                    onClick={() => canGoNext && setMonth(shiftMonth(month, 1))}
                    disabled={!canGoNext}
                    className="p-1.5 rounded border border-border hover:bg-accent/50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            )}

            {error && !loading && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-center">
                    <AlertTriangle className="h-5 w-5 text-destructive mx-auto mb-2" />
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            )}

            {recap && !loading && (
                <div className="flex gap-4">
                    {/* Matrix table */}
                    <div className="flex-1 overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 bg-card z-10 text-left px-2 py-1.5 border border-border font-medium text-muted-foreground min-w-[120px]">
                                        Ruangan
                                    </th>
                                    {recap.dates.map((date) => (
                                        <th key={date} className="px-1 py-1.5 border border-border font-medium text-muted-foreground text-center min-w-[28px]">
                                            {parseInt(date.split("-")[2], 10)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {recap.matrix.map((row) => (
                                    <tr key={row.room.id}>
                                        <td className="sticky left-0 bg-card z-10 px-2.5 py-1.5 border border-border font-medium text-foreground text-sm whitespace-nowrap">
                                            <div className="flex items-center justify-between gap-3">
                                                <span>{row.room.name}</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void handleExportPdf(row.room.id, month);
                                                    }}
                                                    disabled={exportingPdfId === row.room.id}
                                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                                    title={`Unduh PDF ${row.room.name}`}
                                                    type="button"
                                                >
                                                    {exportingPdfId === row.room.id ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
                                                    ) : (
                                                        <FileDown className="h-3.5 w-3.5 text-[var(--primary)]" />
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                        {row.days.map((cell) => (
                                            <td
                                                key={cell.date}
                                                onClick={() => cell.status !== "FUTURE" && openDetail(row.room, cell.date)}
                                                className={`px-1 py-1 border border-border text-center cursor-pointer transition-colors ${
                                                    cell.status === "SELESAI"
                                                        ? "bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50"
                                                        : cell.status === "FUTURE"
                                                            ? "bg-gray-50 dark:bg-gray-900/20 cursor-default"
                                                            : cell.status === "LIBUR"
                                                                ? "bg-gray-100 dark:bg-gray-800/40 hover:bg-gray-200 dark:hover:bg-gray-800/70"
                                                                : "bg-yellow-50 dark:bg-yellow-900/10 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                                                }`}
                                                title={`${row.room.name} - ${cell.date}: ${cell.status === "LIBUR" ? "Libur (bebas paraf)" : cell.status}`}
                                            >
                                                {cell.status === "SELESAI" ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mx-auto" />
                                                ) : cell.status === "FUTURE" ? (
                                                    <Clock className="h-3 w-3 text-gray-300 dark:text-gray-600 mx-auto" />
                                                ) : cell.status === "LIBUR" ? (
                                                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">L</span>
                                                ) : (
                                                    <Circle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 mx-auto" />
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {recap.matrix.length === 0 && (
                            <p className="text-center text-muted-foreground py-8 text-sm">Tidak ada ruangan aktif. Tambah di Pengaturan &gt; Ruangan.</p>
                        )}
                    </div>

                    {/* Detail panel */}
                    {(detailRoom || detailLoading) && (
                        <div className="w-72 flex-shrink-0 bg-card border border-border rounded-lg p-4">
                            {detailLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                            ) : detail ? (
                                <div>
                                    <h3 className="text-sm font-semibold mb-1">{detailRoom?.name}</h3>
                                    <p className="text-xs text-muted-foreground mb-3">{detailDate ? formatWibDate(detailDate) : ""}</p>

                                    {detail.type === "record" && detail.checklist && (
                                        <>
                                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full mb-3 ${
                                                detail.checklist.derivedStatus === "SELESAI"
                                                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                    : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                            }`}>
                                                {detail.checklist.derivedStatus === "SELESAI" ? "Sudah selesai" : "Belum selesai"}
                                            </span>
                                            <div className="space-y-1.5 mt-2">
                                                {detail.checklist.items.filter((i) => i.isActive).map((item) => (
                                                    <div key={item.id} className="flex items-start gap-2 text-xs">
                                                        {item.isComplete ? (
                                                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                                        ) : (
                                                            <Circle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <p className={item.isComplete ? "line-through text-muted-foreground" : "text-foreground"}>
                                                                {item.itemNameSnapshot}
                                                            </p>
                                                            <p className="text-muted-foreground">
                                                                {item.lastChangedBy
                                                                    ? `${item.lastChangedBy.displayName} · ${formatTime(item.lastChangedAt)}`
                                                                    : "Belum dikerjakan"}
                                                            </p>
                                                            <div className="mt-1.5">
                                                                <CleaningEvidencePanel checklistItemId={item.id} collapsible />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    {detail.type === "preview" && detail.preview && (
                                        <div>
                                            <span className="text-xs text-muted-foreground">Daftar pekerjaan yang dicek hari itu: {detail.preview.templateName}</span>
                                            <div className="mt-2 space-y-1">
                                                {detail.preview.items.map((item, idx) => (
                                                    <p key={idx} className="text-xs text-muted-foreground">
                                                        {idx + 1}. {item.name}
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {detail.type === "no_record" && (
                                        <p className="text-xs text-muted-foreground">{detail.message}</p>
                                    )}

                                    {/* Paraf harian */}
                                    <div className="mt-4 border-t border-border pt-3" data-testid="paraf-section">
                                        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                            Paraf Harian
                                        </h4>
                                        {parafLoading ? (
                                            <div className="flex items-center gap-2 py-2">
                                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                <span className="text-xs text-muted-foreground">Memuat status paraf...</span>
                                            </div>
                                        ) : paraf ? (
                                            <div className="space-y-2">
                                                {paraf.isFree ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                                        <CalendarOff className="h-3 w-3" />
                                                        Bebas paraf
                                                        {paraf.isHoliday && paraf.holidayDescription
                                                            ? ` · ${paraf.holidayDescription}`
                                                            : " · Hari libur"}
                                                    </span>
                                                ) : (
                                                    <>
                                                        <p className="text-xs text-muted-foreground">
                                                            Checklist {paraf.checklist.percent}% ({paraf.checklist.completedCount}/{paraf.checklist.activeCount})
                                                            {paraf.reviewers
                                                                ? ` · ${paraf.reviewers.inspectedByName ?? paraf.reviewers.inspectedByEmployeeId} / ${paraf.reviewers.knownByName ?? paraf.reviewers.knownByEmployeeId}`
                                                                : " · Reviewer belum ditetapkan"}
                                                        </p>
                                                        {paraf.parafs.length > 0 && (
                                                            <div className="space-y-1">
                                                                {paraf.parafs.map((p) => (
                                                                    <span
                                                                        key={p.id}
                                                                        className={`mr-1 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                                                                            p.status === "TERLAMBAT"
                                                                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                                                                : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                                        }`}
                                                                    >
                                                                        {roleLabel(p.role)}: {p.status === "TERLAMBAT" ? "Terlambat" : "Tepat waktu"}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {paraf.missingRoles.length === 0 ? (
                                                            <p className="text-xs text-green-700 dark:text-green-400 font-medium">
                                                                Semua paraf sudah lengkap.
                                                            </p>
                                                        ) : (
                                                            <div className="space-y-1.5">
                                                                {!paraf.checklist.isComplete && (
                                                                    <p className="text-xs text-amber-700 dark:text-amber-400">
                                                                        Selesaikan semua checklist 100% dulu, baru bisa paraf.
                                                                    </p>
                                                                )}
                                                                {!paraf.reviewers && (
                                                                    <p className="text-xs text-muted-foreground">
                                                                        Minta GA menentukan pemeriksa bulan ini dulu.
                                                                    </p>
                                                                )}
                                                                {paraf.missingRoles.map((role) => {
                                                                    const locked = !paraf.checklist.isComplete || !paraf.reviewers;
                                                                    const ownerId =
                                                                        role === "INSPECTED_BY"
                                                                            ? paraf.reviewers?.inspectedByEmployeeId
                                                                            : paraf.reviewers?.knownByEmployeeId;
                                                                    // Sembunyikan tombol peran milik orang lain (non-WIG002
                                                                    // pasti 403 bila diklik); tampilkan teks menunggu saja.
                                                                    if (!locked && !meIsWig002 && meEmployeeId && ownerId !== meEmployeeId) {
                                                                        const ownerName =
                                                                            role === "INSPECTED_BY"
                                                                                ? (paraf.reviewers?.inspectedByName ?? ownerId)
                                                                                : (paraf.reviewers?.knownByName ?? ownerId);
                                                                        return (
                                                                            <p key={role} className="text-xs text-muted-foreground">
                                                                                Menunggu {roleLabel(role)}: {ownerName}
                                                                            </p>
                                                                        );
                                                                    }
                                                                    return (
                                                                        <button
                                                                            key={role}
                                                                            type="button"
                                                                            disabled={locked || parafSigning}
                                                                            onClick={() => {
                                                                                setParafRole(role);
                                                                                setShowParafModal(true);
                                                                            }}
                                                                            title={locked ? "Paraf terkunci" : `Paraf sebagai ${roleLabel(role)}`}
                                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                                                                        >
                                                                            <PenLine className="h-3.5 w-3.5" />
                                                                            Paraf · {roleLabel(role)}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">Status paraf belum dimuat.</p>
                                        )}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            )}

            {showParafModal && detailRoom && detailDate && paraf?.reviewers && (
                <AccessibleModal
                    ariaLabel="Konfirmasi Paraf Harian"
                    onClose={() => !parafSigning && setShowParafModal(false)}
                >
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">Konfirmasi Paraf Harian</h2>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                {detailRoom.name} · {detailDate} · {roleLabel(parafRole)}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => setShowParafModal(false)}
                            disabled={parafSigning}
                            aria-label="Tutup modal paraf"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <p className="text-sm text-foreground">
                            Paraf sebagai <strong>{roleLabel(parafRole)}</strong> oleh{" "}
                            <strong>
                                {parafRole === "INSPECTED_BY"
                                    ? (paraf.reviewers.inspectedByName ?? paraf.reviewers.inspectedByEmployeeId)
                                    : (paraf.reviewers.knownByName ?? paraf.reviewers.knownByEmployeeId)}
                            </strong>
                            .
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Paraf dianggap tepat waktu bila dilakukan di hari yang sama sebelum jam 00.00 malam waktu Jakarta.
                            {detailDate === getWibToday()
                                ? " Paraf tanggal ini hari ini tercatat tepat waktu."
                                : ` Paraf tanggal ${detailDate} hari ini (${getWibToday()}) tercatat terlambat.`}
                        </p>
                        {!paraf.checklist.isComplete && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                Selesaikan semua checklist 100% dulu, baru bisa paraf.
                            </p>
                        )}
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => void handleConfirmParaf()}
                                disabled={parafSigning || !paraf.checklist.isComplete}
                                className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                            >
                                {parafSigning ? "Menyimpan..." : "Simpan Paraf"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowParafModal(false)}
                                disabled={parafSigning}
                                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                            >
                                Batal
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}

function formatWibDate(wibDate: string): string {
    try {
        const d = new Date(`${wibDate}T00:00:00+07:00`);
        if (Number.isNaN(d.getTime())) return wibDate;
        return d.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "Asia/Jakarta",
        });
    } catch {
        return wibDate;
    }
}

function formatTime(iso: string | null): string {
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
