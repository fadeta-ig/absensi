"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertCircle, ListTodo } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError } from "@/lib/clientErrors";

import GreenMeetingNavTabs from "../components/GreenMeetingNavTabs";
import TasksTrackerTab from "../components/TasksTrackerTab";

import type {
    GreenMeetingNote,
    GreenMeetingConfig,
    GreenMeetingTaskStatus,
} from "../types";

export default function GreenMeetingTasksPage() {
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>("");

    const [activeTasks, setActiveTasks] = useState<GreenMeetingNote[]>([]);
    const [config, setConfig] = useState<GreenMeetingConfig | null>(null);

    const loadTasksData = useCallback(async () => {
        setLoading(true);
        setLoadError("");

        try {
            const [tasksRes, configRes] = await Promise.all([
                fetch("/api/green-meeting/notes?activeTasks=true"),
                fetch("/api/green-meeting/config"),
            ]);

            if (!tasksRes.ok) throw new Error("Gagal memuat daftar tindak lanjut.");

            const tasksData = await tasksRes.json();
            setActiveTasks(tasksData);

            if (configRes.ok) {
                const configData = await configRes.json();
                setConfig(configData);
            }
        } catch (err) {
            reportClientError("GreenMeetingTasksPage", "Gagal memuat data tindak lanjut", err);
            setLoadError(err instanceof Error ? err.message : "Terjadi kesalahan memuat data.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadTasksData();
    }, [loadTasksData]);

    const handleUpdateTaskStatus = async (noteId: string, status: GreenMeetingTaskStatus) => {
        try {
            const res = await fetch("/api/green-meeting/notes", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ noteId, taskStatus: status }),
            });

            if (!res.ok) throw new Error("Gagal memperbarui status tugas.");
            const updated: GreenMeetingNote = await res.json();

            setActiveTasks((prev) =>
                status === "SELESAI" || status === "DIBATALKAN"
                    ? prev.filter((t) => t.id !== noteId)
                    : prev.map((t) => (t.id === noteId ? updated : t))
            );

            toast(`Status tugas berhasil diubah menjadi ${status}.`, "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memperbarui status tugas.", "error");
            throw err;
        }
    };

    const handleExtendDeadline = async (noteId: string, newDeadlineDate: string, reason: string) => {
        try {
            const res = await fetch("/api/green-meeting/deadlines", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    noteId,
                    newDeadlineDate,
                    reason,
                }),
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || "Gagal memperpanjang deadline.");
            }

            const updated: GreenMeetingNote = await res.json();

            setActiveTasks((prev) =>
                prev.map((t) => (t.id === updated.id ? updated : t))
            );

            toast("Batas waktu tugas berhasil diperpanjang.", "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memperpanjang deadline.", "error");
            throw err;
        }
    };

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
            {/* Header Judul Halaman */}
            <div className="bg-card border border-border rounded-xl p-4 sm:p-6 shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center gap-1.5">
                        <ListTodo size={12} />
                        Pelacak Tindak Lanjut
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        {activeTasks.length} Tugas Aktif Berjalan
                    </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Monitoring & Pelacakan Tugas Lintas Departemen
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Pantau progres instruksi rapat, perpanjangan tenggat waktu bertingkat (multi-deadline), dan evaluasi ketepatan penyelesaian tugas.
                </p>
            </div>

            {/* Sub-Navigasi Dropdown Green Meeting Tabs */}
            <GreenMeetingNavTabs tasksCount={activeTasks.length} />

            {/* Error Banner */}
            {loadError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-sm">
                    <AlertCircle size={18} />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Tabel Pelacak Tugas */}
            <TasksTrackerTab
                tasks={activeTasks}
                config={config}
                onUpdateTaskStatus={handleUpdateTaskStatus}
                onExtendDeadline={handleExtendDeadline}
                loading={loading}
            />
        </div>
    );
}
