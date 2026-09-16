"use client";

import { useState } from "react";
import {
    Calendar,
    Check,
    CheckCircle2,
    Clock,
    Eye,
    FileText,
    Building2,
    LogIn,
    LogOut,
    Paperclip,
    User,
    X,
    XCircle,
    Loader2,
    ExternalLink
} from "lucide-react";
import { AttendanceCorrection } from "../types";
import { formatIndonesianDate } from "@/lib/utils";

interface Props {
    selectedCorrection: AttendanceCorrection | null;
    onClose: () => void;
    empInfo: { name: string; department: string; division: string };
    processingId: string | null;
    onAction: (id: string, status: "APPROVED" | "REJECTED") => Promise<void> | void;
}

export function AttendanceCorrectionDetailModal({
    selectedCorrection,
    onClose,
    empInfo,
    processingId,
    onAction,
}: Props) {
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    if (!selectedCorrection) return null;

    const isPending = selectedCorrection.status === "PENDING";
    const isApproved = selectedCorrection.status === "APPROVED";
    const isRejected = selectedCorrection.status === "REJECTED";
    const isProcessing = processingId === selectedCorrection.id;

    // Format clock in / clock out times
    const formatTime = (timeStr: string | null) => {
        if (!timeStr) return "--:--";
        try {
            const d = new Date(timeStr);
            return isNaN(d.getTime())
                ? "--:--"
                : d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB";
        } catch {
            return "--:--";
        }
    };

    // Calculate duration between proposed in and proposed out
    const calculateDuration = () => {
        if (!selectedCorrection.proposedClockIn || !selectedCorrection.proposedClockOut) return null;
        try {
            const inTime = new Date(selectedCorrection.proposedClockIn).getTime();
            const outTime = new Date(selectedCorrection.proposedClockOut).getTime();
            if (isNaN(inTime) || isNaN(outTime) || outTime <= inTime) return null;
            const diffMinutes = Math.round((outTime - inTime) / (1000 * 60));
            const hours = Math.floor(diffMinutes / 60);
            const minutes = diffMinutes % 60;
            return `${hours} jam ${minutes > 0 ? `${minutes} menit` : ""}`;
        } catch {
            return null;
        }
    };

    const duration = calculateDuration();

    const handleActionClick = async (status: "APPROVED" | "REJECTED") => {
        await onAction(selectedCorrection.id, status);
        onClose();
    };

    return (
        <>
            <div className="modal-overlay z-50" onClick={onClose}>
                <div
                    className="modal-content max-w-xl p-0 overflow-hidden shadow-2xl border border-[var(--border)] animate-[fadeIn_0.2s_ease]"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="modal-header border-b border-[var(--border)] px-6 py-4 flex items-center justify-between bg-[var(--card)]">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="modal-title text-base font-bold text-[var(--text-primary)]">
                                    Detail Pengajuan Koreksi Presensi
                                </h2>
                                <p className="text-xs text-[var(--text-muted)]">
                                    Pemeriksaan data pengajuan sebelum tindakan persetujuan HR
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {isPending && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                                    <Clock className="w-3.5 h-3.5 animate-pulse text-amber-600" /> Menunggu
                                </span>
                            )}
                            {isApproved && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Disetujui
                                </span>
                            )}
                            {isRejected && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                                    <XCircle className="w-3.5 h-3.5 text-rose-600" /> Ditolak
                                </span>
                            )}
                            <button
                                type="button"
                                className="modal-close p-1.5 rounded-lg hover:bg-[var(--secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                onClick={onClose}
                                title="Tutup"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto bg-[var(--background)]">
                        {/* Employee Identity Card */}
                        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-full bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)] font-bold text-sm">
                                    <User className="w-5 h-5 text-[var(--text-muted)]" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-[var(--text-primary)]">
                                        {empInfo.name || "Nama Karyawan"}
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--secondary)] border border-[var(--border)] text-[var(--text-muted)] font-semibold">
                                            {selectedCorrection.employeeId}
                                        </span>
                                        {(empInfo.department || empInfo.division) && (
                                            <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                                                <Building2 className="w-3 h-3" />
                                                {empInfo.department} {empInfo.division ? `• ${empInfo.division}` : ""}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Timing Details Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Target Date */}
                            <div className="p-3.5 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-1">
                                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-[var(--primary)]" />
                                    Tanggal Kehadiran Target
                                </span>
                                <p className="text-sm font-bold text-[var(--text-primary)]">
                                    {formatIndonesianDate(selectedCorrection.targetDate)}
                                </p>
                                <p className="text-[11px] font-mono text-[var(--text-muted)]">
                                    Diajukan: {new Date(selectedCorrection.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </p>
                            </div>

                            {/* Total Duration / Summary */}
                            <div className="p-3.5 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-1">
                                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                                    Total Durasi Usulan
                                </span>
                                <p className="text-sm font-bold text-[var(--text-primary)]">
                                    {duration || "Sebagian Waktu Saja"}
                                </p>
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    {selectedCorrection.proposedClockIn && selectedCorrection.proposedClockOut
                                        ? "Usulan jam masuk & keluar lengkap"
                                        : "Usulan koreksi tunggal (masuk/keluar)"}
                                </p>
                            </div>
                        </div>

                        {/* Proposed In & Out Clock Comparison Card */}
                        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-3">
                            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                                Usulan Waktu Presensi Baru
                            </span>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                                        <LogIn className="w-3.5 h-3.5" />
                                        <span>Usulan Jam Masuk</span>
                                    </div>
                                    <p className="text-base font-bold font-mono text-emerald-900 dark:text-emerald-200">
                                        {formatTime(selectedCorrection.proposedClockIn)}
                                    </p>
                                </div>

                                <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">
                                        <LogOut className="w-3.5 h-3.5" />
                                        <span>Usulan Jam Pulang</span>
                                    </div>
                                    <p className="text-base font-bold font-mono text-blue-900 dark:text-blue-200">
                                        {formatTime(selectedCorrection.proposedClockOut)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Full Reason Section */}
                        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                                <FileText className="w-3.5 h-3.5 text-[var(--text-primary)]" />
                                <span>Alasan & Penjelasan Karyawan</span>
                            </div>
                            <div className="p-3.5 rounded-lg bg-[var(--secondary)]/40 border border-[var(--border)] text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
                                {selectedCorrection.reason || "Tidak ada alasan tertulis."}
                            </div>
                        </div>

                        {/* Attachment / Evidence Section */}
                        <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                                    <Paperclip className="w-3.5 h-3.5 text-[var(--primary)]" />
                                    <span>Bukti Pendukung / Lampiran</span>
                                </div>
                                {selectedCorrection.attachmentUrl && (
                                    <a
                                        href={selectedCorrection.attachmentUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-[var(--primary)] font-semibold hover:underline flex items-center gap-1"
                                    >
                                        Buka di Tab Baru <ExternalLink className="w-3 h-3" />
                                    </a>
                                )}
                            </div>

                            {selectedCorrection.attachmentUrl ? (
                                <div className="pt-2">
                                    {selectedCorrection.attachmentUrl.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) ? (
                                        <div className="relative group rounded-xl overflow-hidden border border-[var(--border)] bg-black/5 max-w-sm mx-auto">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={selectedCorrection.attachmentUrl}
                                                alt="Bukti Koreksi"
                                                className="w-full max-h-56 object-contain rounded-lg"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setPreviewImage(selectedCorrection.attachmentUrl)}
                                                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-semibold text-xs gap-2"
                                            >
                                                <Eye className="w-4 h-4" /> Perbesar Foto
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="p-3 rounded-lg bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                                                <Paperclip className="w-4 h-4 text-[var(--text-muted)]" />
                                                <span>Dokumen Lampiran Bukti</span>
                                            </div>
                                            <a
                                                href={selectedCorrection.attachmentUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-secondary btn-sm !py-1 !px-2.5 text-xs"
                                            >
                                                Unduh / Lihat Berkas
                                            </a>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-[var(--text-muted)] italic pt-1">
                                    Tidak ada dokumen atau foto bukti lampiran yang disertakan.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="modal-footer border-t border-[var(--border)] px-6 py-4 bg-[var(--card)] flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-secondary"
                            disabled={isProcessing}
                        >
                            Tutup
                        </button>

                        {isPending && (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleActionClick("REJECTED")}
                                    disabled={isProcessing}
                                    className="btn btn-danger flex items-center gap-1.5"
                                >
                                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                    Tolak Pengajuan
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleActionClick("APPROVED")}
                                    disabled={isProcessing}
                                    className="btn btn-success flex items-center gap-1.5"
                                >
                                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    Setujui Koreksi
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Photo Zoom Overlay Modal if clicked */}
            {previewImage && (
                <div className="modal-overlay z-[60]" onClick={() => setPreviewImage(null)}>
                    <div className="modal-content !max-w-2xl p-2 bg-black/90 border-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end p-2">
                            <button
                                type="button"
                                onClick={() => setPreviewImage(null)}
                                className="p-1.5 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={previewImage}
                            alt="Bukti Lampiran Full"
                            className="w-full max-h-[80vh] object-contain rounded-lg"
                        />
                    </div>
                </div>
            )}
        </>
    );
}
