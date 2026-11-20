"use client";

import { formatDisplayDate, formatDisplayTime } from "@/lib/utils";

import { useState, useEffect } from "react";
import {
    Clock4, Plus, Loader2, X,
    Calendar, Clock, FileText, Filter
} from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
import { useToast } from "@/components/Toast";
import DataTablePagination from "@/components/ui/DataTablePagination";
import EmptyState from "@/components/ui/EmptyState";
import ListSkeleton from "@/components/ui/ListSkeleton";
import PageHeader from "@/components/ui/PageHeader";
import StateCard from "@/components/ui/StateCard";
import StatusBadge, { type StatusTone } from "@/components/ui/StatusBadge";
import DraftNotice from "@/components/ui/DraftNotice";
import { useEmployeeDraft } from "@/hooks/useEmployeeDraft";
import { isPlainObject } from "@/lib/formPersistence";

interface OvertimeRequest {
    id: string;
    employeeId: string;
    date: string;
    startTime: string;
    endTime: string;
    hours: number;
    reason: string;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
}

const STATUS_CONFIG: Record<OvertimeRequest["status"], { label: string; tone: StatusTone }> = {
    pending: { label: "Menunggu", tone: "warning" },
    approved: { label: "Disetujui", tone: "success" },
    rejected: { label: "Ditolak", tone: "danger" },
};

export default function EmployeeOvertimePage() {
    const [requests, setRequests] = useState<OvertimeRequest[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingList, setLoadingList] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const toast = useToast();

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);

    const [defaultDate] = useState(() => new Date().toISOString().split("T")[0]);
    const [form, setForm] = useState({
        date: defaultDate,
        startTime: "17:00",
        endTime: "19:00",
        reason: "",
        isHoliday: false,
    });

    const {
        restored: overtimeDraftRestored,
        clearDraft: clearOvertimeDraft,
        discardDraft: discardOvertimeDraft,
    } = useEmployeeDraft<{
        showForm: boolean;
        date: string;
        startTime: string;
        endTime: string;
        reason: string;
        isHoliday: boolean;
    }>({
        formKey: "overtime:create",
        value: { showForm, ...form },
        isDirty: (draft) =>
            draft.reason.trim().length > 0 ||
            draft.isHoliday ||
            draft.startTime !== "17:00" ||
            draft.endTime !== "19:00" ||
            draft.date !== defaultDate,
        validate: (raw): raw is {
            showForm: boolean;
            date: string;
            startTime: string;
            endTime: string;
            reason: string;
            isHoliday: boolean;
        } =>
            isPlainObject(raw) &&
            typeof raw.showForm === "boolean" &&
            typeof raw.date === "string" &&
            typeof raw.startTime === "string" &&
            typeof raw.endTime === "string" &&
            typeof raw.reason === "string" &&
            typeof raw.isHoliday === "boolean",
        onRestore: (draft) => {
            setForm({
                date: draft.date || defaultDate,
                startTime: draft.startTime || "17:00",
                endTime: draft.endTime || "19:00",
                reason: draft.reason,
                isHoliday: draft.isHoliday,
            });
            if (draft.showForm) {
                setShowForm(true);
            }
        },
    });

    useEffect(() => {
        const loadRequests = async () => {
            setLoadingList(true);
            setLoadError("");
            try {
                const res = await fetch("/api/overtime");
                if (!res.ok) {
                    throw new Error(await getResponseErrorMessage(res, "Gagal memuat pengajuan lembur."));
                }

                const data = await res.json();
                setRequests(Array.isArray(data) ? data : []);
            } catch (err) {
                reportClientError("EmployeeOvertimePage", "Gagal memuat pengajuan lembur", err);
                setRequests([]);
                setLoadError(err instanceof Error ? err.message : "Gagal memuat pengajuan lembur.");
            } finally {
                setLoadingList(false);
            }
        };

        void loadRequests();
    }, []);

    const resetForm = () => {
        setForm({ date: new Date().toISOString().split("T")[0], startTime: "17:00", endTime: "19:00", reason: "", isHoliday: false });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.date || !form.startTime || !form.endTime || !form.reason) return;
        setLoading(true);

        try {
            const res = await fetch("/api/overtime", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            if (res.ok) {
                const data = await res.json();
                setRequests((prev) => [data, ...prev]);
                clearOvertimeDraft();
                setShowForm(false);
                resetForm();
                toast("Pengajuan lembur berhasil dikirim!", "success");
            } else {
                toast(await getResponseErrorMessage(res, "Gagal mengajukan lembur"), "error");
            }
        } catch (error) {
            reportClientError("EmployeeOvertimePage", "Gagal mengirim pengajuan lembur", error, { date: form.date, startTime: form.startTime, endTime: form.endTime });
            toast("Pengajuan lembur belum terkirim karena koneksi bermasalah. Periksa internet lalu coba lagi.", "error");
        }
        setLoading(false);
    };

    const totalApproved = requests.filter((r) => r.status === "approved").reduce((sum, r) => sum + r.hours, 0);
    const filtered = filterStatus === "all" ? requests : requests.filter((r) => r.status === filterStatus);

    const paginatedRequests = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;

    return (
        <div className="space-y-5 animate-[fadeIn_0.5s_ease]">
            <PageHeader
                title="Lembur"
                subtitle={`Total disetujui: ${Number(totalApproved.toFixed(2))} jam`}
                icon={Clock4}
                action={
                    <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                        <Plus className="w-4 h-4" /> Ajukan Lembur
                    </button>
                }
            />

            {/* Filter */}
            <div className="flex flex-wrap items-center gap-2">
                <Filter className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
                {["all", "pending", "approved", "rejected"].map((s) => (
                    <button
                        key={s}
                        onClick={() => { setFilterStatus(s); setCurrentPage(1); }}
                        className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors active:scale-[0.99] ${filterStatus === s
                            ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]"
                            : "border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--secondary)_60%,transparent)]"
                            }`}
                    >
                        {s === "all" ? "Semua" : STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].label}
                    </button>
                ))}
            </div>

            {/* Request List */}
            {loadingList ? (
                <ListSkeleton count={3} label="Memuat pengajuan lembur" />
            ) : loadError ? (
                <StateCard variant="error" title={loadError} />
            ) : filtered.length === 0 ? (
                <EmptyState icon={Clock4} title="Belum ada pengajuan lembur" />
            ) : (
                <div className="space-y-3">
                    {paginatedRequests.map((req) => {
                        const cfg = STATUS_CONFIG[req.status];
                        return (
                            <div key={req.id} className="emp-surface p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Calendar className="w-4 h-4 text-[var(--primary)] shrink-0" />
                                            <h3 className="text-sm font-bold text-[var(--text-primary)]">{formatDisplayDate(req.date)}</h3>
                                        </div>
                                        <p className="text-xs text-[var(--text-muted)] mb-1">
                                            <Clock className="w-3 h-3 inline mr-1" />
                                            {formatDisplayTime(req.startTime)} — {formatDisplayTime(req.endTime)} ({req.hours} jam)
                                        </p>
                                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                                            <FileText className="w-3 h-3 inline mr-1" />{req.reason}
                                        </p>
                                    </div>
                                    <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>
                                </div>
                            </div>
                        );
                    })}

                    <DataTablePagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filtered.length}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                        pageSizeOptions={[5, 10, 20]}
                        itemLabel="pengajuan"
                    />
                </div>
            )}

            {/* Form Modal */}
            {showForm && (
                <AccessibleModal ariaLabel="Pengajuan lembur" onClose={() => setShowForm(false)} className="max-w-md">
                        <div className="modal-header">
                            <h2 className="modal-title">Pengajuan Lembur</h2>
                            <button className="modal-close" onClick={() => setShowForm(false)} aria-label="Tutup form pengajuan lembur">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <DraftNotice
                                compact
                                visible={overtimeDraftRestored}
                                onDiscard={() => {
                                    discardOvertimeDraft();
                                    resetForm();
                                }}
                            />
                            <div className="form-group !mb-0">
                                <label className="form-label">
                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Tanggal Lembur</span>
                                </label>
                                <input type="date" className="form-input" value={form.date}
                                    onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="form-group !mb-0">
                                    <label className="form-label">
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Jam Mulai</span>
                                    </label>
                                    <input type="time" className="form-input" value={form.startTime}
                                        onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
                                </div>
                                <div className="form-group !mb-0">
                                    <label className="form-label">
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Jam Selesai</span>
                                    </label>
                                    <input type="time" className="form-input" value={form.endTime}
                                        onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
                                </div>
                            </div>

                            <div className="form-group !mb-0">
                                <label className="form-label">
                                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Alasan Lembur</span>
                                </label>
                                <textarea className="form-input min-h-[80px] resize-none" value={form.reason}
                                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                                    placeholder="Jelaskan alasan dan pekerjaan yang dilakukan..." required />
                            </div>

                            <div className="form-group !mb-0">
                                <label className="flex items-center gap-2.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.isHoliday}
                                        onChange={(e) => setForm({ ...form, isHoliday: e.target.checked })}
                                        className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                    />
                                    <span className="text-sm text-[var(--text-secondary)]">Hari Libur / Istirahat Mingguan</span>
                                </label>
                            </div>

                            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock4 className="w-4 h-4" />}
                                Ajukan Lembur
                            </button>
                        </form>
                </AccessibleModal>
            )}
        </div>
    );
}
