"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    CheckSquare,
    FileText,
    ListTodo,
    Settings,
    BarChart3,
} from "lucide-react";

interface GreenMeetingNavTabsProps {
    attendanceCount?: number;
    notesCount?: number;
    tasksCount?: number;
}

export default function GreenMeetingNavTabs({
    attendanceCount,
    notesCount,
    tasksCount,
}: GreenMeetingNavTabsProps) {
    const pathname = usePathname();

    const tabs = [
        {
            href: "/ga/green-meeting/attendance",
            icon: CheckSquare,
            shortLabel: "Presensi",
            label: "Presensi Hari Ini",
            count: attendanceCount,
        },
        {
            href: "/ga/green-meeting/notes",
            icon: FileText,
            shortLabel: "Notulensi",
            label: "Notulensi Rapat",
            count: notesCount,
        },
        {
            href: "/ga/green-meeting/tasks",
            icon: ListTodo,
            shortLabel: "Tindak Lanjut",
            label: "Pelacak Tindak Lanjut",
            count: tasksCount,
        },
        {
            href: "/ga/green-meeting/settings",
            icon: Settings,
            shortLabel: "Kalender",
            label: "Kalender & Departemen",
        },
        {
            href: "/ga/green-meeting/recap",
            icon: BarChart3,
            shortLabel: "Laporan",
            label: "Laporan & Ekspor",
        },
    ];

    return (
        <div className="bg-muted/60 p-1.5 rounded-xl border border-border flex items-center gap-1 overflow-x-auto scrollbar-none mb-6">
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");

                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all whitespace-nowrap min-w-0 ${
                            isActive
                                ? "bg-card text-foreground shadow-xs border border-border"
                                : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                        }`}
                    >
                        <Icon size={16} className={`shrink-0 ${isActive ? "text-primary" : ""}`} />
                        <span className="sm:hidden">{tab.shortLabel}</span>
                        <span className="hidden sm:inline">{tab.label}</span>
                        {typeof tab.count === "number" && (
                            <span
                                className={`px-1.5 py-0.2 rounded-full text-[10px] sm:text-xs font-bold ${
                                    isActive
                                        ? "bg-primary/10 text-primary"
                                        : "bg-muted text-muted-foreground"
                                }`}
                            >
                                {tab.count}
                            </span>
                        )}
                    </Link>
                );
            })}
        </div>
    );
}
