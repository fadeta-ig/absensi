"use client";

import { BarChart3 } from "lucide-react";

interface WeeklyChartProps {
    weeklyData: { date: string; present: number; late: number; absent: number }[];
}

export default function WeeklyChart({ weeklyData }: WeeklyChartProps) {
    const maxChartVal = Math.max(...weeklyData.map((d) => d.present + d.late + d.absent), 1);

    return (
        <div className="lg:col-span-3 flex flex-col gap-3">
            <h2 className="text-[12px] font-bold text-[#800020] uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#800020]" /> Kehadiran 7 Hari Terakhir
            </h2>
            <div className="card p-5 flex-1 flex flex-col">
                {weeklyData.length === 0 ? (
                    <div className="p-8 text-center">
                        <BarChart3 className="w-8 h-8 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                        <p className="text-xs text-[var(--text-muted)]">Memuat data chart...</p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-end gap-1.5 h-[160px]">
                            {weeklyData.map((d, i) => {
                                const pctPresent = (d.present / maxChartVal) * 100;
                                const pctLate = (d.late / maxChartVal) * 100;
                                const dayLabel = new Date(d.date).toLocaleDateString("id-ID", { weekday: "short" });
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                                        <div className="relative w-full flex flex-col justify-end" style={{ height: "130px" }}>
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--text-primary)] text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                                                H:{d.present} T:{d.late} A:{d.absent}
                                            </div>
                                            <div className="w-full rounded-t bg-green-400 transition-all duration-500" style={{ height: `${pctPresent}%`, minHeight: d.present > 0 ? "4px" : "0" }} />
                                            <div className="w-full bg-orange-400 transition-all duration-500" style={{ height: `${pctLate}%`, minHeight: d.late > 0 ? "4px" : "0" }} />
                                        </div>
                                        <span className="text-[10px] text-[var(--text-muted)] font-medium">{dayLabel}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-center gap-4 mt-4">
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-400" /><span className="text-[10px] text-[var(--text-muted)]">Hadir</span></div>
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-orange-400" /><span className="text-[10px] text-[var(--text-muted)]">Terlambat</span></div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
