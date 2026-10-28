"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Info, Loader2, Scissors, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { addCalendarDays, isValidCalendarDate, toUTCDateKey } from "@/lib/timezone";
import type { DryRunOutcome, EmployeeLite, ShiftLite } from "./rosterUi";
import { formatAssignmentInterval, formatWIBShort, sourceBadgeLabel } from "./rosterUi";

const SHORT_DAY_LABELS: Array<{ dayOfWeek: number; label: string }> = [
    { dayOfWeek: 1, label: "Sen" },
    { dayOfWeek: 2, label: "Sel" },
    { dayOfWeek: 3, label: "Rab" },
    { dayOfWeek: 4, label: "Kam" },
    { dayOfWeek: 5, label: "Jum" },
    { dayOfWeek: 6, label: "Sab" },
    { dayOfWeek: 0, label: "Min" },
];

interface AssignRosterModalProps {
    employees: EmployeeLite[];
    shifts: ShiftLite[];
    defaultStartDate: string;
    shiftNameOf: (shiftId?: string | null) => string;
    onClose: () => void;
    onApplied: () => void;
}

export default function AssignRosterModal({
    employees,
    shifts,
    defaultStartDate,
    shiftNameOf,
    onClose,
    onApplied,
}: AssignRosterModalProps) {
    const toast = useToast();
    const confirm = useConfirm();

    const [targetShiftId, setTargetShiftId] = useState(() => shifts[0]?.id ?? "");
    const [effectiveFrom, setEffectiveFrom] = useState(defaultStartDate);
    const [uiEffectiveTo, setUiEffectiveTo] = useState(""); // inclusive
    const [replaceFuture, setReplaceFuture] = useState(false);

    const [dryRunPlan, setDryRunPlan] = useState<DryRunOutcome | null>(null);
    const [loadingDryRun, setLoadingDryRun] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");

    const dateRangeInvalid = Boolean(uiEffectiveTo && effectiveFrom && uiEffectiveTo < effectiveFrom);

    const durationDays = useMemo(() => {
        if (!effectiveFrom || !uiEffectiveTo || !isValidCalendarDate(effectiveFrom) || !isValidCalendarDate(uiEffectiveTo)) {
            return null;
        }
        if (uiEffectiveTo < effectiveFrom) return null;
        const startMs = toUTCDateKey(effectiveFrom).getTime();
        const endMs = toUTCDateKey(uiEffectiveTo).getTime();
        return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
    }, [effectiveFrom, uiEffectiveTo]);

    const applyPeriodPreset = (days: number | null) => {
        const start = isValidCalendarDate(effectiveFrom) ? effectiveFrom : defaultStartDate;
        if (!isValidCalendarDate(effectiveFrom) && isValidCalendarDate(start)) {
            setEffectiveFrom(start);
        }
        setUiEffectiveTo(days === null ? "" : addCalendarDays(start, days - 1));
    };

    const targetShift = useMemo(
        () => shifts.find((s) => s.id === targetShiftId) ?? null,
        [shifts, targetShiftId],
    );

    // Server-side dry-run preview, recalculated on every input change.
    useEffect(() => {
        if (
            employees.length === 0 ||
            !targetShiftId ||
            !isValidCalendarDate(effectiveFrom) ||
            dateRangeInvalid ||
            (uiEffectiveTo && !isValidCalendarDate(uiEffectiveTo))
        ) {
            setDryRunPlan(null);
            setLoadingDryRun(false);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setLoadingDryRun(true);
            try {
                const exclusiveEffectiveTo = uiEffectiveTo ? addCalendarDays(uiEffectiveTo, 1) : null;
                const assignments = employees.map((emp) => ({
                    employeeId: emp.employeeId,
                    shiftId: targetShiftId,
                    effectiveFrom,
                    effectiveTo: exclusiveEffectiveTo,
                }));
                const res = await fetch("/api/shifts/assignments", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ assignments, replaceFuture, dryRun: true }),
                    signal: controller.signal,
                });
                if (!res.ok) {
                    setDryRunPlan(null);
                    return;
                }
                const data = (await res.json()) as DryRunOutcome;
                if (data && Array.isArray(data.plan)) {
                    setDryRunPlan(data);
                }
            } catch {
                // Ignore abort / network errors on preview
            } finally {
                if (!controller.signal.aborted) setLoadingDryRun(false);
            }
        }, 180);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [employees, targetShiftId, effectiveFrom, uiEffectiveTo, replaceFuture, dateRangeInvalid]);

    const dryRunSummary = useMemo(() => {
        if (!dryRunPlan) return null;
        let cleanCount = 0;
        let truncateCount = 0;
        let splitCount = 0;
        let replaceCount = 0;
        let futureConflictCount = 0;
        let historyConflictCount = 0;

        for (const item of dryRunPlan.plan) {
            if (item.conflicts.length > 0) {
                for (const c of item.conflicts) {
                    if (c.reason === "FUTURE") futureConflictCount++;
                    else historyConflictCount++;
                }
            } else if (item.actions.length === 0) {
                cleanCount++;
            } else {
                if (item.actions.some((a) => a.type === "split")) splitCount++;
                else if (item.actions.some((a) => a.type === "truncate")) truncateCount++;
                if (item.actions.some((a) => a.type === "replace" || a.type === "trimStart")) replaceCount++;
            }
        }
        return {
            cleanCount,
            truncateCount,
            splitCount,
            replaceCount,
            futureConflictCount,
            historyConflictCount,
            totalConflicts: dryRunPlan.conflicts.length,
        };
    }, [dryRunPlan]);

    const executeAssign = async () => {
        setSubmitting(true);
        setSubmitError("");
        const exclusiveEffectiveTo = uiEffectiveTo ? addCalendarDays(uiEffectiveTo, 1) : null;
        try {
            const assignments = employees.map((emp) => ({
                employeeId: emp.employeeId,
                shiftId: targetShiftId,
                effectiveFrom,
                effectiveTo: exclusiveEffectiveTo,
            }));
            const res = await fetch("/api/shifts/assignments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignments, replaceFuture }),
            });
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan jadwal shift."));
            }
            const data = await res.json();
            const targetName = shiftNameOf(targetShiftId);
            const appliedCount = data.applied ?? assignments.length;
            toast(`Roster tersimpan: ${appliedCount} karyawan ke ${targetName}.`, "success");
            onApplied();
        } catch (error) {
            reportClientError("AssignRosterModal", "Gagal menetapkan shift roster", error);
            const message = error instanceof Error ? error.message : "Gagal menyimpan jadwal shift.";
            setSubmitError(message);
            toast(message, "error");
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (employees.length === 0 || !targetShiftId || !effectiveFrom || dateRangeInvalid) return;

        const targetName = shiftNameOf(targetShiftId);
        const periodLabel = uiEffectiveTo
            ? `${formatWIBShort(effectiveFrom)} s.d. ${formatWIBShort(uiEffectiveTo)} (${durationDays ?? 1} hari, inklusif)`
            : `mulai ${formatWIBShort(effectiveFrom)} (berlaku seterusnya)`;

        const warningNotes: string[] = [];
        if (dryRunSummary) {
            if (dryRunSummary.splitCount > 0) {
                warningNotes.push(`${dryRunSummary.splitCount} jadwal berjalan akan dibelah dan otomatis dilanjutkan setelah periode ini selesai.`);
            }
            if (dryRunSummary.truncateCount > 0) {
                warningNotes.push(`${dryRunSummary.truncateCount} jadwal berjalan sebelumnya akan dipotong sebelum ${formatWIBShort(effectiveFrom)}.`);
            }
            if (dryRunSummary.replaceCount > 0) {
                warningNotes.push(`${dryRunSummary.replaceCount} jadwal masa depan akan ditimpa/dipangkas.`);
            }
        }

        confirm({
            title: "Konfirmasi Penetapan Roster Shift",
            message: [
                `Tetapkan "${targetName}" untuk ${employees.length} karyawan terpilih (${periodLabel})?`,
                ...warningNotes,
            ].join(" "),
            confirmLabel: `Ya, Tetapkan (${employees.length} Karyawan)`,
            variant: warningNotes.length > 0 ? "warning" : "info",
            onConfirm: executeAssign,
        });
    };

    const busy = submitting;

    return (
        <AccessibleModal onClose={onClose} ariaLabel="Tetapkan Roster Shift" className="max-w-xl w-full">
            <div className="modal-header">
                <div>
                    <h3 className="modal-title text-base font-bold text-[var(--text-primary)]">
                        Tetapkan Roster Shift
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {employees.length} karyawan terpilih • Pratinjau dampak dihitung otomatis oleh server
                    </p>
                </div>
                <button type="button" onClick={onClose} disabled={busy} className="modal-close" aria-label="Tutup dialog">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                    {submitError && <FeedbackMessage variant="error">{submitError}</FeedbackMessage>}

                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                        {employees.map((emp) => (
                            <span
                                key={emp.employeeId}
                                className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--secondary)] border border-[var(--border)] text-[11px] font-medium text-[var(--text-primary)]"
                            >
                                {emp.name} <span className="ml-1 font-mono text-[var(--text-muted)]">{emp.employeeId}</span>
                            </span>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="form-group !mb-0">
                            <label className="form-label text-xs" htmlFor="roster-date">
                                Berlaku Mulai Tanggal
                            </label>
                            <input
                                id="roster-date"
                                type="date"
                                className="form-input text-xs"
                                value={effectiveFrom}
                                disabled={busy}
                                onChange={(e) => setEffectiveFrom(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group !mb-0">
                            <label className="form-label text-xs" htmlFor="roster-date-to">
                                Hari terakhir (ikut termasuk, opsional)
                            </label>
                            <input
                                id="roster-date-to"
                                type="date"
                                className="form-input text-xs"
                                min={effectiveFrom || undefined}
                                value={uiEffectiveTo}
                                disabled={busy}
                                onChange={(e) => setUiEffectiveTo(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-[var(--text-muted)] mr-0.5">Preset:</span>
                        {( [
                            { label: "1 Hari", days: 1 },
                            { label: "6 Hari", days: 6 },
                            { label: "7 Hari", days: 7 },
                            { label: "14 Hari", days: 14 },
                        ] as const).map((preset) => (
                            <button
                                key={preset.label}
                                type="button"
                                disabled={busy}
                                onClick={() => applyPeriodPreset(preset.days)}
                                className="px-2 py-0.5 rounded-md border border-[var(--border)] bg-[var(--secondary)]/50 hover:bg-[var(--secondary)] text-[11px] font-medium"
                            >
                                {preset.label}
                            </button>
                        ))}
                        {uiEffectiveTo && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => applyPeriodPreset(null)}
                                className="px-2 py-0.5 rounded-md border border-[var(--border)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                                Tanpa Batas Akhir
                            </button>
                        )}
                    </div>

                    {dateRangeInvalid ? (
                        <p className="text-xs text-[var(--danger)] flex items-center gap-1 font-medium">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            Hari terakhir tidak boleh sebelum tanggal mulai.
                        </p>
                    ) : (
                        <div className="rounded-lg bg-[var(--secondary)]/40 px-2.5 py-2 text-[11px] text-[var(--text-secondary)] flex items-start gap-2">
                            <Info className="w-3.5 h-3.5 text-[var(--primary)] shrink-0 mt-0.5" />
                            <div>
                                {uiEffectiveTo && durationDays ? (
                                    <span>
                                        Berlaku <strong>{formatWIBShort(effectiveFrom)}</strong> s.d.{" "}
                                        <strong>{formatWIBShort(uiEffectiveTo)}</strong>{" "}
                                        <span className="font-bold text-[var(--primary)]">({durationDays} hari, inklusif)</span>.
                                    </span>
                                ) : effectiveFrom ? (
                                    <span>
                                        Berlaku mulai <strong>{formatWIBShort(effectiveFrom)}</strong> dan{" "}
                                        <strong>terus berjalan (tanpa batas akhir)</strong> hingga ada penugasan berikutnya.
                                    </span>
                                ) : (
                                    <span>Pilih tanggal mulai berlaku untuk penugasan ini.</span>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="form-label text-xs" htmlFor="roster-shift">
                            Shift Tujuan
                        </label>
                        <select
                            id="roster-shift"
                            className="form-select text-xs font-semibold"
                            value={targetShiftId}
                            disabled={busy}
                            onChange={(e) => setTargetShiftId(e.target.value)}
                            required
                        >
                            {shifts.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.isDefault ? `${s.name} — Default` : s.name}
                                </option>
                            ))}
                        </select>

                        {targetShift && (
                            <div className="grid grid-cols-7 gap-1 text-center">
                                {SHORT_DAY_LABELS.map(({ dayOfWeek, label }) => {
                                    const d = targetShift.days.find((day) => day.dayOfWeek === dayOfWeek);
                                    const isOff = !d || d.isOff;
                                    return (
                                        <div
                                            key={dayOfWeek}
                                            className={`rounded-md py-1 px-0.5 border text-[10px] ${
                                                isOff
                                                    ? "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
                                                    : "bg-[var(--card)] border-[var(--border)] text-[var(--text-primary)]"
                                            }`}
                                        >
                                            <div className="font-bold">{label}</div>
                                            <div className="text-[9px] truncate mt-0.5">
                                                {isOff ? "Libur" : `${d.startTime}`}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/30 p-3 space-y-2.5">
                        <label htmlFor="roster-replace-future" className="flex items-start gap-2 cursor-pointer select-none">
                            <input
                                id="roster-replace-future"
                                type="checkbox"
                                checked={replaceFuture}
                                disabled={busy}
                                onChange={(e) => setReplaceFuture(e.target.checked)}
                                className="mt-0.5 rounded border-[var(--border)]"
                            />
                            <span className="text-xs text-[var(--text-primary)] leading-snug">
                                <strong>Timpa / pangkas jadwal masa depan</strong> yang bertabrakan di dalam periode ini (termasuk koreksi jadwal hari ini).
                            </span>
                        </label>

                        <div className="border-t border-[var(--border)] pt-2.5 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-[var(--text-primary)]">Pratinjau Dampak</span>
                                {loadingDryRun && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                                        <Loader2 className="w-3 h-3 animate-spin" /> Menghitung...
                                    </span>
                                )}
                            </div>

                            {dryRunPlan && dryRunSummary && (
                                <>
                                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                                        {dryRunSummary.cleanCount > 0 && (
                                            <span className="badge badge-success">{dryRunSummary.cleanCount} siap ditetapkan</span>
                                        )}
                                        {dryRunSummary.truncateCount > 0 && (
                                            <span className="badge badge-info">{dryRunSummary.truncateCount} potong jadwal berjalan</span>
                                        )}
                                        {dryRunSummary.splitCount > 0 && (
                                            <span className="badge badge-info">
                                                <Scissors className="w-3 h-3 mr-0.5" />
                                                {dryRunSummary.splitCount} belah & sambung kembali
                                            </span>
                                        )}
                                        {dryRunSummary.replaceCount > 0 && (
                                            <span className="badge badge-warning">{dryRunSummary.replaceCount} jadwal diganti/dipangkas</span>
                                        )}
                                        {dryRunSummary.totalConflicts > 0 && (
                                            <span className="badge badge-error">{dryRunSummary.totalConflicts} bentrok</span>
                                        )}
                                    </div>

                                    {dryRunSummary.futureConflictCount > 0 && !replaceFuture && (
                                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-300 space-y-1.5">
                                            <p>
                                                Ada <strong>{dryRunSummary.futureConflictCount} jadwal masa depan/hari ini</strong> yang dimulai di dalam periode baru.
                                            </p>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => setReplaceFuture(true)}
                                                className="btn btn-secondary btn-sm !py-1 !px-2 text-[11px] font-bold"
                                            >
                                                Aktifkan Timpa Jadwal Masa Depan
                                            </button>
                                        </div>
                                    )}

                                    {dryRunSummary.historyConflictCount > 0 && (
                                        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-700 dark:text-rose-300">
                                            Terdapat <strong>{dryRunSummary.historyConflictCount} jadwal riwayat masa lalu</strong> yang dimulai di dalam periode ini dan tidak boleh dihapus. Majukan Tanggal Mulai ke hari ini atau setelah jadwal riwayat tersebut.
                                        </div>
                                    )}

                                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                                        {dryRunPlan.plan.map((item) => {
                                            const emp = employees.find((e) => e.employeeId === item.employeeId);
                                            return (
                                                <div
                                                    key={item.employeeId}
                                                    className="rounded-lg bg-[var(--card)] border border-[var(--border)] px-2.5 py-1.5 text-[11px] space-y-0.5"
                                                >
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="font-semibold text-[var(--text-primary)] truncate">
                                                            {emp?.name ?? item.employeeId}
                                                        </span>
                                                        <span className="text-[10px] font-semibold text-[var(--primary)] inline-flex items-center gap-1 shrink-0">
                                                            <ArrowRight className="w-3 h-3" />
                                                            {shiftNameOf(item.shiftId)}
                                                        </span>
                                                    </div>
                                                    {item.actions.map((act, idx) => (
                                                        <p key={idx} className="text-[10px] text-[var(--text-muted)]">
                                                            •{" "}
                                                            {act.type === "truncate" &&
                                                                `Memotong ${shiftNameOf(act.shiftId)} agar berakhir sebelum ${formatWIBShort(item.effectiveFrom)}`}
                                                            {act.type === "split" &&
                                                                `Melanjutkan kembali ${shiftNameOf(act.shiftId)} mulai ${formatWIBShort(act.resultFrom ?? "")}`}
                                                            {act.type === "replace" &&
                                                                `Menimpa ${shiftNameOf(act.shiftId)} (${formatAssignmentInterval(act.effectiveFrom, act.effectiveTo)})`}
                                                            {act.type === "trimStart" &&
                                                                `Memangkas awal ${shiftNameOf(act.shiftId)} menjadi mulai ${formatWIBShort(act.resultFrom ?? "")}`}
                                                        </p>
                                                    ))}
                                                    {item.conflicts.map((conf, idx) => (
                                                        <p key={idx} className="text-[10px] text-[var(--danger)] font-medium">
                                                            • Bentrok {conf.reason === "HISTORY" ? "riwayat" : "jadwal"}:{" "}
                                                            {shiftNameOf(conf.shiftId)} ({formatAssignmentInterval(conf.effectiveFrom, conf.effectiveTo)})
                                                        </p>
                                                    ))}
                                                    {item.after && (
                                                        <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                                                            • Mulai {formatWIBShort(item.after.date)}: berlaku{" "}
                                                            <strong>{shiftNameOf(item.after.shiftId)}</strong> ({sourceBadgeLabel(item.after.source)})
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 p-4 pt-3 border-t border-[var(--border)]">
                    <button type="button" onClick={onClose} disabled={busy} className="btn btn-ghost btn-sm">
                        Batal
                    </button>
                    <button
                        type="submit"
                        disabled={busy || employees.length === 0 || !targetShiftId || !effectiveFrom || dateRangeInvalid}
                        className="btn btn-primary btn-sm"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                            </>
                        ) : (
                            <>Tetapkan {shiftNameOf(targetShiftId)} untuk {employees.length} orang</>
                        )}
                    </button>
                </div>
            </form>
        </AccessibleModal>
    );
}
