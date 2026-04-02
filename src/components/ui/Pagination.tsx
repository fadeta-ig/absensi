"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
    currentPage: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    className?: string;
}

export default function Pagination({
    currentPage,
    totalItems,
    pageSize,
    onPageChange,
    className = "",
}: PaginationProps) {
    const totalPages = Math.ceil(totalItems / pageSize);
    if (totalPages <= 1) return null;

    const from = (currentPage - 1) * pageSize + 1;
    const to   = Math.min(currentPage * pageSize, totalItems);

    // Maksimum 7 tombol halaman, sisanya "..."
    const getPageNumbers = (): (number | "...")[] => {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        const pages: (number | "...")[] = [];
        const showLeft  = currentPage > 4;
        const showRight = currentPage < totalPages - 3;

        pages.push(1);
        if (showLeft)  pages.push("...");

        const start = Math.max(2, currentPage - 1);
        const end   = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) pages.push(i);

        if (showRight) pages.push("...");
        pages.push(totalPages);
        return pages;
    };

    const btnBase: React.CSSProperties = {
        minWidth: 34, height: 34, border: "1px solid var(--border)",
        borderRadius: 8, background: "white", cursor: "pointer",
        fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
    };

    return (
        <div
            className={className}
            style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                flexWrap: "wrap", gap: 12, padding: "12px 16px",
                borderTop: "1px solid var(--border)", background: "white",
            }}
        >
            {/* Info */}
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Menampilkan <strong>{from}–{to}</strong> dari <strong>{totalItems}</strong> aset
            </p>

            {/* Page buttons */}
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {/* Prev */}
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    style={{
                        ...btnBase,
                        color: currentPage === 1 ? "var(--text-muted)" : "var(--text-primary)",
                        opacity: currentPage === 1 ? 0.4 : 1,
                    }}
                >
                    <ChevronLeft size={15} />
                </button>

                {/* Numbers */}
                {getPageNumbers().map((p, i) =>
                    p === "..." ? (
                        <span key={`dots-${i}`} style={{ padding: "0 4px", color: "var(--text-muted)", fontSize: 13 }}>…</span>
                    ) : (
                        <button
                            key={p}
                            onClick={() => onPageChange(p as number)}
                            style={{
                                ...btnBase,
                                background: p === currentPage ? "var(--primary)" : "white",
                                color: p === currentPage ? "white" : "var(--text-primary)",
                                borderColor: p === currentPage ? "var(--primary)" : "var(--border)",
                                fontWeight: p === currentPage ? 600 : 400,
                            }}
                        >
                            {p}
                        </button>
                    )
                )}

                {/* Next */}
                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    style={{
                        ...btnBase,
                        color: currentPage === totalPages ? "var(--text-muted)" : "var(--text-primary)",
                        opacity: currentPage === totalPages ? 0.4 : 1,
                    }}
                >
                    <ChevronRight size={15} />
                </button>
            </div>

            {/* Page size info kecil */}
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{pageSize} / halaman</p>
        </div>
    );
}
