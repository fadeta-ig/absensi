"use client";

import { useState } from "react";
import {
    CheckCircle2,
    AlertCircle,
    XCircle,
    Edit2,
    CheckCheck,
    User,
    Check,
    X,
} from "lucide-react";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table";
import AccessibleModal from "@/components/ui/AccessibleModal";
import type { GreenMeetingAttendance, GreenMeetingAttendanceStatus } from "../types";

interface AttendanceTabProps {
    attendances: GreenMeetingAttendance[];
    onBulkMarkAllPresent: () => Promise<void>;
    onBulkUpdateSelected: (
        attendanceIds: string[],
        action: "MARK_SELECTED_PRESENT" | "MARK_SELECTED_ALPA"
    ) => Promise<void>;
    onUpdateAttendance: (
        attendanceId: string,
        data: {
            status: GreenMeetingAttendanceStatus;
            representativeName?: string | null;
            permitReason?: string | null;
        }
    ) => Promise<void>;
    loading?: boolean;
}

export default function AttendanceTab({
    attendances,
    onBulkMarkAllPresent,
    onBulkUpdateSelected,
    onUpdateAttendance,
    loading = false,
}: AttendanceTabProps) {
    const [filterStatus, setFilterStatus] = useState<string>("ALL");
    const [markingAll, setMarkingAll] = useState(false);
    const [bulkProcessing, setBulkProcessing] = useState(false);

    // Multi-Select State
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Modal Edit State
    const [selectedAtt, setSelectedAtt] = useState<GreenMeetingAttendance | null>(null);
    const [editStatus, setEditStatus] = useState<GreenMeetingAttendanceStatus>("HADIR");
    const [editRepName, setEditRepName] = useState<string>("");
    const [editReason, setEditReason] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string>("");

    // Filter list
    const filtered = attendances.filter((a) => {
        if (filterStatus === "ALL") return true;
        return a.status === filterStatus;
    });

    const isAllSelected = filtered.length > 0 && filtered.every((a) => selectedIds.includes(a.id));

    const handleToggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds((prev) => prev.filter((id) => !filtered.some((f) => f.id === id)));
        } else {
            const newIds = new Set([...selectedIds, ...filtered.map((f) => f.id)]);
            setSelectedIds(Array.from(newIds));
        }
    };

    const handleToggleRow = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    const handleOpenEdit = (att: GreenMeetingAttendance) => {
        setSelectedAtt(att);
        setEditStatus(att.status);
        setEditRepName(att.representativeName || "");
        setEditReason(att.permitReason || "");
        setErrorMsg("");
    };

    const handleSaveAttendance = async () => {
        if (!selectedAtt) return;
        if (editStatus === "IZIN" && !editReason.trim()) {
            setErrorMsg("Alasan izin wajib diisi jika status perwakilan adalah Izin.");
            return;
        }

        setSaving(true);
        setErrorMsg("");
        try {
            await onUpdateAttendance(selectedAtt.id, {
                status: editStatus,
                representativeName: editRepName.trim() || null,
                permitReason: editStatus === "IZIN" ? editReason.trim() : null,
            });
            setSelectedAtt(null);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "Gagal menyimpan presensi.");
        } finally {
            setSaving(false);
        }
    };

    // 1-Click Quick Status Changes on a Single Row
    const handleQuickSetStatus = async (att: GreenMeetingAttendance, newStatus: GreenMeetingAttendanceStatus) => {
        if (newStatus === "IZIN") {
            handleOpenEdit(att);
            return;
        }
        await onUpdateAttendance(att.id, {
            status: newStatus,
            representativeName: att.representativeName,
            permitReason: null,
        });
    };

    // Bulk Action: Mark Selected
    const handleBulkAction = async (action: "MARK_SELECTED_PRESENT" | "MARK_SELECTED_ALPA") => {
        if (selectedIds.length === 0 || bulkProcessing) return;
        setBulkProcessing(true);
        try {
            await onBulkUpdateSelected(selectedIds, action);
            setSelectedIds([]);
        } finally {
            setBulkProcessing(false);
        }
    };

    // 1-Click Mark All Present
    const handleMarkAll = async () => {
        if (markingAll) return;
        setMarkingAll(true);
        try {
            await onBulkMarkAllPresent();
            setSelectedIds([]);
        } finally {
            setMarkingAll(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Top Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card p-4 rounded-xl border border-border">
                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        type="button"
                        onClick={() => setFilterStatus("ALL")}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filterStatus === "ALL"
                            ? "bg-primary text-white shadow-xs"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Semua ({attendances.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterStatus("HADIR")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterStatus === "HADIR"
                            ? "bg-emerald-600 text-white"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Hadir ({attendances.filter((a) => a.status === "HADIR").length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterStatus("IZIN")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterStatus === "IZIN"
                            ? "bg-amber-600 text-white"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Izin ({attendances.filter((a) => a.status === "IZIN").length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterStatus("ALPA")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterStatus === "ALPA"
                            ? "bg-rose-600 text-white"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Alpa ({attendances.filter((a) => a.status === "ALPA").length})
                    </button>
                </div>

                {/* 1-Click Quick Action */}
                <button
                    type="button"
                    onClick={handleMarkAll}
                    disabled={markingAll || loading || attendances.length === 0}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
                >
                    <CheckCheck size={16} />
                    <span>{markingAll ? "Memproses..." : "Tandai Semua Hadir"}</span>
                </button>
            </div>

            {/* Bulk Editor Selection Bar (Muncul jika ada checkbox yang dipilih) */}
            {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/10 border border-primary/20 p-3 rounded-xl animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 text-xs font-bold text-primary">
                        <span>{selectedIds.length} Departemen Dipilih:</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => handleBulkAction("MARK_SELECTED_PRESENT")}
                            disabled={bulkProcessing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors disabled:opacity-50"
                        >
                            <Check size={14} />
                            <span>Tandai Hadir ({selectedIds.length})</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleBulkAction("MARK_SELECTED_ALPA")}
                            disabled={bulkProcessing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors disabled:opacity-50"
                        >
                            <X size={14} />
                            <span>Tandai Alpa ({selectedIds.length})</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedIds([])}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors"
                        >
                            Batal
                        </button>
                    </div>
                </div>
            )}

            {/* Attendance Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40px] text-center">
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    onChange={handleToggleSelectAll}
                                    className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                                    title="Pilih Semua Departemen"
                                />
                            </TableHead>
                            <TableHead className="w-[40px] text-center">No</TableHead>
                            <TableHead>Departemen</TableHead>
                            <TableHead>Divisi</TableHead>
                            <TableHead>Status Kehadiran</TableHead>
                            <TableHead>Nama Perwakilan</TableHead>
                            <TableHead>Alasan / Keterangan</TableHead>
                            <TableHead className="text-right">Aksi Cepat</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                    Tidak ada data presensi departemen.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map((att, idx) => {
                                const isChecked = selectedIds.includes(att.id);

                                return (
                                    <TableRow key={att.id} className={isChecked ? "bg-primary/[0.03]" : ""}>
                                        <TableCell className="text-center">
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => handleToggleRow(att.id)}
                                                className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer"
                                            />
                                        </TableCell>
                                        <TableCell className="text-center font-medium text-muted-foreground text-xs">
                                            {idx + 1}
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-semibold text-foreground text-sm">
                                                {att.unit.department.name}
                                            </div>
                                            {att.unit.department.code && (
                                                <span className="text-[11px] text-muted-foreground">
                                                    Kode: {att.unit.department.code}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {att.unit.department.division?.name || "-"}
                                        </TableCell>
                                        <TableCell>
                                            {att.status === "HADIR" && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                    <CheckCircle2 size={13} />
                                                    Hadir
                                                </span>
                                            )}
                                            {att.status === "IZIN" && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                    <AlertCircle size={13} />
                                                    Izin
                                                </span>
                                            )}
                                            {att.status === "ALPA" && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                                    <XCircle size={13} />
                                                    Alpa
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs text-foreground">
                                            {att.representativeName ? (
                                                <div className="flex items-center gap-1.5">
                                                    <User size={13} className="text-muted-foreground" />
                                                    <span>{att.representativeName}</span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground italic">Perwakilan Departemen</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs max-w-[180px] truncate text-muted-foreground">
                                            {att.status === "IZIN" ? (
                                                <span className="text-amber-700 dark:text-amber-300 font-medium">
                                                    {att.permitReason || "-"}
                                                </span>
                                            ) : (
                                                "-"
                                            )}
                                        </TableCell>

                                        {/* Aksi Cepat 1-Klik Langsung per Baris */}
                                        <TableCell className="text-right">
                                            <div className="inline-flex items-center gap-1">
                                                {/* Tombol Cepat Hadir */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleQuickSetStatus(att, "HADIR")}
                                                    title="Set Hadir"
                                                    className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${att.status === "HADIR"
                                                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                                        : "border-border hover:bg-emerald-500/10 text-emerald-600"
                                                        }`}
                                                >
                                                    Hadir
                                                </button>

                                                {/* Tombol Cepat Izin */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEdit(att)}
                                                    title="Set Izin (Isi Alasan)"
                                                    className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${att.status === "IZIN"
                                                        ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                                                        : "border-border hover:bg-amber-500/10 text-amber-600"
                                                        }`}
                                                >
                                                    Izin
                                                </button>

                                                {/* Tombol Cepat Alpa */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleQuickSetStatus(att, "ALPA")}
                                                    title="Set Alpa"
                                                    className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${att.status === "ALPA"
                                                        ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                                                        : "border-border hover:bg-rose-500/10 text-rose-600"
                                                        }`}
                                                >
                                                    Alpa
                                                </button>

                                                {/* Edit Lengkap */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEdit(att)}
                                                    title="Edit Nama / Alasan"
                                                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-0.5"
                                                >
                                                    <Edit2 size={13} />
                                                </button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Modal Edit Kehadiran */}
            {selectedAtt && (
                <AccessibleModal
                    ariaLabel="Ubah Presensi Departemen"
                    onClose={() => setSelectedAtt(null)}
                    className="max-w-md w-full p-6 bg-card border border-border rounded-xl shadow-xl"
                >
                    <div className="space-y-4">
                        <div>
                            <span className="text-xs font-medium text-muted-foreground uppercase">
                                Presensi Departemen
                            </span>
                            <h3 className="text-lg font-bold text-foreground mt-0.5">
                                {selectedAtt.unit.department.name}
                            </h3>
                        </div>

                        {errorMsg && (
                            <div className="p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-medium">
                                {errorMsg}
                            </div>
                        )}

                        {/* Status Radio */}
                        <div>
                            <label className="block text-xs font-medium text-foreground mb-2">
                                Status Kehadiran
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditStatus("HADIR")}
                                    className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors ${editStatus === "HADIR"
                                        ? "bg-emerald-600 text-white border-emerald-600"
                                        : "border-border hover:bg-muted text-foreground"
                                        }`}
                                >
                                    Hadir
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditStatus("IZIN")}
                                    className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors ${editStatus === "IZIN"
                                        ? "bg-amber-600 text-white border-amber-600"
                                        : "border-border hover:bg-muted text-foreground"
                                        }`}
                                >
                                    Izin
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditStatus("ALPA")}
                                    className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-colors ${editStatus === "ALPA"
                                        ? "bg-rose-600 text-white border-rose-600"
                                        : "border-border hover:bg-muted text-foreground"
                                        }`}
                                >
                                    Alpa
                                </button>
                            </div>
                        </div>

                        {/* Nama Perwakilan */}
                        <div>
                            <label className="block text-xs font-medium text-foreground mb-1.5">
                                Nama Perwakilan (Opsional)
                            </label>
                            <input
                                type="text"
                                value={editRepName}
                                onChange={(e) => setEditRepName(e.target.value)}
                                placeholder="Contoh: Ahmad Subagyo"
                                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                maxLength={100}
                            />
                        </div>

                        {/* Alasan Izin (Kondisional Wajib) */}
                        {editStatus === "IZIN" && (
                            <div>
                                <label className="block text-xs font-medium text-foreground mb-1.5">
                                    Alasan / Keterangan Izin <span className="text-rose-500">*Wajib</span>
                                </label>
                                <textarea
                                    value={editReason}
                                    onChange={(e) => setEditReason(e.target.value)}
                                    placeholder="Jelaskan alasan izin (contoh: Menghadiri kunjungan audit eksternal di pabrik)"
                                    rows={3}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    maxLength={500}
                                    required
                                />
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setSelectedAtt(null)}
                                disabled={saving}
                                className="px-3.5 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted text-foreground transition-colors"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveAttendance}
                                disabled={saving}
                                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-white shadow-sm transition-colors disabled:opacity-50"
                            >
                                {saving ? "Menyimpan..." : "Simpan Status"}
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
