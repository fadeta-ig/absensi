"use client";

import { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    ClipboardList,
    History,
    Laptop,
    Loader2,
    Smartphone,
    UserCheck,
    Users,
    UserX,
    X,
} from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

type EmployeeSummary = {
    id: string;
    employeeId: string;
    name: string;
    isActive: boolean;
};

type StatusOverview = {
    employee: EmployeeSummary & { statusChangedAt?: string | null };
    impact: {
        directReports: { employeeId: string; name: string; positionRel?: { name: string } | null }[];
        assignedAssets: { id: string; assetCode: string; name: string }[];
        simCards: { id: string; phoneNumber: string; provider: string }[];
        pendingRequests: {
            leave: number;
            overtime: number;
            attendanceCorrection: number;
            letter: number;
            assetTicket: number;
        };
        pushSubscriptions: number;
    };
    history: {
        id: string;
        wasActive: boolean;
        isActive: boolean;
        reason: string;
        effectiveDate: string;
        createdAt: string;
        actor: { employeeId: string; name: string };
    }[];
    eligibleManagers: { employeeId: string; name: string; positionRel?: { name: string } | null }[];
};

interface Props {
    employee: EmployeeSummary;
    onClose: () => void;
    onSuccess: (message: string) => void | Promise<void>;
}

function todayInJakarta() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

export default function EmployeeStatusModal({ employee, onClose, onSuccess }: Props) {
    const [overview, setOverview] = useState<StatusOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [reason, setReason] = useState("");
    const [effectiveDate, setEffectiveDate] = useState(todayInJakarta());
    const [managerChoice, setManagerChoice] = useState("");
    const nextIsActive = !employee.isActive;

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        fetch(`/api/employees/${employee.id}/status`, { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(await getResponseErrorMessage(response, "Gagal memuat dampak perubahan status."));
                const data = await response.json();
                setOverview(data);
            })
            .catch((fetchError: unknown) => {
                if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
                reportClientError("EmployeeStatusModal", "Gagal memuat dampak perubahan status karyawan", fetchError, { employeeId: employee.id });
                setError(fetchError instanceof Error ? fetchError.message : "Gagal memuat data.");
            })
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, [employee.id]);

    const pendingTotal = useMemo(() => {
        if (!overview) return 0;
        return Object.values(overview.impact.pendingRequests).reduce((sum, value) => sum + value, 0);
    }, [overview]);

    const requiresReassignment = !nextIsActive && (overview?.impact.directReports.length ?? 0) > 0;
    const canSubmit = reason.trim().length >= 5
        && Boolean(effectiveDate)
        && (!requiresReassignment || Boolean(managerChoice));

    const handleSubmit = async () => {
        if (!canSubmit || submitting) return;
        setSubmitting(true);
        setError("");

        const reassignManagerId = requiresReassignment
            ? managerChoice === "__NONE__" ? null : managerChoice
            : undefined;

        try {
            const response = await fetch(`/api/employees/${employee.id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    isActive: nextIsActive,
                    reason: reason.trim(),
                    effectiveDate,
                    reassignManagerId,
                }),
            });
            if (!response.ok) throw new Error(await getResponseErrorMessage(response, "Gagal mengubah status karyawan."));
            const data = await response.json();
            await onSuccess(data.message);
        } catch (submitError: unknown) {
            reportClientError("EmployeeStatusModal", "Gagal mengubah status karyawan", submitError, { employeeId: employee.id, nextIsActive });
            setError(submitError instanceof Error ? submitError.message : "Gagal mengubah status karyawan.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AccessibleModal
            ariaLabel={nextIsActive ? "Aktifkan kembali karyawan" : "Nonaktifkan karyawan"}
            onClose={onClose}
            className="w-full max-w-3xl max-h-[92vh] overflow-y-auto !p-0 rounded-2xl"
            disableClose={submitting}
        >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${nextIsActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                            {nextIsActive ? <UserCheck className="h-5 w-5" /> : <UserX className="h-5 w-5" />}
                        </div>
                        <div>
                            <h2 className="font-bold text-[var(--text-primary)]">
                                {nextIsActive ? "Aktifkan Kembali" : "Nonaktifkan Karyawan"}
                            </h2>
                            <p className="text-xs text-[var(--text-muted)]">{employee.name} · {employee.employeeId}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="btn btn-ghost !p-2" disabled={submitting} aria-label="Tutup modal status karyawan">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-6 p-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-sm text-[var(--text-muted)]">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memeriksa dampak lintas modul...
                        </div>
                    ) : overview ? (
                        <>
                            {!nextIsActive && (
                                <div className="space-y-3">
                                    <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                                        <AlertTriangle className="h-4 w-4 text-amber-500" /> Dampak yang harus ditinjau
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                        <ImpactCard icon={Users} label="Bawahan aktif" value={overview.impact.directReports.length} />
                                        <ImpactCard icon={Laptop} label="Aset dipegang" value={overview.impact.assignedAssets.length} />
                                        <ImpactCard icon={Smartphone} label="SIM dipegang" value={overview.impact.simCards.length} />
                                        <ImpactCard icon={ClipboardList} label="Proses pending" value={pendingTotal} />
                                    </div>

                                    {(overview.impact.assignedAssets.length > 0 || overview.impact.simCards.length > 0 || pendingTotal > 0) && (
                                        <FeedbackMessage variant="warning" compact>
                                            Akses akan tetap dihentikan. Aset, SIM, dan proses pending tidak dihapus otomatis agar dapat ditindaklanjuti oleh HR/GA dengan jejak data yang utuh.
                                        </FeedbackMessage>
                                    )}

                                    {requiresReassignment && (
                                        <div className="form-group !mb-0">
                                            <label className="form-label">Alihkan {overview.impact.directReports.length} bawahan aktif</label>
                                            <select
                                                className="form-select"
                                                value={managerChoice}
                                                onChange={(event) => setManagerChoice(event.target.value)}
                                                required
                                            >
                                                <option value="">Pilih atasan pengganti</option>
                                                <option value="__NONE__">Tidak ada / langsung ke CEO</option>
                                                {overview.eligibleManagers.map((manager) => (
                                                    <option key={manager.employeeId} value={manager.employeeId}>
                                                        {manager.name} ({manager.employeeId}){manager.positionRel?.name ? ` · ${manager.positionRel.name}` : ""}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="form-group !mb-0">
                                    <label className="form-label">Tanggal efektif</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={effectiveDate}
                                        max={todayInJakarta()}
                                        onChange={(event) => setEffectiveDate(event.target.value)}
                                        required
                                    />
                                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">Perubahan akses diterapkan segera; tanggal ini dicatat sebagai tanggal bisnis efektif.</p>
                                </div>
                                <div className="form-group !mb-0 sm:row-span-2">
                                    <label className="form-label">Alasan perubahan status</label>
                                    <textarea
                                        className="form-input min-h-28 resize-y"
                                        value={reason}
                                        onChange={(event) => setReason(event.target.value)}
                                        maxLength={1000}
                                        placeholder={nextIsActive ? "Contoh: Karyawan dipekerjakan kembali..." : "Contoh: Kontrak kerja telah berakhir..."}
                                        required
                                    />
                                    <p className="mt-1 text-[10px] text-[var(--text-muted)]">Minimal 5 karakter · {reason.length}/1000</p>
                                </div>
                            </div>

                            {overview.history.length > 0 && (
                                <div className="rounded-xl border border-[var(--border)] p-4">
                                    <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                                        <History className="h-4 w-4" /> Riwayat terakhir
                                    </h3>
                                    <div className="space-y-3">
                                        {overview.history.slice(0, 3).map((item) => (
                                            <div key={item.id} className="flex items-start justify-between gap-4 text-xs">
                                                <div>
                                                    <p className="font-semibold text-[var(--text-primary)]">
                                                        {item.isActive ? "Diaktifkan" : "Dinonaktifkan"} oleh {item.actor.name}
                                                    </p>
                                                    <p className="mt-0.5 text-[var(--text-muted)]">{item.reason}</p>
                                                </div>
                                                <time className="shrink-0 text-[10px] text-[var(--text-muted)]">
                                                    {new Date(item.effectiveDate).toLocaleDateString("id-ID")}
                                                </time>
                                            </div>
                                        ))}
                                    </div>
                                </div>
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
                        className={`btn ${nextIsActive ? "btn-primary" : "bg-red-600 text-white hover:bg-red-700"}`}
                        onClick={handleSubmit}
                        disabled={!overview || !canSubmit || submitting}
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : nextIsActive ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                        {submitting ? "Menyimpan..." : nextIsActive ? "Aktifkan Kembali" : "Nonaktifkan"}
                    </button>
                </div>
        </AccessibleModal>
    );
}

function ImpactCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/40 p-3">
            <Icon className="mb-2 h-4 w-4 text-[var(--primary)]" />
            <p className="text-xl font-bold text-[var(--text-primary)]">{value}</p>
            <p className="text-[10px] font-medium text-[var(--text-muted)]">{label}</p>
        </div>
    );
}
