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
    ArrowRight,
    FileSpreadsheet,
    Printer,
    BarChart3,
    CheckSquare,
    FileText,
    Shield,
    Info,
    User,
} from "lucide-react";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table";
import { toWIBDateString, addCalendarDays } from "@/lib/timezone";
import { exportToExcel, exportToPdfTable } from "@/lib/export";
import { reportClientError } from "@/lib/clientErrors";
import {
    DeptRecapTable,
    exportRecapDeptPdf,
    exportRecapMemberExcel,
    useGreenMeetingRecap,
} from "@/components/green-meeting/GreenMeetingRecap";
import { countAttendance, personRowsOf } from "@/app/ga/green-meeting/selectors";

interface DepartmentInfo {
    id: string;
    name: string;
    code: string | null;
    division?: {
        id: string;
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
    employeeId: string | null;
    employeeName: string | null;
    departmentId: string | null;
    departmentName: string | null;
    /** LEGACY read-only: presensi tanpa kolom division di DB. */
    divisionId?: string | null;
    divisionName?: string | null;
    representativeName?: string | null;
    permitReason?: string | null;
    unit?: GreenMeetingUnit | null;
}

interface GreenMeetingDeadline {
    id: string;
    sequence: number;
    deadlineDate: string;
    reason: string | null;
}

interface GreenMeetingNoteTarget {
    label?: string | null;
    employee?: { name: string } | null;
    division?: { name: string } | null;
    department?: DepartmentInfo | null;
}

interface GreenMeetingNote {
    id: string;
    type: "INFORMASI" | "TUGAS";
    content: string;
    originType: "DIREKSI" | "DEPARTMENT";
    originName: string;
    isAllTarget: boolean;
    taskStatus: "BELUM_DIMULAI" | "SEDANG_BERJALAN" | "SELESAI" | "DIBATALKAN";
    completedAt: string | null;
    targets: GreenMeetingNoteTarget[];
    deadlines: GreenMeetingDeadline[];
    session?: {
        meetingDate: string;
    };
}

interface GreenMeetingSession {
    id: string;
    meetingDate: string;
    startTime: string;
    room: string;
    isCancelled?: boolean;
    attendances: GreenMeetingAttendance[];
    deptIzins?: { id: string; departmentId: string | null; reason: string }[];
    notes: GreenMeetingNote[];
}

type TabKey = "ATTENDANCE" | "NOTES" | "TASKS" | "RECAP";

function renderTaskStatusBadge(status: string) {
    switch (status) {
        case "SELESAI":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <CheckCircle2 size={12} />
                    Selesai
                </span>
            );
        case "SEDANG_BERJALAN":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                    <Clock size={12} />
                    Sedang Berjalan
                </span>
            );
        case "BELUM_DIMULAI":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                    <Clock size={12} />
                    Belum Dimulai
                </span>
            );
        case "DIBATALKAN":
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                    Dibatalkan
                </span>
            );
        default:
            return <span className="text-xs font-medium text-muted-foreground">{status}</span>;
    }
}

export default function HrGreenMeetingMonitoringPage() {
    const todayStr = toWIBDateString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const defaultStart = toWIBDateString(thirtyDaysAgo);

    const [currentDateStr, setCurrentDateStr] = useState<string>(todayStr);
    const [activeTab, setActiveTab] = useState<TabKey>("ATTENDANCE");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>("");

    // Data States
    const [session, setSession] = useState<GreenMeetingSession | null>(null);
    const [offDayInfo, setOffDayInfo] = useState<{ isOffDay: boolean; reason?: string }>({ isOffDay: false });
    const [activeTasks, setActiveTasks] = useState<GreenMeetingNote[]>([]);

    // Filter States
    const [attendanceFilter, setAttendanceFilter] = useState<string>("ALL");
    const [noteFilter, setNoteFilter] = useState<string>("ALL");

    // Recap States
    const [recapStart, setRecapStart] = useState<string>(defaultStart);
    const [recapEnd, setRecapEnd] = useState<string>(todayStr);
    const [memberQuery, setMemberQuery] = useState("");
    const { recap: recapData, loading: recapLoading, error: recapError, fetchRecap } = useGreenMeetingRecap();

    const fetchedDateRef = useRef<string | null>(null);

    // Load Session Data
    const abortRef = useRef<AbortController | null>(null);
    const loadSessionData = useCallback(async (targetDate: string) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoading(true);
        setLoadError("");

        try {
            const [sessionRes, tasksRes] = await Promise.all([
                fetch(`/api/green-meeting/sessions?date=${targetDate}`, { signal: controller.signal }),
                fetch("/api/green-meeting/notes?activeTasks=true", { signal: controller.signal }),
            ]);

            if (controller.signal.aborted) return;
            if (sessionRes.status === 404) {
                setSession(null);
                setOffDayInfo({ isOffDay: false });
            } else {
                if (!sessionRes.ok) throw new Error("Gagal memuat sesi Green Meeting.");
                const sessionJson = await sessionRes.json();
                setSession(sessionJson.session);
                setOffDayInfo(sessionJson.offDayInfo || { isOffDay: false });
            }

            if (tasksRes.ok) {
                const tasksJson = await tasksRes.json();
                if (!controller.signal.aborted) setActiveTasks(tasksJson);
            }
        } catch (err) {
            if (err instanceof Error && err.name === "AbortError") return;
            reportClientError("HrGreenMeetingMonitoring", "Gagal memuat monitoring Green Meeting", err);
            setLoadError(err instanceof Error ? err.message : "Terjadi kesalahan memuat data.");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, []);

    useEffect(() => () => abortRef.current?.abort(), []);

    useEffect(() => {
        if (fetchedDateRef.current === currentDateStr) return;
        fetchedDateRef.current = currentDateStr;
        void loadSessionData(currentDateStr);
    }, [currentDateStr, loadSessionData]);

    const handleRefresh = useCallback(() => {
        void loadSessionData(currentDateStr);
    }, [currentDateStr, loadSessionData]);

    useEffect(() => {
        if (activeTab === "RECAP") {
            void fetchRecap(recapStart, recapEnd);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // Export Excel (peringkat per orang; bersama dengan GA)
    const handleExportExcel = () => {
        if (!recapData) return;
        exportRecapMemberExcel(recapData, memberQuery, recapStart, recapEnd, "Monitoring_Green_Meeting", exportToExcel);
    };

    // Export PDF (rekap dept; bersama dengan GA)
    const handleExportPdf = () => {
        if (!recapData) return;
        exportRecapDeptPdf(
            recapData,
            recapStart,
            recapEnd,
            `Monitoring_Green_Meeting_${recapStart}_sd_${recapEnd}`,
            "Laporan Pemantauan Rapat Koordinasi Green Meeting",
            exportToPdfTable
        );
    };

    // Derived HUD (bersama dengan GA via selectors)
    const attendances = useMemo(() => session?.attendances || [], [session]);
    const personRows = useMemo(() => personRowsOf(attendances as never[]), [attendances]);
    const { hadir: hadirCount, belumHadir: alpaCount, percent: attendancePercent } = useMemo(
        () => countAttendance(personRows as never[]),
        [personRows]
    );

    const dueTodayTasks = useMemo(() => activeTasks.filter((t) => {
        const latestDeadline = t.deadlines && t.deadlines.length > 0
            ? t.deadlines[t.deadlines.length - 1].deadlineDate.split("T")[0]
            : null;
        return latestDeadline === currentDateStr;
    }), [activeTasks, currentDateStr]);

    const extendedTasks = useMemo(
        () => activeTasks.filter((t) => t.deadlines && t.deadlines.length > 1),
        [activeTasks]
    );

    const taskChips = useMemo(() => {
        const todayWib = toWIBDateString();
        const overdue = activeTasks.filter((t) => {
            if (t.taskStatus === "SELESAI" || t.taskStatus === "DIBATALKAN") return false;
            const latest = t.deadlines && t.deadlines.length > 0 ? t.deadlines[t.deadlines.length - 1] : null;
            return latest ? latest.deadlineDate.slice(0, 10) < todayWib : false;
        }).length;
        return {
            total: activeTasks.length,
            selesai: activeTasks.filter((t) => t.taskStatus === "SELESAI").length,
            berjalan: activeTasks.filter((t) => t.taskStatus === "BELUM_DIMULAI" || t.taskStatus === "SEDANG_BERJALAN").length,
            overdue,
        };
    }, [activeTasks]);

    // Filters (per orang; baris legacy tanpa employee disembunyikan di sini, arsip di tab rekap)
    const filteredAttendances = useMemo(() => personRows.filter((a) => {
        if (attendanceFilter === "ALL") return true;
        if (attendanceFilter === "HADIR") return a.status === "HADIR";
        return a.status !== "HADIR";
    }), [personRows, attendanceFilter]);
    const legacyRows = useMemo(() => attendances.filter((a) => !a.employeeId), [attendances]);
    const hasLegacyArchive = legacyRows.length > 0;
    const hasMixedArchive = personRows.length > 0 && legacyRows.length > 0;

    const filteredNotes = useMemo(() => (session?.notes || []).filter((n) => {
        if (noteFilter === "ALL") return true;
        if (noteFilter === "DIREKSI") return n.originType === "DIREKSI";
        if (noteFilter === "INFORMASI") return n.type === "INFORMASI";
        if (noteFilter === "TUGAS") return n.type === "TUGAS";
        return true;
    }), [session, noteFilter]);

    const filteredMembers = useMemo(() => (recapData?.memberStats ?? []).filter((m) => {
        const q = memberQuery.trim().toLowerCase();
        if (!q) return true;
        return `${m.name} ${m.departmentName}`.toLowerCase().includes(q);
    }), [recapData, memberQuery]);

    const formattedDate = new Date(`${currentDateStr}T00:00:00`).toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            {/* Header Read-Only Monitoring */}
            <div className="bg-card border border-border rounded-xl p-4 sm:p-6 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                Green Meeting
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center gap-1">
                                <Shield size={12} />
                                Pemantauan HR (Read-Only)
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                Dikelola Penuh oleh Tim General Affairs
                            </span>
                            {offDayInfo?.isOffDay && (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1">
                                    <AlertCircle size={12} />
                                    {offDayInfo.reason || "Hari Libur"}
                                </span>
                            )}
                        </div>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-1 text-foreground">
                            Pemantauan Rapat Koordinasi Harian
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Peninjauan transparansi presensi departemen, notulen arahan manajemen, dan pelacakan progres tindak lanjut perusahaan.
                        </p>
                    </div>

                    {/* Date Navigation */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center bg-muted/60 border border-border rounded-lg p-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setCurrentDateStr(addCalendarDays(currentDateStr, -1));
                                }}
                                className="p-1.5 hover:bg-background rounded-md text-foreground transition-colors"
                                title="Hari Sebelumnya"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <label
                                className="relative flex items-center gap-1.5 px-2.5 py-1 text-xs sm:text-sm font-medium text-foreground hover:bg-background/80 rounded-md cursor-pointer transition-colors group"
                                title="Klik untuk memilih tanggal dari kalender"
                                onClick={(e) => {
                                    try {
                                        const input = e.currentTarget.querySelector("input[type='date']") as HTMLInputElement | null;
                                        input?.showPicker?.();
                                    } catch {}
                                }}
                            >
                                <Calendar size={14} className="text-primary group-hover:scale-110 transition-transform" />
                                <span className="select-none font-semibold">{formattedDate}</span>
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
                                className="p-1.5 hover:bg-background rounded-md text-foreground transition-colors"
                                title="Hari Berikutnya"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setCurrentDateStr(todayStr)}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
                        >
                            Hari Ini
                        </button>

                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={loading}
                            className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                            title="Muat Ulang Data"
                        >
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {/* Sub Bar Info Ruangan & Jam */}
                <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock size={14} />
                            <span>Jam Mulai: <strong className="text-foreground">{session?.startTime || "08:30"} WIB</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            <MapPin size={14} />
                            <span>Lokasi: <strong className="text-foreground">{session?.room || "Ruang Rapat Utama Lt. 2"}</strong></span>
                        </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                        Status Sesi:{" "}
                        {!session ? (
                            <span className="font-semibold text-muted-foreground">● Belum ada</span>
                        ) : session.isCancelled ? (
                            <span className="font-semibold text-rose-600 dark:text-rose-400">● Dibatalkan</span>
                        ) : offDayInfo?.isOffDay ? (
                            <span className="font-semibold text-amber-600 dark:text-amber-400">● Libur</span>
                        ) : (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">● Aktif</span>
                        )}
                    </div>
                </div>
            </div>

            {loadError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-sm font-medium flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                        <AlertCircle size={16} />
                        <span>{loadError}</span>
                    </span>
                    <button
                        type="button"
                        onClick={handleRefresh}
                        className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-500/30 hover:bg-rose-500/10 transition-colors"
                    >
                        Coba lagi
                    </button>
                </div>
            )}

            {!loading && !session && !loadError && (
                <div className="p-4 rounded-xl bg-muted/60 border border-border text-sm text-muted-foreground flex items-center gap-2">
                    <Info size={16} className="shrink-0" />
                    <span>Belum ada sesi rapat pada tanggal ini. Pilih tanggal lain atau hubungi Tim GA.</span>
                </div>
            )}

            {/* KPI HUD */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <span className="text-xs font-medium text-muted-foreground uppercase">Presensi Karyawan Hari Ini</span>
                    <div className="text-2xl font-bold text-foreground mt-1">
                        {hadirCount} / {personRows.length}
                        <span className="text-xs text-emerald-600 ml-1.5">({attendancePercent}%)</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="text-emerald-600 font-medium">{hadirCount} Hadir</span> •
                        <span className="text-rose-600 font-medium">{alpaCount} Belum hadir</span>
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <span className="text-xs font-medium text-muted-foreground uppercase">Tugas Berjalan</span>
                    <div className="text-2xl font-bold text-foreground mt-1">{activeTasks.length}</div>
                    <p className="mt-2 text-xs text-muted-foreground">Tindak lanjut aktif perusahaan</p>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <span className="text-xs font-medium text-muted-foreground uppercase">Jatuh Tempo Hari Ini</span>
                    <div className={`text-2xl font-bold mt-1 ${dueTodayTasks.length > 0 ? "text-rose-600" : "text-foreground"}`}>
                        {dueTodayTasks.length}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Batas waktu hari ini</p>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <span className="text-xs font-medium text-muted-foreground uppercase">Tugas Diperpanjang</span>
                    <div className="text-2xl font-bold text-foreground mt-1">{extendedTasks.length}</div>
                    <p className="mt-2 text-xs text-amber-600 font-medium">Mendapat perpanjangan deadline</p>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex items-center gap-1.5 border-b border-border pb-1 overflow-x-auto">
                <button
                    type="button"
                    onClick={() => setActiveTab("ATTENDANCE")}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-[5px] whitespace-nowrap ${activeTab === "ATTENDANCE"
                        ? "border-primary text-primary bg-card/60"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                >
                    <CheckSquare size={16} />
                    <span>Presensi Karyawan ({personRows.length})</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab("NOTES")}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-[5px] whitespace-nowrap ${activeTab === "NOTES"
                        ? "border-primary text-primary bg-card/60"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                >
                    <FileText size={16} />
                    <span>Notulensi Rapat ({session?.notes?.length || 0})</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab("TASKS")}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-[5px] whitespace-nowrap ${activeTab === "TASKS"
                        ? "border-primary text-primary bg-card/60"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                >
                    <ListTodo size={16} />
                    <span>Pelacak Tindak Lanjut ({activeTasks.length})</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab("RECAP")}
                    className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-lg transition-colors border-b-2 -mb-[5px] whitespace-nowrap ${activeTab === "RECAP"
                        ? "border-primary text-primary bg-card/60"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                >
                    <BarChart3 size={16} />
                    <span>Rekap & Ekspor Laporan</span>
                </button>
            </div>

            {/* TAB CONTENTS (Read-Only) */}
            <div className="pt-2">
                {/* TAB 1: PRESENSI KARYAWAN */}
                {activeTab === "ATTENDANCE" && (
                    <div className="space-y-4">
                        {hasLegacyArchive && (
                            <p className="text-xs text-muted-foreground bg-card border border-border rounded-xl px-4 py-3">
                                {hasMixedArchive
                                    ? `Sesi campuran: ${legacyRows.length} baris arsip lama disembunyikan, hanya ${personRows.length} baris per-orang ditampilkan. Detail arsip ada di tab Rekap.`
                                    : "Sesi ini memakai format lama (per departemen). Datanya tersimpan sebagai arsip dan tidak ditampilkan di sini."}
                            </p>
                        )}
                        <div className="flex items-center gap-2 bg-card p-3 rounded-xl border border-border">
                            <button
                                type="button"
                                onClick={() => setAttendanceFilter("ALL")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${attendanceFilter === "ALL" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}
                            >
                                Semua ({personRows.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setAttendanceFilter("HADIR")}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg ${attendanceFilter === "HADIR" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}
                            >
                                Hadir ({hadirCount})
                            </button>
                            <button
                                type="button"
                                onClick={() => setAttendanceFilter("ALPA")}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg ${attendanceFilter === "ALPA" ? "bg-rose-600 text-white" : "bg-muted text-muted-foreground"}`}
                            >
                                Belum hadir ({alpaCount})
                            </button>
                        </div>

                        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[40px] text-center">No</TableHead>
                                        <TableHead>Nama Karyawan</TableHead>
                                        <TableHead>Departemen</TableHead>
                                        <TableHead>Divisi</TableHead>
                                        <TableHead>Status Kehadiran</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredAttendances.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                                                Tidak ada data presensi.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredAttendances.map((att, idx) => (
                                            <TableRow key={att.id}>
                                                <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                                                <TableCell className="font-semibold text-xs text-foreground">
                                                    {att.employeeName || att.representativeName || "-"}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {att.departmentName || "-"}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    {att.divisionName || "-"}
                                                </TableCell>
                                                <TableCell>
                                                    {att.status === "HADIR" ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                            <CheckCircle2 size={12} /> Hadir
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                                            Belum hadir
                                                        </span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}

                {/* TAB 2: NOTULENSI */}
                {activeTab === "NOTES" && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 bg-card p-3 rounded-xl border border-border flex-wrap">
                            <button
                                type="button"
                                onClick={() => setNoteFilter("ALL")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${noteFilter === "ALL" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}
                            >
                                Semua Notulen
                            </button>
                            <button
                                type="button"
                                onClick={() => setNoteFilter("DIREKSI")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${noteFilter === "DIREKSI" ? "bg-purple-600 text-white" : "bg-muted text-muted-foreground"}`}
                            >
                                Arahan Direksi
                            </button>
                            <button
                                type="button"
                                onClick={() => setNoteFilter("INFORMASI")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${noteFilter === "INFORMASI" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}
                            >
                                Informasi
                            </button>
                            <button
                                type="button"
                                onClick={() => setNoteFilter("TUGAS")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${noteFilter === "TUGAS" ? "bg-amber-600 text-white" : "bg-muted text-muted-foreground"}`}
                            >
                                Tugas Tindak Lanjut
                            </button>
                        </div>

                        <div className="space-y-3">
                            {filteredNotes.length === 0 ? (
                                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
                                    <Info size={28} className="mx-auto mb-2 opacity-40" />
                                    <p className="text-sm font-medium">Belum ada notulen untuk filter ini.</p>
                                </div>
                            ) : (
                                filteredNotes.map((note) => {
                                    const isTask = note.type === "TUGAS";
                                    return (
                                        <div key={note.id} className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border/70">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${isTask ? "bg-purple-500/10 text-purple-600 border-purple-500/20" : "bg-blue-500/10 text-blue-600 border-blue-500/20"}`}>
                                                        {isTask ? "Tugas Tindak Lanjut" : "Informasi"}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-muted border border-border text-foreground font-medium flex-wrap">
                                                        <span className="font-bold">Dari: {note.originName}</span>
                                                        <ArrowRight size={11} className="text-muted-foreground" />
                                                        <span>
                                                            Kepada: {note.isAllTarget ? (
                                                                <strong className="text-primary">Semua Karyawan</strong>
                                                            ) : (
                                                                <strong>
                                                                    {note.targets?.map((t: GreenMeetingNoteTarget) => t.label || t.employee?.name || t.division?.name || t.department?.name).filter(Boolean).join(" • ") || "Target Spesifik"}
                                                                </strong>
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>

                                                {isTask && renderTaskStatusBadge(note.taskStatus)}
                                            </div>

                                            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                                {note.content}
                                            </div>

                                            {isTask && note.deadlines && note.deadlines.length > 0 && (
                                                <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Clock size={12} className="text-primary" />
                                                        <span>Tenggat: <strong>{new Date(note.deadlines[note.deadlines.length - 1].deadlineDate).toLocaleDateString("id-ID")}</strong></span>
                                                        {note.deadlines.length > 1 && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                                                Perpanjangan ke-{note.deadlines.length - 1}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 3: ACTION ITEMS TRACKER */}
                {activeTab === "TASKS" && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-semibold">
                                Total {taskChips.total}
                            </span>
                            <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 font-semibold">
                                Berjalan {taskChips.berjalan}
                            </span>
                            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold">
                                Selesai {taskChips.selesai}
                            </span>
                            {taskChips.overdue > 0 && (
                                <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 font-bold">
                                    Terlambat {taskChips.overdue}
                                </span>
                            )}
                        </div>
                        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[40px] text-center">No</TableHead>
                                    <TableHead>Uraian Tugas</TableHead>
                                    <TableHead>Dari ke Kepada</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Tenggat Terkini</TableHead>
                                    <TableHead>Riwayat Molor</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {activeTasks.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                                            Tidak ada tugas aktif berjalan saat ini.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    activeTasks.map((task, idx) => {
                                        const currentDeadline = task.deadlines && task.deadlines.length > 0
                                            ? task.deadlines[task.deadlines.length - 1]
                                            : null;
                                        const extensionsCount = Math.max(0, (task.deadlines?.length || 1) - 1);

                                        return (
                                            <TableRow key={task.id}>
                                                <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                                                <TableCell className="max-w-[280px]">
                                                    <div className="text-xs font-semibold text-foreground whitespace-pre-wrap">
                                                        {task.content}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    <span className="font-semibold text-purple-600">{task.originName}</span>
                                                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                                                        <ArrowRight size={10} />
                                                        <span>
                                                            {task.isAllTarget
                                                                ? "Semua Karyawan"
                                                                : task.targets?.map((t) => t.label || t.employee?.name || t.division?.name || t.department?.name).filter(Boolean).join(", ") || "-"}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {renderTaskStatusBadge(task.taskStatus)}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {currentDeadline ? (
                                                        <div className="font-semibold text-foreground flex items-center gap-1">
                                                            <Clock size={12} className="text-primary" />
                                                            <span>{new Date(currentDeadline.deadlineDate).toLocaleDateString("id-ID")}</span>
                                                        </div>
                                                    ) : (
                                                        "-"
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {extensionsCount > 0 ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                                            {extensionsCount}x Diperpanjang
                                                        </span>
                                                    ) : (
                                                        <span className="text-emerald-600 font-medium text-xs">
                                                            Tepat Waktu
                                                        </span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                        </div>
                    </div>
                )}

                {/* TAB 4: REKAPITULASI & EKSPOR */}
                {activeTab === "RECAP" && (
                    <div className="space-y-6">
                        <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Calendar size={14} /> Periode:
                                </span>
                                <input
                                    type="date"
                                    value={recapStart}
                                    onChange={(e) => setRecapStart(e.target.value)}
                                    className="px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
                                />
                                <span className="text-xs text-muted-foreground">s/d</span>
                                <input
                                    type="date"
                                    value={recapEnd}
                                    onChange={(e) => setRecapEnd(e.target.value)}
                                    className="px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
                                />
                                <button
                                    type="button"
                                    onClick={() => void fetchRecap(recapStart, recapEnd)}
                                    disabled={recapLoading}
                                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-muted hover:bg-muted/80 text-foreground"
                                >
                                    {recapLoading ? "Memuat..." : "Terapkan"}
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleExportExcel}
                                    disabled={!recapData || recapData.memberStats?.length === 0}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                                >
                                    <FileSpreadsheet size={14} />
                                    <span>Ekspor Excel</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportPdf}
                                    disabled={!recapData || recapData.deptStats?.length === 0}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
                                >
                                    <Printer size={14} />
                                    <span>Cetak PDF</span>
                                </button>
                            </div>
                        </div>

                        {recapError && (
                            <div className="p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 font-medium flex items-center justify-between gap-2">
                                <span>{recapError}</span>
                                <button
                                    type="button"
                                    onClick={() => void fetchRecap(recapStart, recapEnd)}
                                    disabled={recapLoading}
                                    className="shrink-0 px-3 py-1 text-xs font-semibold rounded-lg border border-rose-500/30 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                                >
                                    Coba lagi
                                </button>
                            </div>
                        )}

                        {recapData && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                                        <span className="text-xs text-muted-foreground uppercase">Total Sesi</span>
                                        <div className="text-2xl font-bold text-foreground mt-1">{recapData.kpi.totalSesi}</div>
                                    </div>
                                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                                        <span className="text-xs text-muted-foreground uppercase">Hadir</span>
                                        <div className="text-2xl font-bold text-emerald-600 mt-1">{recapData.kpi.totalHadir}</div>
                                        <p className="text-[11px] text-muted-foreground mt-1">dari {recapData.kpi.totalOrang} orang</p>
                                    </div>
                                    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                                        <span className="text-xs text-muted-foreground uppercase">Tidak Hadir</span>
                                        <div className="text-2xl font-bold text-rose-600 mt-1">{recapData.kpi.totalAlpa}</div>
                                    </div>
                                </div>
                                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                                    <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <BarChart3 size={16} className="text-primary" />
                                            <h4 className="text-sm font-bold text-foreground">
                                                Kehadiran Per Orang (Total Sesi: {recapData.totalSessions})
                                            </h4>
                                        </div>
                                        <input
                                            type="text"
                                            value={memberQuery}
                                            onChange={(e) => setMemberQuery(e.target.value)}
                                            placeholder="Cari nama / departemen…"
                                            aria-label="Cari anggota rekap"
                                            className="px-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                        />
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[40px] text-center">No</TableHead>
                                                <TableHead>Nama</TableHead>
                                                <TableHead>Departemen</TableHead>
                                                <TableHead className="text-center">Hadir</TableHead>
                                                <TableHead className="text-center">Tidak Hadir</TableHead>
                                                <TableHead className="text-center">Total Sesi</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredMembers.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                                                        Tidak ada data untuk periode atau pencarian ini.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                filteredMembers.map((stat, idx: number) => (
                                                <TableRow key={stat.employeeId}>
                                                    <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                                                    <TableCell className="text-xs font-semibold text-foreground">{stat.name}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{stat.departmentName}</TableCell>
                                                    <TableCell className="text-center text-xs text-emerald-600 font-medium">{stat.hadir}</TableCell>
                                                    <TableCell className="text-center text-xs text-rose-600 font-medium">{stat.alpa}</TableCell>
                                                    <TableCell className="text-center text-xs">{stat.totalSesi}</TableCell>
                                                </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                                <DeptRecapTable title="Keterwakilan Departemen" stats={recapData.deptStats} />
                                {recapData.archiveSessions > 0 && (
                                    <DeptRecapTable
                                        title={`Arsip Sesi Lama (${recapData.archiveSessions} sesi)`}
                                        subtitle="Format per departemen, hanya baca, tidak dihitung dalam KPI."
                                        stats={recapData.archiveStats}
                                        showStatus={false}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
