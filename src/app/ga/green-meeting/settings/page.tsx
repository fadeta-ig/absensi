"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertCircle, Settings } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError } from "@/lib/clientErrors";

import GreenMeetingNavTabs from "../components/GreenMeetingNavTabs";
import SettingsTab from "../components/SettingsTab";

import type {
    GreenMeetingUnit,
    GreenMeetingConfig,
    GreenMeetingHoliday,
} from "../types";

export default function GreenMeetingSettingsPage() {
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>("");

    const [units, setUnits] = useState<GreenMeetingUnit[]>([]);
    const [holidays, setHolidays] = useState<GreenMeetingHoliday[]>([]);
    const [config, setConfig] = useState<GreenMeetingConfig | null>(null);

    const loadSettingsData = useCallback(async () => {
        setLoading(true);
        setLoadError("");

        try {
            const [unitsRes, holidaysRes, configRes] = await Promise.all([
                fetch("/api/green-meeting/units"),
                fetch("/api/green-meeting/holidays"),
                fetch("/api/green-meeting/config"),
            ]);

            if (!unitsRes.ok) throw new Error("Gagal memuat daftar departemen.");

            const unitsData: GreenMeetingUnit[] = await unitsRes.json();
            setUnits(unitsData);

            if (holidaysRes.ok) {
                const holidaysData = await holidaysRes.json();
                setHolidays(holidaysData);
            }

            if (configRes.ok) {
                const configData = await configRes.json();
                setConfig(configData);
            }
        } catch (err) {
            reportClientError("GreenMeetingSettingsPage", "Gagal memuat pengaturan Green Meeting", err);
            setLoadError(err instanceof Error ? err.message : "Terjadi kesalahan memuat data.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadSettingsData();
    }, [loadSettingsData]);

    const handleUpdateConfig = async (data: {
        defaultRoom?: string;
        defaultTime?: string;
        maxDeadlineExtensions?: number;
        offDaysWeekly?: string;
    }) => {
        try {
            const res = await fetch("/api/green-meeting/config", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!res.ok) throw new Error("Gagal menyimpan konfigurasi.");
            const updated = await res.json();
            setConfig(updated);
            toast("Parameter operasional rapat berhasil disimpan.", "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menyimpan konfigurasi.", "error");
            throw err;
        }
    };

    const handleUpdateUnit = async (
        unitId: string,
        data: { isActiveInMeeting?: boolean; isDefaultRequired?: boolean }
    ) => {
        try {
            const res = await fetch("/api/green-meeting/units", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: unitId, ...data }),
            });

            if (!res.ok) throw new Error("Gagal memperbarui departemen.");
            const updated = await res.json();
            setUnits((prev) => prev.map((u) => (u.id === unitId ? updated : u)));
            toast("Pengaturan departemen berhasil disimpan.", "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memperbarui departemen.", "error");
            throw err;
        }
    };

    const handleAddHoliday = async (data: { date: string; description: string; isRecurring?: boolean }) => {
        try {
            const res = await fetch("/api/green-meeting/holidays", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!res.ok) throw new Error("Gagal menambahkan hari libur.");
            const created = await res.json();
            setHolidays((prev) => [...prev, created]);
            toast("Hari libur berhasil didaftarkan.", "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menambahkan hari libur.", "error");
            throw err;
        }
    };

    const handleDeleteHoliday = async (id: string) => {
        try {
            const res = await fetch(`/api/green-meeting/holidays?id=${id}`, {
                method: "DELETE",
            });

            if (!res.ok) throw new Error("Gagal menghapus hari libur.");
            setHolidays((prev) => prev.filter((h) => h.id !== id));
            toast("Hari libur berhasil dihapus.", "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menghapus hari libur.", "error");
            throw err;
        }
    };

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
            {/* Header Judul Halaman */}
            <div className="bg-card border border-border rounded-xl p-4 sm:p-6 shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                        <Settings size={12} />
                        Konfigurasi Modul
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        Pengelola Tetap: General Affairs (WIG002)
                    </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Kalender Operasional & Partisipasi Departemen
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Atur jadwal hari libur rutin/khusus, toleransi batas perpanjangan waktu, serta keikutsertaan departemen dalam rapat.
                </p>
            </div>

            {/* Sub-Navigasi Dropdown Green Meeting Tabs */}
            <GreenMeetingNavTabs />

            {/* Error Banner */}
            {loadError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-sm">
                    <AlertCircle size={18} />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Form Settings */}
            <SettingsTab
                config={config}
                holidays={holidays}
                units={units}
                onUpdateConfig={handleUpdateConfig}
                onAddHoliday={handleAddHoliday}
                onDeleteHoliday={handleDeleteHoliday}
                onUpdateUnit={handleUpdateUnit}
                loading={loading}
            />
        </div>
    );
}
