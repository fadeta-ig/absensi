"use client";

import { useState } from "react";
import { Edit3, Loader2, Trash2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { addCalendarDays, isValidCalendarDate, toWIBDateString } from "@/lib/timezone";
import type { EmployeeLite, RosterTimelineAssignment } from "./rosterUi";
import { formatAssignmentInterval, formatWIBShort, toInclusiveEndDate } from "./rosterUi";

interface ManageRosterModalProps {
    employee: EmployeeLite;
    assignments: RosterTimelineAssignment[];
    today: string;
    shiftNameOf: (shiftId?: string | null) => string;
    onClose: () => void;
    onChanged: () => void;
}

export default function ManageRosterModal({
    employee,
    assignments,
    today,
    shiftNameOf,
    onClose,
    onChanged,
}: ManageRosterModalProps) {
    const toast = useToast();
    const confirm = useConfirm();

    const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
    const [editUiEndDate, setEditUiEndDate] = useState("");
    const [editOpenEnded, setEditOpenEnded] = useState(false);
    const [updatingEndId, setUpdatingEndId] = useState("");
    const [cancellingKey, setCancellingKey] = useState("");
    const [actionError, setActionError] = useState("");

    const refToday = today || toWIBDateString();
    const busy = Boolean(updatingEndId) || Boolean(cancellingKey);

    const handleCancelAssignment = (asg: RosterTimelineAssignment) => {
        const assignmentKey = `${asg.employeeId}:${asg.effectiveFrom}`;
        const isToday = asg.effectiveFrom === refToday;
        const labelKind = isToday ? "jadwal hari ini" : "jadwal masa depan";

        confirm({
            title: "Batalkan Jadwal Roster",
            message: `Batalkan ${labelKind} ${employee.name} yang berlaku mulai ${formatWIBShort(asg.effectiveFrom)}? Jadwal sebelumnya (bila ada) akan otomatis disambungkan kembali.`,
            confirmLabel: "Ya, Batalkan Jadwal",
            variant: "danger",
            onConfirm: async () => {
                setCancellingKey(assignmentKey);
                setActionError("");
                try {
                    const res = await fetch("/api/shifts/assignments", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ employeeId: asg.employeeId, effectiveFrom: asg.effectiveFrom }),
                    });
                    if (!res.ok) {
                        throw new Error(await getResponseErrorMessage(res, "Gagal membatalkan jadwal masa depan."));
                    }
                    const msg = `Jadwal masa depan ${employee.name} dibatalkan.`;
                    toast(msg, "success");
                    onChanged();
                } catch (error) {
                    reportClientError("ManageRosterModal", "Gagal membatalkan roster", error);
                    const message = error instanceof Error ? error.message : "Gagal membatalkan jadwal masa depan.";
                    setActionError(message);
                    toast(message, "error");
                } finally {
                    setCancellingKey((current) => (current === assignmentKey ? "" : current));
                }
            },
        });
    };

    const handleUpdateEnd = async (asg: RosterTimelineAssignment) => {
        const exclusiveNewEnd = editOpenEnded ? null : editUiEndDate ? addCalendarDays(editUiEndDate, 1) : null;
        if (!editOpenEnded && !isValidCalendarDate(editUiEndDate)) {
            toast("Pilih tanggal hari terakhir yang valid atau centang Tanpa Batas Akhir.", "error");
            return;
        }
        setUpdatingEndId(asg.id);
        setActionError("");
        try {
            const res = await fetch("/api/shifts/assignments", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeId: asg.employeeId,
                    effectiveFrom: asg.effectiveFrom,
                    effectiveTo: exclusiveNewEnd,
                }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memperbarui tanggal akhir jadwal."));
            }
            const endLabel = editOpenEnded ? "tanpa batas akhir" : `s.d. ${formatWIBShort(editUiEndDate)} (inklusif)`;
            toast(`Tanggal akhir jadwal ${employee.name} diperbarui (${endLabel}).`, "success");
            setEditingAssignmentId(null);
            onChanged();
        } catch (error) {
            reportClientError("ManageRosterModal", "Gagal mengubah akhir roster", error);
            const message = error instanceof Error ? error.message : "Gagal memperbarui tanggal akhir jadwal.";
            setActionError(message);
            toast(message, "error");
        } finally {
            setUpdatingEndId("");
        }
    };

    return (
        <AccessibleModal onClose={onClose} ariaLabel={`Kelola Jadwal Roster ${employee.name}`} className="max-w-xl w-full">
            <div className="modal-header">
                <div>
                    <h3 className="modal-title text-base font-bold text-[var(--text-primary)]">
                        {employee.name}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        <span className="font-mono">{employee.employeeId}</span>
                        {" • "}Jadwal roster bertanggal
                    </p>
                </div>
                <button type="button" onClick={onClose} disabled={busy} className="modal-close" aria-label="Tutup dialog">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                {actionError && <FeedbackMessage variant="error">{actionError}</FeedbackMessage>}

                {assignments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--text-muted)]">
                        Belum memiliki jadwal roster bertanggal dan selalu mengikuti shift dasar.
                    </div>
                ) : (
                    assignments.map((asg) => {
                        const isFutureOrToday = asg.effectiveFrom >= refToday;
                        const isEndedInPast = Boolean(asg.effectiveTo && asg.effectiveTo < refToday);
                        const isEditing = editingAssignmentId === asg.id;
                        const incEnd = toInclusiveEndDate(asg.effectiveTo);
                        const cancelKey = `${asg.employeeId}:${asg.effectiveFrom}`;

                        return (
                            <div key={asg.id} className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/30 p-3 space-y-2.5">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-xs font-bold text-[var(--text-primary)]">
                                                {shiftNameOf(asg.shiftId)}
                                            </span>
                                            {isEndedInPast ? (
                                                <span className="badge bg-[var(--secondary)] text-[var(--text-muted)] text-[10px]">
                                                    Selesai
                                                </span>
                                            ) : asg.effectiveFrom <= refToday ? (
                                                <span className="badge badge-success text-[10px]">Berjalan</span>
                                            ) : (
                                                <span className="badge badge-info text-[10px]">Terjadwal</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                            {formatAssignmentInterval(asg.effectiveFrom, asg.effectiveTo)}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {!isEndedInPast && (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => {
                                                    if (isEditing) {
                                                        setEditingAssignmentId(null);
                                                    } else {
                                                        setEditingAssignmentId(asg.id);
                                                        setEditOpenEnded(asg.effectiveTo === null);
                                                        setEditUiEndDate(incEnd ?? refToday);
                                                    }
                                                }}
                                                className="btn btn-secondary btn-sm !px-2.5 !py-1 text-xs"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                                Ubah Akhir
                                            </button>
                                        )}
                                        {isFutureOrToday && (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                aria-label={`Batalkan jadwal masa depan ${employee.name} mulai ${asg.effectiveFrom}`}
                                                onClick={() => handleCancelAssignment(asg)}
                                                className="btn btn-danger btn-sm !px-2.5 !py-1 text-xs"
                                            >
                                                {cancellingKey === cancelKey ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        Batalkan
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {isEditing && (
                                    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 space-y-2.5">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
                                            <div>
                                                <label htmlFor={`edit-end-${asg.id}`} className="form-label text-[11px]">
                                                    Hari terakhir baru (inklusif)
                                                </label>
                                                <input
                                                    id={`edit-end-${asg.id}`}
                                                    type="date"
                                                    min={asg.effectiveFrom > refToday ? asg.effectiveFrom : refToday}
                                                    value={editUiEndDate}
                                                    disabled={editOpenEnded || updatingEndId === asg.id}
                                                    onChange={(e) => setEditUiEndDate(e.target.value)}
                                                    className="form-input text-xs"
                                                />
                                            </div>
                                            <label className="flex items-center gap-2 text-xs cursor-pointer pb-2">
                                                <input
                                                    type="checkbox"
                                                    checked={editOpenEnded}
                                                    disabled={updatingEndId === asg.id}
                                                    onChange={(e) => setEditOpenEnded(e.target.checked)}
                                                />
                                                <span>Tanpa batas akhir (seterusnya)</span>
                                            </label>
                                        </div>
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setEditingAssignmentId(null)}
                                                className="btn btn-ghost btn-sm text-xs"
                                            >
                                                Batal
                                            </button>
                                            <button
                                                type="button"
                                                disabled={updatingEndId === asg.id}
                                                onClick={() => void handleUpdateEnd(asg)}
                                                className="btn btn-primary btn-sm text-xs"
                                            >
                                                {updatingEndId === asg.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    "Simpan Tanggal Akhir"
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </AccessibleModal>
    );
}
