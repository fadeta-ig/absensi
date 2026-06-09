"use client";

import { useState, useEffect } from "react";
import {
    FileText, Search, Filter
} from "lucide-react";
import { useToast } from "@/components/Toast";

import { LetterRequestTable } from "./components/LetterRequestTable";
import { LetterDetailModal } from "./components/LetterDetailModal";
import { LetterActionModal } from "./components/LetterActionModal";
import { LetterRequest, LetterStatus, LetterType, TYPE_CONFIG, STATUS_CONFIG } from "./types";

const ITEMS_PER_PAGE = 10;

function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString("id-ID", {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LetterRequestsPage() {
    const toast = useToast();

    const [requests, setRequests]       = useState<LetterRequest[]>([]);
    const [loading, setLoading]         = useState(true);
    const [search, setSearch]           = useState("");
    const [statusFilter, setStatusFilter] = useState<LetterStatus | "ALL">("ALL");
    const [typeFilter, setTypeFilter]   = useState<LetterType | "ALL">("ALL");
    const [currentPage, setCurrentPage] = useState(1);

    // Action modal
    const [actionTarget, setActionTarget]   = useState<LetterRequest | null>(null);
    const [actionType, setActionType]       = useState<"PROCESSING" | "READY" | "REJECTED">("PROCESSING");
    const [actionNotes, setActionNotes]     = useState("");
    const [submitting, setSubmitting]       = useState(false);

    // Detail modal
    const [detail, setDetail] = useState<LetterRequest | null>(null);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        fetch("/api/letter-requests")
            .then((r) => r.json())
            .then((data: LetterRequest[]) => { if (Array.isArray(data)) setRequests(data); })
            .catch(() => toast("Gagal memuat data surat", "error"))
            .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Filter Logic ──────────────────────────────────────────────────────────
    const filtered = requests.filter((r) => {
        if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
        if (typeFilter !== "ALL" && r.type !== typeFilter) return false;
        if (search) {
            const q = search.toLowerCase();
            const nameMatch = r.employeeName?.toLowerCase().includes(q);
            const idMatch = r.employeeId.toLowerCase().includes(q);
            const purposeMatch = r.purpose.toLowerCase().includes(q);
            if (!nameMatch && !idMatch && !purposeMatch) return false;
        }
        return true;
    });

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
    const paginated  = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => { setCurrentPage(1); }, [search, statusFilter, typeFilter]);

    // ── Summary Stats ─────────────────────────────────────────────────────────
    const countByStatus = (s: LetterStatus) => requests.filter((r) => r.status === s).length;

    // ── Action Handler ────────────────────────────────────────────────────────
    const handleAction = async () => {
        if (!actionTarget) return;
        setSubmitting(true);

        try {
            const res = await fetch("/api/letter-requests", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: actionTarget.id,
                    status: actionType,
                    notes: actionNotes.trim() || null,
                }),
            });

            if (res.ok) {
                const updated = await res.json() as LetterRequest;
                setRequests((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
                setActionTarget(null);
                setActionNotes("");
                toast(`Status berhasil diubah ke "${STATUS_CONFIG[actionType].label}"`, "success");
            } else {
                const err = await res.json() as { error?: string };
                toast(err.error ?? "Gagal mengubah status", "error");
            }
        } catch {
            toast("Terjadi kesalahan koneksi", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const openAction = (req: LetterRequest, type: "PROCESSING" | "READY" | "REJECTED") => {
        setActionTarget(req);
        setActionType(type);
        setActionNotes(req.notes ?? "");
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[var(--primary)]" />
                    Manajemen Surat Karyawan
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Kelola permintaan surat keterangan dari karyawan
                </p>
            </div>

            {/* ── Summary Cards ───────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(["PENDING", "PROCESSING", "READY", "REJECTED"] as LetterStatus[]).map((s) => {
                    const cfg = STATUS_CONFIG[s];
                    const StatusIcon = cfg.icon;
                    return (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(statusFilter === s ? "ALL" : s)}
                            className={`card p-4 text-center transition-all cursor-pointer ${statusFilter === s ? "ring-2 ring-[var(--primary)] bg-[var(--primary)]/5" : "hover:shadow-md"}`}
                        >
                            <StatusIcon className={`w-5 h-5 mx-auto mb-2 ${s === "PENDING" ? "text-orange-500" : s === "PROCESSING" ? "text-blue-500" : s === "READY" ? "text-green-500" : "text-red-500"}`} />
                            <p className="text-2xl font-extrabold text-[var(--text-primary)]">{countByStatus(s)}</p>
                            <p className="text-xs text-[var(--text-muted)] font-semibold mt-0.5">{cfg.label}</p>
                        </button>
                    );
                })}
            </div>

            {/* ── Filters ─────────────────────────────────────────────────── */}
            <div className="card p-4">
                <div className="flex flex-wrap gap-3">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            className="form-input pl-10"
                            placeholder="Cari nama, ID, atau tujuan..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="relative min-w-[160px]">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <select
                            className="form-select pl-10"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as LetterType | "ALL")}
                        >
                            <option value="ALL">Semua Jenis</option>
                            {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Table ───────────────────────────────────────────────────── */}
            <LetterRequestTable
                loading={loading}
                filteredLength={filtered.length}
                paginated={paginated}
                currentPage={currentPage}
                totalPages={totalPages}
                ITEMS_PER_PAGE={ITEMS_PER_PAGE}
                setCurrentPage={setCurrentPage}
                setDetail={setDetail}
                openAction={openAction}
                fmtDate={fmtDate}
            />

            {/* ── Detail Modal ────────────────────────────────────────────── */}
            {detail && (
                <LetterDetailModal
                    detail={detail}
                    setDetail={setDetail}
                    openAction={openAction}
                    fmtDate={fmtDate}
                />
            )}

            {/* ── Action Modal ────────────────────────────────────────────── */}
            {actionTarget && (
                <LetterActionModal
                    actionTarget={actionTarget}
                    setActionTarget={setActionTarget}
                    actionType={actionType}
                    submitting={submitting}
                    actionNotes={actionNotes}
                    setActionNotes={setActionNotes}
                    handleAction={handleAction}
                />
            )}
        </div>
    );
}
