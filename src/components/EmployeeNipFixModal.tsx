"use client";

import { useEffect, useState } from "react";
import {
    ClipboardList,
    FileText,
    Hash,
    Loader2,
    RefreshCw,
    Users,
    X,
} from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { useToast } from "@/components/Toast";

type EmployeeSummary = {
    id: string;
    employeeId: string;
    name: string;
};

type NipFixImpact = {
    employee: EmployeeSummary;
    newEmployeeId: string;
    counts: {
        attendance: number;
        corrections: number;
        pendingCorrections: number;
        pendingLeave: number;
        pendingOvertime: number;
        documents: number;
        shiftAssignments: number;
        subordinates: number;
        assetsHeld: number;
    };
    usernameClash: boolean;
    blockedReasons: string[];
};

interface Props {
    employee: EmployeeSummary;
    onClose: () => void;
    onSuccess: (message: string) => void | Promise<void>;
}

function ImpactCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-center">
            <Icon className="mx-auto h-4 w-4 text-[var(--text-muted)]" />
            <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">{value}</p>
            <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
        </div>
    );
}

export default function EmployeeNipFixModal({ employee, onClose, onSuccess }: Props) {
    const toast = useToast();
    const [newEmployeeId, setNewEmployeeId] = useState("");
    const [retypeEmployeeId, setRetypeEmployeeId] = useState("");
    const [impact, setImpact] = useState<NipFixImpact | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [acknowledged, setAcknowledged] = useState(false);
    const [error, setError] = useState("");
    const [submitLock, setSubmitLock] = useState(false);

    const loadImpact = async (targetId: string) => {
        const controller = new AbortController();
        setLoading(true);
        setError("");
        try {
            const response = await fetch(
                `/api/employees/fix-employee-id?employeeUuid=${encodeURIComponent(employee.id)}&newEmployeeId=${encodeURIComponent(targetId)}`,
                { signal: controller.signal },
            );
            if (!response.ok) throw new Error(await getResponseErrorMessage(response, "Gagal memeriksa dampak perbaikan NIP."));
            setImpact(await response.json());
        } catch (fetchError: unknown) {
            if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
            reportClientError("EmployeeNipFixModal", "Gagal memeriksa dampak perbaikan NIP", fetchError, { employeeId: employee.id });
            setImpact(null);
            setError(fetchError instanceof Error ? fetchError.message : "Gagal memeriksa dampak.");
        } finally {
            setLoading(false);
        }
        return () => controller.abort();
    };

    useEffect(() => {
        setImpact(null);
        setAcknowledged(false);
        const trimmed = newEmployeeId.trim();
        if (trimmed.length < 3) return;
        const timer = setTimeout(() => {
            void loadImpact(trimmed);
        }, 500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [newEmployeeId, employee.id]);

    const blocked = (impact?.blockedReasons.length ?? 0) > 0;
    const canSubmit =
        impact !== null &&
        !blocked &&
        !impact.usernameClash &&
        newEmployeeId.trim() === retypeEmployeeId.trim() &&
        retypeEmployeeId.trim().length >= 3 &&
        acknowledged &&
        !submitting;

    const handleSubmit = async () => {
        if (!canSubmit || submitLock) return;
        setSubmitLock(true);
        setSubmitting(true);
        setError("");
        try {
            const response = await fetch("/api/employees/fix-employee-id", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    employeeUuid: employee.id,
                    newEmployeeId: newEmployeeId.trim(),
                    acknowledged: true,
                }),
            });
            if (!response.ok) throw new Error(await getResponseErrorMessage(response, "Gagal memperbaiki NIP."));
            const data = await response.json();
            toast(data.message ?? "NIP berhasil diperbaiki.", "success");
            await onSuccess(data.message ?? "NIP berhasil diperbaiki.");
        } catch (submitError: unknown) {
            reportClientError("EmployeeNipFixModal", "Gagal memperbaiki NIP karyawan", submitError, { employeeId: employee.id });
            setError(submitError instanceof Error ? submitError.message : "Gagal memperbaiki NIP.");
        } finally {
            setSubmitting(false);
            setSubmitLock(false);
        }
    };

    return (
        <AccessibleModal
            ariaLabel="Perbaiki NIP karyawan"
            onClose={onClose}
            className="w-full max-w-3xl max-h-[92vh] overflow-y-auto !p-0 rounded-2xl"
            disableClose={submitting}
        >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <Hash className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="font-bold text-[var(--text-primary)]">Perbaiki NIP Karyawan</h2>
                        <p className="text-xs text-[var(--text-muted)]">{employee.name} · {employee.employeeId}</p>
                    </div>
                </div>
                <button type="button" onClick={onClose} className="btn btn-ghost !p-2" disabled={submitting} aria-label="Tutup modal perbaiki NIP">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="space-y-6 p-6">
                <FeedbackMessage variant="warning">
                    NIP lama tidak dapat dipakai lagi setelah perbaikan. Akun terkait wajib login ulang. Riwayat audit tidak diubah.
                </FeedbackMessage>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="form-group !mb-0">
                        <label className="form-label">NIP baru</label>
                        <input
                            type="text"
                            className="form-input"
                            value={newEmployeeId}
                            onChange={(event) => setNewEmployeeId(event.target.value)}
                            placeholder="Contoh: ID-26090107"
                            maxLength={50}
                            required
                        />
                    </div>
                    <div className="form-group !mb-0">
                        <label className="form-label">Ketik ulang NIP baru</label>
                        <input
                            type="text"
                            className="form-input"
                            value={retypeEmployeeId}
                            onChange={(event) => setRetypeEmployeeId(event.target.value)}
                            placeholder="Ketik ulang persis sama"
                            maxLength={50}
                            required
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-10 text-sm text-[var(--text-muted)]">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memeriksa dampak lintas modul...
                    </div>
                ) : impact ? (
                    <>
                        <div>
                            <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                                <ClipboardList className="h-4 w-4" /> Data yang ikut pindah
                            </h3>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <ImpactCard icon={FileText} label="Presensi" value={impact.counts.attendance} />
                                <ImpactCard icon={FileText} label="Dokumen" value={impact.counts.documents} />
                                <ImpactCard icon={Users} label="Bawahan" value={impact.counts.subordinates} />
                                <ImpactCard icon={RefreshCw} label="Roster shift" value={impact.counts.shiftAssignments} />
                            </div>
                        </div>

                        {impact.usernameClash && (
                            <FeedbackMessage variant="error">
                                Username tujuan sudah dipakai akun lain. Pilih NIP lain.
                            </FeedbackMessage>
                        )}

                        {impact.blockedReasons.map((reason) => (
                            <FeedbackMessage key={reason} variant="error">
                                {reason} Selesaikan dulu sebelum memperbaiki NIP.
                            </FeedbackMessage>
                        ))}

                        {!blocked && !impact.usernameClash && (
                            <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-4 text-sm">
                                <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={acknowledged}
                                    onChange={(event) => setAcknowledged(event.target.checked)}
                                />
                                <span>
                                    Saya sadar NIP <strong>{employee.employeeId}</strong> akan diganti menjadi{" "}
                                    <strong>{impact.newEmployeeId}</strong> di seluruh data, dan akun terkait harus login ulang.
                                </span>
                            </label>
                        )}
                    </>
                ) : null}

                {error && (
                    <FeedbackMessage variant="error">
                        {error}
                    </FeedbackMessage>
                )}
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[var(--border)] bg-[var(--card)] px-6 py-4">
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Batal</button>
                <button
                    type="button"
                    className="btn bg-amber-600 text-white hover:bg-amber-700"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
                    {submitting ? "Menyimpan..." : "Eksekusi Perbaikan"}
                </button>
            </div>
        </AccessibleModal>
    );
}
