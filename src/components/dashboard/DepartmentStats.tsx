"use client";

import { Users } from "lucide-react";

interface DeptStat {
    department: string;
    total: number;
    presentToday: number;
}

interface DepartmentStatsProps {
    departmentStats: DeptStat[];
}

export default function DepartmentStats({ departmentStats }: DepartmentStatsProps) {
    return (
        <div className="lg:col-span-2 flex flex-col gap-3">
            <h2 className="text-[12px] font-bold text-[#800020] uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-[#800020]" /> Kehadiran Per Departemen
            </h2>
            <div className="card flex-1 divide-y divide-[var(--border)] overflow-y-auto min-h-[200px]">
                {!departmentStats.length ? (
                    <div className="p-8 text-center">
                        <Users className="w-8 h-8 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                        <p className="text-xs text-[var(--text-muted)]">Memuat data...</p>
                    </div>
                ) : (
                    departmentStats.map((dept) => {
                        const pct = dept.total > 0 ? Math.round((dept.presentToday / dept.total) * 100) : 0;
                        return (
                            <div key={dept.department} className="p-3">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-semibold text-[var(--text-primary)]">{dept.department}</span>
                                    <span className="text-[10px] text-[var(--text-muted)]">{dept.presentToday}/{dept.total} ({pct}%)</span>
                                </div>
                                <div className="w-full bg-[var(--secondary)] rounded-full h-2">
                                    <div className="bg-[var(--primary)] h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
