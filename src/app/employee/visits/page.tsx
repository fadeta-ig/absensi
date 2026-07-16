"use client";

import { useState, useEffect } from "react";
import { MapPinned, Plus, Filter, CheckCircle, AlertCircle } from "lucide-react";
import { VisitReport, VisitStatus } from "@/types";
import { VISIT_FILTER_OPTIONS, VISIT_STATUS_CONFIG } from "./visitTypes";
import { VisitCard } from "./components/VisitCard";
import { CreateDraftModal } from "./components/CreateDraftModal";
import { ClockInModal } from "./components/ClockInModal";
import { ClockOutModal } from "./components/ClockOutModal";
import { VisitDetailModal } from "./components/VisitDetailModal";

type ModalState =
    | { type: "none" }
    | { type: "create_draft" }
    | { type: "clock_in"; visit: VisitReport }
    | { type: "clock_out"; visit: VisitReport }
    | { type: "detail"; visit: VisitReport };

const ITEMS_PER_PAGE = 6;

export default function VisitsPage() {
    const [visits, setVisits] = useState<VisitReport[]>([]);
    const [filterStatus, setFilterStatus] = useState<VisitStatus | "all">("all");
    const [modal, setModal] = useState<ModalState>({ type: "none" });
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterStatus]);

    useEffect(() => {
        fetch("/api/visits")
            .then((r) => r.json())
            .then(setVisits)
            .catch(() => setMessage({ type: "error", text: "Gagal memuat data kunjungan." }));
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

    const handleDelete = async (visit: VisitReport) => {
        if (!confirm("Hapus draft kunjungan ini?")) return;
        try {
            const res = await fetch(`/api/visits?id=${visit.id}`, { method: "DELETE" });
            if (res.ok) {
                setVisits((prev) => prev.filter((v) => v.id !== visit.id));
                setMessage({ type: "success", text: "Draft kunjungan berhasil dihapus." });
            } else {
                const data = await res.json();
                setMessage({ type: "error", text: data.error || "Gagal menghapus draft." });
            }
        } catch {
            setMessage({ type: "error", text: "Terjadi kesalahan koneksi." });
        }
    };

    const filtered = filterStatus === "all" ? visits : visits.filter((v) => v.status === filterStatus);
    const paginatedVisits = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;

    // Status counts
    const statusCounts: Record<string, number> = { all: visits.length };
    for (const opt of VISIT_FILTER_OPTIONS) {
        if (opt.key !== "all") {
            statusCounts[opt.key] = visits.filter((v) => v.status === opt.key).length;
        }
    }

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease] pb-20 lg:pb-0">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <MapPinned className="w-5 h-5 text-[var(--primary)]" />
                        Kunjungan Dinas
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Buat draft, clock in, dan clock out kunjungan
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => setModal({ type: "create_draft" })}
                >
                    <Plus className="w-4 h-4" /> Buat Draft
                </button>
            </div>

            {/* Message */}
            {message && (
                <div
                    className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${
                        message.type === "success"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-red-50 text-red-700 border-red-200"
                    }`}
                >
                    {message.type === "success" ? (
                        <CheckCircle className="w-4 h-4 shrink-0" />
                    ) : (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    {message.text}
                </div>
            )}

            {/* Filter */}
            <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-4 h-4 text-[var(--text-muted)]" />
                {VISIT_FILTER_OPTIONS.map((opt) => (
                    <button
                        key={opt.key}
                        onClick={() => setFilterStatus(opt.key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                            filterStatus === opt.key
                                ? "bg-[var(--primary)] text-white"
                                : "bg-[var(--secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                        }`}
                    >
                        {opt.label}
                        {statusCounts[opt.key] > 0 && (
                            <span className="ml-1 opacity-70">({statusCounts[opt.key]})</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Visit List */}
            {filtered.length === 0 ? (
                <div className="card p-12 text-center border-dashed">
                    <MapPinned className="w-12 h-12 text-[var(--border)] mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-[var(--text-primary)]">Belum ada kunjungan</h3>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                        Buat draft kunjungan untuk memulai
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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

                    {filtered.length > ITEMS_PER_PAGE && (
                        <div className="flex justify-between items-center px-4 py-3 border-t border-[var(--border)]">
                            <button
                                className="btn btn-secondary btn-sm"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage((p) => p - 1)}
                            >
                                Prev
                            </button>
                            <span className="text-xs font-medium text-[var(--text-muted)]">
                                Halaman {currentPage} dari {totalPages}
                            </span>
                            <button
                                className="btn btn-secondary btn-sm"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage((p) => p + 1)}
                            >
                                Next
                            </button>
                        </div>
                    )}
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
