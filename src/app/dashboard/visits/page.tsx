"use client";

import { useEffect, useState } from "react";
import { MapPinned, Search, Filter } from "lucide-react";
import { VisitStatus } from "@/types";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage } from "@/lib/clientErrors";

import { VisitListTable } from "./components/VisitListTable";
import { VisitDetailModal } from "./components/VisitDetailModal";
import { VisitReport, STATUS_CONFIG, FILTER_OPTIONS } from "./types";

export default function DashboardVisitsPage() {
    const toast = useToast();
    const [visits, setVisits] = useState<VisitReport[]>([]);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<"all" | "unchecked" | "checked">("all");
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
            toast(err instanceof Error ? err.message : "Gagal memperbarui status kunjungan.", "error");
        } finally {
            setUpdating(null);
        }
    };

    const filtered = visits.filter((v) => {
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
        return matchSearch && matchStatus;
    });

    const statusCounts = {
        all: visits.length,
        draft: visits.filter((v) => v.status === "draft").length,
        clocked_in: visits.filter((v) => v.status === "clocked_in").length,
        unchecked: visits.filter((v) => v.status === "clocked_out" && !v.hrChecked).length,
        checked: visits.filter((v) => v.status === "clocked_out" && v.hrChecked).length,
    };

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

            {/* Search & Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        className="form-input pl-10"
                        placeholder="Cari nama, ID karyawan, klien, atau tujuan..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="w-4 h-4 text-[var(--text-muted)]" />
                    {FILTER_OPTIONS.map((opt) => (
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
                        </button>
                    ))}
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
