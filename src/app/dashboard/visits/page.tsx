"use client";

import { useEffect, useState, useMemo } from "react";
import { MapPinned, Search, Filter, Calendar, RotateCcw } from "lucide-react";
import { VisitStatus } from "@/types";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { getToday, getThisWeekRange, getThisMonthRange, isDateInRange } from "@/lib/datePresets";

import { VisitListTable } from "./components/VisitListTable";
import { VisitDetailModal } from "./components/VisitDetailModal";
import { VisitReport, STATUS_CONFIG, FILTER_OPTIONS } from "./types";

export default function DashboardVisitsPage() {
    const toast = useToast();
    const [visits, setVisits] = useState<VisitReport[]>([]);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<"all" | "unchecked" | "checked">("all");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [datePreset, setDatePreset] = useState<"all" | "today" | "this_week" | "this_month" | "custom">("all");
    const [selectedVisit, setSelectedVisit] = useState<VisitReport | null>(null);
    const [updating, setUpdating] = useState<string | null>(null);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    useEffect(() => {
        const loadVisits = async () => {
            setInitialLoading(true);
            setLoadError("");
            try {
                const res = await fetch("/api/visits");
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat laporan kunjungan."));
                const data = await res.json();
                setVisits(Array.isArray(data) ? data : []);
            } catch (error) {
                reportClientError("DashboardVisitsPage", "Gagal memuat laporan kunjungan", error);
                const message = error instanceof Error ? error.message : "Gagal memuat laporan kunjungan.";
                setLoadError(message);
                setVisits([]);
                toast(message, "error");
            } finally {
                setInitialLoading(false);
            }
        };

        void loadVisits();
    }, [toast]);

    const handleStatusUpdate = async (id: string, isChecked: boolean) => {
        setUpdating(id);
        try {
            const res = await fetch("/api/visits", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "verify",
                    id,
                    hrChecked: isChecked,
                }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memperbarui status kunjungan."));
            const updated = await res.json();
            setVisits((prev) => prev.map((v) => (v.id === id ? updated : v)));
            if (selectedVisit?.id === id) setSelectedVisit(updated);
            toast(isChecked ? "Kunjungan ditandai sudah dicek." : "Status cek kunjungan dibatalkan.", "success");
        } catch (err) {
            reportClientError("DashboardVisitsPage", "Gagal memperbarui status kunjungan", err, { visitId: id, isChecked });
            toast(err instanceof Error ? err.message : "Gagal memperbarui status kunjungan.", "error");
        } finally {
            setUpdating(null);
        }
    };

    const filtered = useMemo(() => {
        return visits.filter((v) => {
            const searchLower = search.toLowerCase();
            const matchSearch = v.clientName.toLowerCase().includes(searchLower) ||
                v.employeeId.toLowerCase().includes(searchLower) ||
                (v.employeeName || "").toLowerCase().includes(searchLower) ||
                v.purpose.toLowerCase().includes(searchLower);
            let matchStatus = true;
            if (filterStatus === "unchecked") {
                matchStatus = !v.hrChecked;
            } else if (filterStatus === "checked") {
                matchStatus = v.hrChecked;
            }
            const matchDate = isDateInRange(v.date, startDate || undefined, endDate || undefined);
            return matchSearch && matchStatus && matchDate;
        });
    }, [visits, search, filterStatus, startDate, endDate]);

    const statusCounts = {
        all: visits.length,
        draft: visits.filter((v) => v.status === "draft").length,
        clocked_in: visits.filter((v) => v.status === "clocked_in").length,
        unchecked: visits.filter((v) => v.status === "clocked_out" && !v.hrChecked).length,
        checked: visits.filter((v) => v.status === "clocked_out" && v.hrChecked).length,
    };

    const applyDatePreset = (preset: "all" | "today" | "this_week" | "this_month") => {
        setDatePreset(preset);
        if (preset === "all") {
            setStartDate("");
            setEndDate("");
        } else if (preset === "today") {
            const today = getToday();
            setStartDate(today);
            setEndDate(today);
        } else if (preset === "this_week") {
            const range = getThisWeekRange();
            setStartDate(range.start);
            setEndDate(range.end);
        } else if (preset === "this_month") {
            const range = getThisMonthRange();
            setStartDate(range.start);
            setEndDate(range.end);
        }
    };

    const resetFilters = () => {
        setSearch("");
        setFilterStatus("all");
        setStartDate("");
        setEndDate("");
        setDatePreset("all");
    };

    const hasActiveFilters = Boolean(search || filterStatus !== "all" || startDate || endDate);

    const activeFilterCount = [
        Boolean(search),
        filterStatus !== "all",
        Boolean(startDate || endDate),
    ].filter(Boolean).length;

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <MapPinned className="w-5 h-5 text-[var(--primary)]" />
                    Manajemen Kunjungan
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">{visits.length} laporan kunjungan</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                    { label: "Total", count: statusCounts.all, color: "bg-blue-50 text-blue-700 border-blue-200" },
                    { label: "Draft", count: statusCounts.draft, color: "bg-gray-50 text-gray-700 border-gray-200" },
                    { label: "Clock In", count: statusCounts.clocked_in, color: "bg-sky-50 text-sky-700 border-sky-200" },
                    { label: "Belum Dicek", count: statusCounts.unchecked, color: "bg-red-50 text-red-700 border-red-200" },
                    { label: "Sudah Dicek", count: statusCounts.checked, color: "bg-green-50 text-green-700 border-green-200" },
                ].map((stat) => (
                    <div key={stat.label} className={`p-3 rounded-xl border ${stat.color}`}>
                        <p className="text-2xl font-bold">{stat.count}</p>
                        <p className="text-xs font-medium">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Search & Filter Bar */}
            <div className="card p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
                    <div className="relative sm:col-span-2 lg:col-span-5">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            type="text"
                            className="form-input pl-10 w-full"
                            placeholder="Cari nama, ID karyawan, klien, atau tujuan..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="lg:col-span-3 flex items-center gap-1.5 flex-wrap">
                        {FILTER_OPTIONS.map((opt) => (
                            <button
                                key={opt.key}
                                type="button"
                                onClick={() => setFilterStatus(opt.key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                    filterStatus === opt.key
                                        ? "bg-[var(--primary)] text-white shadow-sm"
                                        : "bg-[var(--secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5 sm:col-span-2 lg:col-span-4">
                        <div className="relative flex-1">
                            <input
                                type="date"
                                className="form-input text-xs w-full"
                                value={startDate}
                                onChange={(e) => { setStartDate(e.target.value); setDatePreset("custom"); }}
                                title="Tanggal Mulai"
                            />
                        </div>
                        <span className="text-xs text-[var(--text-muted)] shrink-0">s/d</span>
                        <div className="relative flex-1">
                            <input
                                type="date"
                                className="form-input text-xs w-full"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setDatePreset("custom"); }}
                                title="Tanggal Selesai"
                            />
                        </div>
                    </div>
                </div>

                {/* Secondary Row: Quick Date Presets & Reset */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-[var(--text-muted)] mr-1 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            Periode:
                        </span>
                        {[
                            { key: "all", label: "Semua" },
                            { key: "today", label: "Hari Ini" },
                            { key: "this_week", label: "Minggu Ini" },
                            { key: "this_month", label: "Bulan Ini" },
                        ].map((preset) => (
                            <button
                                key={preset.key}
                                type="button"
                                onClick={() => applyDatePreset(preset.key as "all" | "today" | "this_week" | "this_month")}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                    datePreset === preset.key
                                        ? "bg-[var(--primary)] text-white shadow-sm"
                                        : "bg-[var(--secondary)]/50 text-[var(--text-secondary)] hover:bg-[var(--secondary)]"
                                }`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        {activeFilterCount > 0 && (
                            <span className="text-xs font-medium text-[var(--primary)] bg-[var(--primary)]/10 px-2.5 py-0.5 rounded-full">
                                {activeFilterCount} filter aktif
                            </span>
                        )}
                        {hasActiveFilters && (
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Reset Filter
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Table */}
            <VisitListTable
                filtered={filtered}
                loading={initialLoading}
                error={loadError}
                updating={updating}
                setSelectedVisit={setSelectedVisit}
                handleStatusUpdate={handleStatusUpdate}
            />

            {/* Detail Modal */}
            {selectedVisit && (
                <VisitDetailModal
                    selectedVisit={selectedVisit}
                    setSelectedVisit={setSelectedVisit}
                    updating={updating}
                    handleStatusUpdate={handleStatusUpdate}
                />
            )}
        </div>
    );
}
