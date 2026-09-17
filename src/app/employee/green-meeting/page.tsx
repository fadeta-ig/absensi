"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
    ArrowRight,
    FileText,
    Info,
    Building2,
    User,
    XCircle,
    History,
} from "lucide-react";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table";
import { toWIBDateString } from "@/lib/timezone";
import { reportClientError } from "@/lib/clientErrors";
import { isGreenMeetingTargetRelevant, isGreenMeetingNoteRelevant } from "@/lib/greenMeetingTargeting";

interface DepartmentInfo {
    id: string;
    name: string;
    code: string | null;
    division?: {
        name: string;
    } | null;
}

interface GreenMeetingUnit {
    id: string;
    department: DepartmentInfo;
}

interface GreenMeetingAttendance {
    id: string;
    status: "HADIR" | "IZIN" | "ALPA";
    representativeName: string | null;
    permitReason: string | null;
    unit: GreenMeetingUnit;
}

interface GreenMeetingDeadline {
    id: string;
    sequence: number;
    deadlineDate: string;
    reason: string | null;
}

interface GreenMeetingNoteTarget {
    targetType: "DEPARTMENT" | "DIVISION" | "EMPLOYEE";
    employeeId?: string | null;
    departmentId?: string | null;
    divisionId?: string | null;
    label?: string | null;
    employee?: { name: string } | null;
    division?: { name: string } | null;
    department?: DepartmentInfo | null;
}

interface GreenMeetingNote {
    id: string;
    type: "INFORMASI" | "TUGAS";
    content: string;
    originType: string;
    originName: string;
    isAllTarget: boolean;
    taskStatus: "BELUM_DIMULAI" | "SEDANG_BERJALAN" | "SELESAI" | "DIBATALKAN";
    completedAt: string | null;
    lastEditedAt?: string | null;
    lastEditedBy?: string | null;
    targets: GreenMeetingNoteTarget[];
    deadlines: GreenMeetingDeadline[];
    session?: {
        id: string;
        meetingDate: string;
        room?: string;
    } | null;
}

interface GreenMeetingSession {
    id: string;
    meetingDate: string;
    startTime: string;
    room: string;
    attendances: GreenMeetingAttendance[];
    notes: GreenMeetingNote[];
}

type TabKey = "NOTES" | "MY_DEPT_TASKS" | "ATTENDANCE";

// Human-friendly Task Status Renderer (Eliminasi bahasa IT / raw enum)
function renderTaskStatusBadge(status: string) {
    switch (status) {
        case "SELESAI":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 size={12} />
                    Selesai
                </span>
            );
        case "SEDANG_BERJALAN":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    <Clock size={12} />
                    Sedang Berjalan
                </span>
            );
        case "BELUM_DIMULAI":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Clock size={12} />
                    Belum Dimulai
                </span>
            );
        case "DIBATALKAN":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                    <XCircle size={12} />
                    Dibatalkan
                </span>
            );
        default:
            return <span className="text-xs font-medium text-muted-foreground">{status}</span>;
    }
}

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

    // 1. Fetch User Profile
    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch("/api/auth/me");
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
                reportClientError("EmployeeGreenMeeting", "Gagal memuat profil user", err);
            }
        };
        void fetchUser();
    }, []);

    // 2. Fetch Session & Notes
    const loadData = useCallback(
        async (targetDate: string, deptId: string | null, empId: string | null, divId: string | null) => {
            setLoading(true);
            setLoadError("");

            try {
                const promises: [Promise<Response>, Promise<Response>?] = [
                    fetch(`/api/green-meeting/sessions?date=${targetDate}`),
                ];

                if (deptId || empId || divId) {
                    const query = new URLSearchParams();
                    if (deptId) query.set("departmentId", deptId);
                    if (empId) query.set("employeeId", empId);
                    if (divId) query.set("divisionId", divId);
                    promises.push(fetch(`/api/green-meeting/notes?${query.toString()}`));
                }

                const [sessionRes, deptTasksRes] = await Promise.all(promises);

                if (!sessionRes.ok) throw new Error("Gagal memuat agenda rapat.");

                const sessionJson = await sessionRes.json();
                setSession(sessionJson.session);
                setOffDayInfo(sessionJson.offDayInfo || { isOffDay: false });

                if (deptTasksRes && deptTasksRes.ok) {
                    const tasksJson = await deptTasksRes.json();
                    setMyDeptTasks(tasksJson);
                }
            } catch (err) {
                reportClientError("EmployeeGreenMeeting", "Gagal memuat data rapat", err);
                setLoadError(err instanceof Error ? err.message : "Terjadi kesalahan memuat data.");
            } finally {
                setLoading(false);
            }
        },
        []
    );

    useEffect(() => {
        if (fetchedRef.current === `${currentDateStr}_${userDeptId}_${userDivisionId}_${userEmployeeId}`) return;
        fetchedRef.current = `${currentDateStr}_${userDeptId}_${userDivisionId}_${userEmployeeId}`;
        void loadData(currentDateStr, userDeptId, userEmployeeId, userDivisionId);
    }, [currentDateStr, userDeptId, userEmployeeId, userDivisionId, loadData]);

    const handleRefresh = useCallback(() => {
        void loadData(currentDateStr, userDeptId, userEmployeeId, userDivisionId);
    }, [currentDateStr, userDeptId, userEmployeeId, userDivisionId, loadData]);

    // Format tanggal
    const formattedDate = new Date(`${currentDateStr}T00:00:00`).toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
    });

    const attendances = session?.attendances || [];
    const hadirCount = attendances.filter((a) => a.status === "HADIR").length;

    // Data Notulensi & Smart Filter Relevansi
    const allNotes = session?.notes || [];
    const viewerScope = {
        employeeId: userEmployeeId,
        departmentId: userDeptId,
        divisionId: userDivisionId,
    };

    const countRelevant = allNotes.filter((note) =>
        isGreenMeetingNoteRelevant(note, viewerScope)
    ).length;

    const countPersonal = allNotes.filter((note) =>
        note.targets?.some((t) => t.targetType === "EMPLOYEE" && isGreenMeetingTargetRelevant(t, viewerScope))
    ).length;

    const countTasks = allNotes.filter((note) => note.type === "TUGAS").length;
    const countDireksi = allNotes.filter((note) => note.originType === "DIREKSI").length;

    const filteredNotes = allNotes.filter((note) => {
        if (noteFilter === "ALL") return true;
        if (noteFilter === "RELEVANT") return isGreenMeetingNoteRelevant(note, viewerScope);
        if (noteFilter === "PERSONAL") {
            return note.targets?.some((t) => t.targetType === "EMPLOYEE" && isGreenMeetingTargetRelevant(t, viewerScope));
        }
        if (noteFilter === "TUGAS") return note.type === "TUGAS";
        if (noteFilter === "DIREKSI") return note.originType === "DIREKSI";
        return true;
    });

    return (
        <div className="p-3 sm:p-5 max-w-4xl mx-auto space-y-4">
            {/* Header Super Compact: Tanggal, Lokasi, Jam, dan Kehadiran dalam 1 Baris */}
            <div className="bg-card border border-border rounded-xl p-2.5 sm:p-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                    {/* Date Navigation */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="flex items-center bg-muted/60 border border-border rounded-lg p-0.5">
                            <button
                                type="button"
                                onClick={() => {
                                    const d = new Date(`${currentDateStr}T00:00:00`);
                                    d.setDate(d.getDate() - 1);
                                    setCurrentDateStr(d.toISOString().split("T")[0]);
                                }}
                                className="p-1 hover:bg-background rounded text-foreground transition-colors"
                                title="Hari Sebelumnya"
                            >
                                <ChevronLeft size={15} />
                            </button>
                            <label
                                className="relative flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-foreground hover:bg-background/80 rounded cursor-pointer transition-colors group"
                                title="Klik untuk memilih tanggal dari kalender"
                                onClick={(e) => {
                                    try {
                                        const input = e.currentTarget.querySelector("input[type='date']") as HTMLInputElement | null;
                                        input?.showPicker?.();
                                    } catch {}
                                }}
                            >
                                <Calendar size={13} className="text-primary group-hover:scale-110 transition-transform" />
                                <span className="select-none">{formattedDate}</span>
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
                                    const d = new Date(`${currentDateStr}T00:00:00`);
                                    d.setDate(d.getDate() + 1);
                                    setCurrentDateStr(d.toISOString().split("T")[0]);
                                }}
                                className="p-1 hover:bg-background rounded text-foreground transition-colors"
                                title="Hari Berikutnya"
                            >
                                <ChevronRight size={15} />
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setCurrentDateStr(todayStr)}
                            className="px-2 py-1 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
                        >
                            Hari Ini
                        </button>

                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={loading}
                            className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                            title="Muat Ulang"
                        >
                            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                        </button>

                        {offDayInfo?.isOffDay && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1">
                                <AlertCircle size={11} />
                                {offDayInfo.reason || "Hari Libur"}
                            </span>
                        )}
                    </div>

                    {/* Quick Badges: Lokasi, Jam, dan Kehadiran */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border text-foreground font-medium">
                            <MapPin size={12} className="text-primary" />
                            <span>{session?.room || "Ruang Rapat Utama Lt. 2"}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border text-foreground font-medium">
                            <Clock size={12} />
                            <span>{session?.startTime || "08:30"} WIB</span>
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                            <CheckCircle2 size={12} />
                            <span>{hadirCount} / {attendances.length} Dept Hadir</span>
                        </span>
                    </div>
                </div>
            </div>

            {loadError && (
                <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center gap-2">
                    <AlertCircle size={14} />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Segmented Minimalist Tab Navigation */}
            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border overflow-x-auto scrollbar-none">
                <button
                    type="button"
                    onClick={() => setActiveTab("NOTES")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 sm:px-3 text-xs font-semibold rounded-lg transition-all whitespace-nowrap min-w-0 ${
                        activeTab === "NOTES"
                            ? "bg-card text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <FileText size={14} className="shrink-0" />
                    <span className="truncate sm:hidden">Notulen ({allNotes.length})</span>
                    <span className="hidden sm:inline">Notulensi ({allNotes.length})</span>
                </button>

                {userDeptId && (
                    <button
                        type="button"
                        onClick={() => setActiveTab("MY_DEPT_TASKS")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 sm:px-3 text-xs font-semibold rounded-lg transition-all whitespace-nowrap min-w-0 ${
                            activeTab === "MY_DEPT_TASKS"
                                ? "bg-card text-foreground shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <ListTodo size={14} className="shrink-0" />
                        <span className="truncate sm:hidden">Tugas ({myDeptTasks.filter((t) => t.taskStatus !== "SELESAI").length})</span>
                        <span className="hidden sm:inline">Tugas Saya & Dept ({myDeptTasks.filter((t) => t.taskStatus !== "SELESAI").length})</span>
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => setActiveTab("ATTENDANCE")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 sm:px-3 text-xs font-semibold rounded-lg transition-all whitespace-nowrap min-w-0 ${
                        activeTab === "ATTENDANCE"
                            ? "bg-card text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <Building2 size={14} className="shrink-0" />
                    <span className="truncate sm:hidden">Presensi ({attendances.length})</span>
                    <span className="hidden sm:inline">Presensi Dept ({attendances.length})</span>
                </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="space-y-3">
                {/* TAB 1: NOTULENSI RAPAT */}
                {activeTab === "NOTES" && (
                    <div className="space-y-3">
                        {/* Sub-filter Pills */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                            <button
                                type="button"
                                onClick={() => setNoteFilter("ALL")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                                    noteFilter === "ALL"
                                        ? "bg-primary text-white shadow-xs"
                                        : "bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                Semua Notulen ({allNotes.length})
                            </button>
                            {(userDeptId || userEmployeeId) && (
                                <button
                                    type="button"
                                    onClick={() => setNoteFilter("RELEVANT")}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                                        noteFilter === "RELEVANT"
                                            ? "bg-emerald-600 text-white shadow-xs"
                                            : "bg-muted text-muted-foreground hover:text-foreground"
                                    }`}
                                    title="Tampilkan notulensi yang ditujukan untuk Anda atau departemen Anda"
                                >
                                    <span>Untuk Saya & Dept</span>
                                    <span
                                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                            noteFilter === "RELEVANT"
                                                ? "bg-white/20 text-white"
                                                : "bg-background text-foreground"
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
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                                        noteFilter === "PERSONAL"
                                            ? "bg-emerald-600 text-white shadow-xs"
                                            : "bg-muted text-muted-foreground hover:text-foreground"
                                    }`}
                                    title="Tampilkan butir notulensi yang khusus ditujukan kepada Anda pribadi"
                                >
                                    <span>Khusus Saya</span>
                                    <span
                                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                            noteFilter === "PERSONAL"
                                                ? "bg-white/20 text-white"
                                                : "bg-background text-foreground"
                                        }`}
                                    >
                                        {countPersonal}
                                    </span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setNoteFilter("TUGAS")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                                    noteFilter === "TUGAS"
                                        ? "bg-purple-600 text-white shadow-xs"
                                        : "bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <span>Tugas Tindak Lanjut</span>
                                <span
                                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                        noteFilter === "TUGAS"
                                            ? "bg-white/20 text-white"
                                            : "bg-background text-foreground"
                                    }`}
                                >
                                    {countTasks}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setNoteFilter("DIREKSI")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                                    noteFilter === "DIREKSI"
                                        ? "bg-amber-600 text-white shadow-xs"
                                        : "bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <span>Arahan Direksi</span>
                                <span
                                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                        noteFilter === "DIREKSI"
                                            ? "bg-white/20 text-white"
                                            : "bg-background text-foreground"
                                    }`}
                                >
                                    {countDireksi}
                                </span>
                            </button>
                        </div>

                        {/* Note Cards List */}
                        <div className="space-y-2.5">
                            {filteredNotes.length === 0 ? (
                                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground space-y-2">
                                    <Info size={28} className="mx-auto text-muted-foreground opacity-50" />
                                    <p className="text-sm font-semibold text-foreground">
                                        {noteFilter === "RELEVANT" || noteFilter === "PERSONAL"
                                            ? "Tidak ada notulensi khusus untuk Anda atau departemen Anda pada tanggal ini."
                                            : noteFilter === "TUGAS"
                                            ? "Tidak ada tugas tindak lanjut pada tanggal ini."
                                            : noteFilter === "DIREKSI"
                                            ? "Tidak ada arahan direksi pada tanggal ini."
                                            : "Belum ada catatan notulen pada sesi ini."}
                                    </p>
                                    {noteFilter !== "ALL" && allNotes.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setNoteFilter("ALL")}
                                            className="text-xs text-primary hover:underline font-semibold inline-flex items-center gap-1"
                                        >
                                            Tampilkan semua notulensi rapat ({allNotes.length})
                                        </button>
                                    )}
                                </div>
                            ) : (
                                filteredNotes.map((note) => {
                                    const isTask = note.type === "TUGAS";
                                    const isComplete = note.taskStatus === "SELESAI";
                                    const isForMe = Boolean(userEmployeeId && note.targets?.some((t) => t.targetType === "EMPLOYEE" && t.employeeId === userEmployeeId));
                                    const isForMyDept = Boolean(userDeptId && note.targets?.some((t) => t.targetType === "DEPARTMENT" && t.departmentId === userDeptId));
                                    const isForMyDiv = Boolean(userDivisionId && note.targets?.some((t) => t.targetType === "DIVISION" && t.divisionId === userDivisionId));

                                    return (
                                        <div
                                            key={note.id}
                                            className={`bg-card border rounded-xl p-3.5 sm:p-4 shadow-xs space-y-2.5 transition-all ${
                                                isTask
                                                    ? isComplete
                                                        ? "border-emerald-500/30 bg-emerald-500/[0.01]"
                                                        : "border-purple-500/30 bg-purple-500/[0.01]"
                                                    : "border-border"
                                            }`}
                                        >
                                            {/* Top Row: Type, Routing, and Human-Friendly Status */}
                                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/60">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {/* Type Pill */}
                                                    <span
                                                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                                            isTask
                                                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                                        }`}
                                                    >
                                                        {isTask ? "Tugas Tindak Lanjut" : "Informasi"}
                                                    </span>

                                                    {/* Smart Relevance Badges */}
                                                    {isForMe && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                            <User size={10} />
                                                            Untuk Anda
                                                        </span>
                                                    )}
                                                    {!isForMe && isForMyDept && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                                            <Building2 size={10} />
                                                            Dept Anda
                                                        </span>
                                                    )}
                                                    {!isForMe && !isForMyDept && isForMyDiv && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                                            Divisi Anda
                                                        </span>
                                                    )}
                                                    {note.lastEditedAt && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                                                            <History size={10} />
                                                            Direvisi
                                                        </span>
                                                    )}

                                                    {/* Routing Pill: Dari ➔ Kepada */}
                                                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] bg-muted border border-border text-foreground font-medium flex-wrap">
                                                        <span className="font-bold">Dari: {note.originName}</span>
                                                        <ArrowRight size={10} className="text-muted-foreground" />
                                                        <span>
                                                            Kepada:{" "}
                                                            {note.isAllTarget ? (
                                                                <strong className="text-primary font-bold">Semua Karyawan (ALL)</strong>
                                                            ) : (
                                                                <strong>
                                                                    {note.targets
                                                                        ?.map((t: GreenMeetingNoteTarget) => t.label || t.employee?.name || t.division?.name || t.department?.name)
                                                                        .filter(Boolean)
                                                                        .join(" • ") || "Target Spesifik"}
                                                                </strong>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Human-Friendly Status Badge */}
                                                {isTask && renderTaskStatusBadge(note.taskStatus)}
                                            </div>

                                            {/* Note Body */}
                                            <div className="text-xs sm:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed font-normal">
                                                {note.content}
                                            </div>

                                            {/* Footer Info (Tenggat Waktu) */}
                                            {isTask && note.deadlines && note.deadlines.length > 0 && (
                                                <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between flex-wrap gap-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <Clock size={12} className="text-primary" />
                                                        <span>
                                                            Tenggat:{" "}
                                                            <strong className="text-foreground font-semibold">
                                                                {new Date(note.deadlines[note.deadlines.length - 1].deadlineDate).toLocaleDateString("id-ID", {
                                                                    day: "numeric",
                                                                    month: "short",
                                                                    year: "numeric",
                                                                })}
                                                            </strong>
                                                        </span>
                                                        {note.deadlines.length > 1 && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                                                Perpanjangan ke-{note.deadlines.length - 1}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {note.completedAt && (
                                                        <span className="text-emerald-600 font-medium inline-flex items-center gap-1">
                                                            <CheckCircle2 size={11} />
                                                            Selesai {new Date(note.completedAt).toLocaleDateString("id-ID")}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 2: TUGAS SAYA & DEPARTEMEN */}
                {activeTab === "MY_DEPT_TASKS" && (
                    <div className="space-y-2.5">
                        <div className="bg-muted/40 p-2.5 rounded-xl border border-border text-xs text-muted-foreground flex items-center justify-between">
                            <span>
                                Pekerjaan tindak lanjut untuk <strong className="text-foreground">{userDeptName || "Departemen Anda"}</strong>:
                            </span>
                            <span className="font-semibold text-foreground">
                                {myDeptTasks.filter((t) => t.taskStatus !== "SELESAI").length} Tugas Aktif
                            </span>
                        </div>

                        {myDeptTasks.length === 0 ? (
                            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                                <CheckCircle2 size={28} className="mx-auto mb-2 text-emerald-500 opacity-60" />
                                <p className="text-sm font-semibold text-foreground">Tidak ada tugas aktif saat ini.</p>
                                <p className="text-xs mt-0.5">Seluruh instruksi rapat telah selesai dikerjakan.</p>
                            </div>
                        ) : (
                            myDeptTasks.map((task) => {
                                const currentDeadline =
                                    task.deadlines && task.deadlines.length > 0 ? task.deadlines[task.deadlines.length - 1] : null;
                                const isCompleted = task.taskStatus === "SELESAI";
                                const isPersonalTask = Boolean(userEmployeeId && task.targets?.some((t) => t.targetType === "EMPLOYEE" && t.employeeId === userEmployeeId));

                                return (
                                    <div
                                        key={task.id}
                                        className={`bg-card border rounded-xl p-3.5 shadow-xs space-y-2 transition-all ${
                                            isCompleted ? "opacity-75 border-border" : "border-primary/30"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                                                <span>
                                                    Instruksi Dari: <strong className="text-foreground font-semibold">{task.originName}</strong>
                                                </span>
                                                {task.session?.meetingDate && (
                                                    <span className="text-[11px] text-muted-foreground">
                                                        • Rapat {new Date(task.session.meetingDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                                                    </span>
                                                )}
                                                {isPersonalTask ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                        <User size={10} />
                                                        Tugas Pribadi
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                                        <Building2 size={10} />
                                                        Departemen
                                                    </span>
                                                )}
                                            </div>
                                            {renderTaskStatusBadge(task.taskStatus)}
                                        </div>

                                        <div className="text-xs sm:text-sm font-medium text-foreground whitespace-pre-wrap leading-relaxed">
                                            {task.content}
                                        </div>

                                        {currentDeadline && (
                                            <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock size={12} className="text-primary" />
                                                    <span>
                                                        Batas Waktu:{" "}
                                                        <strong className="text-foreground font-semibold">
                                                            {new Date(currentDeadline.deadlineDate).toLocaleDateString("id-ID", {
                                                                weekday: "short",
                                                                day: "numeric",
                                                                month: "short",
                                                                year: "numeric",
                                                            })}
                                                        </strong>
                                                    </span>
                                                </div>
                                                {task.deadlines.length > 1 && (
                                                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                                        Diperpanjang {task.deadlines.length - 1}x
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* TAB 3: TRANSPARANSI PRESENSI DEPARTEMEN */}
                {activeTab === "ATTENDANCE" && (
                    <div className="space-y-3">
                        {/* Mobile View: Clean Compact Cards (sm:hidden - Tidak akan pernah terpotong di HP) */}
                        <div className="sm:hidden divide-y divide-border bg-card border border-border rounded-xl overflow-hidden shadow-xs">
                            {attendances.length === 0 ? (
                                <div className="p-6 text-center text-xs text-muted-foreground">
                                    Tidak ada data kehadiran untuk sesi rapat ini.
                                </div>
                            ) : (
                                attendances.map((att, idx) => (
                                    <div key={att.id} className="p-3 space-y-1.5">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{idx + 1}.</span>
                                                    <span className="text-xs font-bold text-foreground truncate">
                                                        {att.unit.department.name}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground pl-4 truncate">
                                                    <span className="font-medium text-foreground/70">Divisi:</span>{" "}
                                                    {att.unit.department.division?.name || "-"}
                                                </p>
                                            </div>
                                            <div className="shrink-0">
                                                {att.status === "HADIR" && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                        <CheckCircle2 size={11} /> Hadir
                                                    </span>
                                                )}
                                                {att.status === "IZIN" && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                                        Izin
                                                    </span>
                                                )}
                                                {att.status === "ALPA" && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                                        Alpa
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {(att.representativeName || (att.status === "IZIN" && att.permitReason)) && (
                                            <div className="text-[11px] text-muted-foreground pl-4 pt-1 flex flex-wrap items-center gap-2 border-t border-border/40">
                                                {att.representativeName && (
                                                    <span className="inline-flex items-center gap-1 text-foreground font-medium">
                                                        <User size={10} className="text-muted-foreground" />
                                                        {att.representativeName}
                                                    </span>
                                                )}
                                                {att.status === "IZIN" && att.permitReason && (
                                                    <span className="text-amber-700 dark:text-amber-300 italic">
                                                        Alasan: &ldquo;{att.permitReason}&rdquo;
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Desktop View: Full Responsive Table (hidden sm:block) */}
                        <div className="hidden sm:block bg-card border border-border rounded-xl overflow-hidden shadow-xs">
                            <div className="w-full overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[35px] text-center">No</TableHead>
                                            <TableHead>Departemen</TableHead>
                                            <TableHead>Divisi</TableHead>
                                            <TableHead>Status Kehadiran</TableHead>
                                            <TableHead>Perwakilan / Alasan</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {attendances.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                                                    Tidak ada data kehadiran untuk sesi rapat ini.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            attendances.map((att, idx) => (
                                                <TableRow key={att.id}>
                                                    <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                                                    <TableCell className="font-semibold text-xs text-foreground">
                                                        {att.unit.department.name}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">
                                                        {att.unit.department.division?.name || "-"}
                                                    </TableCell>
                                                    <TableCell>
                                                        {att.status === "HADIR" && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                                <CheckCircle2 size={11} /> Hadir
                                                            </span>
                                                        )}
                                                        {att.status === "IZIN" && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                                                Izin
                                                            </span>
                                                        )}
                                                        {att.status === "ALPA" && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                                                Alpa
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-foreground">
                                                        {att.status === "IZIN" && att.permitReason ? (
                                                            <span className="text-amber-700 dark:text-amber-300 italic">
                                                                &ldquo;{att.permitReason}&rdquo;
                                                            </span>
                                                        ) : att.representativeName ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <User size={11} className="text-muted-foreground" />
                                                                <span>{att.representativeName}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground italic">-</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
