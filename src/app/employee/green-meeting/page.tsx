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
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                    <CheckCircle2 size={11} />
                    Selesai
                </span>
            );
        case "SEDANG_BERJALAN":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                    <Clock size={11} />
                    Sedang Berjalan
                </span>
            );
        case "BELUM_DIMULAI":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                    <Clock size={11} />
                    Belum Dimulai
                </span>
            );
        case "DIBATALKAN":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border shrink-0">
                    <XCircle size={11} />
                    Dibatalkan
                </span>
            );
        default:
            return <span className="text-[11px] font-medium text-muted-foreground shrink-0">{status}</span>;
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
        <div className="w-full space-y-4 min-w-0 pb-6 max-w-full overflow-x-hidden">
            {/* Header Super Compact: Tanggal, Lokasi, Jam, dan Kehadiran */}
            <div className="bg-card border border-border/80 rounded-2xl p-3 sm:p-4 shadow-xs space-y-3 min-w-0 overflow-hidden">
                {/* Top Row: Date Navigation & Quick Actions */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                    {/* Date Navigator */}
                    <div className="flex items-center bg-muted/60 border border-border rounded-xl p-1 min-w-0 flex-1 max-w-[260px] sm:max-w-[280px]">
                        <button
                            type="button"
                            onClick={() => {
                                const d = new Date(`${currentDateStr}T00:00:00`);
                                d.setDate(d.getDate() - 1);
                                setCurrentDateStr(d.toISOString().split("T")[0]);
                            }}
                            className="p-1 sm:p-1.5 hover:bg-background rounded-lg text-foreground transition-colors shrink-0"
                            title="Hari Sebelumnya"
                            aria-label="Hari Sebelumnya"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <label
                            className="relative flex items-center justify-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-foreground hover:bg-background/80 rounded-lg cursor-pointer transition-colors group flex-1 min-w-0"
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
                                const d = new Date(`${currentDateStr}T00:00:00`);
                                d.setDate(d.getDate() + 1);
                                setCurrentDateStr(d.toISOString().split("T")[0]);
                            }}
                            className="p-1 sm:p-1.5 hover:bg-background rounded-lg text-foreground transition-colors shrink-0"
                            title="Hari Berikutnya"
                            aria-label="Hari Berikutnya"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    {/* Quick Actions (Hari Ini & Refresh) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => setCurrentDateStr(todayStr)}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-all shadow-2xs"
                        >
                            Hari Ini
                        </button>

                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={loading}
                            className="p-2 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-all shadow-2xs disabled:opacity-50 shrink-0"
                            title="Muat Ulang"
                            aria-label="Muat Ulang Data"
                        >
                            <RefreshCw size={14} className={loading ? "animate-spin text-primary" : ""} />
                        </button>
                    </div>
                </div>

                {/* Off-Day Alert Banner if Active */}
                {offDayInfo?.isOffDay && (
                    <div className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 flex items-center gap-2 min-w-0">
                        <AlertCircle size={14} className="shrink-0 text-amber-600" />
                        <span className="truncate">{offDayInfo.reason || "Hari Libur Rutin / Libur Nasional"}</span>
                    </div>
                )}

                {/* Meeting Metadata Strip: 3-column micro card layout */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-1 border-t border-border/60 text-xs min-w-0">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 p-2 rounded-xl bg-muted/40 border border-border/50 min-w-0 overflow-hidden">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <MapPin size={13} />
                        </div>
                        <div className="min-w-0 flex-1 w-full">
                            <p className="text-[9px] sm:text-[10px] text-muted-foreground font-medium uppercase tracking-wider truncate">Lokasi</p>
                            <p className="text-[11px] sm:text-xs font-semibold text-foreground truncate" title={session?.room || "Ruang Rapat Utama Lt. 2"}>
                                {session?.room || "Ruang Rapat Utama Lt. 2"}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 min-w-0 overflow-hidden">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                            <Clock size={13} />
                        </div>
                        <div className="min-w-0 flex-1 w-full">
                            <p className="text-[9px] sm:text-[10px] text-muted-foreground font-medium uppercase tracking-wider truncate">Mulai</p>
                            <p className="text-[11px] sm:text-xs font-semibold text-foreground truncate">
                                {session?.startTime || "08:30"} WIB
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 p-2 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 min-w-0 overflow-hidden">
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <CheckCircle2 size={13} />
                        </div>
                        <div className="min-w-0 flex-1 w-full">
                            <p className="text-[9px] sm:text-[10px] text-emerald-700 dark:text-emerald-400 font-medium uppercase tracking-wider truncate">Kehadiran</p>
                            <p className="text-[11px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-300 truncate">
                                {hadirCount}/{attendances.length} Hadir
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {loadError && (
                <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Segmented Minimalist Tab Navigation */}
            <div className={`grid ${userDeptId ? "grid-cols-3" : "grid-cols-2"} gap-1.5 bg-muted/70 p-1.5 rounded-2xl border border-border/80 min-w-0`}>
                <button
                    type="button"
                    onClick={() => setActiveTab("NOTES")}
                    className={`flex items-center justify-center gap-1.5 py-2 px-1.5 sm:px-3 text-xs font-semibold rounded-xl transition-all min-w-0 ${
                        activeTab === "NOTES"
                            ? "bg-card text-foreground shadow-xs ring-1 ring-border/50"
                            : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                    }`}
                >
                    <FileText size={14} className="shrink-0 text-primary" />
                    <span className="truncate">Notulensi</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold shrink-0 ${
                        activeTab === "NOTES" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                        {allNotes.length}
                    </span>
                </button>

                {userDeptId && (
                    <button
                        type="button"
                        onClick={() => setActiveTab("MY_DEPT_TASKS")}
                        className={`flex items-center justify-center gap-1.5 py-2 px-1.5 sm:px-3 text-xs font-semibold rounded-xl transition-all min-w-0 ${
                            activeTab === "MY_DEPT_TASKS"
                                ? "bg-card text-foreground shadow-xs ring-1 ring-border/50"
                                : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                        }`}
                    >
                        <ListTodo size={14} className="shrink-0 text-purple-600" />
                        <span className="truncate">Tugas Dept</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold shrink-0 ${
                            activeTab === "MY_DEPT_TASKS" ? "bg-purple-500/15 text-purple-600 dark:text-purple-400" : "bg-muted text-muted-foreground"
                        }`}>
                            {myDeptTasks.filter((t) => t.taskStatus !== "SELESAI").length}
                        </span>
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => setActiveTab("ATTENDANCE")}
                    className={`flex items-center justify-center gap-1.5 py-2 px-1.5 sm:px-3 text-xs font-semibold rounded-xl transition-all min-w-0 ${
                        activeTab === "ATTENDANCE"
                            ? "bg-card text-foreground shadow-xs ring-1 ring-border/50"
                            : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                    }`}
                >
                    <Building2 size={14} className="shrink-0 text-blue-600" />
                    <span className="truncate">Presensi</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold shrink-0 ${
                        activeTab === "ATTENDANCE" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground"
                    }`}>
                        {attendances.length}
                    </span>
                </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="space-y-3 min-w-0">
                {/* TAB 1: NOTULENSI RAPAT */}
                {activeTab === "NOTES" && (
                    <div className="space-y-3 min-w-0">
                        {/* Sub-filter Pills */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none w-full max-w-full min-w-0">
                            <button
                                type="button"
                                onClick={() => setNoteFilter("ALL")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 ${
                                    noteFilter === "ALL"
                                        ? "bg-foreground text-background shadow-xs"
                                        : "bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
                                }`}
                            >
                                Semua Notulen ({allNotes.length})
                            </button>
                            {(userDeptId || userEmployeeId) && (
                                <button
                                    type="button"
                                    onClick={() => setNoteFilter("RELEVANT")}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                                        noteFilter === "RELEVANT"
                                            ? "bg-emerald-600 text-white shadow-xs"
                                            : "bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
                                    }`}
                                    title="Tampilkan notulensi yang ditujukan untuk Anda atau departemen Anda"
                                >
                                    <span>Untuk Saya & Dept</span>
                                    <span
                                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                            noteFilter === "RELEVANT"
                                                ? "bg-white/20 text-white"
                                                : "bg-card text-foreground"
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
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                                        noteFilter === "PERSONAL"
                                            ? "bg-teal-600 text-white shadow-xs"
                                            : "bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
                                    }`}
                                    title="Tampilkan butir notulensi yang khusus ditujukan kepada Anda pribadi"
                                >
                                    <span>Khusus Saya</span>
                                    <span
                                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                            noteFilter === "PERSONAL"
                                                ? "bg-white/20 text-white"
                                                : "bg-card text-foreground"
                                        }`}
                                    >
                                        {countPersonal}
                                    </span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setNoteFilter("TUGAS")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                                    noteFilter === "TUGAS"
                                        ? "bg-purple-600 text-white shadow-xs"
                                        : "bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
                                }`}
                            >
                                <span>Tugas Tindak Lanjut</span>
                                <span
                                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                        noteFilter === "TUGAS"
                                            ? "bg-white/20 text-white"
                                            : "bg-card text-foreground"
                                    }`}
                                >
                                    {countTasks}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setNoteFilter("DIREKSI")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                                    noteFilter === "DIREKSI"
                                        ? "bg-amber-600 text-white shadow-xs"
                                        : "bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
                                }`}
                            >
                                <span>Arahan Direksi</span>
                                <span
                                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                        noteFilter === "DIREKSI"
                                            ? "bg-white/20 text-white"
                                            : "bg-card text-foreground"
                                    }`}
                                >
                                    {countDireksi}
                                </span>
                            </button>
                        </div>

                        {/* Note Cards List */}
                        <div className="space-y-3 min-w-0">
                            {filteredNotes.length === 0 ? (
                                <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 text-center text-muted-foreground space-y-2 shadow-xs w-full min-w-0 overflow-hidden">
                                    <Info size={28} className="mx-auto text-muted-foreground opacity-50" />
                                    <p className="text-xs sm:text-sm font-semibold text-foreground px-2 break-words [overflow-wrap:anywhere]">
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
                                            className={`bg-card border rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-3 transition-all min-w-0 overflow-hidden ${
                                                isTask
                                                    ? isComplete
                                                        ? "border-emerald-500/30 bg-emerald-500/[0.01]"
                                                        : "border-purple-500/30 bg-purple-500/[0.01]"
                                                    : "border-border/80"
                                            }`}
                                        >
                                            {/* Top Row: Type, Relevance Badges, and Status */}
                                            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/60 min-w-0 flex-wrap">
                                                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                                    {/* Type Pill */}
                                                    <span
                                                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border shrink-0 ${
                                                            isTask
                                                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                                                : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                                        }`}
                                                    >
                                                        {isTask ? "Tugas Tindak Lanjut" : "Informasi"}
                                                    </span>

                                                    {/* Smart Relevance Badges */}
                                                    {isForMe && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                                                            <User size={10} />
                                                            Untuk Anda
                                                        </span>
                                                    )}
                                                    {!isForMe && isForMyDept && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                                                            <Building2 size={10} />
                                                            Dept Anda
                                                        </span>
                                                    )}
                                                    {!isForMe && !isForMyDept && isForMyDiv && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                                                            Divisi Anda
                                                        </span>
                                                    )}
                                                    {note.lastEditedAt && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-muted text-muted-foreground border border-border shrink-0">
                                                            <History size={10} />
                                                            Direvisi
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Human-Friendly Status Badge */}
                                                {isTask && (
                                                    <div className="shrink-0">
                                                        {renderTaskStatusBadge(note.taskStatus)}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Dedicated Routing Panel: Dari ➔ Kepada (Zero Leak Guarantee) */}
                                            <div className="bg-muted/40 border border-border/50 rounded-xl p-2 sm:p-2.5 text-xs text-muted-foreground min-w-0">
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                                                    <div className="flex items-center gap-1.5 shrink-0 text-foreground">
                                                        <span className="font-semibold text-muted-foreground text-[11px] flex items-center gap-1">
                                                            <Send size={11} className="text-primary" /> Dari:
                                                        </span>
                                                        <span className="font-bold text-foreground">{note.originName}</span>
                                                    </div>

                                                    <span className="hidden sm:inline text-muted-foreground/50">•</span>

                                                    <div className="flex items-start sm:items-center gap-1.5 min-w-0 flex-1">
                                                        <span className="font-semibold text-muted-foreground text-[11px] shrink-0">Kepada:</span>
                                                        <div className="font-semibold text-foreground break-words [overflow-wrap:anywhere] min-w-0 flex-1 leading-snug">
                                                            {note.isAllTarget ? (
                                                                <span className="text-primary font-bold">Semua Karyawan (ALL)</span>
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
                                            <div className="text-xs sm:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed font-normal break-words [overflow-wrap:anywhere] min-w-0">
                                                {note.content}
                                            </div>

                                            {/* Footer Info (Tenggat Waktu) */}
                                            {isTask && note.deadlines && note.deadlines.length > 0 && (
                                                <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between flex-wrap gap-2 min-w-0">
                                                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                                        <Clock size={12} className="text-primary shrink-0" />
                                                        <span className="truncate">
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
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20 shrink-0">
                                                                Perpanjangan ke-{note.deadlines.length - 1}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {note.completedAt && (
                                                        <span className="text-emerald-600 font-medium inline-flex items-center gap-1 shrink-0">
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
                    <div className="space-y-3 min-w-0">
                        <div className="bg-muted/40 p-3 rounded-2xl border border-border/80 text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 min-w-0">
                            <span className="truncate">
                                Tindak lanjut untuk <strong className="text-foreground font-semibold">{userDeptName || "Departemen Anda"}</strong>:
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold border border-purple-500/20 shrink-0 self-start sm:self-auto">
                                {myDeptTasks.filter((t) => t.taskStatus !== "SELESAI").length} Tugas Aktif
                            </span>
                        </div>

                        {myDeptTasks.length === 0 ? (
                            <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground shadow-xs">
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
                                        className={`bg-card border rounded-2xl p-3.5 sm:p-4 shadow-xs space-y-2.5 transition-all min-w-0 overflow-hidden ${
                                            isCompleted ? "opacity-75 border-border" : "border-purple-500/30 bg-purple-500/[0.01]"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground min-w-0">
                                                <span className="truncate">
                                                    Dari: <strong className="text-foreground font-semibold">{task.originName}</strong>
                                                </span>
                                                {task.session?.meetingDate && (
                                                    <span className="text-[11px] text-muted-foreground shrink-0">
                                                        • {new Date(task.session.meetingDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                                                    </span>
                                                )}
                                                {isPersonalTask ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                                                        <User size={10} />
                                                        Tugas Pribadi
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                                                        <Building2 size={10} />
                                                        Departemen
                                                    </span>
                                                )}
                                            </div>
                                            <div className="shrink-0">
                                                {renderTaskStatusBadge(task.taskStatus)}
                                            </div>
                                        </div>

                                        <div className="text-xs sm:text-sm font-medium text-foreground whitespace-pre-wrap leading-relaxed break-words [overflow-wrap:anywhere] min-w-0">
                                            {task.content}
                                        </div>

                                        {currentDeadline && (
                                            <div className="pt-2 border-t border-border/50 flex items-center justify-between flex-wrap gap-2 text-[11px] text-muted-foreground min-w-0">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <Clock size={12} className="text-primary shrink-0" />
                                                    <span className="truncate">
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
                                                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">
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
                    <div className="space-y-3 min-w-0">
                        {/* Mobile View: Clean Modern Cards with left status stripe */}
                        <div className="sm:hidden space-y-2.5 min-w-0">
                            {attendances.length === 0 ? (
                                <div className="p-8 text-center text-xs text-muted-foreground bg-card border border-border rounded-2xl shadow-xs">
                                    Tidak ada data kehadiran untuk sesi rapat ini.
                                </div>
                            ) : (
                                attendances.map((att, idx) => {
                                    const isHadir = att.status === "HADIR";
                                    const isIzin = att.status === "IZIN";

                                    return (
                                        <div
                                            key={att.id}
                                            className={`p-3 rounded-2xl bg-card border shadow-xs space-y-2 min-w-0 border-l-4 ${
                                                isHadir
                                                    ? "border-l-emerald-500 border-border"
                                                    : isIzin
                                                    ? "border-l-amber-500 border-border"
                                                    : "border-l-rose-500 border-border"
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2 min-w-0">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 min-w-0">
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
                                                    {isHadir && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                            <CheckCircle2 size={11} /> Hadir
                                                        </span>
                                                    )}
                                                    {isIzin && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                            Izin
                                                        </span>
                                                    )}
                                                    {!isHadir && !isIzin && (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                                            Alpa
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {(att.representativeName || (isIzin && att.permitReason)) && (
                                                <div className="text-[11px] text-muted-foreground pl-4 pt-1.5 flex flex-col gap-1 border-t border-border/50 min-w-0">
                                                    {att.representativeName && (
                                                        <div className="flex items-center gap-1.5 text-foreground font-medium min-w-0 truncate">
                                                            <User size={11} className="text-primary shrink-0" />
                                                            <span className="text-muted-foreground text-[10px]">Perwakilan:</span>
                                                            <span className="truncate">{att.representativeName}</span>
                                                        </div>
                                                    )}
                                                    {isIzin && att.permitReason && (
                                                        <div className="text-amber-700 dark:text-amber-300 italic break-words [overflow-wrap:anywhere] min-w-0 bg-amber-500/[0.06] p-1.5 rounded-lg border border-amber-500/20">
                                                            Alasan: &ldquo;{att.permitReason}&rdquo;
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Desktop View: Full Responsive Table */}
                        <div className="hidden sm:block bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
                            <div className="w-full overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[45px] text-center">No</TableHead>
                                            <TableHead>Departemen</TableHead>
                                            <TableHead>Divisi</TableHead>
                                            <TableHead>Status Kehadiran</TableHead>
                                            <TableHead>Perwakilan / Alasan</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {attendances.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
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
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                                <CheckCircle2 size={11} /> Hadir
                                                            </span>
                                                        )}
                                                        {att.status === "IZIN" && (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                                                Izin
                                                            </span>
                                                        )}
                                                        {att.status === "ALPA" && (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                                                Alpa
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-foreground">
                                                        {att.status === "IZIN" && att.permitReason ? (
                                                            <span className="text-amber-700 dark:text-amber-300 italic break-words">
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
