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
import { apiSend } from "../apiClient";

import type {
    GreenMeetingSession,
    GreenMeetingNote,
    GreenMeetingAttendance,
    GreenMeetingPersonStatus,
    GreenMeetingConfig,
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
    const [config, setConfig] = useState<GreenMeetingConfig | null>(null);

    const fetchedDateRef = useRef<string | null>(null);

    const loadSessionData = useCallback(async (targetDate: string) => {
        setLoading(true);
        setLoadError("");

        try {
            const [sessionRes, tasksRes, configRes] = await Promise.all([
                fetch(`/api/green-meeting/sessions?date=${targetDate}`),
                fetch("/api/green-meeting/notes?activeTasks=true"),
                fetch("/api/green-meeting/config"),
            ]);

            let sessionData;
            if (sessionRes.status === 404) {
                // GA: buatkan sesi bila tanggal ini belum ada.
                const createRes = await fetch("/api/green-meeting/sessions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ date: targetDate }),
                });
                if (!createRes.ok) throw new Error("Gagal memuat sesi rapat.");
                const created = await createRes.json();
                sessionData = { session: created, offDayInfo: { isOffDay: false } };
            } else {
                if (!sessionRes.ok) throw new Error("Gagal memuat sesi rapat.");
                sessionData = await sessionRes.json();
            }
            setSession(sessionData.session);
            setOffDayInfo(sessionData.offDayInfo || { isOffDay: false });

            if (tasksRes.ok) {
                const tasksData: GreenMeetingNote[] = await tasksRes.json();
                setActiveTasks(tasksData);
            }

            if (configRes.ok) {
                setConfig(await configRes.json());
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
            await apiSend("/api/green-meeting/sessions", "PATCH", { sessionId: session.id, room: newRoom });
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
            await apiSend("/api/green-meeting/sessions", "PATCH", { sessionId: session.id, startTime: newTime });
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
            const json = await apiSend<{ data?: { attendances: GreenMeetingAttendance[] }; attendances?: GreenMeetingAttendance[] }>(
                "/api/green-meeting/attendance",
                "POST",
                { sessionId: session.id, action: "MARK_ALL_PRESENT" }
            );
            const attendances = json.data?.attendances ?? json.attendances ?? [];
            setSession((prev) => (prev ? { ...prev, attendances } : null));
            toast("Seluruh karyawan berhasil ditandai Hadir.", "success");
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
            const json = await apiSend<{ data?: { attendances: GreenMeetingAttendance[] }; attendances?: GreenMeetingAttendance[] }>(
                "/api/green-meeting/attendance",
                "POST",
                {
                    sessionId: session.id,
                    action,
                    attendanceIds,
                }
            );
            const attendances = json.data?.attendances ?? json.attendances ?? [];
            setSession((prev) => (prev ? { ...prev, attendances } : null));
            toast(`Berhasil memperbarui ${attendanceIds.length} karyawan terpilih.`, "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memperbarui status presensi massal.", "error");
            throw err;
        }
    };

    const handleUpdateAttendance = async (
        attendanceId: string,
        data: {
            status: GreenMeetingPersonStatus;
        }
    ) => {
        try {
            const json = await apiSend<{ data?: GreenMeetingAttendance } & Partial<GreenMeetingAttendance>>(
                "/api/green-meeting/attendance",
                "PATCH",
                {
                    attendanceId,
                    status: data.status,
                }
            );
            const updated = (json.data ?? json) as GreenMeetingAttendance;
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

    const refreshSession = useCallback(async () => {
        if (!session) return;
        try {
            const res = await fetch(`/api/green-meeting/sessions?date=${currentDateStr}`);
            if (!res.ok) return;
            const sessionData = await res.json();
            setSession(sessionData.session);
        } catch {
            // abaikan, data lama tetap tampil
        }
    }, [session, currentDateStr]);

    const handleCreateDeptIzin = async (data: { departmentId: string; reason: string }) => {
        if (!session) return;
        await apiSend("/api/green-meeting/excuses", "POST", { sessionId: session.id, ...data });
        toast("Izin dept berhasil dicatat.", "success");
        await refreshSession();
    };

    const handleDeleteDeptIzin = async (id: string) => {
        try {
            await apiSend(`/api/green-meeting/excuses?id=${encodeURIComponent(id)}`, "DELETE");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menghapus izin.", "error");
            return;
        }
        toast("Catatan izin dihapus.", "success");
        await refreshSession();
    };

    const handleQuickMark = async (employeeId: string) => {
        if (!session) return;
        try {
            await apiSend("/api/green-meeting/attendance/quick", "POST", { sessionId: session.id, employeeId });
            toast("Karyawan ditandai Hadir.", "success");
            await refreshSession();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menandai hadir.", "error");
            throw err;
        }
    };

    const attendances = session?.attendances || [];
    const deptIzins = session?.deptIzins || [];
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
                configDefaults={config}
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
                deptIzins={deptIzins}
                activeTasks={activeTasks}
                currentDateStr={currentDateStr}
            />

            {/* Tabel Presensi Karyawan */}
            <div className="mt-6">
                <AttendanceTab
                    attendances={attendances}
                    deptIzins={deptIzins}
                    onUpdateAttendance={handleUpdateAttendance}
                    onBulkMarkAllPresent={handleBulkMarkAllPresent}
                    onBulkUpdateSelected={handleBulkUpdateStatus}
                    onQuickMark={handleQuickMark}
                    onCreateDeptIzin={handleCreateDeptIzin}
                    onDeleteDeptIzin={handleDeleteDeptIzin}
                    loading={loading}
                />
            </div>
        </div>
    );
}
