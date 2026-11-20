"use client";

import { AlertCircle, History, RotateCcw } from "lucide-react";

interface DraftNoticeProps {
    /** Shows the subtle restored-draft bar when true (or when attachmentHint is non-empty). */
    visible: boolean;
    /** Optional action to discard the restored draft and reset fields to defaults. */
    onDiscard?: () => void;
    /** Custom restored message. */
    message?: string;
    /** Label for the discard/reset button. */
    discardLabel?: string;
    /** Optional inline reminder when previously selected local files/photos must be re-selected. */
    attachmentHint?: string | null;
    /** Extra compact styling for dense modals or inline cards. */
    compact?: boolean;
    className?: string;
}

/**
 * Unobtrusive inline status bar shown only when an unfinished form draft is restored
 * or when previously attached local files need to be re-selected after reload.
 */
export default function DraftNotice({
    visible,
    onDiscard,
    message = "Pengisian sebelumnya dipulihkan.",
    discardLabel = "Reset",
    attachmentHint,
    compact = false,
    className = "",
}: DraftNoticeProps) {
    const hasHint = Boolean(attachmentHint && attachmentHint.trim());
    if (!visible && !hasHint) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className={`rounded-xl border border-[var(--border)] bg-[var(--secondary)] text-[var(--text-secondary)] ${
                compact ? "px-2.5 py-2 text-[11px]" : "px-3 py-2 text-xs"
            } space-y-1.5 ${className}`}
        >
            {visible && (
                <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                        <History className="w-3.5 h-3.5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
                        <span className="truncate">{message}</span>
                    </span>
                    {onDiscard && (
                        <button
                            type="button"
                            onClick={onDiscard}
                            className="shrink-0 inline-flex items-center gap-1 font-semibold text-[var(--primary)] hover:underline px-1.5 py-0.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                        >
                            <RotateCcw className="w-3 h-3" aria-hidden="true" />
                            {discardLabel}
                        </button>
                    )}
                </div>
            )}
            {hasHint && (
                <div className="flex items-start gap-1.5 text-[var(--warning)] font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{attachmentHint}</span>
                </div>
            )}
        </div>
    );
}
