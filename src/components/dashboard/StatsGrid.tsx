"use client";

import { Users, UserCheck, AlertCircle, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StatItem {
    label: string;
    value: string | number;
    sub: string;
    icon: LucideIcon;
    color: string;
    bg: string;
}

interface StatsGridProps {
    activeCount: number;
    totalCount: number;
    presentCount: number;
    lateCount: number;
    attendanceRate: number;
    today: string;
}

export default function StatsGrid({ activeCount, totalCount, presentCount, lateCount, attendanceRate, today }: StatsGridProps) {
    const stats: StatItem[] = [
        { label: "Total Karyawan", value: activeCount, sub: `${totalCount - activeCount} nonaktif`, icon: Users, color: "text-[var(--primary)]", bg: "bg-[var(--primary)]/10" },
        { label: "Hadir Hari Ini", value: presentCount, sub: `dari ${activeCount} aktif`, icon: UserCheck, color: "text-green-600", bg: "bg-green-500/10" },
        { label: "Terlambat", value: lateCount, sub: "hari ini", icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-500/10" },
        { label: "Tingkat Kehadiran", value: `${attendanceRate}%`, sub: today, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-500/10" },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s, i) => {
                const Icon = s.icon;
                return (
                    <div key={i} className="card p-5 flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
                            <Icon className={`w-6 h-6 ${s.color}`} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-2xl font-extrabold text-[var(--text-primary)]">{s.value}</p>
                            <p className="text-xs font-medium text-[var(--text-secondary)] mt-0.5">{s.label}</p>
                            <p className="text-[10px] text-[var(--text-muted)]">{s.sub}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
