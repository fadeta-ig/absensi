"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";
import {
    cleaningInputClass,
    formatCleaningWibDate,
    type CleaningAssignment,
} from "./cleaningSettingsUtils";

const QUICK_REASONS = ["Rotasi jadwal", "Penggantian petugas", "Selesai kontrak"];

interface EndAssignmentModalProps {
    assignment: CleaningAssignment;
    roomName: string;
    saving: boolean;
    onConfirm: (reason: string) => void;
    onClose: () => void;
}

export default function EndAssignmentModal({
    assignment,
    roomName,
    saving,
    onConfirm,
    onClose,
}: EndAssignmentModalProps) {
    const [reason, setReason] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = reason.trim();
        if (!trimmed || saving) return;
        onConfirm(trimmed);
    };

    return (
        <AccessibleModal
            ariaLabel="Akhiri Penugasan"
            onClose={onClose}
            className="!max-w-md !p-6"
        >
            <div className="modal-header !mb-4 pb-3 border-b border-[var(--border)]">
                <div>
                    <h2 className="modal-title">Akhiri Penugasan</h2>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Penugasan akan dihentikan dan tidak muncul lagi di jadwal petugas.
                    </p>
                </div>
                <button
                    type="button"
                    className="modal-close"
                    onClick={onClose}
                    aria-label="Tutup jendela"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Petugas</span>
                        <span className="font-semibold text-foreground">
                            {assignment.user.displayName}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Ruangan</span>
                        <span className="font-medium text-foreground">{roomName}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Aktif sejak</span>
                        <span className="text-foreground">
                            {formatCleaningWibDate(assignment.startsOnWibDate)}
                        </span>
                    </div>
                </div>

                <div>
                    <label
                        htmlFor="end-assignment-reason"
                        className="block text-xs font-medium text-foreground mb-1"
                    >
                        Alasan mengakhiri penugasan
                    </label>
                    <input
                        id="end-assignment-reason"
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Contoh: Rotasi jadwal bulanan"
                        maxLength={200}
                        required
                        className={cleaningInputClass}
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {QUICK_REASONS.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setReason(preset)}
                                className="px-2 py-1 text-[11px] rounded-md border border-border bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted min-h-[40px]"
                    >
                        Batal
                    </button>
                    <button
                        type="submit"
                        disabled={saving || !reason.trim()}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-destructive-foreground bg-destructive rounded-md hover:opacity-90 disabled:opacity-50 min-h-[40px]"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {saving ? "Memproses..." : "Akhiri Penugasan"}
                    </button>
                </div>
            </form>
        </AccessibleModal>
    );
}
