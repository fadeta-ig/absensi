"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import DataTablePagination from "@/components/ui/DataTablePagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { type EmployeePick } from "@/components/ui/EmployeeSearchPicker";
import EquipmentActorPicker from "@/components/equipment/settings/EquipmentActorPicker";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EquipmentCompanyBadge, EquipmentGlobalBadge } from "@/components/equipment/EquipmentStatusBadge";
import { isAssignmentActive } from "@/components/equipment/settings/useSettingsData";
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

    // ─── Daftar penugasan (filter + akhiri massal) ───
    const [assignmentQuery, setAssignmentQuery] = useState("");
    const [endSelected, setEndSelected] = useState<string[]>([]);
    const [endingBulk, setEndingBulk] = useState(false);
    const [endBulkResult, setEndBulkResult] = useState<{ ended: number; skipped: Array<{ assignmentId: string; reason: string }> } | null>(null);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [editingAssignment, setEditingAssignment] = useState<EquipmentAssignment | null>(null);

    // ─── Anggota QC (per perusahaan, maks 20) ───
    const [newQc, setNewQc] = useState<EmployeePick | null>(null);
    const [savingQc, setSavingQc] = useState(false);
    const [qcQuery, setQcQuery] = useState("");

    useEffect(() => {
        void fetchQcMembers(qcCompany);
    }, [fetchQcMembers, qcCompany]);

    const filteredQcMembers = useMemo(() => {
        const q = qcQuery.trim().toLowerCase();
        if (!q) return qcMembers;
        return qcMembers.filter((m) => `${m.name} ${m.employeeId}`.toLowerCase().includes(q));
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
                toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
                reportClientError("EquipmentSettings", "Qc members save failed", err);
            } finally {
                setSavingQc(false);
            }
        },
        [toast, fetchQcMembers, qcCompany]
    );

    const addQcMember = useCallback(() => {
        if (!newQc) {
            toast("Cari dan pilih karyawan terlebih dahulu.", "warning");
            return;
        }
        const id = newQc.employeeId;
        if (qcMembers.some((v) => v.employeeId.toLowerCase() === id.toLowerCase())) {
            toast("Karyawan tersebut sudah terdaftar sebagai anggota QC.", "warning");
            return;
        }
        if (qcMembers.length >= 20) {
            toast(`Anggota QC ${qcCompany} maksimal 20 orang.`, "warning");
            return;
        }
        setNewQc(null);
        void persistQcMembers([...qcMembers.map((v) => v.employeeId), id], `Anggota QC ${qcCompany} ditambahkan.`);
    }, [newQc, qcMembers, qcCompany, toast, persistQcMembers]);

    const removeQcMember = useCallback(
        (member: QcMember) => {
            confirm({
                title: `Hapus "${member.name}" dari QC ${qcCompany}?`,
                message: `Karyawan tersebut tidak lagi melihat antrean pemeriksaan QC ${qcCompany}.`,
                confirmLabel: "Ya, hapus",
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

    const assignmentGroupsForPaging = useMemo(() => {
        const q = assignmentQuery.trim().toLowerCase();
        const rows = assignments.filter((a) => {
            if (!q) return true;
            const hay = `${a.user.displayName ?? ""} ${a.user.employeeId ?? ""} ${a.unit ? a.unit.name : "semua unit"}`.toLowerCase();
            return hay.includes(q);
        });
        const map = new Map<string, { userId: string; employeeId: string | null; displayName: string; items: EquipmentAssignment[]; activeItems: EquipmentAssignment[] }>();
        for (const a of rows) {
            const g =
                map.get(a.user.id) ??
                { userId: a.user.id, employeeId: a.user.employeeId, displayName: a.user.displayName ?? a.user.employeeId ?? "—", items: [], activeItems: [] };
            g.items.push(a);
            if (isAssignmentActive(a)) g.activeItems.push(a);
            map.set(a.user.id, g);
        }
        return [...map.values()]
            .map((g) => ({ ...g, items: [...g.items].sort((x, y) => Number(isAssignmentActive(y)) - Number(isAssignmentActive(x))) }))
            .sort((x, y) => y.activeItems.length - x.activeItems.length || x.displayName.localeCompare(y.displayName));
    }, [assignments, assignmentQuery]);

    const {
        currentPage: assignGroupPage,
        pageSize: assignGroupPageSize,
        setPage: setAssignGroupPage,
        setPageSize: setAssignGroupPageSize,
        resetPage: resetAssignGroupPage,
        getSliceIndices: getAssignGroupSlice,
    } = useTablePagination({ storageKey: "ga-equipment-assignments", defaultPageSize: 5, totalItems: assignmentGroupsForPaging.length });

    const endAssignment = useCallback(
        (assignment: EquipmentAssignment) => {
            const who = assignment.user.displayName ?? assignment.user.employeeId ?? "karyawan";
            const scope = assignment.unit ? assignment.unit.name : "Semua unit";
            confirm({
                title: `Akhiri penugasan ${who}?`,
                message: `Penugasan ${scope} mulai ${assignment.startsOnWibDate} akan diakhiri hari ini.`,
                confirmLabel: "Ya, akhiri",
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
                            toast(err instanceof Error ? err.message : "Gagal.", "error");
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
                .map((a) => `• ${a.user.displayName ?? a.user.employeeId} — ${a.unit ? a.unit.name : "Semua unit"}`)
                .join("\n");
            confirm({
                title: `Akhiri ${targets.length} penugasan?`,
                message: `Penugasan berikut akan diakhiri hari ini:\n${preview}${targets.length > 5 ? `\n…dan ${targets.length - 5} lainnya.` : ""}`,
                confirmLabel: "Ya, akhiri semua",
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
                                toast("Semua di-skip (tidak ada yang diakhiri).", "warning");
                            } else {
                                if (!res.ok) throw new Error(json.error ?? "Gagal mengakhiri penugasan.");
                                const data = json.data as { ended: string[]; skipped: Array<{ assignmentId: string; reason: string }> };
                                setEndBulkResult({ ended: data.ended.length, skipped: data.skipped });
                                setEndSelected((prev) => prev.filter((id) => !data.ended.includes(id)));
                                toast(
                                    data.skipped.length === 0
                                        ? `${data.ended.length} penugasan diakhiri.`
                                        : `${data.ended.length} diakhiri, ${data.skipped.length} di-skip.`,
                                    data.skipped.length === 0 ? "success" : "warning"
                                );
                            }
                            await Promise.all([fetchAssignments(), fetchUnits()]);
                        } catch (err) {
                            toast(err instanceof Error ? err.message : "Gagal.", "error");
                        } finally {
                            setEndingBulk(false);
                        }
                    })();
                },
            });
        },
        [assignments, confirm, endingBulk, toast, fetchAssignments, fetchUnits]
    );

    const assignmentGroups: AssignmentGroup[] = assignmentGroupsForPaging;
    const visibleActiveIds = assignmentGroups.flatMap((g) => g.activeItems.map((a) => a.id));
    const endSelectedVisibleCount = endSelected.filter((id) => visibleActiveIds.includes(id)).length;
    const [assignGroupSliceStart, assignGroupSliceEnd] = getAssignGroupSlice(assignmentGroupsForPaging.length);
    const paginatedAssignmentGroups = assignmentGroupsForPaging.slice(assignGroupSliceStart, assignGroupSliceEnd);
    const assignGroupTotalPages = Math.max(1, Math.ceil(assignmentGroupsForPaging.length / assignGroupPageSize));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h2 className="text-lg font-medium">Penugasan</h2>
                    <p className="text-xs text-muted-foreground">
                        Kelola penugasan operator inspeksi alat dan daftar anggota QC.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAssignModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 shrink-0"
                >
                    <Plus className="h-4 w-4" /> Buat penugasan
                </button>
            </div>
            <CreateAssignmentModal
                open={showAssignModal}
                units={units}
                assignments={assignments}
                fetchAssignments={fetchAssignments}
                fetchUnits={fetchUnits}
                onClose={() => setShowAssignModal(false)}
                onEndAssignment={(a) => endAssignment(a)}
            />
            <div className="bg-card border border-border rounded-lg p-4">
                <h2 className="text-base font-medium mb-1">Daftar Penugasan</h2>
                <p className="text-xs text-muted-foreground mb-3">
                    {assignments.length === 0
                        ? "Belum ada penugasan."
                        : "Dikelompokkan per karyawan. Penugasan aktif bisa diedit/diakhiri satuan atau massal; yang sudah berakhir tercatat sebagai riwayat."}
                </p>
                {assignments.length > 0 && (
                    <div className="mb-3">
                        <EquipmentSearchField
                            id="cari-penugasan"
                            label="Cari penugasan"
                            value={assignmentQuery}
                            onChange={(v) => {
                                setAssignmentQuery(v);
                                resetAssignGroupPage();
                            }}
                            placeholder="Cari karyawan atau alat…"
                        />
                    </div>
                )}
                {endSelected.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mb-3 rounded-lg border border-border bg-accent/30 px-3 py-2">
                        <span className="text-xs font-medium" aria-live="polite">
                            {endSelected.length} dipilih
                        </span>
                        <button
                            type="button"
                            onClick={() => endAssignmentsBulk(endSelected)}
                            disabled={endingBulk}
                            className="px-3 py-1.5 text-xs font-medium text-rose-600 border border-border rounded-md bg-card hover:bg-rose-50 disabled:opacity-50 min-h-[44px] dark:hover:bg-rose-950/30"
                        >
                            {endingBulk ? "Mengakhiri..." : `Akhiri ${endSelected.length} terpilih`}
                        </button>
                        <button
                            type="button"
                            onClick={() => setEndSelected([])}
                            className="text-xs text-muted-foreground hover:text-foreground min-h-[44px] px-2"
                        >
                            Batalkan
                        </button>
                    </div>
                )}
                {endBulkResult && endBulkResult.skipped.length > 0 && (
                    <FeedbackMessage variant="warning" className="mb-3">
                        {endBulkResult.ended} diakhiri, {endBulkResult.skipped.length} di-skip
                        (sudah berakhir / belum mulai).
                    </FeedbackMessage>
                )}
                {assignments.length > 0 &&
                    (assignmentGroupsForPaging.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Tidak ada penugasan yang cocok dengan pencarian.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const allVisible = visibleActiveIds.length > 0 && visibleActiveIds.every((id) => endSelected.includes(id));
                                        setEndSelected((prev) =>
                                            allVisible
                                                ? prev.filter((id) => !visibleActiveIds.includes(id))
                                                : [...new Set([...prev, ...visibleActiveIds])]
                                        );
                                    }}
                                    className="text-xs font-medium text-primary hover:underline min-h-[44px] px-2"
                                >
                                    {visibleActiveIds.length > 0 && visibleActiveIds.every((id) => endSelected.includes(id))
                                        ? "Batalkan hasil"
                                        : `Pilih hasil (${visibleActiveIds.length})`}
                                </button>
                                <span className="text-xs text-muted-foreground" aria-live="polite">
                                    {endSelectedVisibleCount} dari {visibleActiveIds.length} hasil dipilih
                                </span>
                            </div>
                            {paginatedAssignmentGroups.map((g) => (
                                <section key={g.userId} className="rounded-lg border border-border overflow-hidden">
                                    <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-accent/20">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold truncate inline-flex items-center gap-1.5">
                                                <span className="truncate">{g.displayName}</span>
                                                {!g.employeeId && (
                                                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 shrink-0">
                                                        OS
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {g.employeeId ?? (g.items[0]?.user.username ? `@${g.items[0].user.username}` : "Outsource")} · {g.activeItems.length} aktif ·{" "}
                                                {g.items.length - g.activeItems.length} berakhir{" "}
                                                {g.activeItems.some((a) => !a.unit) && <EquipmentGlobalBadge />}
                                            </p>
                                        </div>
                                        {g.activeItems.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => endAssignmentsBulk(g.activeItems.map((a) => a.id))}
                                                className="shrink-0 px-3 min-h-[44px] inline-flex items-center text-xs font-medium text-rose-600 hover:underline"
                                            >
                                                Akhiri semua ({g.activeItems.length})
                                            </button>
                                        )}
                                    </header>
                                    <ul className="divide-y divide-border">
                                        {g.items.map((a) => (
                            <li
                                key={a.id}
                                className="flex items-center justify-between gap-2 px-3 py-2"
                            >
                                <span className="flex items-center gap-2 min-w-0">
                                    {isAssignmentActive(a) && (
                                        <input
                                            type="checkbox"
                                            checked={endSelected.includes(a.id)}
                                            onChange={(e) =>
                                                setEndSelected((prev) =>
                                                    e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)
                                                )
                                            }
                                            aria-label={`Pilih ${a.unit ? a.unit.name : "Semua unit"}`}
                                            className="rounded border-border shrink-0"
                                        />
                                    )}
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold truncate">
                                            {a.unit ? a.unit.name : "Semua unit"}{" "}
                                            {a.unit ? (
                                                <EquipmentCompanyBadge
                                                    company={a.unit.company}
                                                    isSharedBoth={a.unit.isSharedBoth}
                                                    companies={a.unit.companies}
                                                />
                                            ) : (
                                                <EquipmentGlobalBadge />
                                            )}
                                        </span>
                                        <span className="block text-xs text-muted-foreground truncate">
                                            {a.startsOnWibDate}
                                            {a.endsOnWibDate ? ` → ${a.endsOnWibDate}` : " → berjalan"}
                                        </span>
                                    </span>
                                </span>
                                {isAssignmentActive(a) ? (
                                    <span className="flex gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setEditingAssignment(a)}
                                            className="px-3 min-h-[44px] inline-flex items-center text-xs font-medium text-primary border border-border rounded-md hover:bg-accent/50"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => endAssignment(a)}
                                            className="px-3 min-h-[44px] inline-flex items-center text-xs font-medium text-rose-600 border border-border rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                        >
                                            Akhiri
                                        </button>
                                    </span>
                                ) : (
                                    <span className="shrink-0 text-xs text-muted-foreground">Berakhir</span>
                                )}
                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ))}
                            <DataTablePagination
                                currentPage={assignGroupPage}
                                totalPages={assignGroupTotalPages}
                                totalItems={assignmentGroupsForPaging.length}
                                pageSize={assignGroupPageSize}
                                onPageChange={setAssignGroupPage}
                                onPageSizeChange={setAssignGroupPageSize}
                                itemLabel="grup"
                            />
                        </div>
                    ))}
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
                <h2 className="text-base font-medium mb-1">Anggota QC</h2>
                <p className="text-xs text-muted-foreground mb-2">
                    Karyawan QC yang memeriksa hasil inspeksi produksi per perusahaan. Semua anggota
                    melihat semua yang disubmit perusahaannya, terbaru di atas. Maksimal 20 orang
                    per perusahaan.
                </p>
                <div className="flex gap-1 mb-3 border-b border-border">
                    {(["WIG", "MKI"] as const).map((c) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setQcCompany(c)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
                                qcCompany === c
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
                {qcError && (
                    <FeedbackMessage variant="error" className="mb-3">
                        {qcError}{" "}
                        <button onClick={() => void fetchQcMembers(qcCompany)} className="underline">
                            Coba lagi
                        </button>
                    </FeedbackMessage>
                )}
                <div className="mb-3">
                    <EquipmentSearchField
                        id="cari-qc"
                        label="Cari anggota QC"
                        value={qcQuery}
                        onChange={setQcQuery}
                        placeholder="Cari nama atau NIK…"
                    />
                </div>
                <div className="bg-card border border-border rounded-lg overflow-hidden mb-3">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Karyawan</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Aksi</TableHead>
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
                                            {member.isOutsource ? `@${member.username ?? member.employeeId}` : member.employeeId}
                                        </p>
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            className={`text-xs px-1.5 py-0.5 rounded ${member.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}
                                        >
                                            {member.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <button
                                            onClick={() => removeQcMember(member)}
                                            disabled={savingQc}
                                            className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
                                        >
                                            Hapus
                                        </button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {qcMembers.length === 0 && !qcError && (
                        <p className="text-center text-muted-foreground py-6 text-sm">
                            Belum ada anggota QC.
                        </p>
                    )}
                    {qcMembers.length > 0 && filteredQcMembers.length === 0 && !qcError && (
                        <p className="text-center text-muted-foreground py-6 text-sm">
                            Tidak ada anggota QC yang cocok dengan pencarian.
                        </p>
                    )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1">
                        <EquipmentActorPicker
                            role="qc"
                            label="Cari petugas QC (Karyawan / OS)"
                            value={newQc}
                            onChange={setNewQc}
                        />
                    </div>
                    <button
                        onClick={addQcMember}
                        disabled={savingQc || qcMembers.length >= 20}
                        className="shrink-0 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 self-end min-h-10"
                    >
                        {savingQc ? "Menyimpan..." : "Tambah"}
                    </button>
                </div>
                {qcMembers.length >= 20 && (
                    <p className="text-xs text-muted-foreground mt-2">
                        Batas 20 anggota QC {qcCompany} tercapai. Hapus salah satu untuk menambah.
                    </p>
                )}
            </div>

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
