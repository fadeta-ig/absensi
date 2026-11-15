"use client";

import { useState, useEffect } from "react";
import { MapPinned, Plus, Filter } from "lucide-react";
import { VisitReport } from "@/types";
import { VISIT_FILTER_OPTIONS } from "./visitTypes";
import { VisitCard } from "./components/VisitCard";
import { CreateDraftModal } from "./components/CreateDraftModal";
import { ClockInModal } from "./components/ClockInModal";
import { ClockOutModal } from "./components/ClockOutModal";
import { VisitDetailModal } from "./components/VisitDetailModal";
import { useConfirm } from "@/components/ConfirmModal";
import DataTablePagination from "@/components/ui/DataTablePagination";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

const VISITS_FILTER_KEY = "employee-visits-filter";

type VisitFilter = "all" | "draft" | "clocked_in" | "unchecked" | "checked";

function readVisitsFilter(): VisitFilter {
    try {
        const v = window.sessionStorage.getItem(VISITS_FILTER_KEY);
        if (v === "draft" || v === "clocked_in" || v === "unchecked" || v === "checked" || v === "all") return v;
    } catch {
        // abaikan (mode privat)
    }
    return "all";
}

type ModalState =
    | { type: "none" }
    | { type: "create_draft" }
    | { type: "clock_in"; visit: VisitReport }
    | { type: "clock_out"; visit: VisitReport }
    | { type: "detail"; visit: VisitReport };

export default function VisitsPage() {
    const confirm = useConfirm();
    const [visits, setVisits] = useState<VisitReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<VisitFilter>(() => readVisitsFilter());

    useEffect(() => {
        try {
            window.sessionStorage.setItem(VISITS_FILTER_KEY, filterStatus);
        } catch {
            // abaikan (mode privat)
        }
    }, [filterStatus]);
    const [modal, setModal] = useState<ModalState>({ type: "none" });
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);

    useEffect(() => {
        let cancelled = false;

        const loadVisits = async () => {
            setLoading(true);
            try {
                const response = await fetch("/api/visits");
                if (!response.ok) {
                    throw new Error(await getResponseErrorMessage(response, "Data kunjungan tidak dapat dimuat."));
                }
                const data = await response.json();
                if (Array.isArray(data)) {
                    if (cancelled) return;
                    setVisits(data);
                } else {
                    throw new Error("Format data kunjungan tidak valid.");
                }
            } catch (error) {
                reportClientError("EmployeeVisitsPage", "Gagal memuat data kunjungan", error);
                if (!cancelled) {
                    setVisits([]);
                    setMessage({ type: "error", text: error instanceof Error ? error.message : "Data kunjungan tidak dapat dimuat. Periksa koneksi internet lalu coba lagi." });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void loadVisits();
        return () => {
            cancelled = true;
        };
    }, []);

    // Auto-hide message after 5 seconds
    useEffect(() => {
        if (!message) return;
        const timer = setTimeout(() => setMessage(null), 5000);
        return () => clearTimeout(timer);
    }, [message]);

    const updateVisitInList = (updated: VisitReport) => {
        setVisits((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    };

    const handleCreated = (visit: VisitReport) => {
        setVisits((prev) => [visit, ...prev]);
        setMessage({ type: "success", text: "Draft kunjungan berhasil dibuat!" });
    };

    const handleClockIn = (updated: VisitReport) => {
        updateVisitInList(updated);
        setMessage({ type: "success", text: "Clock In berhasil!" });
    };

    const handleClockOut = (updated: VisitReport) => {
        updateVisitInList(updated);
        setMessage({ type: "success", text: "Clock Out berhasil! Menunggu persetujuan HR." });
    };

    const handleDelete = (visit: VisitReport) => {
        confirm({
            title: "Hapus Draft Kunjungan?",
            message: `Draft kunjungan ke ${visit.clientName} akan dihapus dari daftar kunjungan Anda.`,
            confirmLabel: "Hapus Draft",
            cancelLabel: "Batal",
            variant: "danger",
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/visits?id=${visit.id}`, { method: "DELETE" });
                    if (res.ok) {
                        setVisits((prev) => prev.filter((v) => v.id !== visit.id));
                        setMessage({ type: "success", text: "Draft kunjungan berhasil dihapus." });
                    } else {
                        setMessage({ type: "error", text: await getResponseErrorMessage(res, "Draft kunjungan gagal dihapus. Coba lagi.") });
                    }
                } catch (error) {
                    reportClientError("EmployeeVisitsPage", "Gagal menghapus draft kunjungan", error, { visitId: visit.id });
                    setMessage({ type: "error", text: "Draft kunjungan belum terhapus karena koneksi bermasalah. Periksa internet lalu coba lagi." });
                }
            }
        });
    };

    const filtered = visits.filter((v) => {
        if (filterStatus === "all") return true;
        if (filterStatus === "draft" || filterStatus === "clocked_in") return v.status === filterStatus;
        if (filterStatus === "unchecked") return v.status === "clocked_out" && !v.hrChecked;
        if (filterStatus === "checked") return v.status === "clocked_out" && v.hrChecked;
        return true;
    });
    
    const paginatedVisits = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;

    // Status counts
    const statusCounts = {
        all: visits.length,
        draft: visits.filter((v) => v.status === "draft").length,
        clocked_in: visits.filter((v) => v.status === "clocked_in").length,
        unchecked: visits.filter((v) => v.status === "clocked_out" && !v.hrChecked).length,
        checked: visits.filter((v) => v.status === "clocked_out" && v.hrChecked).length,
    };

    return (
        <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
            <PageHeader
                title="Kunjungan Dinas"
                subtitle="Buat draft, clock in, dan clock out kunjungan"
                icon={MapPinned}
                action={
                    <button
                        className="btn btn-primary"
                        onClick={() => setModal({ type: "create_draft" })}
                    >
                        <Plus className="w-4 h-4" /> Buat Draft
                    </button>
                }
            />

            {/* Message */}
            {message && (
                <FeedbackMessage variant={message.type}>
                    {message.text}
                </FeedbackMessage>
            )}

            {/* Filter */}
            <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter status kunjungan">
                <Filter className="w-4 h-4 text-[var(--text-muted)]" />
                {VISIT_FILTER_OPTIONS.map((opt) => (
                    <button
                        key={opt.key}
                        onClick={() => { setFilterStatus(opt.key); setCurrentPage(1); }}
                        aria-pressed={filterStatus === opt.key}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            filterStatus === opt.key
                                ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]"
                                : "border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--secondary)]"
                        }`}
                    >
                        {opt.label}
                        {statusCounts[opt.key as keyof typeof statusCounts] > 0 && (
                            <span className="ml-1 opacity-70">({statusCounts[opt.key as keyof typeof statusCounts]})</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Visit List */}
            {loading ? (
                <ListSkeleton label="Memuat kunjungan" />
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={MapPinned}
                    title="Belum ada kunjungan"
                    description="Buat draft kunjungan untuk memulai"
                />
            ) : (
                <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3">
                        {paginatedVisits.map((visit) => (
                            <VisitCard
                                key={visit.id}
                                visit={visit}
                                onSelect={(v) => setModal({ type: "detail", visit: v })}
                                onClockIn={(v) => setModal({ type: "clock_in", visit: v })}
                                onClockOut={(v) => setModal({ type: "clock_out", visit: v })}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>

                    <DataTablePagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filtered.length}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                        pageSizeOptions={[5, 10, 20]}
                        itemLabel="kunjungan"
                    />
                </div>
            )}

            {/* Modals */}
            {modal.type === "create_draft" && (
                <CreateDraftModal
                    onClose={() => setModal({ type: "none" })}
                    onCreated={handleCreated}
                />
            )}
            {modal.type === "clock_in" && (
                <ClockInModal
                    visit={modal.visit}
                    onClose={() => setModal({ type: "none" })}
                    onClockIn={handleClockIn}
                />
            )}
            {modal.type === "clock_out" && (
                <ClockOutModal
                    visit={modal.visit}
                    onClose={() => setModal({ type: "none" })}
                    onClockOut={handleClockOut}
                />
            )}
            {modal.type === "detail" && (
                <VisitDetailModal
                    visit={modal.visit}
                    onClose={() => setModal({ type: "none" })}
                />
            )}
        </div>
    );
}
