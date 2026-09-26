"use client";

import { useCallback, useEffect, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Clock,
    FileCheck2,
    X,
    PenTool,
    ShieldAlert,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import SignaturePad from "@/components/ui/SignaturePad";
import AccessibleModal from "@/components/ui/AccessibleModal";

interface EmployeeApprovalTask {
    approvalId: string;
    roomId: string;
    roomName: string;
    monthWib: string;
    role: "INSPECTED_BY" | "KNOWN_BY";
    roleLabel: string;
    isSigned: boolean;
    signedAt: string | null;
    derivedStatus: "WAITING_FOR_SIGNATURES" | "PARTIALLY_SIGNED" | "COMPLETE";
    hasChangedAfterSigning: boolean;
    latestChange: { timestamp: string; actorName: string | null } | null;
}

interface DetailTaskModalData {
    id: string;
    roomId: string;
    roomName: string;
    monthWib: string;
    dates: string[];
    days: Array<{
        date: string;
        status: "SELESAI" | "BELUM" | "FUTURE";
        activeCount: number;
        completedCount: number;
    }>;
    inspectedByEmployeeName: string;
    knownByEmployeeName: string;
    userRoles: Array<{
        role: "INSPECTED_BY" | "KNOWN_BY";
        roleLabel: string;
        isSigned: boolean;
        signature: {
            id: string;
            version: number;
            signedAt: string;
            signaturePayload: string;
            hasChangedAfter: boolean;
        } | null;
    }>;
    derivedStatus: "WAITING_FOR_SIGNATURES" | "PARTIALLY_SIGNED" | "COMPLETE";
    latestChange: { timestamp: string; actorName: string | null } | null;
}

function getCurrentMonth(): string {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value ?? "2026";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    return `${year}-${month}`;
}

function formatMonthLabel(monthStr: string): string {
    const [y, m] = monthStr.split("-");
    const months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function shiftMonth(monthStr: string, delta: number): string {
    const [y, m] = monthStr.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(isoString: string | null | undefined): string {
    if (!isoString) return "-";
    const d = new Date(isoString);
    return d.toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }) + " WIB";
}

export default function EmployeeCleaningApprovalsPage() {
    const toast = useToast();
    const [month, setMonth] = useState(getCurrentMonth);
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [tasks, setTasks] = useState<EmployeeApprovalTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state
    const [activeApprovalId, setActiveApprovalId] = useState<string | null>(null);
    const [activeRole, setActiveRole] = useState<"INSPECTED_BY" | "KNOWN_BY">("INSPECTED_BY");
    const [modalData, setModalData] = useState<DetailTaskModalData | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [signing, setSigning] = useState(false);
    const [signError, setSignError] = useState<string | null>(null);
    const [idempotencyKey, setIdempotencyKey] = useState<string>("");

    const fetchTasks = useCallback(async (targetMonth: string, status: string) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (targetMonth) params.set("monthWib", targetMonth);
            if (status !== "ALL") params.set("status", status);

            const res = await fetch(`/api/employee/cleaning/approvals?${params.toString()}`);
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat tugas persetujuan."));
            }
            const json = await res.json();
            setTasks(json.data || []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat tugas.";
            setError(msg);
            reportClientError("EmployeeCleaningApprovals", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchTasks(month, statusFilter);
    }, [month, statusFilter, fetchTasks]);

    const openSigningModal = async (approvalId: string, role: "INSPECTED_BY" | "KNOWN_BY") => {
        setActiveApprovalId(approvalId);
        setActiveRole(role);
        setModalLoading(true);
        setModalData(null);
        setSignError(null);
        setIdempotencyKey(`idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

        try {
            const res = await fetch(`/api/employee/cleaning/approvals?approvalId=${approvalId}`);
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat detail periode persetujuan."));
            }
            const json = await res.json();
            setModalData(json.data);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memuat detail.", "error");
            setActiveApprovalId(null);
        } finally {
            setModalLoading(false);
        }
    };

    const handleSaveSignature = async (payload: string) => {
        if (!activeApprovalId) return;

        setSigning(true);
        setSignError(null);

        try {
            const res = await fetch("/api/employee/cleaning/approvals/sign", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-idempotency-key": idempotencyKey,
                },
                body: JSON.stringify({
                    approvalId: activeApprovalId,
                    role: activeRole,
                    signaturePayload: payload,
                    idempotencyKey,
                }),
            });

            if (!res.ok) {
                const errMsg = await getResponseErrorMessage(res, "Gagal menyimpan tanda tangan.");
                throw new Error(errMsg);
            }

            toast("Tanda tangan berhasil disimpan.", "success");
            const detailRes = await fetch(`/api/employee/cleaning/approvals?approvalId=${activeApprovalId}`);
            if (detailRes.ok) {
                const json = await detailRes.json();
                setModalData(json.data);
            }
            await fetchTasks(month, statusFilter);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal menyimpan tanda tangan.";
            setSignError(msg);
            toast(msg, "error");
        } finally {
            setSigning(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">Tanda Tangan Inspeksi</h1>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                    Periksa dan tanda tangani checklist inspeksi bulanan ruangan yang ditugaskan kepada Anda.
                </p>
            </div>

            {/* Filter controls */}
            <div className="card flex flex-wrap items-center justify-between gap-4 p-4 mb-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setMonth(shiftMonth(month, -1))}
                        className="btn btn-secondary !p-2"
                        title="Bulan sebelumnya"
                        type="button"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-base font-semibold min-w-[150px] text-center text-[var(--text-primary)]">
                        {formatMonthLabel(month)}
                    </span>
                    <button
                        onClick={() => setMonth(shiftMonth(month, 1))}
                        className="btn btn-secondary !p-2"
                        title="Bulan berikutnya"
                        type="button"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setStatusFilter("ALL")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            statusFilter === "ALL"
                                ? "bg-[var(--primary)] text-white"
                                : "btn btn-secondary !p-1.5"
                        }`}
                        type="button"
                    >
                        Semua
                    </button>
                    <button
                        onClick={() => setStatusFilter("PENDING")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            statusFilter === "PENDING"
                                ? "bg-[var(--primary)] text-white"
                                : "btn btn-secondary !p-1.5"
                        }`}
                        type="button"
                    >
                        Menunggu Tanda Tangan
                    </button>
                    <button
                        onClick={() => setStatusFilter("SIGNED")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            statusFilter === "SIGNED"
                                ? "bg-[var(--primary)] text-white"
                                : "btn btn-secondary !p-1.5"
                        }`}
                        type="button"
                    >
                        Selesai
                    </button>
                </div>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                </div>
            )}

            {error && !loading && (
                <div className="mb-6 p-4 bg-[var(--destructive-bg)] text-[var(--destructive)] rounded-xl border border-[var(--destructive-border)] text-center">
                    <AlertTriangle className="h-5 w-5 mx-auto mb-2" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {!loading && !error && tasks.length === 0 && (
                <div className="text-center py-16 border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--card)]">
                    <FileCheck2 className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
                    <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Tidak Ada Tugas Tanda Tangan</h3>
                    <p className="text-sm text-[var(--text-muted)] max-w-sm mx-auto">
                        Tidak ada tugas penandatanganan inspeksi untuk Anda pada bulan {formatMonthLabel(month)}.
                    </p>
                </div>
            )}

            {!loading && !error && tasks.length > 0 && (
                <div className="space-y-4">
                    {tasks.map((task) => (
                        <div
                            key={`${task.approvalId}_${task.role}`}
                            className="card p-5 hover:shadow-md transition-shadow"
                        >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-bold text-[var(--text-primary)]">
                                            {task.roomName}
                                        </h3>
                                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--secondary)] text-[var(--text-secondary)] border border-[var(--border)]">
                                            {task.roleLabel}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                        Periode: {formatMonthLabel(task.monthWib)}
                                    </p>
                                </div>

                                <div>
                                    {task.isSigned ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)]">
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Sudah Ditandatangani
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning-border)]">
                                            <Clock className="h-3.5 w-3.5" /> Menunggu Tanda Tangan Anda
                                        </span>
                                    )}
                                </div>
                            </div>

                            {task.latestChange && (
                                <div className="text-xs text-[var(--text-muted)] mb-3 flex items-center gap-1">
                                    <span>Pembaruan checklist terakhir: {formatDateTime(task.latestChange.timestamp)}</span>
                                </div>
                            )}

                            {task.hasChangedAfterSigning && (
                                <div className="p-2.5 mb-3 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning-border)] text-xs text-[var(--warning)] font-medium flex items-start gap-2">
                                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[var(--warning)]" />
                                    <span>
                                        Perhatian: Terdapat perubahan data checklist inspeksi setelah Anda menandatangani dokumen ini.
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                                <span className="text-xs text-[var(--text-muted)]">
                                    {task.isSigned && task.signedAt
                                        ? `Ditandatangani pada ${formatDateTime(task.signedAt)}`
                                        : "Tanda tangan diperlukan"}
                                </span>
                                <button
                                    onClick={() => openSigningModal(task.approvalId, task.role)}
                                    className={`btn btn-sm ${
                                        task.isSigned
                                            ? "btn-secondary"
                                            : "btn-primary"
                                    }`}
                                    type="button"
                                >
                                    <PenTool className="h-3.5 w-3.5" />
                                    {task.isSigned ? "Lihat Detail Tanda Tangan" : "Tanda Tangani Dokumen"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal Tanda Tangan & Detail */}
            {activeApprovalId && (
                <AccessibleModal
                    ariaLabel="Persetujuan Inspeksi Ruangan"
                    onClose={() => setActiveApprovalId(null)}
                    className="!max-w-2xl !p-6"
                >
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">
                                {modalData ? `Persetujuan ${modalData.roomName}` : "Memuat..."}
                            </h2>
                            {modalData && (
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                    Bulan: {formatMonthLabel(modalData.monthWib)}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => setActiveApprovalId(null)}
                            aria-label="Tutup modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {modalLoading && (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                        </div>
                    )}

                    {!modalLoading && modalData && (
                        <div>
                            {/* Checklist summary dates */}
                            {modalData.days && modalData.days.length > 0 && (
                                <div className="mb-5">
                                    <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                                        Status Checklist Harian
                                    </h4>
                                    <div className="overflow-x-auto border border-[var(--border)] rounded-xl p-2.5 bg-[var(--secondary)]/30">
                                        <div className="flex gap-1.5 min-w-max">
                                            {modalData.days.map((d) => (
                                                <div
                                                    key={d.date}
                                                    className={`w-7 h-10 rounded-lg flex flex-col items-center justify-center text-[9px] font-medium border ${
                                                        d.status === "SELESAI"
                                                            ? "bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]"
                                                            : d.status === "FUTURE"
                                                                ? "bg-[var(--secondary)] text-[var(--text-muted)] border-[var(--border)]"
                                                                : "bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]"
                                                    }`}
                                                    title={`${d.date}: ${d.status}`}
                                                >
                                                    <span className="font-semibold">{parseInt(d.date.split("-")[2], 10)}</span>
                                                    <span className="text-[7px] font-bold">
                                                        {d.status === "SELESAI" ? "OK" : d.status === "FUTURE" ? "-" : "!"}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* User slot view */}
                            {(() => {
                                const currentRoleInfo = modalData.userRoles.find((r) => r.role === activeRole);
                                if (!currentRoleInfo) return null;

                                if (currentRoleInfo.isSigned && currentRoleInfo.signature) {
                                    return (
                                        <div className="space-y-4">
                                            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/20 text-center">
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                                                    Tanda Tangan Anda ({currentRoleInfo.roleLabel})
                                                </h4>
                                                <div className="bg-white dark:bg-[#0D0D11] border border-[var(--border)] rounded-lg p-3 max-w-sm mx-auto h-36 flex items-center justify-center mb-2">
                                                    <img
                                                        src={currentRoleInfo.signature.signaturePayload}
                                                        alt="Tanda tangan tersimpan"
                                                        className="max-h-full max-w-full object-contain"
                                                    />
                                                </div>
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    Tersimpan pada: {formatDateTime(currentRoleInfo.signature.signedAt)}
                                                </p>
                                            </div>

                                            {currentRoleInfo.signature.hasChangedAfter && (
                                                <div className="p-3 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning-border)] text-xs text-[var(--warning)] font-medium flex items-start gap-2">
                                                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[var(--warning)]" />
                                                    <div>
                                                        <div className="font-bold">Perhatian: Checklist Berubah</div>
                                                        <div className="mt-0.5">
                                                            Terdapat perubahan data checklist inspeksi setelah tanda tangan Anda disimpan pada {formatDateTime(currentRoleInfo.signature.signedAt)}.
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                return (
                                    <div>
                                        <div className="mb-3">
                                            <h4 className="text-sm font-bold text-[var(--text-primary)] mb-1">
                                                Bubuhkan Tanda Tangan ({currentRoleInfo.roleLabel})
                                            </h4>
                                            <p className="text-xs text-[var(--text-muted)]">
                                                Gunakan jari atau mouse untuk menandatangani di bawah ini:
                                            </p>
                                        </div>

                                        <SignaturePad
                                            onSave={handleSaveSignature}
                                            saving={signing}
                                            error={signError}
                                            onClearError={() => setSignError(null)}
                                        />
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </AccessibleModal>
            )}
        </div>
    );
}
