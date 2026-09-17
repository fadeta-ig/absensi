"use client";

import { BarChart3 } from "lucide-react";
import GreenMeetingNavTabs from "../components/GreenMeetingNavTabs";
import RecapTab from "../components/RecapTab";

export default function GreenMeetingRecapPage() {
    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
            {/* Header Judul Halaman */}
            <div className="bg-card border border-border rounded-xl p-4 sm:p-6 shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-1.5">
                        <BarChart3 size={12} />
                        Laporan & Analitik
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        Rekapitulasi Presensi
                    </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Laporan Agregat & Ekspor Data Green Meeting
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Filter rentang tanggal kehadiran departemen, tinjau persentase komitmen kehadiran, dan ekspor laporan ke format Excel (.xlsx) atau PDF resmi.
                </p>
            </div>

            {/* Sub-Navigasi Dropdown Green Meeting Tabs */}
            <GreenMeetingNavTabs />

            {/* Tab Rekapitulasi & Ekspor */}
            <RecapTab />
        </div>
    );
}
