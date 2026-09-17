"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/components/Toast";
import { toWIBDateString } from "@/lib/timezone";
import { reportClientError } from "@/lib/clientErrors";

import GreenMeetingHeader from "../components/GreenMeetingHeader";
import GreenMeetingNavTabs from "../components/GreenMeetingNavTabs";
import GreenMeetingHudCards from "../components/GreenMeetingHudCards";
import AttendanceTab from "../components/AttendanceTab";

import type {
    GreenMeetingSession,
    GreenMeetingNote,
    GreenMeetingAttendanceStatus,
} from "../types";

export default function GreenMeetingAttendancePage() {
    const toast = useToast();
    const todayStr = toWIBDateString();

    const [currentDateStr, setCurrentDateStr] = useState<string>(todayStr);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>("");

    const [session, setSession] = useState<GreenMeetingSession | null>(null);
    const [offDayInfo, setOffDayInfo] = useState<{ isOffDay: boolean; reason?: string }>({ isOffDay: false });
    const [activeTasks, setActiveTasks] = useState<GreenMeetingNote[]>([]);

    const fetchedDateRef = useRef<string | null>(null);

    const loadSessionData = useCallback(async (targetDate: string) => {
        setLoading(true);
        setLoadError("");

        try {
            const [sessionRes, tasksRes] = await Promise.all([
                fetch(`/api/green-meeting/sessions?date=${targetDate}`),
                fetch("/api/green-meeting/notes?activeTasks=true"),
            ]);

            if (!sessionRes.ok) throw new Error("Gagal memuat sesi rapat.");

            const sessionData = await sessionRes.json();
            setSession(sessionData.session);
            setOffDayInfo(sessionData.offDayInfo || { isOffDay: false });

            if (tasksRes.ok) {
                const tasksData: GreenMeetingNote[] = await tasksRes.json();
                setActiveTasks(tasksData);
            }
        } catch (err) {
            reportClientError("GreenMeetingAttendancePage", "Gagal memuat data presensi", err);
            setLoadError(err instanceof Error ? err.message : "Terjadi kesalahan memuat data.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (fetchedDateRef.current === currentDateStr) return;
        fetchedDateRef.current = currentDateStr;
        void loadSessionData(currentDateStr);
    }, [currentDateStr, loadSessionData]);

    const handleRefresh = useCallback(() => {
        void loadSessionData(currentDateStr);
    }, [currentDateStr, loadSessionData]);

    const handleUpdateRoom = async (newRoom: string) => {
        if (!session) return;
        try {
            const res = await fetch("/api/green-meeting/sessions", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: session.id, room: newRoom }),
            });
            if (!res.ok) throw new Error("Gagal memperbarui ruangan.");
            toast("Ruangan rapat berhasil diperbarui.", "success");
            setSession((prev) => (prev ? { ...prev, room: newRoom } : null));
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memperbarui ruangan.", "error");
            throw err;
        }
    };

    const handleUpdateTime = async (newTime: string) => {
        if (!session) return;
        try {
            const res = await fetch("/api/green-meeting/sessions", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: session.id, startTime: newTime }),
            });
            if (!res.ok) throw new Error("Gagal memperbarui jam mulai rapat.");
            toast(`Jam mulai rapat diubah menjadi ${newTime} WIB.`, "success");
            setSession((prev) => (prev ? { ...prev, startTime: newTime } : null));
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memperbarui jam rapat.", "error");
            throw err;
        }
    };

    const handleBulkMarkAllPresent = async () => {
        if (!session) return;
        try {
            const res = await fetch("/api/green-meeting/attendance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: session.id, action: "MARK_ALL_PRESENT" }),
            });
            if (!res.ok) throw new Error("Gagal menandai seluruh unit hadir.");
            const data = await res.json();
            setSession((prev) => (prev ? { ...prev, attendances: data.attendances } : null));
            toast("Seluruh perwakilan departemen berhasil ditandai Hadir.", "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memproses presensi massal.", "error");
            throw err;
        }
    };

    const handleBulkUpdateStatus = async (
        attendanceIds: string[],
        action: "MARK_SELECTED_PRESENT" | "MARK_SELECTED_ALPA"
    ) => {
        if (!session) return;
        try {
            const res = await fetch("/api/green-meeting/attendance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId: session.id,
                    action,
                    attendanceIds,
                }),
            });
            if (!res.ok) throw new Error("Gagal memproses aksi massal.");
            const data = await res.json();
            setSession((prev) => (prev ? { ...prev, attendances: data.attendances } : null));
            toast(`Berhasil memperbarui ${attendanceIds.length} departemen terpilih.`, "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memperbarui status presensi massal.", "error");
            throw err;
        }
    };

    const handleUpdateAttendance = async (
        attendanceId: string,
        data: {
            status: GreenMeetingAttendanceStatus;
            representativeName?: string | null;
            permitReason?: string | null;
        }
    ) => {
        try {
            const res = await fetch("/api/green-meeting/attendance", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    attendanceId,
                    status: data.status,
                    permitReason: data.status === "IZIN" ? data.permitReason : undefined,
                    representativeName: data.representativeName,
                }),
            });
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || "Gagal memperbarui status presensi.");
            }
            const updated = await res.json();
            setSession((prev) => {
                if (!prev) return null;
                return {
                    ...prev,
                    attendances: prev.attendances.map((a) => (a.id === attendanceId ? updated : a)),
                };
            });
            toast("Presensi berhasil diperbarui.", "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memperbarui presensi.", "error");
            throw err;
        }
    };

    const attendances = session?.attendances || [];
    const notesCount = session?.notes?.length || 0;

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            {/* Header Kontrol Rapat & Tanggal */}
            <GreenMeetingHeader
                session={session}
                currentDateStr={currentDateStr}
                onDateChange={setCurrentDateStr}
                onUpdateRoom={handleUpdateRoom}
                onUpdateTime={handleUpdateTime}
                onRefresh={handleRefresh}
                loading={loading}
                offDayInfo={offDayInfo}
            />

            {/* Sub-Navigasi Dropdown Green Meeting Tabs */}
            <GreenMeetingNavTabs
                attendanceCount={attendances.length}
                notesCount={notesCount}
                tasksCount={activeTasks.length}
            />

            {/* Error Banner */}
            {loadError && (
                <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-sm">
                    <AlertCircle size={18} />
                    <span>{loadError}</span>
                </div>
            )}

            {/* HUD Cards Ringkasan Presensi */}
            <GreenMeetingHudCards
                attendances={attendances}
                activeTasks={activeTasks}
                currentDateStr={currentDateStr}
            />

            {/* Tabel Presensi Departemen */}
            <div className="mt-6">
                <AttendanceTab
                    attendances={attendances}
                    onUpdateAttendance={handleUpdateAttendance}
                    onBulkMarkAllPresent={handleBulkMarkAllPresent}
                    onBulkUpdateSelected={handleBulkUpdateStatus}
                    loading={loading}
                />
            </div>
        </div>
    );
}
