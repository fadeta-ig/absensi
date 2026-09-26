"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, CheckCircle2, Circle, Clock, FileCheck2, FileDown } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import { exportCleaningMatrixPdf } from "@/lib/exportCleaningPdf";

interface RecapRoom {
    id: string;
    name: string;
}

interface DayCell {
    date: string;
    status: "SELESAI" | "BELUM" | "FUTURE";
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

    const handleExportPdf = useCallback(async (roomId: string, targetMonth: string) => {
        setExportingPdfId(roomId);
        try {
            const res = await fetch(`/api/ga/cleaning/approvals/export-pdf?roomId=${roomId}&monthWib=${targetMonth}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengunduh berkas PDF."));
            const json = await res.json();
            exportCleaningMatrixPdf(json.data);
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

    const openDetail = useCallback(async (room: RecapRoom, date: string) => {
        setDetailRoom(room);
        setDetailDate(date);
        setDetailLoading(true);
        setDetail(null);
        try {
            const res = await fetch(`/api/ga/cleaning/checklists?roomId=${room.id}&date=${date}`);
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat detail."));
            const json = await res.json();
            setDetail(json.data);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memuat detail.", "error");
        } finally {
            setDetailLoading(false);
        }
    }, [toast]);

    const canGoNext = month < getCurrentMonth();

    return (
        <div className="max-w-full mx-auto px-4 py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground mb-1">Rekap Inspeksi</h1>
                    <p className="text-sm text-muted-foreground">Matriks bulanan per ruangan.</p>
                </div>
                <Link
                    href="/ga/cleaning/approvals"
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-card hover:bg-accent text-sm font-medium text-foreground transition-colors self-start sm:self-auto"
                >
                    <FileCheck2 className="h-4 w-4 text-red-600" /> Tanda Tangan Bulanan
                </Link>
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
                                                            : "bg-yellow-50 dark:bg-yellow-900/10 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                                                }`}
                                                title={`${row.room.name} - ${cell.date}: ${cell.status}`}
                                            >
                                                {cell.status === "SELESAI" ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mx-auto" />
                                                ) : cell.status === "FUTURE" ? (
                                                    <Clock className="h-3 w-3 text-gray-300 dark:text-gray-600 mx-auto" />
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
                            <p className="text-center text-muted-foreground py-8 text-sm">Tidak ada ruangan aktif.</p>
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
                                    <p className="text-xs text-muted-foreground mb-3">{detailDate}</p>

                                    {detail.type === "record" && detail.checklist && (
                                        <>
                                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full mb-3 ${
                                                detail.checklist.derivedStatus === "SELESAI"
                                                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                    : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                            }`}>
                                                {detail.checklist.derivedStatus}
                                            </span>
                                            <div className="space-y-1.5 mt-2">
                                                {detail.checklist.items.filter((i) => i.isActive).map((item) => (
                                                    <div key={item.id} className="flex items-start gap-2 text-xs">
                                                        {item.isComplete ? (
                                                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                                        ) : (
                                                            <Circle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                                        )}
                                                        <div>
                                                            <p className={item.isComplete ? "line-through text-muted-foreground" : "text-foreground"}>
                                                                {item.itemNameSnapshot}
                                                            </p>
                                                            <p className="text-muted-foreground">
                                                                {item.lastChangedBy
                                                                    ? `${item.lastChangedBy.displayName} · ${formatTime(item.lastChangedAt)}`
                                                                    : "Belum diubah"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    {detail.type === "preview" && detail.preview && (
                                        <div>
                                            <span className="text-xs text-muted-foreground">Pratinjau template: {detail.preview.templateName}</span>
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
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
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
