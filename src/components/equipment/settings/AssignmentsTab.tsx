"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, ShieldCheck, Users } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import {
    getFriendlyClientErrorMessage,
    getResponseErrorMessage,
    reportClientError,
} from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import DataTablePagination from "@/components/ui/DataTablePagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { type EmployeePick } from "@/components/ui/EmployeeSearchPicker";
import EquipmentActorPicker from "@/components/equipment/settings/EquipmentActorPicker";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EquipmentCompanyBadge, EquipmentGlobalBadge } from "@/components/equipment/EquipmentStatusBadge";
import {
    formatShortWibDate,
    isAssignmentActive,
} from "@/components/equipment/settings/useSettingsData";
import type {
    EquipmentAssignment,
    EquipmentCompanyFilter,
    EquipmentUnit,
    QcMember,
} from "@/components/equipment/settings/useSettingsData";
import { CreateAssignmentModal, EditAssignmentModal } from "@/components/equipment/settings/AssignModals";

type AssignmentGroup = {
    userId: string;
    employeeId: string | null;
    username: string | null;
    displayName: string;
    items: EquipmentAssignment[];
    activeItems: EquipmentAssignment[];
};

interface AssignmentsTabProps {
    assignments: EquipmentAssignment[];
    units: EquipmentUnit[];
    fetchAssignments: () => Promise<void>;
    fetchUnits: () => Promise<void>;
    qcMembers: QcMember[];
    qcError: string | null;
    qcCompany: EquipmentCompanyFilter;
    setQcCompany: React.Dispatch<React.SetStateAction<EquipmentCompanyFilter>>;
    fetchQcMembers: (company: EquipmentCompanyFilter) => Promise<void>;
}

function formatPeriod(startsOn: string, endsOn: string | null): string {
    const start = formatShortWibDate(startsOn);
    if (!endsOn) return `Mulai ${start}`;
    return `${start} - ${formatShortWibDate(endsOn)}`;
}

export default function AssignmentsTab({
    assignments,
    units,
    fetchAssignments,
    fetchUnits,
    qcMembers,
    qcError,
    qcCompany,
    setQcCompany,
    fetchQcMembers,
}: AssignmentsTabProps) {
    const toast = useToast();
    const confirm = useConfirm();

    // Sub-tab: pisahkan Operator Alat vs Anggota QC agar tidak bertumpuk vertikal
    const [section, setSection] = useState<"operators" | "qc">("operators");

    // ─── Operator Alat (filter, accordion, akhiri massal) ───
    const [assignmentQuery, setAssignmentQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
    const [expandedUsers, setExpandedUsers] = useState<string[]>([]);
    const [endSelected, setEndSelected] = useState<string[]>([]);
    const [endingBulk, setEndingBulk] = useState(false);
    const [endBulkResult, setEndBulkResult] = useState<{
        ended: number;
        skipped: Array<{ assignmentId: string; reason: string }>;
    } | null>(null);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [editingAssignment, setEditingAssignment] = useState<EquipmentAssignment | null>(null);

    // ─── Anggota QC (per perusahaan, maks 20) ───
    const [newQc, setNewQc] = useState<EmployeePick | null>(null);
    const [savingQc, setSavingQc] = useState(false);
    const [qcQuery, setQcQuery] = useState("");

    useEffect(() => {
        void fetchQcMembers(qcCompany);
    }, [fetchQcMembers, qcCompany]);

    const totalActiveCount = useMemo(
        () => assignments.filter(isAssignmentActive).length,
        [assignments]
    );

    const filteredQcMembers = useMemo(() => {
        const q = qcQuery.trim().toLowerCase();
        if (!q) return qcMembers;
        return qcMembers.filter((m) =>
            `${m.name} ${m.isOutsource ? (m.username ?? "") : m.employeeId}`.toLowerCase().includes(q)
        );
    }, [qcMembers, qcQuery]);

    const persistQcMembers = useCallback(
        async (employeeIds: string[], successMessage: string) => {
            setSavingQc(true);
            try {
                const res = await fetch("/api/ga/equipment/qc-members", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ company: qcCompany, employeeIds }),
                });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan anggota QC."));
                toast(successMessage, "success");
                setNewQc(null);
                await fetchQcMembers(qcCompany);
            } catch (err) {
                toast(
                    getFriendlyClientErrorMessage(
                        err,
                        "Gagal menyimpan anggota QC. Periksa koneksi Anda lalu coba lagi."
                    ),
                    "error"
                );
                reportClientError("EquipmentSettings", "Qc members save failed", err);
            } finally {
                setSavingQc(false);
            }
        },
        [toast, fetchQcMembers, qcCompany]
    );

    const addQcMember = useCallback(() => {
        if (!newQc) {
            toast("Pilih petugas terlebih dahulu.", "warning");
            return;
        }
        const id = newQc.employeeId;
        if (qcMembers.some((v) => v.employeeId.toLowerCase() === id.toLowerCase())) {
            toast("Petugas tersebut sudah terdaftar sebagai anggota QC.", "warning");
            return;
        }
        if (qcMembers.length >= 20) {
            toast(`Anggota QC ${qcCompany} maksimal 20 orang.`, "warning");
            return;
        }
        setNewQc(null);
        void persistQcMembers(
            [...qcMembers.map((v) => v.employeeId), id],
            `Anggota QC ${qcCompany} ditambahkan.`
        );
    }, [newQc, qcMembers, qcCompany, toast, persistQcMembers]);

    const removeQcMember = useCallback(
        (member: QcMember) => {
            confirm({
                title: `Hapus ${member.name} dari QC ${qcCompany}?`,
                message: `Petugas tersebut tidak lagi dapat melihat antrean pemeriksaan QC ${qcCompany}.`,
                confirmLabel: "Hapus",
                cancelLabel: "Batal",
                variant: "danger",
                onConfirm: () => {
                    void persistQcMembers(
                        qcMembers.filter((v) => v.employeeId !== member.employeeId).map((v) => v.employeeId),
                        "Anggota QC dihapus."
                    );
                },
            });
        },
        [confirm, qcMembers, qcCompany, persistQcMembers]
    );

    const assignmentGroupsForPaging = useMemo<AssignmentGroup[]>(() => {
        const q = assignmentQuery.trim().toLowerCase();
        const rows = assignments.filter((a) => {
            if (statusFilter === "active" && !isAssignmentActive(a)) return false;
            if (!q) return true;
            const hay = `${a.user.displayName ?? ""} ${a.user.username ?? ""} ${a.user.employeeId ?? ""} ${a.unit ? a.unit.name : "semua unit"}`.toLowerCase();
            return hay.includes(q);
        });
        const map = new Map<string, AssignmentGroup>();
        for (const a of rows) {
            const g =
                map.get(a.user.id) ?? {
                    userId: a.user.id,
                    employeeId: a.user.employeeId,
                    username: a.user.username ?? null,
                    displayName:
                        a.user.displayName ??
                        (a.user.username ? `@${a.user.username}` : a.user.employeeId ?? "-"),
                    items: [],
                    activeItems: [],
                };
            g.items.push(a);
            if (isAssignmentActive(a)) g.activeItems.push(a);
            map.set(a.user.id, g);
        }
        return [...map.values()]
            .map((g) => ({
                ...g,
                items: [...g.items].sort((x, y) => Number(isAssignmentActive(y)) - Number(isAssignmentActive(x))),
            }))
            .sort((x, y) => y.activeItems.length - x.activeItems.length || x.displayName.localeCompare(y.displayName));
    }, [assignments, assignmentQuery, statusFilter]);

    const {
        currentPage: assignGroupPage,
        pageSize: assignGroupPageSize,
        setPage: setAssignGroupPage,
        setPageSize: setAssignGroupPageSize,
        resetPage: resetAssignGroupPage,
        getSliceIndices: getAssignGroupSlice,
    } = useTablePagination({
        storageKey: "ga-equipment-assignments",
        defaultPageSize: 10,
        totalItems: assignmentGroupsForPaging.length,
    });

    const endAssignment = useCallback(
        (assignment: EquipmentAssignment) => {
            const who =
                assignment.user.displayName ??
                (assignment.user.username ? `@${assignment.user.username}` : assignment.user.employeeId ?? "petugas");
            const scope = assignment.unit ? assignment.unit.name : "Semua unit";
            confirm({
                title: `Akhiri penugasan ${who}?`,
                message: `Penugasan ${scope} (mulai ${formatShortWibDate(assignment.startsOnWibDate)}) akan diakhiri hari ini.`,
                confirmLabel: "Akhiri",
                cancelLabel: "Batal",
                variant: "warning",
                onConfirm: () => {
                    void (async () => {
                        try {
                            const res = await fetch("/api/ga/equipment/assignments", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ assignmentId: assignment.id }),
                            });
                            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengakhiri penugasan."));
                            toast("Penugasan diakhiri.", "success");
                            await Promise.all([fetchAssignments(), fetchUnits()]);
                        } catch (err) {
                            toast(
                                getFriendlyClientErrorMessage(
                                    err,
                                    "Gagal mengakhiri penugasan. Periksa koneksi Anda lalu coba lagi."
                                ),
                                "error"
                            );
                        }
                    })();
                },
            });
        },
        [confirm, toast, fetchAssignments, fetchUnits]
    );

    const endAssignmentsBulk = useCallback(
        (ids: string[]) => {
            if (ids.length === 0 || endingBulk) return;
            const targets = assignments.filter((a) => ids.includes(a.id));
            const preview = targets
                .slice(0, 5)
                .map((a) => {
                    const who =
                        a.user.displayName ??
                        (a.user.username ? `@${a.user.username}` : a.user.employeeId ?? "Petugas");
                    return `• ${who} (${a.unit ? a.unit.name : "Semua unit"})`;
                })
                .join("\n");
            confirm({
                title: `Akhiri ${targets.length} penugasan?`,
                message: `Penugasan berikut akan diakhiri hari ini:\n${preview}${targets.length > 5 ? `\n...dan ${targets.length - 5} lainnya.` : ""}`,
                confirmLabel: "Akhiri Semua",
                cancelLabel: "Batal",
                variant: "warning",
                onConfirm: () => {
                    void (async () => {
                        setEndingBulk(true);
                        setEndBulkResult(null);
                        try {
                            const res = await fetch("/api/ga/equipment/assignments", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ assignmentIds: ids }),
                            });
                            const json = await res.json().catch(() => ({}));
                            if (res.status === 409 && Array.isArray(json.details)) {
                                setEndBulkResult({ ended: 0, skipped: json.details });
                                toast("Semua penugasan dilewati karena sudah berakhir atau belum dimulai.", "warning");
                            } else {
                                if (!res.ok) throw new Error(json.error ?? "Gagal mengakhiri penugasan.");
                                const data = json.data as {
                                    ended: string[];
                                    skipped: Array<{ assignmentId: string; reason: string }>;
                                };
                                setEndBulkResult({ ended: data.ended.length, skipped: data.skipped });
                                setEndSelected((prev) => prev.filter((id) => !data.ended.includes(id)));
                                toast(
                                    data.skipped.length === 0
                                        ? `${data.ended.length} penugasan diakhiri.`
                                        : `${data.ended.length} diakhiri, ${data.skipped.length} dilewati.`,
                                    data.skipped.length === 0 ? "success" : "warning"
                                );
                            }
                            await Promise.all([fetchAssignments(), fetchUnits()]);
                        } catch (err) {
                            toast(
                                getFriendlyClientErrorMessage(
                                    err,
                                    "Gagal mengakhiri penugasan. Periksa koneksi Anda lalu coba lagi."
                                ),
                                "error"
                            );
                        } finally {
                            setEndingBulk(false);
                        }
                    })();
                },
            });
        },
        [assignments, confirm, endingBulk, toast, fetchAssignments, fetchUnits]
    );

    const [assignGroupSliceStart, assignGroupSliceEnd] = getAssignGroupSlice(assignmentGroupsForPaging.length);
    const paginatedAssignmentGroups = assignmentGroupsForPaging.slice(assignGroupSliceStart, assignGroupSliceEnd);
    const assignGroupTotalPages = Math.max(1, Math.ceil(assignmentGroupsForPaging.length / assignGroupPageSize));

    const isSearching = assignmentQuery.trim().length > 0;
    const allVisibleExpanded =
        paginatedAssignmentGroups.length > 0 &&
        paginatedAssignmentGroups.every((g) => expandedUsers.includes(g.userId));

    const toggleExpandUser = (userId: string) => {
        setExpandedUsers((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
        );
    };

    const toggleExpandAllVisible = () => {
        const ids = paginatedAssignmentGroups.map((g) => g.userId);
        if (allVisibleExpanded) {
            setExpandedUsers((prev) => prev.filter((id) => !ids.includes(id)));
        } else {
            setExpandedUsers((prev) => [...new Set([...prev, ...ids])]);
        }
    };

    const toggleGroupSelection = (group: AssignmentGroup) => {
        const activeIds = group.activeItems.map((a) => a.id);
        const allSelected = activeIds.length > 0 && activeIds.every((id) => endSelected.includes(id));
        setEndSelected((prev) =>
            allSelected ? prev.filter((id) => !activeIds.includes(id)) : [...new Set([...prev, ...activeIds])]
        );
    };

    return (
        <div className="space-y-4">
            {/* Bar atas: Sub-tab Operator Alat vs Anggota QC + Aksi utama */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div
                    role="tablist"
                    aria-label="Jenis penugasan"
                    className="inline-flex rounded-lg border border-border bg-muted/40 p-1 w-fit"
                >
                    <button
                        type="button"
                        role="tab"
                        aria-selected={section === "operators"}
                        onClick={() => setSection("operators")}
                        className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors min-h-[40px] ${
                            section === "operators"
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Users className="h-4 w-4" />
                        <span>Operator Alat</span>
                        <span className="px-1.5 py-0.5 text-[11px] font-semibold rounded-full bg-primary/10 text-primary leading-none">
                            {totalActiveCount}
                        </span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={section === "qc"}
                        onClick={() => setSection("qc")}
                        className={`inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-colors min-h-[40px] ${
                            section === "qc"
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <ShieldCheck className="h-4 w-4" />
                        <span>Anggota QC</span>
                        <span className="px-1.5 py-0.5 text-[11px] font-semibold rounded-full bg-muted text-muted-foreground leading-none">
                            {qcMembers.length}
                        </span>
                    </button>
                </div>

                {section === "operators" && (
                    <button
                        type="button"
                        onClick={() => setShowAssignModal(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 shrink-0 min-h-[44px]"
                    >
                        <Plus className="h-4 w-4" />
                        Buat Penugasan
                    </button>
                )}
            </div>

            {section === "operators" ? (
                <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                    {/* Toolbar ringkas: Cari + Filter Status + Buka/Tutup Semua */}
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                        <div className="flex-1">
                            <EquipmentSearchField
                                id="cari-penugasan"
                                label="Cari penugasan"
                                value={assignmentQuery}
                                onChange={(v) => {
                                    setAssignmentQuery(v);
                                    resetAssignGroupPage();
                                }}
                                placeholder="Cari nama petugas, username, NIK, atau nama alat..."
                            />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div
                                role="group"
                                aria-label="Filter status penugasan"
                                className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs"
                            >
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStatusFilter("active");
                                        resetAssignGroupPage();
                                    }}
                                    className={`px-3 py-1.5 rounded font-medium min-h-[36px] transition-colors ${
                                        statusFilter === "active"
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    Aktif
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStatusFilter("all");
                                        resetAssignGroupPage();
                                    }}
                                    className={`px-3 py-1.5 rounded font-medium min-h-[36px] transition-colors ${
                                        statusFilter === "all"
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    Semua + Riwayat
                                </button>
                            </div>
                            {paginatedAssignmentGroups.length > 0 && !isSearching && (
                                <button
                                    type="button"
                                    onClick={toggleExpandAllVisible}
                                    className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-md min-h-[36px] whitespace-nowrap"
                                >
                                    {allVisibleExpanded ? "Tutup semua" : "Buka semua"}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Strip aksi massal (muncul hanya saat ada item terpilih) */}
                    {endSelected.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/20 px-3.5 py-2">
                            <span className="text-xs font-medium text-foreground" aria-live="polite">
                                {endSelected.length} penugasan dipilih
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => endAssignmentsBulk(endSelected)}
                                    disabled={endingBulk}
                                    className="px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md disabled:opacity-50 min-h-[36px]"
                                >
                                    {endingBulk ? "Mengakhiri..." : `Akhiri ${endSelected.length} Terpilih`}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEndSelected([])}
                                    className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground min-h-[36px]"
                                >
                                    Batal pilih
                                </button>
                            </div>
                        </div>
                    )}

                    {endBulkResult && endBulkResult.skipped.length > 0 && (
                        <FeedbackMessage variant="warning">
                            {endBulkResult.ended} diakhiri, {endBulkResult.skipped.length} dilewati (sudah berakhir atau
                            belum dimulai).
                        </FeedbackMessage>
                    )}

                    {assignments.length === 0 ? (
                        <div className="text-center py-10 border border-dashed border-border rounded-lg space-y-2">
                            <p className="text-sm font-medium text-foreground">Belum ada penugasan operator.</p>
                            <p className="text-xs text-muted-foreground">
                                Klik Buat Penugasan untuk menentukan petugas yang dapat mengisi inspeksi alat.
                            </p>
                        </div>
                    ) : assignmentGroupsForPaging.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">
                            Tidak ada penugasan yang cocok dengan filter saat ini.
                        </p>
                    ) : (
                        <div className="space-y-2.5">
                            <p className="text-xs text-muted-foreground">
                                Menampilkan <strong className="text-foreground">{assignmentGroupsForPaging.length}</strong>{" "}
                                petugas. Klik nama petugas untuk melihat atau mengubah daftar alatnya.
                            </p>

                            {paginatedAssignmentGroups.map((g) => {
                                const isExpanded = isSearching || expandedUsers.includes(g.userId);
                                const endedCount = g.items.length - g.activeItems.length;
                                const hasGlobal = g.activeItems.some((a) => !a.unit);
                                const groupActiveIds = g.activeItems.map((a) => a.id);
                                const allGroupSelected =
                                    groupActiveIds.length > 0 &&
                                    groupActiveIds.every((id) => endSelected.includes(id));

                                return (
                                    <section
                                        key={g.userId}
                                        className="rounded-lg border border-border overflow-hidden bg-background/40"
                                    >
                                        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-accent/30 transition-colors">
                                            <button
                                                type="button"
                                                onClick={() => toggleExpandUser(g.userId)}
                                                aria-expanded={isExpanded}
                                                className="flex items-center gap-2.5 min-w-0 flex-1 text-left min-h-[40px]"
                                            >
                                                {isExpanded ? (
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-sm font-semibold text-foreground truncate">
                                                            {g.displayName}
                                                        </span>
                                                        {!g.employeeId && (
                                                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 shrink-0">
                                                                OS
                                                            </span>
                                                        )}
                                                        <span className="text-xs text-muted-foreground">
                                                            {g.employeeId ?? (g.username ? `@${g.username}` : "Outsource")}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                                    {hasGlobal && <EquipmentGlobalBadge />}
                                                    <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                        {g.activeItems.length} aktif
                                                    </span>
                                                    {endedCount > 0 && (
                                                        <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-muted text-muted-foreground">
                                                            {endedCount} riwayat
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                            {g.activeItems.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => endAssignmentsBulk(groupActiveIds)}
                                                    className="shrink-0 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md min-h-[36px]"
                                                >
                                                    Akhiri Semua
                                                </button>
                                            )}
                                        </div>

                                        {isExpanded && (
                                            <div className="border-t border-border bg-card">
                                                {g.activeItems.length >= 2 && (
                                                    <div className="flex items-center justify-between px-3.5 py-1.5 bg-muted/30 border-b border-border/60 text-xs">
                                                        <label className="inline-flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                                                            <input
                                                                type="checkbox"
                                                                checked={allGroupSelected}
                                                                onChange={() => toggleGroupSelection(g)}
                                                                className="rounded border-border"
                                                            />
                                                            Pilih semua {g.activeItems.length} penugasan aktif
                                                        </label>
                                                    </div>
                                                )}
                                                <ul className="divide-y divide-border/70">
                                                    {g.items.map((a) => {
                                                        const active = isAssignmentActive(a);
                                                        return (
                                                            <li
                                                                key={a.id}
                                                                className={`flex items-center justify-between gap-3 px-3.5 py-2 ${
                                                                    !active ? "opacity-60 bg-muted/15" : ""
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                    {active ? (
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={endSelected.includes(a.id)}
                                                                            onChange={(e) =>
                                                                                setEndSelected((prev) =>
                                                                                    e.target.checked
                                                                                        ? [...prev, a.id]
                                                                                        : prev.filter((id) => id !== a.id)
                                                                                )
                                                                            }
                                                                            aria-label={`Pilih ${a.unit ? a.unit.name : "Semua unit"}`}
                                                                            className="rounded border-border shrink-0"
                                                                        />
                                                                    ) : (
                                                                        <span className="w-4 shrink-0" aria-hidden="true" />
                                                                    )}
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className="text-sm font-medium text-foreground truncate">
                                                                                {a.unit ? a.unit.name : "Semua unit"}
                                                                            </span>
                                                                            {a.unit ? (
                                                                                <EquipmentCompanyBadge
                                                                                    company={a.unit.company}
                                                                                    isSharedBoth={a.unit.isSharedBoth}
                                                                                    companies={a.unit.companies}
                                                                                />
                                                                            ) : (
                                                                                <EquipmentGlobalBadge />
                                                                            )}
                                                                        </div>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            {formatPeriod(a.startsOnWibDate, a.endsOnWibDate)}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {active ? (
                                                                    <div className="flex items-center gap-1 shrink-0">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setEditingAssignment(a)}
                                                                            className="px-2.5 py-1.5 text-xs font-medium text-foreground border border-border rounded-md hover:bg-muted min-h-[36px]"
                                                                        >
                                                                            Ubah
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => endAssignment(a)}
                                                                            className="px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md min-h-[36px]"
                                                                        >
                                                                            Akhiri
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                                                        Berakhir
                                                                    </span>
                                                                )}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </div>
                                        )}
                                    </section>
                                );
                            })}

                            <DataTablePagination
                                currentPage={assignGroupPage}
                                totalPages={assignGroupTotalPages}
                                totalItems={assignmentGroupsForPaging.length}
                                pageSize={assignGroupPageSize}
                                onPageChange={setAssignGroupPage}
                                onPageSizeChange={setAssignGroupPageSize}
                                itemLabel="petugas"
                            />
                        </div>
                    )}
                </div>
            ) : (
                /* Sub-tab Anggota QC */
                <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                            <h2 className="text-base font-semibold text-foreground">Anggota QC ({qcCompany})</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Petugas QC memeriksa hasil inspeksi yang dikirim operator. Maksimal 20 orang per perusahaan.
                            </p>
                        </div>
                        <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 text-xs w-fit">
                            {(["WIG", "MKI"] as const).map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setQcCompany(c)}
                                    className={`px-3.5 py-1.5 rounded font-semibold min-h-[36px] transition-colors ${
                                        qcCompany === c
                                            ? "bg-background text-primary shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tambah Anggota QC di atas agar langsung terjangkau */}
                    <div className="rounded-lg border border-border bg-muted/20 p-3 flex flex-col sm:flex-row gap-2 sm:items-end">
                        <div className="flex-1">
                            <EquipmentActorPicker
                                role="qc"
                                label={`Tambah anggota QC ${qcCompany}`}
                                value={newQc}
                                onChange={setNewQc}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={addQcMember}
                            disabled={savingQc || qcMembers.length >= 20}
                            className="shrink-0 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[42px]"
                        >
                            {savingQc ? "Menyimpan..." : "Tambah"}
                        </button>
                    </div>
                    {qcMembers.length >= 20 && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                            Batas 20 anggota QC {qcCompany} tercapai. Hapus salah satu untuk menambah.
                        </p>
                    )}

                    {qcError && (
                        <FeedbackMessage variant="error">
                            {qcError}{" "}
                            <button
                                type="button"
                                onClick={() => void fetchQcMembers(qcCompany)}
                                className="underline ml-1 font-medium"
                            >
                                Coba lagi
                            </button>
                        </FeedbackMessage>
                    )}

                    {qcMembers.length > 0 && (
                        <EquipmentSearchField
                            id="cari-qc"
                            label="Cari anggota QC"
                            value={qcQuery}
                            onChange={setQcQuery}
                            placeholder="Cari nama, username, atau NIK..."
                        />
                    )}

                    <div className="border border-border rounded-lg overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Petugas</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredQcMembers.map((member) => (
                                    <TableRow key={member.employeeId}>
                                        <TableCell>
                                            <p className="font-medium text-foreground inline-flex items-center gap-1.5">
                                                <span>{member.name}</span>
                                                {member.isOutsource && (
                                                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                                        OS
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {member.isOutsource
                                                    ? member.username
                                                        ? `@${member.username}`
                                                        : "Akun outsource"
                                                    : member.employeeId}
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                    member.isActive
                                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                        : "bg-muted text-muted-foreground"
                                                }`}
                                            >
                                                {member.isActive ? "Aktif" : "Nonaktif"}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <button
                                                type="button"
                                                onClick={() => removeQcMember(member)}
                                                disabled={savingQc}
                                                className="px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-md disabled:opacity-50 min-h-[36px]"
                                            >
                                                Hapus
                                            </button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {qcMembers.length === 0 && !qcError && (
                            <p className="text-center text-muted-foreground py-8 text-sm">
                                Belum ada anggota QC untuk {qcCompany}.
                            </p>
                        )}
                        {qcMembers.length > 0 && filteredQcMembers.length === 0 && !qcError && (
                            <p className="text-center text-muted-foreground py-8 text-sm">
                                Tidak ada anggota QC yang cocok dengan pencarian.
                            </p>
                        )}
                    </div>
                </div>
            )}

            <CreateAssignmentModal
                open={showAssignModal}
                units={units}
                assignments={assignments}
                fetchAssignments={fetchAssignments}
                fetchUnits={fetchUnits}
                onClose={() => setShowAssignModal(false)}
                onEndAssignment={(a) => endAssignment(a)}
            />

            <EditAssignmentModal
                assignment={editingAssignment}
                units={units}
                fetchAssignments={fetchAssignments}
                fetchUnits={fetchUnits}
                onClose={() => setEditingAssignment(null)}
            />
        </div>
    );
}
