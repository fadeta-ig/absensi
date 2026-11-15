"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
    Calendar,
    Clock,
    MapPin,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    ListTodo,
    ChevronLeft,
    ChevronRight,
    FileText,
    Info,
    Building2,
    User,
    History,
    Send,
} from "lucide-react";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table";
import { addCalendarDays, toWIBDateString } from "@/lib/timezone";
import { reportClientError } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import EmptyState from "@/components/ui/EmptyState";
import { isGreenMeetingTargetRelevant, isGreenMeetingNoteRelevant } from "@/lib/greenMeetingTargeting";
import { personRowsOf, legacyRowsOf, countAttendance } from "@/app/ga/green-meeting/selectors";
import { AttendanceBadge, TaskStatusBadge } from "@/components/green-meeting/GreenMeetingBadges";
import type {
    GreenMeetingAttendance,
    GreenMeetingNote,
    GreenMeetingNoteTarget,
    GreenMeetingSession,
} from "@/app/ga/green-meeting/types";

type TabKey = "NOTES" | "MY_DEPT_TASKS" | "ATTENDANCE";

export default function EmployeeGreenMeetingPage() {
    const todayStr = toWIBDateString();

    const [currentDateStr, setCurrentDateStr] = useState<string>(todayStr);
    const [activeTab, setActiveTab] = useState<TabKey>("NOTES");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>("");

    // User State (Logged-in employee)
    const [userDeptId, setUserDeptId] = useState<string | null>(null);
    const [userDivisionId, setUserDivisionId] = useState<string | null>(null);
    const [userEmployeeId, setUserEmployeeId] = useState<string | null>(null);
    const [userDeptName, setUserDeptName] = useState<string>("");

    // Session Data
    const [session, setSession] = useState<GreenMeetingSession | null>(null);
    const [offDayInfo, setOffDayInfo] = useState<{ isOffDay: boolean; reason?: string }>({ isOffDay: false });
    const [myDeptTasks, setMyDeptTasks] = useState<GreenMeetingNote[]>([]);

    // Filter Notulensi
    const [noteFilter, setNoteFilter] = useState<"ALL" | "RELEVANT" | "PERSONAL" | "TUGAS" | "DIREKSI">("ALL");

    const fetchedRef = useRef<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const [profileLoaded, setProfileLoaded] = useState(false);

    // 1. Fetch User Profile
    useEffect(() => {
        const controller = new AbortController();
        const fetchUser = async () => {
            try {
                const res = await fetch("/api/auth/me", { signal: controller.signal });
                if (res.ok) {
                    const data = await res.json();
                    setUserDeptId(data.departmentId || null);
                    setUserDivisionId(data.divisionId || null);
                    setUserEmployeeId(data.employeeId || null);
                    if (data.employee?.department?.name) {
                        setUserDeptName(data.employee.department.name);
                    }
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                reportClientError("EmployeeGreenMeeting", "Gagal memuat profil user", err);
            } finally {
                if (!controller.signal.aborted) setProfileLoaded(true);
            }
        };
        void fetchUser();
        return () => controller.abort();
    }, []);

    // 2. Fetch Session & Notes (tunda sampai profil siap agar tidak double-fetch null→isi)
    const loadData = useCallback(
        async (targetDate: string, deptId: string | null, empId: string | null, divId: string | null) => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            setLoading(true);
            setLoadError("");
            // Reset tugas tanggal lama agar tidak stale saat tanggal/scope berubah.
            setMyDeptTasks([]);

            try {
                const promises: [Promise<Response>, Promise<Response>?] = [
                    fetch(`/api/green-meeting/sessions?date=${targetDate}`, { signal: controller.signal }),
                ];

                if (deptId || empId || divId) {
                    const query = new URLSearchParams();
                    if (deptId) query.set("departmentId", deptId);
                    if (empId) query.set("employeeId", empId);
                    if (divId) query.set("divisionId", divId);
                    promises.push(fetch(`/api/green-meeting/notes?${query.toString()}`, { signal: controller.signal }));
                }

                const [sessionRes, deptTasksRes] = await Promise.all(promises);
                if (controller.signal.aborted) return;

                if (sessionRes.status === 404) {
                    setSession(null);
                    setOffDayInfo({ isOffDay: false });
                } else {
                    if (!sessionRes.ok) throw new Error("Gagal memuat agenda rapat.");
                    const sessionJson = await sessionRes.json();
                    if (controller.signal.aborted) return;
                    setSession(sessionJson.session);
                    setOffDayInfo(sessionJson.offDayInfo || { isOffDay: false });
                }

                if (deptTasksRes) {
                    if (deptTasksRes.ok) {
                        const tasksJson = await deptTasksRes.json();
                        if (!controller.signal.aborted) setMyDeptTasks(tasksJson);
                    } else if (!controller.signal.aborted) {
                        // Error parsial tugas: jangan tampilkan stale diam-diam.
                        setLoadError("Gagal memuat daftar tugas departemen. Data sesi tetap tampil.");
                    }
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                reportClientError("EmployeeGreenMeeting", "Gagal memuat data rapat", err);
                setLoadError(err instanceof Error ? err.message : "Terjadi kesalahan memuat data.");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        },
        []
    );

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    useEffect(() => {
        if (!profileLoaded) return;
        if (fetchedRef.current === `${currentDateStr}_${userDeptId}_${userDivisionId}_${userEmployeeId}`) return;
        fetchedRef.current = `${currentDateStr}_${userDeptId}_${userDivisionId}_${userEmployeeId}`;
        void loadData(currentDateStr, userDeptId, userEmployeeId, userDivisionId);
    }, [profileLoaded, currentDateStr, userDeptId, userEmployeeId, userDivisionId, loadData]);

    const handleRefresh = useCallback(() => {
        void loadData(currentDateStr, userDeptId, userEmployeeId, userDivisionId);
    }, [currentDateStr, userDeptId, userEmployeeId, userDivisionId, loadData]);

    // Format tanggal
    const formattedDate = new Date(`${currentDateStr}T00:00:00+07:00`).toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
    });

    const attendances = useMemo(() => session?.attendances || [], [session]);
    const personRows = useMemo(() => personRowsOf(attendances), [attendances]);
    const legacyRows = useMemo(() => legacyRowsOf(attendances), [attendances]);
    const { hadir: hadirCount, percent: attendancePercent } = useMemo(
        () => countAttendance(personRows),
        [personRows]
    );

    // Kumpulan dept yang berizin pada sesi ini (dept-only; division tidak ada di DeptIzin).
    const izinDeptIds = useMemo(
        () => new Set((session?.deptIzins || []).map((i) => i.departmentId).filter(Boolean) as string[]),
        [session]
    );
    const hasDeptIzin = useCallback(
        (att: GreenMeetingAttendance) =>
            Boolean(att.departmentId && izinDeptIds.has(att.departmentId)),
        [izinDeptIds]
    );

    const isActiveTask = useCallback(
        (t: GreenMeetingNote) =>
            t.taskStatus === "BELUM_DIMULAI" || t.taskStatus === "SEDANG_BERJALAN",
        []
    );
    const activeDeptTaskCount = useMemo(
        () => myDeptTasks.filter(isActiveTask).length,
        [myDeptTasks, isActiveTask]
    );

    // Data Notulensi & Smart Filter Relevansi
    const allNotes = useMemo(() => session?.notes || [], [session]);
    const viewerScope = useMemo(() => ({
        employeeId: userEmployeeId,
        departmentId: userDeptId,
        divisionId: userDivisionId,
    }), [userEmployeeId, userDeptId, userDivisionId]);

    const countRelevant = useMemo(
        () => allNotes.filter((note) => isGreenMeetingNoteRelevant(note, viewerScope)).length,
        [allNotes, viewerScope]
    );

    const countPersonal = useMemo(
        () => allNotes.filter((note) =>
            note.targets?.some((t) => t.targetType === "EMPLOYEE" && isGreenMeetingTargetRelevant(t, viewerScope))
        ).length,
        [allNotes, viewerScope]
    );

    const countTasks = useMemo(() => allNotes.filter((note) => note.type === "TUGAS").length, [allNotes]);
    const countDireksi = useMemo(() => allNotes.filter((note) => note.originType === "DIREKSI").length, [allNotes]);

    const filteredNotes = useMemo(() => allNotes.filter((note) => {
        if (noteFilter === "ALL") return true;
        if (noteFilter === "RELEVANT") return isGreenMeetingNoteRelevant(note, viewerScope);
        if (noteFilter === "PERSONAL") {
            return note.targets?.some((t) => t.targetType === "EMPLOYEE" && isGreenMeetingTargetRelevant(t, viewerScope));
        }
        if (noteFilter === "TUGAS") return note.type === "TUGAS";
        if (noteFilter === "DIREKSI") return note.originType === "DIREKSI";
        return true;
    }), [allNotes, noteFilter, viewerScope]);

    return (
        <div className="w-full space-y-5 min-w-0 max-w-full overflow-x-hidden" aria-busy={loading}>
            <h1 className="sr-only">Green Meeting</h1>
            {/* Header Super Compact: Tanggal, Lokasi, Jam, dan Kehadiran */}
            <div className="emp-surface p-3 sm:p-4 space-y-3 min-w-0 overflow-hidden">
                {/* Top Row: Date Navigation & Quick Actions */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                    {/* Date Navigator */}
                    <div className="flex items-center bg-[color-mix(in_srgb,var(--muted)_60%,transparent)] border border-[var(--border)] rounded-xl p-1 min-w-0 flex-1 max-w-[260px] sm:max-w-[280px]">
                        <button
                            type="button"
                            onClick={() => {
                                setCurrentDateStr(addCalendarDays(currentDateStr, -1));
                            }}
                            className="min-w-11 min-h-11 p-2.5 hover:bg-[var(--background)] rounded-lg text-[var(--text-primary)] transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                            title="Hari Sebelumnya"
                            aria-label="Hari Sebelumnya"
                        >
                            <ChevronLeft size={16} aria-hidden="true" />
                        </button>
                        <label
                            className="relative flex items-center justify-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--background)_80%,transparent)] rounded-lg cursor-pointer transition-colors group flex-1 min-w-0"
                            title="Klik untuk memilih tanggal dari kalender"
                            onClick={(e) => {
                                try {
                                    const input = e.currentTarget.querySelector("input[type='date']") as HTMLInputElement | null;
                                    input?.showPicker?.();
                                } catch {}
                            }}
                        >
                            <Calendar size={13} className="text-primary shrink-0 group-hover:scale-110 transition-transform" />
                            <span className="select-none truncate">{formattedDate}</span>
                            <input
                                type="date"
                                value={currentDateStr}
                                onChange={(e) => {
                                    if (e.target.value) setCurrentDateStr(e.target.value);
                                }}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                aria-label="Pilih tanggal rapat"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => {
                                setCurrentDateStr(addCalendarDays(currentDateStr, 1));
                            }}
                            className="min-w-11 min-h-11 p-2.5 hover:bg-[var(--background)] rounded-lg text-[var(--text-primary)] transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                            title="Hari Berikutnya"
                            aria-label="Hari Berikutnya"
                        >
                            <ChevronRight size={16} aria-hidden="true" />
                        </button>
                    </div>

                    {/* Quick Actions (Hari Ini & Refresh) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => setCurrentDateStr(todayStr)}
                            className="px-3 py-2.5 min-h-11 text-xs font-semibold rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--text-primary)] transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                        >
                            Hari Ini
                        </button>

                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={loading}
                            aria-busy={loading}
                            className="p-2.5 min-w-11 min-h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all disabled:opacity-50 shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                            title="Muat Ulang"
                            aria-label="Muat Ulang Data"
                        >
                            <RefreshCw size={14} aria-hidden="true" className={loading ? "animate-spin text-primary" : ""} />
                        </button>
                    </div>
                </div>

                {/* Off-Day Alert Banner if Active */}
                {offDayInfo?.isOffDay && (
                    <div className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning-border)] flex items-center gap-2 min-w-0">
                        <AlertCircle size={14} className="shrink-0 text-[var(--warning)]" />
                        <span className="truncate">{offDayInfo.reason || "Hari Libur Rutin / Libur Nasional"}</span>
                    </div>
                )}

                {/* Meeting Metadata Strip: 3-column micro card layout */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-1 border-t border-[color-mix(in_srgb,var(--border)_60%,transparent)] text-xs min-w-0">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 p-2 rounded-xl bg-[color-mix(in_srgb,var(--muted)_40%,transparent)] border border-[color-mix(in_srgb,var(--border)_50%,transparent)] min-w-0 overflow-hidden">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <MapPin size={13} />
                        </div>
                        <div className="min-w-0 flex-1 w-full">
                            <p className="text-[11px] sm:text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider truncate">Lokasi</p>
                            <p className="text-[11px] sm:text-xs font-semibold text-[var(--text-primary)] truncate" title={session?.room || "Belum ada sesi"}>
                                {session ? session.room : "—"}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 p-2 rounded-xl bg-[var(--info-bg)] border border-[var(--info-border)] min-w-0 overflow-hidden">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[color-mix(in_srgb,var(--info-border)_60%,transparent)] text-[var(--info)] flex items-center justify-center shrink-0">
                            <Clock size={13} />
                        </div>
                        <div className="min-w-0 flex-1 w-full">
                            <p className="text-[11px] sm:text-xs text-[var(--text-muted)] font-medium uppercase tracking-wider truncate">Mulai</p>
                            <p className="text-[11px] sm:text-xs font-semibold text-[var(--text-primary)] truncate">
                                {session ? `${session.startTime} WIB` : "—"}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 p-2 rounded-xl bg-[var(--success-bg)] border border-[var(--success-border)] min-w-0 overflow-hidden">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[color-mix(in_srgb,var(--success-border)_60%,transparent)] text-[var(--success)] flex items-center justify-center shrink-0">
                            <CheckCircle2 size={13} aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1 w-full">
                            <p className="text-[11px] sm:text-xs text-[var(--success)] font-medium uppercase tracking-wider truncate">Kehadiran</p>
                            <p className="text-[11px] sm:text-xs font-bold text-[var(--success)] truncate">
                                {hadirCount}/{personRows.length} Hadir ({attendancePercent}%)
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {loadError && (
                <FeedbackMessage variant="error" compact>
                    <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                            <AlertCircle size={14} className="shrink-0" />
                            <span className="break-words">{loadError}</span>
                        </span>
                        <button
                            type="button"
                            onClick={handleRefresh}
                            className="shrink-0 px-3 py-2.5 min-h-11 text-xs font-semibold rounded-lg border border-[var(--destructive-border)]"
                        >
                            Coba lagi
                        </button>
                    </div>
                </FeedbackMessage>
            )}

            {/* Segmented Minimalist Tab Navigation */}
            <div
                role="tablist"
                aria-label="Pilih tampilan rapat"
                className={`grid ${userDeptId ? "grid-cols-3" : "grid-cols-2"} gap-1.5 bg-[color-mix(in_srgb,var(--muted)_70%,transparent)] p-1.5 rounded-2xl border border-[color-mix(in_srgb,var(--border)_80%,transparent)] min-w-0`}
            >
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "NOTES"}
                    onClick={() => setActiveTab("NOTES")}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-1.5 sm:px-3 text-xs font-semibold rounded-xl border border-transparent transition-all min-w-0 min-h-11 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                        activeTab === "NOTES"
                            ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]"
                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--secondary)]"
                    }`}
                >
                    <FileText size={14} className="shrink-0 text-primary" />
                    <span className="truncate">Notulensi</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        activeTab === "NOTES" ? "bg-primary/10 text-primary" : "bg-[var(--muted)] text-[var(--text-muted)]"
                    }`}>
                        {allNotes.length}
                    </span>
                </button>

                {userDeptId && (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === "MY_DEPT_TASKS"}
                        onClick={() => setActiveTab("MY_DEPT_TASKS")}
                        className={`flex items-center justify-center gap-1.5 py-2.5 px-1.5 sm:px-3 text-xs font-semibold rounded-xl border border-transparent transition-all min-w-0 min-h-11 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                            activeTab === "MY_DEPT_TASKS"
                                ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--secondary)]"
                        }`}
                    >
                        <ListTodo size={14} className="shrink-0 text-[var(--primary)]" />
                        <span className="truncate">Tugas Dept</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            activeTab === "MY_DEPT_TASKS" ? "bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]" : "bg-[var(--muted)] text-[var(--text-muted)]"
                        }`}>
                            {activeDeptTaskCount}
                        </span>
                    </button>
                )}

                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "ATTENDANCE"}
                    onClick={() => setActiveTab("ATTENDANCE")}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-1.5 sm:px-3 text-xs font-semibold rounded-xl border border-transparent transition-all min-w-0 min-h-11 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                        activeTab === "ATTENDANCE"
                            ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]"
                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--secondary)]"
                    }`}
                >
                    <Building2 size={14} aria-hidden="true" className="shrink-0 text-[var(--primary)]" />
                    <span className="truncate">Presensi</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                        activeTab === "ATTENDANCE" ? "bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]" : "bg-[var(--muted)] text-[var(--text-muted)]"
                    }`}>
                        {personRows.length}
                    </span>
                </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="space-y-3 min-w-0">
                {loading && !session && myDeptTasks.length === 0 && (
                    <div className="space-y-2.5 animate-pulse" role="status" aria-label="Memuat data rapat">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="emp-surface p-4 space-y-2">
                                <div className="h-3 w-1/3 rounded bg-[var(--muted)]" />
                                <div className="h-3 w-full rounded bg-[var(--muted)]" />
                                <div className="h-3 w-2/3 rounded bg-[var(--muted)]" />
                            </div>
                        ))}
                    </div>
                )}
                {/* TAB 1: NOTULENSI RAPAT */}
                {activeTab === "NOTES" && (
                    <div className="space-y-3 min-w-0">
                        {/* Sub-filter Pills */}
                        <div
                            role="group"
                            aria-label="Filter notulensi"
                            className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none w-full max-w-full min-w-0 snap-x"
                        >
                            <button
                                type="button"
                                onClick={() => setNoteFilter("ALL")}
                                aria-pressed={noteFilter === "ALL"}
                                className={`px-3 py-2.5 min-h-11 text-xs font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 snap-start focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                                    noteFilter === "ALL"
                                        ? "bg-[var(--primary)] text-white"
                                        : "bg-[color-mix(in_srgb,var(--muted)_70%,transparent)] hover:bg-[var(--muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--border)_50%,transparent)]"
                                }`}
                            >
                                Semua Notulen ({allNotes.length})
                            </button>
                            {(userDeptId || userEmployeeId) && (
                                <button
                                    type="button"
                                    onClick={() => setNoteFilter("RELEVANT")}
                                    aria-pressed={noteFilter === "RELEVANT"}
                                    className={`px-3 py-2.5 min-h-11 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 snap-start focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                                        noteFilter === "RELEVANT"
                                            ? "bg-[var(--primary)] text-white"
                                            : "bg-[color-mix(in_srgb,var(--muted)_70%,transparent)] hover:bg-[var(--muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--border)_50%,transparent)]"
                                    }`}
                                    title="Tampilkan notulensi yang ditujukan untuk Anda atau departemen Anda"
                                >
                                    <span>Untuk Saya & Dept</span>
                                    <span
                                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                            noteFilter === "RELEVANT"
                                                ? "bg-white/20 text-white"
                                                : "bg-[var(--card)] text-[var(--text-primary)]"
                                        }`}
                                    >
                                        {countRelevant}
                                    </span>
                                </button>
                            )}
                            {countPersonal > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setNoteFilter("PERSONAL")}
                                    aria-pressed={noteFilter === "PERSONAL"}
                                    className={`px-3 py-2.5 min-h-11 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 snap-start focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                                        noteFilter === "PERSONAL"
                                            ? "bg-[var(--primary)] text-white"
                                            : "bg-[color-mix(in_srgb,var(--muted)_70%,transparent)] hover:bg-[var(--muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--border)_50%,transparent)]"
                                    }`}
                                    title="Tampilkan butir notulensi yang khusus ditujukan kepada Anda pribadi"
                                >
                                    <span>Khusus Saya</span>
                                    <span
                                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                            noteFilter === "PERSONAL"
                                                ? "bg-white/20 text-white"
                                                : "bg-[var(--card)] text-[var(--text-primary)]"
                                        }`}
                                    >
                                        {countPersonal}
                                    </span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setNoteFilter("TUGAS")}
                                aria-pressed={noteFilter === "TUGAS"}
                                className={`px-3 py-2.5 min-h-11 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 snap-start focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                                    noteFilter === "TUGAS"
                                        ? "bg-[var(--primary)] text-white"
                                        : "bg-[color-mix(in_srgb,var(--muted)_70%,transparent)] hover:bg-[var(--muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--border)_50%,transparent)]"
                                }`}
                            >
                                <span>Tugas Tindak Lanjut</span>
                                <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        noteFilter === "TUGAS"
                                            ? "bg-white/20 text-white"
                                            : "bg-[var(--card)] text-[var(--text-primary)]"
                                    }`}
                                >
                                    {countTasks}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setNoteFilter("DIREKSI")}
                                aria-pressed={noteFilter === "DIREKSI"}
                                className={`px-3 py-2.5 min-h-11 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 snap-start focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
                                    noteFilter === "DIREKSI"
                                        ? "bg-[var(--primary)] text-white"
                                        : "bg-[color-mix(in_srgb,var(--muted)_70%,transparent)] hover:bg-[var(--muted)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--border)_50%,transparent)]"
                                }`}
                            >
                                <span>Arahan Direksi</span>
                                <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        noteFilter === "DIREKSI"
                                            ? "bg-white/20 text-white"
                                            : "bg-[var(--card)] text-[var(--text-primary)]"
                                    }`}
                                >
                                    {countDireksi}
                                </span>
                            </button>
                        </div>

                        {/* Note Cards List */}
                        <div className="space-y-3 min-w-0">
                            {filteredNotes.length === 0 ? (
                                <EmptyState
                                    icon={Info}
                                    className="w-full min-w-0 overflow-hidden"
                                    title={
                                        noteFilter === "RELEVANT" || noteFilter === "PERSONAL"
                                            ? "Tidak ada notulensi khusus untuk Anda atau departemen Anda pada tanggal ini."
                                            : noteFilter === "TUGAS"
                                            ? "Tidak ada tugas tindak lanjut pada tanggal ini."
                                            : noteFilter === "DIREKSI"
                                            ? "Tidak ada arahan direksi pada tanggal ini."
                                            : "Belum ada catatan notulen pada sesi ini."
                                    }
                                    action={noteFilter !== "ALL" && allNotes.length > 0 ? (
                                        <button
                                            type="button"
                                            onClick={() => setNoteFilter("ALL")}
                                            className="text-xs text-primary hover:underline font-semibold inline-flex items-center gap-1"
                                        >
                                            Tampilkan semua notulensi rapat ({allNotes.length})
                                        </button>
                                    ) : undefined}
                                />
                            ) : (
                                filteredNotes.map((note) => {
                                    const isTask = note.type === "TUGAS";
                                    const isJustInfo = note.type === "JUST_INFO";
                                    const isComplete = note.taskStatus === "SELESAI";
                                    const isForMe = (note.targets ?? []).some((t) => isGreenMeetingTargetRelevant(t, viewerScope) && t.targetType === "EMPLOYEE");
                                    const isForMyDept = !isForMe && (note.targets ?? []).some((t) => isGreenMeetingTargetRelevant(t, viewerScope) && t.targetType === "DEPARTMENT");
                                    const isForMyDiv = !isForMe && !isForMyDept && (note.targets ?? []).some((t) => isGreenMeetingTargetRelevant(t, viewerScope) && t.targetType === "DIVISION");

                                    return (
                                        <div
                                            key={note.id}
                                            className={`emp-surface p-3.5 sm:p-4 space-y-3 transition-all min-w-0 overflow-hidden ${
                                                isTask
                                                    ? isComplete
                                                        ? "border-[var(--success-border)]"
                                                        : "border-[color-mix(in_srgb,var(--primary)_30%,transparent)]"
                                                    : "border-[color-mix(in_srgb,var(--border)_80%,transparent)]"
                                            }`}
                                        >
                                            {/* Top Row: Type, Relevance Badges, and Status */}
                                            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[color-mix(in_srgb,var(--border)_60%,transparent)] min-w-0 flex-wrap">
                                                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                                    {/* Type Pill */}
                                                    <span
                                                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border shrink-0 ${
                                                            isTask
                                                                ? "bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)] border-[color-mix(in_srgb,var(--primary)_20%,transparent)]"
                                                                : isJustInfo
                                                                    ? "bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-border)]"
                                                                    : "bg-[var(--secondary)] text-[var(--text-secondary)] border-[var(--border)]"
                                                        }`}
                                                    >
                                                        {isTask ? "Tugas Tindak Lanjut" : isJustInfo ? "Just Information" : "Informasi"}
                                                    </span>

                                                    {/* Smart Relevance Badges */}
                                                    {isForMe && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)] shrink-0">
                                                            <User size={11} aria-hidden="true" />
                                                            Untuk Anda
                                                        </span>
                                                    )}
                                                    {!isForMe && isForMyDept && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-[var(--info-bg)] text-[var(--info)] border border-[var(--info-border)] shrink-0">
                                                            <Building2 size={11} aria-hidden="true" />
                                                            Dept Anda
                                                        </span>
                                                    )}
                                                    {!isForMe && !isForMyDept && isForMyDiv && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)] border border-[color-mix(in_srgb,var(--primary)_20%,transparent)] shrink-0">
                                                            Divisi Anda
                                                        </span>
                                                    )}
                                                    {note.lastEditedAt && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-[var(--muted)] text-[var(--text-muted)] border border-[var(--border)] shrink-0">
                                                            <History size={11} aria-hidden="true" />
                                                            Direvisi
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Human-Friendly Status Badge */}
                                                {isTask && (
                                                    <div className="shrink-0">
                                                        <TaskStatusBadge status={note.taskStatus} />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Dedicated Routing Panel: Dari ➔ Kepada (Zero Leak Guarantee) */}
                                            <div className="bg-[color-mix(in_srgb,var(--muted)_40%,transparent)] border border-[color-mix(in_srgb,var(--border)_50%,transparent)] rounded-xl p-2 sm:p-2.5 text-xs text-[var(--text-muted)] min-w-0">
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                                                    <div className="flex items-center gap-1.5 shrink-0 text-[var(--text-primary)]">
                                                        <span className="font-semibold text-[var(--text-muted)] text-[11px] flex items-center gap-1">
                                                            <Send size={11} className="text-primary" /> Dari:
                                                        </span>
                                                        <span className="font-bold text-[var(--text-primary)]">{note.originName}</span>
                                                    </div>

                                                    <span className="hidden sm:inline text-[color-mix(in_srgb,var(--text-muted)_50%,transparent)]">•</span>

                                                    <div className="flex items-start sm:items-center gap-1.5 min-w-0 flex-1">
                                                        <span className="font-semibold text-[var(--text-muted)] text-[11px] shrink-0">Kepada:</span>
                                                        <div className="font-semibold text-[var(--text-primary)] break-words [overflow-wrap:anywhere] min-w-0 flex-1 leading-snug">
                                                            {note.isAllTarget ? (
                                                                <span className="text-primary font-bold">Semua Karyawan</span>
                                                            ) : (
                                                                <span>
                                                                    {note.targets
                                                                        ?.map((t: GreenMeetingNoteTarget) => t.label || t.employee?.name || t.division?.name || t.department?.name)
                                                                        .filter(Boolean)
                                                                        .join(" • ") || "Target Spesifik"}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Note Body */}
                                            <div className="text-xs sm:text-sm text-[color-mix(in_srgb,var(--text-primary)_90%,transparent)] whitespace-pre-wrap leading-relaxed font-normal break-words [overflow-wrap:anywhere] min-w-0">
                                                {note.content}
                                            </div>

                                            {/* Footer Info (Tenggat Waktu + overdue) */}
                                            {isTask && note.deadlines && note.deadlines.length > 0 && (() => {
                                                const last = note.deadlines[note.deadlines.length - 1];
                                                const dueStr = new Date(last.deadlineDate).toLocaleDateString("id-ID", {
                                                    day: "numeric",
                                                    month: "short",
                                                    year: "numeric",
                                                    timeZone: "Asia/Jakarta",
                                                });
                                                const todayStr = toWIBDateString();
                                                const dueDay = new Date(last.deadlineDate).toISOString().slice(0, 10);
                                                const isOverdue = note.taskStatus !== "SELESAI" && note.taskStatus !== "DIBATALKAN" && dueDay < todayStr;
                                                return (
                                                <div className="pt-2 border-t border-[color-mix(in_srgb,var(--border)_50%,transparent)] text-[11px] text-[var(--text-muted)] flex items-center justify-between flex-wrap gap-2 min-w-0">
                                                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                                        <Clock size={12} aria-hidden="true" className="text-primary shrink-0" />
                                                        <span className="truncate">
                                                            Tenggat:{" "}
                                                            <strong className="text-[var(--text-primary)] font-semibold">
                                                                {dueStr}
                                                            </strong>
                                                        </span>
                                                        {isOverdue && (
                                                            <span aria-label={`Lewat tenggat sejak ${dueStr}`} className="px-1.5 py-1 rounded text-[11px] font-semibold bg-[var(--destructive-bg)] text-[var(--destructive-text)] border border-[var(--destructive-border)] shrink-0">
                                                                Lewat tenggat
                                                            </span>
                                                        )}
                                                        {note.deadlines.length > 1 && (
                                                            <span className="px-1.5 py-1 rounded text-[11px] font-semibold bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning-border)] shrink-0">
                                                                Perpanjangan ke-{note.deadlines.length - 1}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {note.completedAt && (
                                                        <span className="text-[var(--success)] font-medium inline-flex items-center gap-1 shrink-0">
                                                            <CheckCircle2 size={11} aria-hidden="true" />
                                                            Selesai {new Date(note.completedAt).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}
                                                        </span>
                                                    )}
                                                </div>
                                                );
                                            })()}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 2: TUGAS SAYA & DEPARTEMEN */}
                {activeTab === "MY_DEPT_TASKS" && (
                    <div className="space-y-3 min-w-0">
                        <div className="bg-[color-mix(in_srgb,var(--muted)_40%,transparent)] p-3 rounded-2xl border border-[color-mix(in_srgb,var(--border)_80%,transparent)] text-xs text-[var(--text-muted)] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 min-w-0">
                            <span className="truncate">
                                Tindak lanjut untuk <strong className="text-[var(--text-primary)] font-semibold">{userDeptName || "Departemen Anda"}</strong>:
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)] font-bold border border-[color-mix(in_srgb,var(--primary)_20%,transparent)] shrink-0 self-start sm:self-auto">
                                {activeDeptTaskCount} Tugas Aktif
                            </span>
                        </div>

                        {myDeptTasks.length === 0 ? (
                            <EmptyState
                                icon={CheckCircle2}
                                title="Tidak ada tugas aktif saat ini."
                                description="Seluruh instruksi rapat telah selesai dikerjakan."
                            />
                        ) : (
                            myDeptTasks.map((task) => {
                                const currentDeadline =
                                    task.deadlines && task.deadlines.length > 0 ? task.deadlines[task.deadlines.length - 1] : null;
                                const isCompleted = task.taskStatus === "SELESAI";
                                const isPersonalTask = Boolean(userEmployeeId && task.targets?.some((t) => t.targetType === "EMPLOYEE" && t.employeeId === userEmployeeId));

                                return (
                                    <div
                                        key={task.id}
                                        className={`emp-surface p-3.5 sm:p-4 space-y-2.5 transition-all min-w-0 overflow-hidden ${
                                            isCompleted ? "opacity-75 border-[var(--border)]" : "border-[color-mix(in_srgb,var(--primary)_30%,transparent)]"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap text-xs text-[var(--text-muted)] min-w-0">
                                                <span className="truncate">
                                                    Dari: <strong className="text-[var(--text-primary)] font-semibold">{task.originName}</strong>
                                                </span>
                                                {task.session?.meetingDate && (
                                                    <span className="text-[11px] text-[var(--text-muted)] shrink-0">
                                                        • {new Date(task.session.meetingDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })}
                                                    </span>
                                                )}
                                                {isPersonalTask ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)] shrink-0">
                                                        <User size={11} aria-hidden="true" />
                                                        Tugas Pribadi
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-[var(--info-bg)] text-[var(--info)] border border-[var(--info-border)] shrink-0">
                                                        <Building2 size={11} aria-hidden="true" />
                                                        Departemen
                                                    </span>
                                                )}
                                            </div>
                                            <div className="shrink-0">
                                                <TaskStatusBadge status={task.taskStatus} />
                                            </div>
                                        </div>

                                        <div className="text-xs sm:text-sm font-medium text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed break-words [overflow-wrap:anywhere] min-w-0">
                                            {task.content}
                                        </div>

                                        {currentDeadline && (() => {
                                            const dueStr = new Date(currentDeadline.deadlineDate).toLocaleDateString("id-ID", {
                                                weekday: "short",
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                                timeZone: "Asia/Jakarta",
                                            });
                                            const dueDay = new Date(currentDeadline.deadlineDate).toISOString().slice(0, 10);
                                            const isOverdue = !isCompleted && task.taskStatus !== "DIBATALKAN" && dueDay < toWIBDateString();
                                            return (
                                            <div className="pt-2 border-t border-[color-mix(in_srgb,var(--border)_50%,transparent)] flex items-center justify-between flex-wrap gap-2 text-[11px] text-[var(--text-muted)] min-w-0">
                                                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                                    <Clock size={12} aria-hidden="true" className="text-primary shrink-0" />
                                                    <span className="truncate">
                                                        Batas Waktu:{" "}
                                                        <strong className="text-[var(--text-primary)] font-semibold">
                                                            {dueStr}
                                                        </strong>
                                                    </span>
                                                    {isOverdue && (
                                                        <span aria-label={`Lewat tenggat sejak ${dueStr}`} className="text-[11px] font-semibold text-[var(--destructive-text)] bg-[var(--destructive-bg)] px-1.5 py-1 rounded border border-[var(--destructive-border)] shrink-0">
                                                            Lewat tenggat
                                                        </span>
                                                    )}
                                                </div>
                                                {task.deadlines.length > 1 && (
                                                    <span className="text-[11px] font-semibold text-[var(--warning)] bg-[var(--warning-bg)] px-1.5 py-1 rounded border border-[var(--warning-border)] shrink-0">
                                                        Diperpanjang {task.deadlines.length - 1}x
                                                    </span>
                                                )}
                                            </div>
                                            );
                                        })()}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* TAB 3: TRANSPARANSI PRESENSI KARYAWAN */}
                {activeTab === "ATTENDANCE" && (
                    <div className="space-y-3 min-w-0">
                        {!session && !loading ? (
                            <div className="p-8 text-center emp-surface ">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">Tidak ada sesi rapat pada tanggal ini.</p>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">Pilih tanggal lain atau hubungi Tim GA.</p>
                            </div>
                        ) : (
                            <>
                        {legacyRows.length > 0 && (
                            <p className="text-xs text-[var(--text-muted)] emp-surface px-4 py-3">
                                {personRows.length > 0
                                    ? `Sesi campuran: ${legacyRows.length} baris arsip lama disembunyikan, hanya ${personRows.length} baris per-orang ditampilkan.`
                                    : "Sesi ini memakai format lama (per departemen). Datanya tersimpan sebagai arsip dan tidak ditampilkan di sini."}
                            </p>
                        )}
                        {/* Mobile View: Clean Modern Cards with left status stripe */}
                        <div className="sm:hidden space-y-2.5 min-w-0">
                            {personRows.length === 0 ? (
                                <div className="p-8 text-center text-xs text-[var(--text-muted)] emp-surface ">
                                    Tidak ada data kehadiran untuk sesi rapat ini.
                                </div>
                            ) : (
                                personRows.map((att, idx) => {
                                    const isHadir = att.status === "HADIR";
                                    const isMine = Boolean(userEmployeeId && att.employeeId === userEmployeeId);
                                    const attName = att.employeeName || att.representativeName || "-";

                                    return (
                                        <div
                                            key={att.id}
                                            className={`p-3 rounded-2xl bg-[var(--card)] border space-y-2 min-w-0 border-l-4 ${
                                                isHadir
                                                    ? "border-l-emerald-500 border-[var(--border)]"
                                                    : "border-l-rose-500 border-[var(--border)]"
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2 min-w-0">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">{idx + 1}.</span>
                                                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">
                                                            {attName}
                                                        </span>
                                                        {isMine && (
                                                            <span className="inline-flex items-center px-1.5 py-1 rounded text-[11px] font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
                                                                Saya
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-[var(--text-muted)] pl-4 truncate">
                                                        <span className="font-medium text-[color-mix(in_srgb,var(--text-primary)_70%,transparent)]">Dept:</span>{" "}
                                                        {att.departmentName || "-"}
                                                    </p>
                                                </div>
                                                <div className="shrink-0">
                                                    <AttendanceBadge status={att.status} hasIzin={hasDeptIzin(att)} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Desktop View: Full Responsive Table */}
                        <div className="hidden sm:block emp-surface overflow-hidden ">
                            <div className="w-full overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[45px] text-center">No</TableHead>
                                            <TableHead>Nama Karyawan</TableHead>
                                            <TableHead>Departemen</TableHead>
                                            <TableHead>Status Kehadiran</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {personRows.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-8 text-xs text-[var(--text-muted)]">
                                                    Tidak ada data kehadiran untuk sesi rapat ini.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            personRows.map((att, idx) => (
                                                <TableRow key={att.id}>
                                                    <TableCell className="text-center text-xs text-[var(--text-muted)]">{idx + 1}</TableCell>
                                                    <TableCell className="font-semibold text-xs text-[var(--text-primary)]">
                                                        {att.employeeName || att.representativeName || "-"}
                                                        {userEmployeeId && att.employeeId === userEmployeeId && (
                                                            <span className="ml-1.5 inline-flex items-center px-1.5 py-1 rounded text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                                                                Saya
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-[var(--text-muted)]">
                                                        {att.departmentName || "-"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <AttendanceBadge status={att.status} hasIzin={hasDeptIzin(att)} />
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
