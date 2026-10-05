"use client";

import { useCallback, useEffect, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Plus,
    FileCheck2,
    RotateCcw,
    Eye,
    X,
    UserCheck,
    FileDown,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
// exportCleaningPdf (jspdf) dimuat dinamis saat tombol diklik agar tidak
// membebani bundle halaman.
async function renderCleaningMatrixPdf(data: Parameters<typeof import("@/lib/exportCleaningPdf").exportCleaningMatrixPdf>[0]) {
    const { exportCleaningMatrixPdf } = await import("@/lib/exportCleaningPdf");
    exportCleaningMatrixPdf(data);
}

interface ReviewerInfo {
    employeeId: string;
    employeeName: string;
    isActive: boolean;
    signedAt: string | null;
    hasChangedAfter: boolean;
    signature?: {
        id: string;
        version: number;
        signedAt: string;
        signaturePayload: string;
        hasChangedAfter: boolean;
    } | null;
}

interface ApprovalSummaryItem {
    id: string;
    roomId: string;
    roomName: string;
    monthWib: string;
    derivedStatus: "WAITING_FOR_SIGNATURES" | "PARTIALLY_SIGNED" | "COMPLETE";
    inspectedBy: ReviewerInfo;
    knownBy: ReviewerInfo;
    latestChange: { timestamp: string; actorName: string | null } | null;
    createdAt: string;
    updatedAt: string;
    isSignable?: boolean;
    opensOnWibDate?: string;
}

interface EligibleReviewer {
    id: string;
    employeeId: string;
    name: string;
    userAccount?: {
        id: string;
        username: string;
        displayName: string;
    } | null;
}

interface CleaningRoomSimple {
    id: string;
    name: string;
}

interface DetailSignatureHistory {
    id: string;
    role: "INSPECTED_BY" | "KNOWN_BY";
    version: number;
    employeeId: string;
    employeeName: string;
    status: "SIGNED" | "REOPENED";
    signedAt: string;
    reopenedAt: string | null;
    reopenReason: string | null;
    reopenedByName: string | null;
    signaturePayload: string | null;
}

interface ApprovalDetailData {
    id?: string;
    status: "UNOPENED" | "WAITING_FOR_SIGNATURES" | "PARTIALLY_SIGNED" | "COMPLETE";
    roomId: string;
    roomName: string;
    monthWib: string;
    dates?: string[];
    days?: Array<{
        date: string;
        status: "SELESAI" | "BELUM" | "FUTURE" | "LIBUR";
        activeCount: number;
        completedCount: number;
    }>;
    inspectedBy?: ReviewerInfo;
    knownBy?: ReviewerInfo;
    latestChange: { timestamp: string; actorName: string | null } | null;
    history?: DetailSignatureHistory[];
    signable?: { isSignable: boolean; opensOnWibDate: string; wibToday: string };
}

function formatOpensOnShort(wibDate: string | undefined): string {
    if (!wibDate) return "";
    const [y, m, d] = wibDate.split("-").map(Number);
    const short = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    if (!y || !m || !d || m < 1 || m > 12) return wibDate ?? "";
    return `${d} ${short[m - 1]} ${y}`;
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

export default function GaCleaningApprovalsPage() {
    const toast = useToast();
    const [month, setMonth] = useState(getCurrentMonth);
    const [approvals, setApprovals] = useState<ApprovalSummaryItem[]>([]);
    const [rooms, setRooms] = useState<CleaningRoomSimple[]>([]);
    const [reviewers, setReviewers] = useState<EligibleReviewer[]>([]);
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal Buka Periode
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [selectedRoomId, setSelectedRoomId] = useState("");
    const [selectedInspectedId, setSelectedInspectedId] = useState("");
    const [selectedKnownId, setSelectedKnownId] = useState("");
    const [savingOpen, setSavingOpen] = useState(false);
    const [defaultReviewers, setDefaultReviewers] = useState<{
        inspectedByEmployeeId: string | null;
        knownByEmployeeId: string | null;
    } | null>(null);
    const [openingAll, setOpeningAll] = useState(false);

    // Modal Detail
    const [detailData, setDetailData] = useState<ApprovalDetailData | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [showDetailModal, setShowDetailModal] = useState(false);

    // Modal Buka Kembali (Reopen)
    const [showReopenModal, setShowReopenModal] = useState(false);
    const [reopenApprovalId, setReopenApprovalId] = useState("");
    const [reopenRole, setReopenRole] = useState<"INSPECTED_BY" | "KNOWN_BY">("INSPECTED_BY");
    const [reopenReason, setReopenReason] = useState("");
    const [replacementId, setReplacementId] = useState("");
    const [savingReopen, setSavingReopen] = useState(false);
    const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

    const fetchData = useCallback(async (targetMonth: string) => {
        setLoading(true);
        setError(null);
        try {
            const [approvalsRes, roomsRes, reviewersRes, defaultsRes] = await Promise.all([
                fetch(`/api/ga/cleaning/approvals?monthWib=${targetMonth}`),
                fetch("/api/ga/cleaning/rooms"),
                fetch("/api/ga/cleaning/approvals/reviewers"),
                fetch("/api/ga/cleaning/settings/default-reviewers").catch(() => null),
            ]);

            if (!approvalsRes.ok) {
                throw new Error(await getResponseErrorMessage(approvalsRes, "Gagal memuat persetujuan inspeksi."));
            }
            const approvalsJson = await approvalsRes.json();
            setApprovals(approvalsJson.data || []);

            if (roomsRes.ok) {
                const roomsJson = await roomsRes.json();
                setRooms(roomsJson.data || []);
            }

            if (reviewersRes.ok) {
                const reviewersJson = await reviewersRes.json();
                setReviewers(reviewersJson.data || []);
            }

            if (defaultsRes && defaultsRes.ok) {
                const defaultsJson = await defaultsRes.json();
                const defaults = defaultsJson.data?.defaults ?? defaultsJson.data ?? null;
                if (defaults && (defaults.inspectedByEmployeeId || defaults.knownByEmployeeId)) {
                    setDefaultReviewers({
                        inspectedByEmployeeId: defaults.inspectedByEmployeeId ?? null,
                        knownByEmployeeId: defaults.knownByEmployeeId ?? null,
                    });
                } else {
                    setDefaultReviewers(null);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat data.";
            setError(msg);
            reportClientError("GaCleaningApprovals", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    const openOpenModal = useCallback(() => {
        // Refresh default reviewer + daftar eligible agar tidak basi bila HR
        // mengubah data setelah halaman dibuka.
        fetch("/api/ga/cleaning/settings/default-reviewers")
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                const defaults = json?.data?.defaults ?? json?.data ?? null;
                if (defaults && (defaults.inspectedByEmployeeId || defaults.knownByEmployeeId)) {
                    setDefaultReviewers({
                        inspectedByEmployeeId: defaults.inspectedByEmployeeId ?? null,
                        knownByEmployeeId: defaults.knownByEmployeeId ?? null,
                    });
                    setSelectedInspectedId((prev) => prev || defaults.inspectedByEmployeeId || "");
                    setSelectedKnownId((prev) => prev || defaults.knownByEmployeeId || "");
                }
            })
            .catch(() => undefined);
        fetch("/api/ga/cleaning/approvals/reviewers")
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (Array.isArray(json?.data)) setReviewers(json.data);
            })
            .catch(() => undefined);
        if (!selectedInspectedId && defaultReviewers?.inspectedByEmployeeId) {
            setSelectedInspectedId(defaultReviewers.inspectedByEmployeeId);
        }
        if (!selectedKnownId && defaultReviewers?.knownByEmployeeId) {
            setSelectedKnownId(defaultReviewers.knownByEmployeeId);
        }
        setShowOpenModal(true);
    }, [selectedInspectedId, selectedKnownId, defaultReviewers]);

    const handleOpenAll = useCallback(async () => {
        setOpeningAll(true);
        try {
            const res = await fetch("/api/ga/cleaning/approvals/open-all", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ monthWib: month }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal membuka semua periode."));
            const json = await res.json();
            toast(`Periode dibuka: ${json.data.created} baru, ${json.data.skipped} sudah ada.`, "success");
            await fetchData(month);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal membuka semua periode.", "error");
        } finally {
            setOpeningAll(false);
        }
    }, [month, fetchData, toast]);

    useEffect(() => {
        void fetchData(month);
    }, [month, fetchData]);

    const handleOpenPeriod = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedRoomId) {
            toast("Silakan pilih ruangan.", "error");
            return;
        }
        if (!selectedInspectedId || !selectedKnownId) {
            toast("Silakan pilih kedua penanda tangan.", "error");
            return;
        }
        if (selectedInspectedId === selectedKnownId) {
            toast("Karyawan Diperiksa Oleh dan Mengetahui harus berbeda.", "error");
            return;
        }

        setSavingOpen(true);
        try {
            const res = await fetch("/api/ga/cleaning/approvals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomId: selectedRoomId,
                    monthWib: month,
                    inspectedByEmployeeId: selectedInspectedId,
                    knownByEmployeeId: selectedKnownId,
                }),
            });

            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal membuka periode persetujuan."));
            }

            const json = await res.json();
            toast(json.isNew ? "Periode persetujuan berhasil dibuka." : "Periode persetujuan sudah ada.", "success");
            setShowOpenModal(false);
            setSelectedRoomId("");
            setSelectedInspectedId("");
            setSelectedKnownId("");
            await fetchData(month);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal membuka periode.", "error");
        } finally {
            setSavingOpen(false);
        }
    };

    const handleViewDetail = async (roomId: string) => {
        setDetailLoading(true);
        setShowDetailModal(true);
        setDetailData(null);
        try {
            const res = await fetch(`/api/ga/cleaning/approvals?roomId=${roomId}&monthWib=${month}&mode=detail`);
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal memuat detail persetujuan."));
            }
            const json = await res.json();
            setDetailData(json.data);
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal memuat detail.", "error");
            setShowDetailModal(false);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleOpenReopenModal = (approvalId: string, defaultRole: "INSPECTED_BY" | "KNOWN_BY") => {
        setReopenApprovalId(approvalId);
        setReopenRole(defaultRole);
        setReopenReason("");
        setReplacementId("");
        setShowReopenModal(true);
    };

    const handleReopenSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reopenReason.trim() || reopenReason.trim().length < 3) {
            toast("Alasan pembukaan kembali wajib diisi minimal 3 karakter.", "error");
            return;
        }

        setSavingReopen(true);
        try {
            const res = await fetch("/api/ga/cleaning/approvals/reopen", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    approvalId: reopenApprovalId,
                    role: reopenRole,
                    reopenReason: reopenReason.trim(),
                    replacementEmployeeId: replacementId || undefined,
                }),
            });

            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal membuka kembali slot tanda tangan."));
            }

            toast("Slot tanda tangan berhasil dibuka kembali.", "success");
            setShowReopenModal(false);
            await fetchData(month);
            if (showDetailModal && detailData) {
                await handleViewDetail(detailData.roomId);
            }
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal membuka kembali slot.", "error");
        } finally {
            setSavingReopen(false);
        }
    };

    const handleExportPdf = async (roomId: string, targetMonth: string) => {
        const idKey = `${roomId}_${targetMonth}`;
        setExportingPdfId(idKey);
        try {
            const res = await fetch(`/api/ga/cleaning/approvals/export-pdf?roomId=${roomId}&monthWib=${targetMonth}`);
            if (!res.ok) {
                throw new Error(await getResponseErrorMessage(res, "Gagal mengunduh berkas PDF."));
            }
            const json = await res.json();
            await renderCleaningMatrixPdf(json.data);
            toast("Formulir PDF inspeksi berhasil diunduh.", "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Gagal mengunduh PDF.", "error");
        } finally {
            setExportingPdfId(null);
        }
    };

    const filteredApprovals = statusFilter === "ALL"
        ? approvals
        : approvals.filter((a) => a.derivedStatus === statusFilter);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "COMPLETE":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)]">
                        <CheckCircle2 className="h-3 w-3" /> Lengkap
                    </span>
                );
            case "PARTIALLY_SIGNED":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning-border)]">
                        <Clock className="h-3 w-3" /> Sebagian
                    </span>
                );
            case "WAITING_FOR_SIGNATURES":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--info-bg)] text-[var(--info)] border border-[var(--info-border)]">
                        <Clock className="h-3 w-3" /> Menunggu Tanda Tangan
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--secondary)] text-[var(--text-muted)] border border-[var(--border)]">
                        Belum dibuka GA
                    </span>
                );
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">Tanda Tangan Bulanan Inspeksi</h1>
                    <p className="text-sm text-[var(--text-muted)] mt-0.5">
                        Kelola periode persetujuan dan tanda tangan bulanan dua penanda tangan internal. Tanda tangan
                        Diperiksa Oleh dan Mengetahui baru dapat dilakukan mulai tanggal terakhir bulan itu pukul 00.00
                        WIB (akhir bulan), meskipun periode sudah dibuka lebih awal.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => void handleOpenAll()}
                        className="btn btn-secondary"
                        disabled={openingAll}
                        title="Buka periode bulan ini untuk semua ruangan aktif sekaligus"
                        type="button"
                    >
                        {openingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Buka Semua Ruangan
                    </button>
                    <button
                        onClick={() => openOpenModal()}
                        className="btn btn-primary"
                    >
                        <Plus className="h-4 w-4" /> Buka Periode Baru
                    </button>
                </div>
            </div>

            {/* Controls: Month selector and Status Filter */}
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
                    <span className="text-xs font-medium text-[var(--text-muted)]">Status:</span>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="form-select text-xs py-1.5"
                    >
                        <option value="ALL">Semua Status</option>
                        <option value="WAITING_FOR_SIGNATURES">Menunggu Tanda Tangan</option>
                        <option value="PARTIALLY_SIGNED">Sebagian</option>
                        <option value="COMPLETE">Lengkap</option>
                    </select>
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

            {!loading && !error && filteredApprovals.length === 0 && (
                <div className="text-center py-16 border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--card)]">
                    <FileCheck2 className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
                    <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">Belum Ada Periode Persetujuan</h3>
                    <p className="text-sm text-[var(--text-muted)] mb-4 max-w-md mx-auto">
                        Belum ada periode yang dibuka untuk bulan {formatMonthLabel(month)}. Klik tombol di bawah untuk membuka periode baru.
                    </p>
                    <button
                        onClick={() => openOpenModal()}
                        className="btn btn-primary btn-sm"
                        type="button"
                    >
                        <Plus className="h-4 w-4" /> Buka Periode {formatMonthLabel(month)}
                    </button>
                </div>
            )}

            {!loading && !error && filteredApprovals.length > 0 && (
                <div className="card overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Ruangan</th>
                                    <th>Status</th>
                                    <th>Diperiksa Oleh</th>
                                    <th>Mengetahui</th>
                                    <th>Perubahan Terakhir</th>
                                    <th className="text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredApprovals.map((app) => (
                                    <tr key={app.id}>
                                        <td className="font-semibold text-[var(--text-primary)]">
                                            {app.roomName}
                                        </td>
                                        <td>
                                            {getStatusBadge(app.derivedStatus)}
                                            {app.isSignable === false && app.derivedStatus !== "COMPLETE" && (
                                                <div className="text-[11px] text-[var(--text-muted)] mt-1">
                                                    TTD dibuka {formatOpensOnShort(app.opensOnWibDate)} (akhir bulan)
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div className="font-medium text-[var(--text-primary)]">{app.inspectedBy.employeeName}</div>
                                            {app.inspectedBy.signedAt ? (
                                                <div className="text-xs text-[var(--success)] flex items-center gap-1 mt-0.5">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    {formatDateTime(app.inspectedBy.signedAt)}
                                                </div>
                                            ) : (
                                                <div className="text-xs text-[var(--text-muted)] mt-0.5">Belum ditandatangani</div>
                                            )}
                                            {app.inspectedBy.hasChangedAfter && (
                                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning-border)]">
                                                    Checklist diubah setelah tanda tangan
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="font-medium text-[var(--text-primary)]">{app.knownBy.employeeName}</div>
                                            {app.knownBy.signedAt ? (
                                                <div className="text-xs text-[var(--success)] flex items-center gap-1 mt-0.5">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    {formatDateTime(app.knownBy.signedAt)}
                                                </div>
                                            ) : (
                                                <div className="text-xs text-[var(--text-muted)] mt-0.5">Belum ditandatangani</div>
                                            )}
                                            {app.knownBy.hasChangedAfter && (
                                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning-border)]">
                                                    Checklist diubah setelah tanda tangan
                                                </span>
                                            )}
                                        </td>
                                        <td className="text-xs text-[var(--text-muted)]">
                                            {app.latestChange ? (
                                                <div>
                                                    <div className="font-medium text-[var(--text-secondary)]">{formatDateTime(app.latestChange.timestamp)}</div>
                                                    {app.latestChange.actorName && (
                                                        <div className="text-[11px] opacity-75">oleh {app.latestChange.actorName}</div>
                                                    )}
                                                </div>
                                            ) : (
                                                "-"
                                            )}
                                        </td>
                                        <td className="text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleExportPdf(app.roomId, app.monthWib)}
                                                    className="btn btn-secondary btn-sm"
                                                    type="button"
                                                    title="Ekspor PDF Lembar Kendali"
                                                    disabled={exportingPdfId === `${app.roomId}_${app.monthWib}`}
                                                >
                                                    {exportingPdfId === `${app.roomId}_${app.monthWib}` ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
                                                    ) : (
                                                        <FileDown className="h-3.5 w-3.5 text-[var(--primary)]" />
                                                    )}
                                                    PDF
                                                </button>
                                                <button
                                                    onClick={() => handleViewDetail(app.roomId)}
                                                    className="btn btn-secondary btn-sm"
                                                    type="button"
                                                >
                                                    <Eye className="h-3.5 w-3.5" /> Detail
                                                </button>
                                                <button
                                                    onClick={() => handleOpenReopenModal(app.id, "INSPECTED_BY")}
                                                    className="btn btn-secondary btn-sm !text-[var(--warning)]"
                                                    title="Buka kembali slot tanda tangan"
                                                    type="button"
                                                >
                                                    <RotateCcw className="h-3.5 w-3.5" /> Buka Kembali
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal: Buka Periode Baru */}
            {showOpenModal && (
                <AccessibleModal
                    ariaLabel="Buka Periode Persetujuan"
                    onClose={() => setShowOpenModal(false)}
                    className="!max-w-lg"
                >
                    <div className="modal-header">
                        <div>
                            <h2 className="modal-title">Buka Periode Persetujuan</h2>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                Pilih ruangan dan tentukan dua penanda tangan internal untuk bulan {formatMonthLabel(month)}.
                            </p>
                            {defaultReviewers?.inspectedByEmployeeId && defaultReviewers?.knownByEmployeeId && (
                                <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full bg-[var(--secondary)] text-[var(--text-secondary)] border border-[var(--border)]">
                                    Terisi otomatis dari default (Pengaturan &gt; Reviewer &amp; Atasan) — boleh diubah di sini.
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => setShowOpenModal(false)}
                            aria-label="Tutup modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <form onSubmit={handleOpenPeriod} className="space-y-4">
                        <div className="form-group !mb-0">
                            <label className="form-label">Ruangan</label>
                            <select
                                value={selectedRoomId}
                                onChange={(e) => setSelectedRoomId(e.target.value)}
                                required
                                className="form-select"
                            >
                                <option value="">Pilih Ruangan</option>
                                {rooms.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group !mb-0">
                            <label className="form-label">
                                Diperiksa Oleh (Pemeriksa)
                            </label>
                            <select
                                value={selectedInspectedId}
                                onChange={(e) => setSelectedInspectedId(e.target.value)}
                                required
                                className="form-select"
                            >
                                <option value="">Pilih Karyawan Internal</option>
                                {reviewers.map((rev) => (
                                    <option key={rev.id} value={rev.employeeId}>
                                        {rev.name} ({rev.employeeId})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group !mb-0">
                            <label className="form-label">
                                Mengetahui (Pimpinan / Penanggung Jawab)
                            </label>
                            <select
                                value={selectedKnownId}
                                onChange={(e) => setSelectedKnownId(e.target.value)}
                                required
                                className="form-select"
                            >
                                <option value="">Pilih Karyawan Internal</option>
                                {reviewers.map((rev) => (
                                    <option key={rev.id} value={rev.employeeId}>
                                        {rev.name} ({rev.employeeId})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedInspectedId && selectedKnownId && selectedInspectedId === selectedKnownId && (
                            <p className="text-xs text-[var(--destructive)] font-medium">
                                Pemeriksa dan Mengetahui tidak boleh merupakan orang yang sama.
                            </p>
                        )}

                        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4 mt-4">
                            <button
                                type="button"
                                onClick={() => setShowOpenModal(false)}
                                className="btn btn-secondary"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={savingOpen || selectedInspectedId === selectedKnownId}
                                className="btn btn-primary"
                            >
                                {savingOpen ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                                Buka Periode
                            </button>
                        </div>
                    </form>
                </AccessibleModal>
            )}

            {/* Modal: Buka Kembali (Reopen Slot) */}
            {showReopenModal && (
                <AccessibleModal
                    ariaLabel="Buka Kembali Slot Tanda Tangan"
                    onClose={() => setShowReopenModal(false)}
                    className="!max-w-lg"
                >
                    <div className="modal-header">
                        <div>
                            <h2 className="modal-title">Buka Kembali Slot Tanda Tangan</h2>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                Membuka kembali slot tanda tangan akan mengarsipkan tanda tangan lama dan meminta tanda tangan ulang. Tanda tangan ulang tetap mengikuti aturan akhir bulan.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => setShowReopenModal(false)}
                            aria-label="Tutup modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <form onSubmit={handleReopenSubmit} className="space-y-4">
                        <div className="form-group !mb-0">
                            <label className="form-label">Peran Slot</label>
                            <select
                                value={reopenRole}
                                onChange={(e) => setReopenRole(e.target.value as "INSPECTED_BY" | "KNOWN_BY")}
                                className="form-select"
                            >
                                <option value="INSPECTED_BY">Diperiksa Oleh</option>
                                <option value="KNOWN_BY">Mengetahui</option>
                            </select>
                        </div>

                        <div className="form-group !mb-0">
                            <label className="form-label">
                                Alasan Pembukaan Kembali (Wajib)
                            </label>
                            <textarea
                                value={reopenReason}
                                onChange={(e) => setReopenReason(e.target.value)}
                                required
                                rows={3}
                                placeholder="Contoh: Perlu revisi catatan inspeksi pada checklist sebelum pengesahan."
                                className="form-textarea"
                            />
                        </div>

                        <div className="form-group !mb-0">
                            <label className="form-label">
                                Karyawan Pengganti (Opsional)
                            </label>
                            <select
                                value={replacementId}
                                onChange={(e) => setReplacementId(e.target.value)}
                                className="form-select"
                            >
                                <option value="">Pertahankan Karyawan Saat Ini</option>
                                {reviewers.map((rev) => (
                                    <option key={rev.id} value={rev.employeeId}>
                                        {rev.name} ({rev.employeeId})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4 mt-4">
                            <button
                                type="button"
                                onClick={() => setShowReopenModal(false)}
                                className="btn btn-secondary"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={savingReopen || reopenReason.trim().length < 3}
                                className="btn btn-primary !bg-[var(--warning)] hover:opacity-90"
                            >
                                {savingReopen ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                Konfirmasi Buka Kembali
                            </button>
                        </div>
                    </form>
                </AccessibleModal>
            )}

            {/* Modal: Detail Persetujuan */}
            {showDetailModal && (
                <AccessibleModal
                    ariaLabel="Detail Persetujuan Inspeksi"
                    onClose={() => setShowDetailModal(false)}
                    className="!max-w-4xl !p-6"
                >
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="modal-title">{detailData ? detailData.roomName : "Memuat..."}</h2>
                                {detailData && getStatusBadge(detailData.status)}
                            </div>
                            {detailData && (
                                <>
                                    <p className="text-xs text-[var(--text-muted)] mt-1">
                                        Periode: {formatMonthLabel(detailData.monthWib)}
                                    </p>
                                    {detailData.signable && !detailData.signable.isSignable && (
                                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                            Tanda tangan baru dapat dilakukan mulai {formatOpensOnShort(detailData.signable.opensOnWibDate)} pukul 00.00 WIB (akhir bulan). Status Menunggu saat ini adalah normal.
                                        </p>
                                    )}
                                    {detailData.latestChange && (
                                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                            Perubahan checklist terakhir: {formatDateTime(detailData.latestChange.timestamp)}
                                            {detailData.latestChange.actorName && ` oleh ${detailData.latestChange.actorName}`}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {detailData && (
                                <button
                                    onClick={() => handleExportPdf(detailData.roomId, detailData.monthWib)}
                                    className="btn btn-secondary btn-sm"
                                    type="button"
                                    disabled={exportingPdfId === `${detailData.roomId}_${detailData.monthWib}`}
                                    title="Ekspor PDF Lembar Kendali"
                                >
                                    {exportingPdfId === `${detailData.roomId}_${detailData.monthWib}` ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
                                    ) : (
                                        <FileDown className="h-3.5 w-3.5 text-[var(--primary)]" />
                                    )}
                                    Export PDF
                                </button>
                            )}
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => setShowDetailModal(false)}
                                aria-label="Tutup modal"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {detailLoading && (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
                        </div>
                    )}

                    {!detailLoading && detailData && (
                        <div>
                            {/* Ringkasan harian bulan ini */}
                            {detailData.days && detailData.days.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                                        Ringkasan Harian Bulan Ini
                                    </h3>
                                    <div className="overflow-x-auto border border-[var(--border)] rounded-xl p-2.5 bg-[var(--secondary)]/30">
                                        <div className="flex gap-1.5 min-w-max">
                                            {detailData.days.map((d) => (
                                                <div
                                                    key={d.date}
                                                    className={`w-8 h-11 rounded-lg flex flex-col items-center justify-center text-[10px] font-medium border ${
                                                        d.status === "SELESAI"
                                                            ? "bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]"
                                                            : d.status === "FUTURE"
                                                                ? "bg-[var(--secondary)] text-[var(--text-muted)] border-[var(--border)]"
                                                                : d.status === "LIBUR"
                                                                    ? "bg-gray-100 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400 border-[var(--border)]"
                                                                    : "bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]"
                                                    }`}
                                                    title={`${d.date}: ${d.status === "SELESAI" ? "Selesai" : d.status === "FUTURE" ? "Hari depan" : d.status === "LIBUR" ? "Libur (bebas paraf)" : "Belum"} (${d.completedCount}/${d.activeCount} selesai)`}
                                                >
                                                    <span className="font-semibold">{parseInt(d.date.split("-")[2], 10)}</span>
                                                    <span className="text-[8px] font-bold">
                                                        {d.status === "SELESAI" ? "Selesai" : d.status === "FUTURE" ? "-" : d.status === "LIBUR" ? "Libur" : "Belum"}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--text-muted)]">
                                        <span className="inline-flex items-center gap-1">
                                            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--success)]" /> Selesai
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--warning)]" /> Belum
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--border)]" /> - : hari depan (belum bisa diisi)
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-300 dark:bg-gray-700" /> Libur (bebas paraf)
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Dua kartu tanda tangan */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                {/* Diperiksa Oleh Card */}
                                <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--secondary)]/20">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Diperiksa Oleh
                                        </span>
                                        {detailData.inspectedBy?.signature ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)]">
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Sudah Ditandatangani
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--secondary)] text-[var(--text-muted)] border border-[var(--border)]">
                                                <Clock className="h-3.5 w-3.5" /> Menunggu Tanda Tangan
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm font-bold text-[var(--text-primary)]">
                                        {detailData.inspectedBy?.employeeName}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)] mb-3">
                                        {detailData.inspectedBy?.employeeName} — NIP: {detailData.inspectedBy?.employeeId}
                                    </p>

                                    {detailData.inspectedBy?.signature ? (
                                        <div>
                                            <div className="bg-white dark:bg-[#0D0D11] border border-[var(--border)] rounded-lg p-2 flex items-center justify-center h-32 mb-2">
                                                <img
                                                    src={detailData.inspectedBy.signature.signaturePayload}
                                                    alt="Tanda tangan Diperiksa Oleh"
                                                    className="max-h-full max-w-full object-contain"
                                                />
                                            </div>
                                            <p className="text-xs text-[var(--text-muted)]">
                                                Ditandatangani pada: {formatDateTime(detailData.inspectedBy.signature.signedAt)}
                                            </p>
                                            {detailData.inspectedBy.signature.hasChangedAfter && (
                                                <div className="mt-2 p-2.5 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning-border)] text-xs text-[var(--warning)] font-medium">
                                                    Perhatian: Terdapat perubahan checklist setelah tanda tangan ini disimpan.
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="border border-dashed border-[var(--border)] rounded-lg h-32 flex items-center justify-center text-xs text-[var(--text-muted)]">
                                            Belum ada tanda tangan
                                        </div>
                                    )}
                                </div>

                                {/* Mengetahui Card */}
                                <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--secondary)]/20">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                            Mengetahui
                                        </span>
                                        {detailData.knownBy?.signature ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)]">
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Sudah Ditandatangani
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--secondary)] text-[var(--text-muted)] border border-[var(--border)]">
                                                <Clock className="h-3.5 w-3.5" /> Menunggu Tanda Tangan
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm font-bold text-[var(--text-primary)]">
                                        {detailData.knownBy?.employeeName}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)] mb-3">
                                        {detailData.knownBy?.employeeName} — NIP: {detailData.knownBy?.employeeId}
                                    </p>

                                    {detailData.knownBy?.signature ? (
                                        <div>
                                            <div className="bg-white dark:bg-[#0D0D11] border border-[var(--border)] rounded-lg p-2 flex items-center justify-center h-32 mb-2">
                                                <img
                                                    src={detailData.knownBy.signature.signaturePayload}
                                                    alt="Tanda tangan Mengetahui"
                                                    className="max-h-full max-w-full object-contain"
                                                />
                                            </div>
                                            <p className="text-xs text-[var(--text-muted)]">
                                                Ditandatangani pada: {formatDateTime(detailData.knownBy.signature.signedAt)}
                                            </p>
                                            {detailData.knownBy.signature.hasChangedAfter && (
                                                <div className="mt-2 p-2.5 rounded-lg bg-[var(--warning-bg)] border border-[var(--warning-border)] text-xs text-[var(--warning)] font-medium">
                                                    Perhatian: Terdapat perubahan checklist setelah tanda tangan ini disimpan.
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="border border-dashed border-[var(--border)] rounded-lg h-32 flex items-center justify-center text-xs text-[var(--text-muted)]">
                                            Belum ada tanda tangan
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Riwayat tanda tangan */}
                            {detailData.history && detailData.history.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">
                                        Riwayat Tanda Tangan & Pembukaan Kembali
                                    </h3>
                                    <div className="border border-[var(--border)] rounded-xl divide-y divide-[var(--border)] overflow-hidden bg-[var(--card)]">
                                        {detailData.history.map((hist) => (
                                            <div key={hist.id} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                <div>
                                                    <div className="font-semibold text-[var(--text-primary)]">
                                                        {hist.role === "INSPECTED_BY" ? "Diperiksa Oleh" : "Mengetahui"} (v{hist.version}): {hist.employeeName}
                                                    </div>
                                                    <div className="text-[var(--text-muted)] mt-0.5">
                                                        Ditandatangani: {formatDateTime(hist.signedAt)}
                                                    </div>
                                                    {hist.reopenedAt && (
                                                        <div className="text-[var(--warning)] mt-1 font-medium">
                                                            Dibuka kembali: {formatDateTime(hist.reopenedAt)}
                                                            {hist.reopenedByName && ` oleh ${hist.reopenedByName}`}
                                                            {hist.reopenReason && ` · Alasan: "${hist.reopenReason}"`}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase self-start sm:self-center ${
                                                    hist.status === "SIGNED"
                                                        ? "bg-[var(--success-bg)] text-[var(--success)]"
                                                        : "bg-[var(--warning-bg)] text-[var(--warning)]"
                                                }`}>
                                                    {hist.status === "SIGNED" ? "Sudah ditandatangani" : "Dibuka kembali"}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </AccessibleModal>
            )}
        </div>
    );
}
