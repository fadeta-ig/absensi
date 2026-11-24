"use client";

import { memo } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Search, Star, X } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { STRESSMETER_SCALE, getStressmeterScale } from "@/lib/stressmeterConstants";
import {
    formatStressmeterDate,
    type StressmeterOverviewData,
} from "@/components/stressmeter/types";

interface AttentionAndLogsTabProps {
    data: StressmeterOverviewData;
    search: string;
    onSearchChange: (val: string) => void;
    ratingFilter: string;
    onRatingFilterChange: (val: string) => void;
    onPageChange: (page: number) => void;
}

function AttentionAndLogsTab({
    data,
    search,
    onSearchChange,
    ratingFilter,
    onRatingFilterChange,
    onPageChange,
}: AttentionAndLogsTabProps) {
    const { attentionList, logs, pagination } = data;

    return (
        <div className="space-y-5">
            {/* Panel Deteksi Dini */}
            <section className="bg-card border border-border rounded-xl p-4 space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Deteksi Dini (14 Hari Terakhir)
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Karyawan yang tercatat memberi skor 1–2 berulang atau skor 1 terbaru. Gunakan informasi ini secara bijak untuk pendekatan suportif.
                        </p>
                    </div>
                    <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 shrink-0">
                        {attentionList.length} karyawan
                    </span>
                </div>

                {attentionList.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
                        Tidak ada karyawan dengan tren skor rendah berulang dalam 14 hari terakhir.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {attentionList.map((item) => {
                            const latestScale = getStressmeterScale(item.latestRating);
                            return (
                                <div
                                    key={item.employeeId}
                                    className="rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/15 p-3.5 flex items-start justify-between gap-3"
                                >
                                    <div className="min-w-0 space-y-1">
                                        <p className="text-sm font-semibold text-foreground truncate">
                                            {item.employeeName}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {item.employeeId} · {item.departmentName}
                                        </p>
                                        <p className="text-xs text-foreground">
                                            <span className="font-semibold text-rose-600 dark:text-rose-400">
                                                {item.lowCount}× skor rendah
                                            </span>{" "}
                                            dari {item.totalCount} pengisian (rata-rata{" "}
                                            {item.averageRating.toFixed(1)})
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0 space-y-1">
                                        {latestScale && (
                                            <span
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${latestScale.badgeClass}`}
                                            >
                                                {latestScale.rating}★ {latestScale.label}
                                            </span>
                                        )}
                                        <p className="text-[11px] text-muted-foreground">
                                            {formatStressmeterDate(item.latestShiftDate)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Log Respons Karyawan */}
            <section className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder="Cari nama, NIP, atau departemen..."
                            className="w-full pl-9 pr-8 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => onSearchChange("")}
                                aria-label="Hapus pencarian"
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <select
                        aria-label="Filter skor penilaian"
                        value={ratingFilter}
                        onChange={(e) => onRatingFilterChange(e.target.value)}
                        className="px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:w-52"
                    >
                        <option value="ALL">Semua Respons</option>
                        <option value="LOW">Skor Rendah (1–2★)</option>
                        {STRESSMETER_SCALE.map((s) => (
                            <option key={s.rating} value={String(s.rating)}>
                                {s.shortLabel}
                            </option>
                        ))}
                        <option value="SKIPPED">Lewati (SKIP)</option>
                    </select>
                </div>

                {logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-10 text-center">
                        Tidak ada respons yang cocok dengan filter saat ini.
                    </p>
                ) : (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tanggal Shift</TableHead>
                                    <TableHead>Karyawan</TableHead>
                                    <TableHead>Departemen</TableHead>
                                    <TableHead>Respons</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {logs.map((row) => {
                                    const scale = getStressmeterScale(row.rating);
                                    return (
                                        <TableRow key={row.id}>
                                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                {formatStressmeterDate(row.shiftDate)}
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium text-sm text-foreground">
                                                    {row.employeeName}
                                                </div>
                                                <div className="text-xs font-mono text-muted-foreground">
                                                    {row.employeeId}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {row.departmentName}
                                            </TableCell>
                                            <TableCell>
                                                {row.skipped || !scale ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                                        Lewati
                                                    </span>
                                                ) : (
                                                    <span
                                                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${scale.badgeClass}`}
                                                    >
                                                        <Star className="w-3 h-3 fill-current" />
                                                        {scale.rating} · {scale.label}
                                                    </span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>

                        {pagination.totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
                                <span>
                                    Halaman {pagination.page} dari {pagination.totalPages} (
                                    {pagination.total} data)
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        disabled={pagination.page <= 1}
                                        onClick={() => onPageChange(pagination.page - 1)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                        Sebelumnya
                                    </button>
                                    <button
                                        type="button"
                                        disabled={pagination.page >= pagination.totalPages}
                                        onClick={() => onPageChange(pagination.page + 1)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40"
                                    >
                                        Berikutnya
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}

export default memo(AttentionAndLogsTab);
