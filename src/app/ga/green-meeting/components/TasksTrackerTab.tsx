"use client";

import { useState } from "react";
import {
    Clock,
    CheckCircle2,
    AlertTriangle,
    Calendar,
    ArrowRight,
    CalendarPlus,
    History,
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
import type { GreenMeetingNote, GreenMeetingTaskStatus, GreenMeetingConfig } from "../types";

interface TasksTrackerTabProps {
    tasks: GreenMeetingNote[];
    config: GreenMeetingConfig | null;
    onUpdateTaskStatus: (noteId: string, status: GreenMeetingTaskStatus) => Promise<void>;
    onExtendDeadline: (noteId: string, newDeadlineDate: string, reason: string) => Promise<void>;
    loading?: boolean;
}

export default function TasksTrackerTab({
    tasks,
    config,
    onUpdateTaskStatus,
    onExtendDeadline,
}: TasksTrackerTabProps) {
    const [filterStatus, setFilterStatus] = useState<string>("ACTIVE");

    // Modal Extend Deadline State
    const [selectedTask, setSelectedTask] = useState<GreenMeetingNote | null>(null);
    const [newDeadline, setNewDeadline] = useState<string>("");
    const [extendReason, setExtendReason] = useState<string>("");
    const [extending, setExtending] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string>("");

    const maxExtensions = config?.maxDeadlineExtensions ?? 3;

    const handleOpenExtend = (task: GreenMeetingNote) => {
        setSelectedTask(task);
        setNewDeadline("");
        setExtendReason("");
        setErrorMsg("");
    };

    const handleSaveExtension = async () => {
        if (!selectedTask) return;
        if (!newDeadline) {
            setErrorMsg("Tanggal tenggat waktu baru wajib ditentukan.");
            return;
        }
        if (!extendReason.trim() || extendReason.trim().length < 5) {
            setErrorMsg("Alasan perpanjangan deadline wajib diisi minimal 5 karakter.");
            return;
        }

        setExtending(true);
        setErrorMsg("");
        try {
            await onExtendDeadline(selectedTask.id, newDeadline, extendReason.trim());
            setSelectedTask(null);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "Gagal memperpanjang deadline.");
        } finally {
            setExtending(false);
        }
    };

    const filteredTasks = tasks.filter((t) => {
        if (filterStatus === "ACTIVE") return t.taskStatus === "BELUM_DIMULAI" || t.taskStatus === "SEDANG_BERJALAN";
        if (filterStatus === "COMPLETED") return t.taskStatus === "SELESAI";
        if (filterStatus === "EXTENDED") return t.deadlines && t.deadlines.length > 1;
        return true;
    });

    return (
        <div className="space-y-4">
            {/* Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card p-4 rounded-xl border border-border">
                <div>
                    <h3 className="text-base font-bold text-foreground">Pelacak Tindak Lanjut Perusahaan (Action Items)</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Pemantauan seluruh tugas rapat, tenggat waktu dinamis, dan riwayat perpanjangan multi-deadline.
                    </p>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        type="button"
                        onClick={() => setFilterStatus("ACTIVE")}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filterStatus === "ACTIVE"
                            ? "bg-primary text-white shadow-xs"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Sedang Berjalan ({tasks.filter((t) => t.taskStatus === "BELUM_DIMULAI" || t.taskStatus === "SEDANG_BERJALAN").length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterStatus("EXTENDED")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterStatus === "EXTENDED"
                            ? "bg-amber-600 text-white"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Pernah Diperpanjang ({tasks.filter((t) => t.deadlines && t.deadlines.length > 1).length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterStatus("COMPLETED")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterStatus === "COMPLETED"
                            ? "bg-emerald-600 text-white"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Selesai ({tasks.filter((t) => t.taskStatus === "SELESAI").length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterStatus("ALL")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterStatus === "ALL"
                            ? "bg-foreground text-background"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        Semua ({tasks.length})
                    </button>
                </div>
            </div>

            {/* Table Action Tracker */}
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40px] text-center">No</TableHead>
                            <TableHead>Uraian Tugas</TableHead>
                            <TableHead>Dari ➔ Kepada</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Tenggat Terkini</TableHead>
                            <TableHead>Riwayat Molor</TableHead>
                            <TableHead className="text-right">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredTasks.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                    Tidak ada tugas tindak lanjut pada filter ini.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredTasks.map((task, idx) => {
                                const currentDeadline = task.deadlines && task.deadlines.length > 0
                                    ? task.deadlines[task.deadlines.length - 1]
                                    : null;
                                const extensionsCount = Math.max(0, (task.deadlines?.length || 1) - 1);
                                const isMaxReached = extensionsCount >= maxExtensions;

                                return (
                                    <TableRow key={task.id}>
                                        <TableCell className="text-center font-medium text-muted-foreground text-xs">
                                            {idx + 1}
                                        </TableCell>

                                        {/* Uraian */}
                                        <TableCell className="max-w-[280px]">
                                            <div className="text-sm font-semibold text-foreground whitespace-pre-wrap">
                                                {task.content}
                                            </div>
                                            {task.session && (
                                                <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                                                    <Calendar size={11} />
                                                    Rapat: {new Date(task.session.meetingDate).toLocaleDateString("id-ID", {
                                                        day: "numeric",
                                                        month: "short",
                                                        year: "numeric",
                                                    })}
                                                </span>
                                            )}
                                        </TableCell>

                                        {/* Dari ➔ Kepada */}
                                        <TableCell className="text-xs">
                                            <div className="font-semibold text-purple-600 dark:text-purple-400">
                                                {task.originName}
                                            </div>
                                            <div className="flex items-center gap-1 text-muted-foreground text-[11px] mt-0.5">
                                                <ArrowRight size={10} />
                                                <span>
                                                    {task.isAllTarget
                                                        ? "Semua Karyawan"
                                                        : task.targets?.map((t) => t.label || t.employee?.name || t.division?.name || t.department?.name).filter(Boolean).join(", ") || "-"}
                                                </span>
                                            </div>
                                        </TableCell>

                                        {/* Status */}
                                        <TableCell>
                                            <select
                                                value={task.taskStatus}
                                                onChange={(e) =>
                                                    onUpdateTaskStatus(task.id, e.target.value as GreenMeetingTaskStatus)
                                                }
                                                className={`text-xs font-bold px-2 py-1 rounded-lg border focus:outline-none ${task.taskStatus === "SELESAI"
                                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                                    : task.taskStatus === "SEDANG_BERJALAN"
                                                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                                        : task.taskStatus === "DIBATALKAN"
                                                            ? "bg-muted text-muted-foreground border-border"
                                                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                                    }`}
                                            >
                                                <option value="BELUM_DIMULAI">Belum Dimulai</option>
                                                <option value="SEDANG_BERJALAN">Sedang Berjalan</option>
                                                <option value="SELESAI">Selesai</option>
                                                <option value="DIBATALKAN">Dibatalkan</option>
                                            </select>
                                        </TableCell>

                                        {/* Deadline Terkini */}
                                        <TableCell className="text-xs">
                                            {currentDeadline ? (
                                                <div className="font-bold text-foreground flex items-center gap-1.5">
                                                    <Clock size={13} className="text-primary" />
                                                    <span>
                                                        {new Date(currentDeadline.deadlineDate).toLocaleDateString("id-ID", {
                                                            day: "numeric",
                                                            month: "short",
                                                            year: "numeric",
                                                        })}
                                                    </span>
                                                </div>
                                            ) : (
                                                "-"
                                            )}
                                        </TableCell>

                                        {/* Riwayat Molor */}
                                        <TableCell className="text-xs">
                                            {extensionsCount > 0 ? (
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${isMaxReached
                                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                                    }`}>
                                                    <AlertTriangle size={11} />
                                                    {extensionsCount} / {maxExtensions}x Molor
                                                </span>
                                            ) : (
                                                <span className="text-emerald-600 dark:text-emerald-400 font-medium text-xs flex items-center gap-1">
                                                    <CheckCircle2 size={12} />
                                                    Tepat Waktu (Deadline 1)
                                                </span>
                                            )}
                                        </TableCell>

                                        {/* Aksi Perpanjangan */}
                                        <TableCell className="text-right">
                                            {task.taskStatus !== "SELESAI" && task.taskStatus !== "DIBATALKAN" && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenExtend(task)}
                                                    disabled={isMaxReached}
                                                    title={isMaxReached ? "Batas toleransi perpanjangan telah habis" : "Berikan perpanjangan deadline"}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${isMaxReached
                                                        ? "opacity-40 cursor-not-allowed bg-muted border-border text-muted-foreground"
                                                        : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/30"
                                                        }`}
                                                >
                                                    <CalendarPlus size={13} />
                                                    <span>{isMaxReached ? "Habis Kuota" : "Perpanjang"}</span>
                                                </button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Modal Perpanjangan Deadline Bertingkat */}
            {selectedTask && (
                <AccessibleModal
                    ariaLabel="Perpanjang Tenggat Waktu Tugas"
                    onClose={() => setSelectedTask(null)}
                    className="max-w-lg w-full p-6 bg-card border border-border rounded-xl shadow-xl"
                >
                    <div className="space-y-4">
                        <div>
                            <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                                <CalendarPlus size={13} />
                                Perpanjangan Tenggat Waktu Bertingkat (Multi-Deadline)
                            </span>
                            <h3 className="text-base font-bold text-foreground mt-1">
                                {selectedTask.content}
                            </h3>
                        </div>

                        {/* Kuota Info Banner */}
                        <div className="p-3 rounded-lg bg-muted/60 border border-border text-xs flex items-center justify-between">
                            <span className="text-muted-foreground">Toleransi Perpanjangan:</span>
                            <span className="font-bold text-foreground">
                                Perpanjangan ke-{Math.max(0, (selectedTask.deadlines?.length || 1))} dari batas {maxExtensions}x
                            </span>
                        </div>

                        {/* Riwayat Deadline Kronologis */}
                        <div className="bg-muted/30 p-3.5 rounded-lg border border-border space-y-2">
                            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                <History size={13} className="text-primary" />
                                Riwayat Tenggat Waktu Sebelumnya:
                            </span>
                            <div className="space-y-1.5 pt-1">
                                {selectedTask.deadlines?.map((d, index) => (
                                    <div
                                        key={d.id}
                                        className="text-xs flex items-baseline justify-between p-2 rounded bg-background border border-border/70"
                                    >
                                        <div>
                                            <span className="font-bold text-foreground">
                                                {index === 0 ? "Deadline Awal (D1):" : `Perpanjangan ${index} (D${index + 1}):`}
                                            </span>{" "}
                                            <span className="text-muted-foreground">
                                                {new Date(d.deadlineDate).toLocaleDateString("id-ID", {
                                                    day: "numeric",
                                                    month: "short",
                                                    year: "numeric",
                                                })}
                                            </span>
                                            {d.reason && (
                                                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5 italic">
                                                    Alasan: &ldquo;{d.reason}&rdquo;
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {errorMsg && (
                            <div className="p-3 text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-medium">
                                {errorMsg}
                            </div>
                        )}

                        {/* Input Deadline Baru */}
                        <div>
                            <label className="block text-xs font-semibold text-foreground mb-1.5">
                                Batas Waktu Baru (Deadline {selectedTask.deadlines.length + 1}) <span className="text-rose-500">*Wajib</span>
                            </label>
                            <input
                                type="date"
                                value={newDeadline}
                                onChange={(e) => setNewDeadline(e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                required
                            />
                        </div>

                        {/* Textarea Alasan Wajib Perpanjangan */}
                        <div>
                            <label className="block text-xs font-semibold text-foreground mb-1.5">
                                Alasan Keterlambatan / Perpanjangan <span className="text-rose-500">*Wajib (Min 5 Karakter)</span>
                            </label>
                            <textarea
                                value={extendReason}
                                onChange={(e) => setExtendReason(e.target.value)}
                                placeholder="Jelaskan kendala di lapangan mengapa tugas ini perlu diperpanjang (contoh: Menunggu persetujuan skema desain dari vendor luar)..."
                                rows={3}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                maxLength={500}
                                required
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setSelectedTask(null)}
                                disabled={extending}
                                className="px-4 py-2 text-xs font-medium rounded-lg border border-border hover:bg-muted text-foreground transition-colors"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveExtension}
                                disabled={extending || !newDeadline || extendReason.trim().length < 5}
                                className="px-5 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50"
                            >
                                {extending ? "Menyimpan..." : "Simpan Perpanjangan"}
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
