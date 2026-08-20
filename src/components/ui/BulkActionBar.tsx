"use client";

import React from "react";
import { CheckSquare, X } from "lucide-react";

interface BulkActionBarProps {
    selectedCount: number;
    totalCount?: number;
    onClearSelection: () => void;
    onSelectAll?: () => void;
    allSelected?: boolean;
    itemLabel?: string;
    children: React.ReactNode;
    className?: string;
}

export default function BulkActionBar({
    selectedCount,
    totalCount,
    onClearSelection,
    onSelectAll,
    allSelected = false,
    itemLabel = "data",
    children,
    className = "",
}: BulkActionBarProps) {
    if (selectedCount === 0) return null;

    return (
        <div
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-3xl animate-[fadeIn_0.25s_ease] ${className}`}
        >
            <div className="bg-[var(--card)]/95 backdrop-blur-md border-2 border-[var(--primary)] text-[var(--text-primary)] rounded-2xl p-3 sm:px-5 sm:py-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.18)] flex flex-wrap items-center justify-between gap-3">
                {/* Left: Selection info and select-all trigger */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center font-bold">
                        <CheckSquare className="w-4 h-4" />
                    </div>
                    <div>
                        <p className="text-xs font-bold leading-tight">
                            <span className="text-[var(--primary)]">{selectedCount}</span> {itemLabel} terpilih
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                            {onSelectAll && totalCount !== undefined && totalCount > selectedCount && (
                                <button
                                    type="button"
                                    onClick={onSelectAll}
                                    className="text-[11px] font-semibold text-[var(--primary)] hover:underline"
                                >
                                    Pilih semua ({totalCount})
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onClearSelection}
                                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                            >
                                Batalkan pilihan
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: Actions and Dismiss */}
                <div className="flex items-center gap-2 flex-wrap">
                    {children}

                    <button
                        type="button"
                        onClick={onClearSelection}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--secondary)] transition-colors ml-1"
                        title="Tutup Bar Aksi"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
