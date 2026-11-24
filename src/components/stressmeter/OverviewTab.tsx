"use client";

import { memo } from "react";
import { AlertTriangle, BarChart3, MessageSquareHeart, Star, Users } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { getStressmeterScale } from "@/lib/stressmeterConstants";
import {
    formatShortDayMonth,
    type StressmeterOverviewData,
} from "@/components/stressmeter/types";

interface OverviewTabProps {
    data: StressmeterOverviewData;
    onOpenSharesTab: () => void;
    onOpenAttentionTab: () => void;
}

function getScoreBadgeClass(avg: number | null): string {
    if (avg === null) return "bg-muted text-muted-foreground";
    if (avg <= 2.2) return "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300";
    if (avg < 3.2) return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
    if (avg < 4.0) return "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300";
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
}

function OverviewTab({
    data,
    onOpenSharesTab,
    onOpenAttentionTab,
}: OverviewTabProps) {
    const { kpi, distribution, dailyTrend, departmentBreakdown } = data;
    const recentTrend = dailyTrend.slice(-14);

    return (
        <div className="space-y-5">
            {/* 4 Kartu KPI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-card border border-border rounded-xl p-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                        <span>Rata-rata Skor</span>
                        <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-foreground tabular-nums">
                            {kpi.averageRating !== null ? kpi.averageRating.toFixed(1) : "-"}
                        </span>
                        <span className="text-xs text-muted-foreground">/ 5.0</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Dari {kpi.totalRated} respons terisi
                    </p>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                        <span>Partisipasi Clock In</span>
                        <Users className="w-4 h-4 text-sky-500" />
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-foreground tabular-nums">
                            {kpi.participationRate.toFixed(1)}%
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {kpi.totalRated} isi · {kpi.totalSkipped} lewati ({kpi.totalClockIns} Clock In)
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onOpenAttentionTab}
                    className="bg-card border border-border hover:border-amber-400/60 rounded-xl p-4 space-y-1.5 text-left transition-colors"
                >
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                        <span>Skor Rendah (1–2★)</span>
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-foreground tabular-nums">
                            {kpi.lowMoodCount}
                        </span>
                        <span className="text-xs text-muted-foreground">respons</span>
                    </div>
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                        {data.attentionList.length} karyawan perlu perhatian →
                    </p>
                </button>

                <button
                    type="button"
                    onClick={onOpenSharesTab}
                    className="bg-card border border-border hover:border-primary/50 rounded-xl p-4 space-y-1.5 text-left transition-colors"
                >
                    <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                        <span>Curhat Anonim Baru</span>
                        <MessageSquareHeart className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-foreground tabular-nums">
                            {kpi.newAnonymousShares}
                        </span>
                        <span className="text-xs text-muted-foreground">belum dibaca</span>
                    </div>
                    <p className="text-xs text-primary font-medium">
                        Buka kotak curhat anonim →
                    </p>
                </button>
            </div>

            {/* Distribusi Bintang & Tren Harian */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Distribusi 1–5 */}
                <section className="bg-card border border-border rounded-xl p-4 space-y-4">
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">
                            Distribusi Penilaian (1–5 Bintang)
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Sebaran perasaan karyawan yang mengisi pada periode terpilih.
                        </p>
                    </div>

                    {kpi.totalRated === 0 ? (
                        <p className="text-xs text-muted-foreground py-8 text-center border border-dashed border-border rounded-lg">
                            Belum ada data penilaian pada rentang tanggal ini.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {distribution.map((row) => {
                                const scale = getStressmeterScale(row.rating);
                                return (
                                    <div key={row.rating} className="space-y-1">
                                        <div className="flex items-center justify-between text-xs gap-2">
                                            <span className="font-medium text-foreground">
                                                {scale?.shortLabel ?? `${row.rating}★`}
                                            </span>
                                            <span className="text-muted-foreground tabular-nums">
                                                {row.count} ({row.percentage.toFixed(1)}%)
                                            </span>
                                        </div>
                                        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${scale?.barClass ?? "bg-primary"}`}
                                                style={{ width: `${Math.max(row.count > 0 ? 3 : 0, row.percentage)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Tren Harian */}
                <section className="bg-card border border-border rounded-xl p-4 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                <BarChart3 className="w-4 h-4 text-primary" />
                                Tren Rata-rata Harian
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Menampilkan hingga 14 hari aktif terakhir dalam periode terpilih.
                            </p>
                        </div>
                    </div>

                    {recentTrend.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-8 text-center border border-dashed border-border rounded-lg">
                            Belum ada tren harian pada rentang tanggal ini.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-end gap-1.5 sm:gap-2 h-44 pt-4 px-1 border-b border-border">
                                {recentTrend.map((day) => {
                                    const avg = day.averageRating ?? 0;
                                    const heightPct = day.averageRating !== null ? Math.max(12, (avg / 5) * 100) : 6;
                                    const barColor =
                                        day.averageRating === null
                                            ? "bg-muted"
                                            : avg <= 2.2
                                                ? "bg-rose-500"
                                                : avg < 3.2
                                                    ? "bg-amber-500"
                                                    : avg < 4.0
                                                        ? "bg-sky-500"
                                                        : "bg-emerald-500";
                                    return (
                                        <div
                                            key={day.date}
                                            className="flex-1 flex flex-col items-center justify-end h-full min-w-0 group"
                                            title={`${formatShortDayMonth(day.date)}: rata-rata ${
                                                day.averageRating !== null ? day.averageRating.toFixed(1) : "-"
                                            } (${day.ratedCount} isi, ${day.lowCount} skor rendah, ${day.skippedCount} lewati)`}
                                        >
                                            <span className="text-[10px] font-semibold text-muted-foreground mb-1 tabular-nums">
                                                {day.averageRating !== null ? day.averageRating.toFixed(1) : "-"}
                                            </span>
                                            <div
                                                className={`w-full max-w-[32px] rounded-t-md transition-all ${barColor} group-hover:opacity-85`}
                                                style={{ height: `${heightPct}%` }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 px-1">
                                {recentTrend.map((day) => (
                                    <span
                                        key={day.date}
                                        className="flex-1 text-center text-[10px] text-muted-foreground truncate"
                                    >
                                        {formatShortDayMonth(day.date)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {/* Ringkasan per Departemen */}
            <section className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-border">
                    <h2 className="text-sm font-semibold text-foreground">
                        Ringkasan per Departemen
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Diurutkan dari rata-rata terendah agar departemen yang membutuhkan dukungan segera terlihat.
                    </p>
                </div>

                {departmentBreakdown.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-8 text-center">
                        Belum ada data respons departemen pada periode ini.
                    </p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Departemen</TableHead>
                                <TableHead>Rata-rata Skor</TableHead>
                                <TableHead className="text-right">Terisi</TableHead>
                                <TableHead className="text-right">Skor Rendah (1–2★)</TableHead>
                                <TableHead className="text-right">Lewati</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {departmentBreakdown.map((dept) => (
                                <TableRow key={dept.departmentId}>
                                    <TableCell className="font-medium text-foreground">
                                        {dept.departmentName}
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${getScoreBadgeClass(
                                                dept.averageRating
                                            )}`}
                                        >
                                            {dept.averageRating !== null
                                                ? `${dept.averageRating.toFixed(1)} / 5`
                                                : "Belum ada"}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {dept.ratedCount}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <span
                                            className={
                                                dept.lowCount > 0
                                                    ? "font-semibold text-rose-600 dark:text-rose-400"
                                                    : "text-muted-foreground"
                                            }
                                        >
                                            {dept.lowCount}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-muted-foreground">
                                        {dept.skippedCount}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </section>
        </div>
    );
}

export default memo(OverviewTab);
