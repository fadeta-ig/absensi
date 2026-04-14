"use client";

import { useRouter } from "next/navigation";
import {
    Users, ClipboardList, CalendarOff, FileText,
    Clock, Wallet, Megaphone, MapPinned, Clock4,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface MenuItem {
    label: string;
    desc: string;
    href: string;
    icon: LucideIcon;
    count?: number;
}

interface QuickMenuProps {
    employeeCount: number;
    todayAttendanceCount: number;
    pendingLeaveCount: number;
    newsCount: number;
}

export default function QuickMenu({ employeeCount, todayAttendanceCount, pendingLeaveCount, newsCount }: QuickMenuProps) {
    const router = useRouter();

    const menuItems: MenuItem[] = [
        { label: "Karyawan", desc: "Kelola data karyawan", href: "/dashboard/employees", icon: Users, count: employeeCount },
        { label: "Absensi", desc: "Monitor kehadiran", href: "/dashboard/attendance", icon: ClipboardList, count: todayAttendanceCount },
        { label: "Kunjungan", desc: "Kelola kunjungan", href: "/dashboard/visits", icon: MapPinned },
        { label: "Lembur", desc: "Kelola lembur", href: "/dashboard/overtime", icon: Clock4 },
        { label: "Payroll", desc: "Buat slip gaji", href: "/dashboard/payroll", icon: Wallet },
        { label: "Cuti", desc: "Kelola pengajuan", href: "/dashboard/leave", icon: CalendarOff, count: pendingLeaveCount },
        { label: "Jam Kerja", desc: "Atur shift", href: "/dashboard/shifts", icon: Clock },
        { label: "Laporan", desc: "Export data", href: "/dashboard/reports", icon: FileText },
        { label: "WIG News", desc: "Pengumuman", href: "/dashboard/news", icon: Megaphone, count: newsCount },
    ];

    return (
        <div className="space-y-3">
            <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">Menu Utama</h2>
            <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-9 gap-3">
                {menuItems.map((m) => {
                    const Icon = m.icon;
                    return (
                        <button key={m.href} onClick={() => router.push(m.href)} className="card p-4 flex flex-col items-center gap-2 hover:shadow-md transition-all group cursor-pointer relative">
                            {m.count !== undefined && m.count > 0 && (
                                <span className="absolute top-2 right-2 w-5 h-5 bg-[var(--primary)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">{m.count}</span>
                            )}
                            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center group-hover:bg-[var(--primary)] transition-colors">
                                <Icon className="w-5 h-5 text-[var(--primary)] group-hover:text-white transition-colors" />
                            </div>
                            <div className="text-center">
                                <p className="text-xs font-semibold text-[var(--text-primary)]">{m.label}</p>
                                <p className="text-[10px] text-[var(--text-muted)] mt-0.5 hidden sm:block">{m.desc}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
