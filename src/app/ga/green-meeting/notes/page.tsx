"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/components/Toast";
import { toWIBDateString } from "@/lib/timezone";
import { reportClientError } from "@/lib/clientErrors";

import GreenMeetingHeader from "../components/GreenMeetingHeader";
import GreenMeetingNavTabs from "../components/GreenMeetingNavTabs";
import NotesTab from "../components/NotesTab";

import type {
    GreenMeetingSession,
    GreenMeetingNote,
    GreenMeetingUnit,
    DepartmentInfo,
    GreenMeetingNoteType,
    GreenMeetingOriginType,
    GreenMeetingTaskStatus,
} from "../types";
import type { NoteTargetItem } from "@/lib/services/greenMeetingService";

export default function GreenMeetingNotesPage() {
    const toast = useToast();
    const todayStr = toWIBDateString();

    const [currentDateStr, setCurrentDateStr] = useState<string>(todayStr);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>("");

    const [session, setSession] = useState<GreenMeetingSession | null>(null);
    const [offDayInfo, setOffDayInfo] = useState<{ isOffDay: boolean; reason?: string }>({ isOffDay: false });
    const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
    const [divisions, setDivisions] = useState<{ id: string; name: string }[]>([]);
    const [activeTasksCount, setActiveTasksCount] = useState<number>(0);

    const fetchedDateRef = useRef<string | null>(null);

    const loadSessionData = useCallback(async (targetDate: string) => {
        setLoading(true);
        setLoadError("");

        try {
            const [sessionRes, tasksRes, unitsRes] = await Promise.all([
                fetch(`/api/green-meeting/sessions?date=${targetDate}`),
                fetch("/api/green-meeting/notes?activeTasks=true"),
                fetch("/api/green-meeting/units"),
            ]);

            if (!sessionRes.ok) throw new Error("Gagal memuat sesi rapat.");

            const sessionData = await sessionRes.json();
            setSession(sessionData.session);
            setOffDayInfo(sessionData.offDayInfo || { isOffDay: false });

            if (tasksRes.ok) {
                const tasksData: GreenMeetingNote[] = await tasksRes.json();
                setActiveTasksCount(tasksData.length);
            }

            if (unitsRes.ok) {
                const unitsData: GreenMeetingUnit[] = await unitsRes.json();
                const depts = unitsData
                    .filter((u) => u.isActiveInMeeting)
                    .map((u) => u.department);
                setDepartments(depts);

                const divMap = new Map<string, { id: string; name: string }>();
                for (const u of unitsData) {
                    if (u.department.division) {
                        divMap.set(u.department.division.id, u.department.division);
                    }
                }
                setDivisions(Array.from(divMap.values()));
            }
        } catch (err) {
            reportClientError("GreenMeetingNotesPage", "Gagal memuat data notulensi", err);
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

    const handleCreateNote = async (data: {
        type: GreenMeetingNoteType;
        content: string;
        originType: GreenMeetingOriginType;
        originName: string;
        isAllTarget: boolean;
        targets?: NoteTargetItem[];
        initialDeadlineDate?: string;
    }) => {
        if (!session) return;
        try {
            const res = await fetch("/api/green-meeting/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId: session.id,
                    ...data,
                }),
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || "Gagal menambahkan butir notulen.");
            }

            const newNote: GreenMeetingNote = await res.json();
            setSession((prev) => {
                if (!prev) return null;
                return {
                    ...prev,
                    notes: [newNote, ...(prev.notes || [])],
                };
            });
            if (newNote.type === "TUGAS") {
                setActiveTasksCount((prev) => prev + 1);
            }
            toast("Butir notulen berhasil ditambahkan.", "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal menambahkan notulen.", "error");
            throw err;
        }
    };

    const handleUpdateNote = async (noteId: string, data: {
        type: GreenMeetingNoteType;
        content: string;
        originType: GreenMeetingOriginType;
        originName: string;
        isAllTarget: boolean;
        targets?: NoteTargetItem[];
        initialDeadlineDate?: string;
        changeReason: string;
    }) => {
        try {
            const res = await fetch(`/api/green-meeting/notes/${noteId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || "Gagal memperbarui notulensi.");
            }

            const updatedNote: GreenMeetingNote = await res.json();
            setSession((prev) => prev ? {
                ...prev,
                notes: prev.notes.map((note) => note.id === noteId ? updatedNote : note),
            } : null);
            toast("Notulensi berhasil diperbarui dan riwayat revisi disimpan.", "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memperbarui notulensi.", "error");
            throw err;
        }
    };

    const handleUpdateTaskStatus = async (noteId: string, status: GreenMeetingTaskStatus) => {
        try {
            const res = await fetch("/api/green-meeting/notes", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ noteId, taskStatus: status }),
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.error || "Gagal memperbarui status tugas.");
            }

            const updatedNote: GreenMeetingNote = await res.json();
            setSession((prev) => {
                if (!prev) return null;
                return {
                    ...prev,
                    notes: prev.notes.map((n) => (n.id === noteId ? updatedNote : n)),
                };
            });
            toast(`Status tugas berhasil diubah menjadi ${status}.`, "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memperbarui status tugas.", "error");
            throw err;
        }
    };

    const notes = session?.notes || [];
    const attendanceCount = session?.attendances?.length || 0;

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
                attendanceCount={attendanceCount}
                notesCount={notes.length}
                tasksCount={activeTasksCount}
            />

            {/* Error Banner */}
            {loadError && (
                <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-2 text-sm">
                    <AlertCircle size={18} />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Form & List Notulensi Rapat */}
            <NotesTab
                notes={notes}
                departments={departments}
                divisions={divisions}
                onCreateNote={handleCreateNote}
                onUpdateNote={handleUpdateNote}
                onUpdateTaskStatus={handleUpdateTaskStatus}
            />
        </div>
    );
}
