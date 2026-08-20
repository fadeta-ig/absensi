"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface DataTablePaginationProps {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
    pageSizeOptions?: number[];
    itemLabel?: string;
    className?: string;
}

export default function DataTablePagination({
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [10, 25, 50, 100],
    itemLabel = "data",
    className = "",
}: DataTablePaginationProps) {
    if (totalItems === 0) return null;

    const from = Math.min((currentPage - 1) * pageSize + 1, totalItems);
    const to = Math.min(currentPage * pageSize, totalItems);
    const safeTotalPages = Math.max(1, totalPages);

    const getPageNumbers = (): (number | "...")[] => {
        if (safeTotalPages <= 7) {
            return Array.from({ length: safeTotalPages }, (_, i) => i + 1);
        }

        const pages: (number | "...")[] = [];
        const showLeft = currentPage > 4;
        const showRight = currentPage < safeTotalPages - 3;

        pages.push(1);
        if (showLeft) pages.push("...");

        const start = Math.max(2, currentPage - 1);
        const end = Math.min(safeTotalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }

        if (showRight) pages.push("...");
        pages.push(safeTotalPages);
        return pages;
    };

    return (
        <div
            className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--card)] text-xs text-[var(--text-secondary)] ${className}`}
        >
            {/* Info and Page Size Selector */}
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                <p className="text-[var(--text-muted)] font-medium">
                    Menampilkan <span className="font-semibold text-[var(--text-primary)]">{from}–{to}</span> dari{" "}
                    <span className="font-semibold text-[var(--text-primary)]">{totalItems}</span> {itemLabel}
                </p>

                {onPageSizeChange && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[var(--text-muted)]">Baris:</span>
                        <select
                            value={pageSize}
                            onChange={(e) => onPageSizeChange(Number(e.target.value))}
                            className="form-select !py-1 !px-2 !text-xs !h-8 bg-[var(--secondary)] border-[var(--border)] rounded-md font-medium text-[var(--text-primary)]"
                        >
                            {pageSizeOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-1">
                {/* First Page */}
                <button
                    type="button"
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--secondary)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    title="Halaman Pertama"
                >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                </button>

                {/* Previous Page */}
                <button
                    type="button"
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--secondary)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    title="Halaman Sebelumnya"
                >
                    <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1 px-1">
                    {getPageNumbers().map((p, i) =>
                        p === "..." ? (
                            <span key={`dots-${i}`} className="px-1 text-[var(--text-muted)] font-bold">
                                ...
                            </span>
                        ) : (
                            <button
                                key={p}
                                type="button"
                                onClick={() => onPageChange(p as number)}
                                className={`min-w-[30px] h-8 px-2 rounded-md font-semibold text-xs transition-colors ${
                                    p === currentPage
                                        ? "bg-[var(--primary)] text-white shadow-sm"
                                        : "border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--secondary)] hover:text-[var(--text-primary)]"
                                }`}
                            >
                                {p}
                            </button>
                        )
                    )}
                </div>

                {/* Next Page */}
                <button
                    type="button"
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage >= safeTotalPages}
                    className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--secondary)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    title="Halaman Berikutnya"
                >
                    <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {/* Last Page */}
                <button
                    type="button"
                    onClick={() => onPageChange(safeTotalPages)}
                    disabled={currentPage >= safeTotalPages}
                    className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--secondary)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    title="Halaman Terakhir"
                >
                    <ChevronsRight className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
