"use client";

import { useCallback, useMemo, useState } from "react";
import {
    CheckCircle2,
    XCircle,
    CheckCheck,
    Check,
    X,
    Search,
} from "lucide-react";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table";
import AccessibleModal from "@/components/ui/AccessibleModal";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import { fetchGreenMeetingEmployees } from "../apiClient";
import { countAttendance, groupRowsByDept, legacyRowsOf, personRowsOf } from "../selectors";
import type {
    GreenMeetingAttendance,
    GreenMeetingDeptIzin,
    GreenMeetingPersonStatus,
} from "../types";

interface AttendanceTabProps {
    attendances: GreenMeetingAttendance[];
    deptIzins: GreenMeetingDeptIzin[];
    onBulkMarkAllPresent: () => Promise<void>;
    onBulkUpdateSelected: (
        attendanceIds: string[],
        action: "MARK_SELECTED_PRESENT" | "MARK_SELECTED_ALPA"
    ) => Promise<void>;
    onUpdateAttendance: (
        attendanceId: string,
        data: { status: GreenMeetingPersonStatus }
    ) => Promise<void>;
    onQuickMark: (employeeId: string) => Promise<void>;
    onCreateDeptIzin: (data: { departmentId: string; reason: string }) => Promise<void>;
    onDeleteDeptIzin: (id: string) => Promise<void>;
    loading?: boolean;
}

interface EmployeeHit {
    employeeId: string;
    name: string;
    department: string;
}

function displayName(att: GreenMeetingAttendance): string {
    return att.employeeName || att.representativeName || "-";
}

function deptName(att: GreenMeetingAttendance): string {
    return att.departmentName || "-";
}

export default function AttendanceTab({
    attendances,
    deptIzins,
    onBulkMarkAllPresent,
    onBulkUpdateSelected,
    onUpdateAttendance,
    onQuickMark,
    onCreateDeptIzin,
    onDeleteDeptIzin,
    loading = false,
}: AttendanceTabProps) {
    const [filterStatus, setFilterStatus] = useState<string>("ALL");
    const [search, setSearch] = useState("");
    const [markingAll, setMarkingAll] = useState(false);
    const [bulkProcessing, setBulkProcessing] = useState(false);
    const [confirmAll, setConfirmAll] = useState(false);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const [izinDeptId, setIzinDeptId] = useState<string | null>(null);
    const [izinReason, setIzinReason] = useState("");
    const [izinSaving, setIzinSaving] = useState(false);
    const [izinError, setIzinError] = useState("");

    const [quickQuery, setQuickQuery] = useState("");
    const [quickMarkingId, setQuickMarkingId] = useState<string | null>(null);

    const fetchQuickEmployees = useCallback(async (q: string, signal: AbortSignal): Promise<EmployeeHit[]> => {
        const list = await fetchGreenMeetingEmployees(q, signal);
        return list.slice(0, 8);
    }, []);
    const { results: quickResults, searching: quickSearching } = useDebouncedSearch(
        quickQuery,
        fetchQuickEmployees,
        300
    );

    const handleQuickPick = async (hit: EmployeeHit) => {
        if (quickMarkingId) return;
        setQuickMarkingId(hit.employeeId);
        try {
            await onQuickMark(hit.employeeId);
            setQuickQuery("");
        } finally {
            setQuickMarkingId(null);
        }
    };

    const personRows = useMemo(
        () => personRowsOf(attendances),
        [attendances]
    );
    const legacyRows = useMemo(
        () => legacyRowsOf(attendances),
        [attendances]
    );
    const isArchiveSession = personRows.length === 0 && legacyRows.length > 0;
    const [showArchive, setShowArchive] = useState(false);

    const filtered = personRows.filter((a) => {
        if (filterStatus !== "ALL" && a.status !== filterStatus) return false;
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            const hay = `${displayName(a)} ${deptName(a)}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    const groups = useMemo(() => groupRowsByDept(personRows), [personRows]);

    const [deptFilter, setDeptFilter] = useState<string | null>(null);

    const visibleRows = filtered.filter((a) =>
        deptFilter ? (a.departmentId ?? deptName(a)) === deptFilter : true
    );

    const { hadir: hadirCount, belumHadir: alpaCount } = useMemo(
        () => countAttendance(personRows),
        [personRows]
    );

    const isAllSelected = visibleRows.length > 0 && visibleRows.every((a) => selectedIds.includes(a.id));

    const handleToggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds((prev) => prev.filter((id) => !visibleRows.some((f) => f.id === id)));
        } else {
            const newIds = new Set([...selectedIds, ...visibleRows.map((f) => f.id)]);
            setSelectedIds(Array.from(newIds));
        }
    };

    const handleToggleRow = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    const handleSelectDept = (deptRows: GreenMeetingAttendance[]) => {
        const ids = deptRows.map((r) => r.id);
        const allIn = ids.every((id) => selectedIds.includes(id));
        setSelectedIds((prev) =>
            allIn ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))
        );
    };

    const handleQuickSetStatus = async (att: GreenMeetingAttendance, newStatus: GreenMeetingPersonStatus) => {
        await onUpdateAttendance(att.id, { status: newStatus });
    };

    const handleBulkAction = async (action: "MARK_SELECTED_PRESENT" | "MARK_SELECTED_ALPA") => {
        if (selectedIds.length === 0 || bulkProcessing) return;
        setBulkProcessing(true);
        try {
            await onBulkUpdateSelected(selectedIds, action);
            setSelectedIds([]);
        } finally {
            setBulkProcessing(false);
        }
    };

    const handleMarkAll = async () => {
        if (markingAll) return;
        setMarkingAll(true);
        try {
            await onBulkMarkAllPresent();
            setSelectedIds([]);
            setConfirmAll(false);
        } finally {
            setMarkingAll(false);
        }
    };

    const handleSaveIzin = async () => {
        if (!izinDeptId) return;
        if (izinReason.trim().length < 3) {
            setIzinError("Alasan izin wajib diisi minimal 3 karakter.");
            return;
        }
        setIzinSaving(true);
        setIzinError("");
        try {
            const target = groups.flatMap((g) => g.rows).find((r) => r.departmentId === izinDeptId);
            await onCreateDeptIzin({
                departmentId: target?.departmentId ?? izinDeptId,
                reason: izinReason.trim(),
            });
            setIzinDeptId(null);
            setIzinReason("");
        } catch (err) {
            setIzinError(err instanceof Error ? err.message : "Gagal menyimpan izin.");
        } finally {
            setIzinSaving(false);
        }
    };

    const izinByDept = useMemo(() => {
        const map = new Map<string, GreenMeetingDeptIzin>();
        for (const izin of deptIzins) {
            if (izin.departmentId && !map.has(`dept:${izin.departmentId}`)) map.set(`dept:${izin.departmentId}`, izin);
        }
        return map;
    }, [deptIzins]);

    return (
        <div className="space-y-4">
            {/* Top Action Bar */}
            <div className="flex flex-col gap-3 bg-card p-4 rounded-xl border border-border">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setFilterStatus("ALL")}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filterStatus === "ALL"
                                ? "bg-primary text-white shadow-xs"
                                : "bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            Semua ({personRows.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterStatus("HADIR")}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterStatus === "HADIR"
                                ? "bg-emerald-600 text-white"
                                : "bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            Hadir ({hadirCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterStatus("ALPA")}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterStatus === "ALPA"
                                ? "bg-rose-600 text-white"
                                : "bg-muted text-muted-foreground hover:text-foreground"
                                }`}
                        >
                            Belum hadir ({alpaCount})
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setConfirmAll(true)}
                        disabled={markingAll || loading || personRows.length === 0}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
                    >
                        <CheckCheck size={16} />
                        <span>{markingAll ? "Memproses..." : "Tandai Semua Hadir"}</span>
                    </button>
                </div>
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari nama atau departemen…"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
                <div className="relative">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1.5">
                        <Search size={13} className="text-muted-foreground" />
                        Cari nama langsung dari HR — departemen otomatis terisi
                    </div>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            value={quickQuery}
                            onChange={(e) => setQuickQuery(e.target.value)}
                            placeholder="Ketik nama karyawan, pilih, langsung hadir…"
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-primary/40 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                    {(quickSearching || quickResults.length > 0) && quickQuery.trim().length >= 2 && (
                        <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                            {quickSearching && quickResults.length === 0 && (
                                <p className="px-3 py-2 text-xs text-muted-foreground">Mencari…</p>
                            )}
                            {!quickSearching && quickResults.length === 0 && (
                                <p className="px-3 py-2 text-xs text-muted-foreground">Tidak ketemu di data HR.</p>
                            )}
                            {quickResults.map((hit) => {
                                const already = personRows.some((r) => r.employeeId === hit.employeeId && r.status === "HADIR");
                                return (
                                    <button
                                        key={hit.employeeId}
                                        type="button"
                                        disabled={quickMarkingId !== null}
                                        onClick={() => void handleQuickPick(hit)}
                                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/60 transition-colors disabled:opacity-50"
                                    >
                                        <span className="min-w-0">
                                            <span className="block text-xs font-bold text-foreground truncate">{hit.name}</span>
                                            <span className="block text-[11px] text-muted-foreground truncate">
                                                {hit.department}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                                            {quickMarkingId === hit.employeeId
                                                ? "Menyimpan…"
                                                : already
                                                    ? "Sudah hadir"
                                                    : "Hadirkan"}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Bulk Editor Selection Bar */}
            {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/10 border border-primary/20 p-3 rounded-xl animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 text-xs font-bold text-primary">
                        <span>{selectedIds.length} Karyawan Dipilih:</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => handleBulkAction("MARK_SELECTED_PRESENT")}
                            disabled={bulkProcessing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
                        >
                            <Check size={14} />
                            <span>Tandai Hadir ({selectedIds.length})</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleBulkAction("MARK_SELECTED_ALPA")}
                            disabled={bulkProcessing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors disabled:opacity-50"
                        >
                            <X size={14} />
                            <span>Tandai Alpa ({selectedIds.length})</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedIds([])}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors"
                        >
                            Batal
                        </button>
                    </div>
                </div>
            )}

            {/* Strip departemen: filter + aksi per dept (logika terwakili jalan di belakang) */}
            {groups.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 bg-card p-3 rounded-xl border border-border">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase mr-1">Dept:</span>
                    <button
                        type="button"
                        onClick={() => setDeptFilter(null)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors ${deptFilter === null
                            ? "bg-primary text-white border-primary"
                            : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Semua
                    </button>
                    {groups.map((group) => {
                        const deptHadir = group.rows.filter((r) => r.status === "HADIR").length;
                        const deptIzin = group.deptId ? izinByDept.get(`dept:${group.deptId}`) : undefined;
                        const active = deptFilter === (group.deptId ?? group.deptName);
                        const dot = deptHadir > 0 ? "bg-emerald-500" : deptIzin ? "bg-amber-500" : "bg-rose-500";
                        return (
                            <span
                                key={`chip-${group.deptId ?? group.deptName}`}
                                className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full border text-[11px] transition-colors ${active
                                    ? "border-primary bg-primary/10"
                                    : "border-border bg-background"
                                    }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => setDeptFilter(active ? null : (group.deptId ?? group.deptName))}
                                    className="inline-flex items-center gap-1.5 font-semibold text-foreground"
                                    title={`Saring ${group.deptName}`}
                                >
                                    <span className={`h-2 w-2 rounded-full ${dot}`} />
                                    {group.deptName} ({deptHadir}/{group.rows.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const notYet = group.rows.filter((r) => r.status !== "HADIR");
                                        if (notYet.length === 0) return;
                                        handleSelectDept(notYet);
                                        setDeptFilter(null);
                                    }}
                                    className="px-1.5 py-0.5 font-bold text-emerald-600 hover:bg-emerald-500/10 rounded-full"
                                    title={`Pilih yang belum hadir di ${group.deptName}`}
                                    aria-label={`Pilih yang belum hadir di ${group.deptName}`}
                                >
                                    ✓
                                </button>
                                {deptIzin ? (
                                    <button
                                        type="button"
                                        onClick={() => onDeleteDeptIzin(deptIzin.id)}
                                        className="px-1.5 py-0.5 font-bold text-muted-foreground hover:text-foreground rounded-full"
                                        title={`Hapus izin ${group.deptName}`}
                                        aria-label={`Hapus izin ${group.deptName}`}
                                    >
                                        ✕
                                    </button>
                                ) : (
                                    group.deptId && (
                                        <button
                                            type="button"
                                            onClick={() => { setIzinDeptId(group.deptId); setIzinReason(""); setIzinError(""); }}
                                            className="px-1.5 py-0.5 font-bold text-amber-600 hover:bg-amber-500/10 rounded-full"
                                            title={`Catat izin untuk ${group.deptName}`}
                                            aria-label={`Catat izin untuk ${group.deptName}`}
                                        >
                                            I
                                        </button>
                                    )
                                )}
                            </span>
                        );
                    })}
                </div>
            )}

            {/* Attendance Table: daftar nama langsung */}
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40px] text-center">
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    onChange={handleToggleSelectAll}
                                    className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                                    title="Pilih Semua Karyawan"
                                />
                            </TableHead>
                            <TableHead className="w-[40px] text-center">No</TableHead>
                            <TableHead>Nama Karyawan</TableHead>
                            <TableHead>Departemen</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Aksi Cepat</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visibleRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    {isArchiveSession
                                        ? "Sesi ini memakai format lama (per departemen). Lihat arsip di bawah."
                                        : "Tidak ada data karyawan."}
                                </TableCell>
                            </TableRow>
                        ) : (
                            visibleRows.map((att, idx) => {
                                    const isChecked = selectedIds.includes(att.id);
                                    return (
                                        <TableRow key={att.id} className={isChecked ? "bg-primary/[0.03]" : ""}>
                                            <TableCell className="text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => handleToggleRow(att.id)}
                                                    className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                                                />
                                            </TableCell>
                                            <TableCell className="text-center font-medium text-muted-foreground text-xs">
                                                {idx + 1}
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-semibold text-foreground text-sm">{displayName(att)}</div>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{deptName(att)}</TableCell>
                                            <TableCell>
                                                {att.status === "HADIR" ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                        <CheckCircle2 size={13} />
                                                        Hadir
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                                        <XCircle size={13} />
                                                        Belum hadir
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="inline-flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleQuickSetStatus(att, "HADIR")}
                                                        title="Tandai Hadir"
                                                        className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${att.status === "HADIR"
                                                            ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                                            : "border-border hover:bg-emerald-500/10 text-emerald-600"
                                                            }`}
                                                    >
                                                        Hadir
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleQuickSetStatus(att, "ALPA")}
                                                        title="Tandai Alpa"
                                                        className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${att.status !== "HADIR"
                                                            ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                                                            : "border-border hover:bg-rose-500/10 text-rose-600"
                                                            }`}
                                                    >
                                                        Alpa
                                                    </button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                </Table>
            </div>

            {/* Legacy fallback: sesi lama per departemen (arsip, tidak campur) */}
            {isArchiveSession && (
                <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                            Sesi lama memakai format per departemen (periode awal bulan). Data tetap tersimpan sebagai arsip.
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowArchive((v) => !v)}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-border hover:bg-muted text-foreground transition-colors"
                        >
                            {showArchive ? "Sembunyikan arsip" : `Lihat arsip (${legacyRows.length})`}
                        </button>
                    </div>
                    {showArchive && (
                        <div className="mt-3 space-y-1.5">
                            {legacyRows.map((att) => (
                                <div key={att.id} className="flex items-center justify-between gap-2 text-xs border border-border rounded-lg px-3 py-2">
                                    <span className="font-medium text-foreground">
                                        {att.representativeName || deptName(att) || "Departemen"}
                                    </span>
                                    <span className={`font-bold px-2 py-0.5 rounded-full ${att.status === "HADIR"
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                                        : att.status === "IZIN"
                                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                            : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400"
                                        }`}>
                                        {att.status === "HADIR" ? "Hadir" : att.status === "IZIN" ? "Izin" : "Belum hadir"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Modal konfirmasi tandai semua */}
            {confirmAll && (
                <AccessibleModal
                    ariaLabel="Konfirmasi tandai semua hadir"
                    onClose={() => !markingAll && setConfirmAll(false)}
                >
                    <div className="space-y-4">
                        <h3 className="text-base font-bold text-foreground">
                            Tandai semua ({personRows.length} karyawan) hadir?
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Semua karyawan yang belum hadir akan ditandai Hadir sekaligus. Pastikan panitia sudah memeriksa kehadiran di lapangan.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setConfirmAll(false)}
                                disabled={markingAll}
                                className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted text-foreground transition-colors"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleMarkAll}
                                disabled={markingAll}
                                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
                            >
                                {markingAll ? "Memproses..." : "Ya, tandai semua"}
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}

            {/* Modal izin dept */}
            {izinDeptId && (
                <AccessibleModal
                    ariaLabel="Catat izin departemen"
                    onClose={() => !izinSaving && setIzinDeptId(null)}
                >
                    <div className="space-y-4">
                        <h3 className="text-base font-bold text-foreground">Izin Departemen</h3>
                        {izinError && (
                            <p className="text-xs font-medium rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 px-3 py-2">
                                {izinError}
                            </p>
                        )}
                        <div>
                            <label className="block text-xs font-medium text-foreground mb-1.5">
                                Alasan Izin <span className="text-rose-500">*Wajib</span>
                            </label>
                            <textarea
                                value={izinReason}
                                onChange={(e) => setIzinReason(e.target.value)}
                                placeholder="Contoh: Seluruh dept dinas luar kota"
                                rows={3}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                maxLength={1000}
                            />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIzinDeptId(null)}
                                disabled={izinSaving}
                                className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted text-foreground transition-colors"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveIzin}
                                disabled={izinSaving}
                                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50"
                            >
                                {izinSaving ? "Menyimpan..." : "Simpan Izin"}
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
