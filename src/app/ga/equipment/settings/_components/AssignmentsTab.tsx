"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import { getResponseErrorMessage } from "@/lib/clientErrors";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import DataTablePagination from "@/components/ui/DataTablePagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import { EquipmentSearchField } from "@/components/ui/EquipmentSearchField";
import { EquipmentCompanyBadge, EquipmentGlobalBadge } from "@/components/equipment/EquipmentStatusBadge";
import { isAssignmentActive } from "@/app/ga/equipment/settings/_components/useSettingsData";
import type {
    EquipmentAssignment,
    EquipmentUnit,
} from "@/app/ga/equipment/settings/_components/useSettingsData";
import { CreateAssignmentModal, EditAssignmentModal } from "@/app/ga/equipment/settings/_components/AssignModals";

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
}

export default function AssignmentsTab({ assignments, units, fetchAssignments, fetchUnits }: AssignmentsTabProps) {
    const toast = useToast();
    const confirm = useConfirm();

    // ─── Daftar penugasan (filter + akhiri massal) ───
    const [assignmentQuery, setAssignmentQuery] = useState("");
    const [endSelected, setEndSelected] = useState<string[]>([]);
    const [endingBulk, setEndingBulk] = useState(false);
    const [endBulkResult, setEndBulkResult] = useState<{ ended: number; skipped: Array<{ assignmentId: string; reason: string }> } | null>(null);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [editingAssignment, setEditingAssignment] = useState<EquipmentAssignment | null>(null);

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
                        Kelola siapa yang melihat modul Inspeksi Alat.
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
                                            <p className="text-sm font-semibold truncate">{g.displayName}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {g.employeeId ?? ""} · {g.activeItems.length} aktif ·{" "}
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
