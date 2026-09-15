"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface UseTablePaginationOptions {
    /** Unique key for persistent storage (e.g. "employees", "leave", "assets") */
    storageKey?: string;
    /** Default page size if not set in URL or storage (default: 10) */
    defaultPageSize?: number;
    /** Optional total items to allow smart clamping */
    totalItems?: number;
}

export interface UseTablePaginationReturn {
    currentPage: number;
    pageSize: number;
    setPage: (newPage: number) => void;
    setPageSize: (newSize: number) => void;
    resetPage: () => void;
    /** Returns pagination slice indices: [start, end] */
    getSliceIndices: (itemsLength?: number) => [number, number];
}

export function useTablePagination(
    options?: UseTablePaginationOptions
): UseTablePaginationReturn {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const storageKey = options?.storageKey;
    const defaultPageSize = options?.defaultPageSize || 10;
    const totalItems = options?.totalItems;

    // Client-side stored preference fallback resolved lazily without useEffect
    const [storedState] = useState<{ page?: number; size?: number }>(() => {
        if (typeof window === "undefined" || !storageKey) return {};
        try {
            const storedPage = sessionStorage.getItem(`hris_page_${storageKey}`);
            const storedSize = localStorage.getItem(`hris_pagesize_${storageKey}`);
            const p = storedPage ? parseInt(storedPage, 10) : undefined;
            const s = storedSize ? parseInt(storedSize, 10) : undefined;
            return {
                page: p && !isNaN(p) && p > 0 ? p : undefined,
                size: s && !isNaN(s) && s > 0 ? s : undefined,
            };
        } catch {
            return {};
        }
    });

    // 1. Resolve pageSize (URL > localStorage > defaultPageSize)
    const limitFromUrl = searchParams.get("limit");
    const pageSize = useMemo(() => {
        if (limitFromUrl) {
            const parsed = parseInt(limitFromUrl, 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
        if (storedState.size) return storedState.size;
        return defaultPageSize;
    }, [limitFromUrl, storedState.size, defaultPageSize]);

    // 2. Resolve raw page (URL > sessionStorage > 1)
    const pageFromUrl = searchParams.get("page");
    const rawPage = useMemo(() => {
        if (pageFromUrl) {
            const parsed = parseInt(pageFromUrl, 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
        if (storedState.page) return storedState.page;
        return 1;
    }, [pageFromUrl, storedState.page]);

    // 3. Smart Clamping: If total items known, clamp between 1 and totalPages
    const currentPage = useMemo(() => {
        if (typeof totalItems === "number" && totalItems > 0) {
            const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
            return Math.min(rawPage, totalPages);
        }
        return rawPage;
    }, [rawPage, totalItems, pageSize]);

    // Update URL helper
    const updateUrl = useCallback(
        (newPage: number, newSize: number) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("page", String(newPage));
            params.set("limit", String(newSize));
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        },
        [pathname, router, searchParams]
    );

    // Update Page
    const setPage = useCallback(
        (newPage: number) => {
            const validPage = Math.max(1, newPage);
            if (storageKey && typeof window !== "undefined") {
                try {
                    sessionStorage.setItem(`hris_page_${storageKey}`, String(validPage));
                } catch {
                    // Ignore private-mode storage errors
                }
            }
            updateUrl(validPage, pageSize);
        },
        [pageSize, storageKey, updateUrl]
    );

    // Update Page Size
    const setPageSize = useCallback(
        (newSize: number) => {
            const validSize = Math.max(1, newSize);
            if (storageKey && typeof window !== "undefined") {
                try {
                    localStorage.setItem(`hris_pagesize_${storageKey}`, String(validSize));
                    sessionStorage.setItem(`hris_page_${storageKey}`, "1");
                } catch {
                    // Ignore storage errors
                }
            }
            updateUrl(1, validSize);
        },
        [storageKey, updateUrl]
    );

    // Reset Page (e.g. search keyword or filter changes)
    const resetPage = useCallback(() => {
        if (storageKey && typeof window !== "undefined") {
            try {
                sessionStorage.setItem(`hris_page_${storageKey}`, "1");
            } catch {
                // Ignore storage errors
            }
        }
        if (searchParams.get("page") !== "1" && searchParams.has("page")) {
            updateUrl(1, pageSize);
        }
    }, [pageSize, searchParams, storageKey, updateUrl]);

    const getSliceIndices = useCallback(
        (itemsLength?: number): [number, number] => {
            const start = (currentPage - 1) * pageSize;
            const end = typeof itemsLength === "number" ? Math.min(start + pageSize, itemsLength) : start + pageSize;
            return [start, end];
        },
        [currentPage, pageSize]
    );

    return useMemo(
        () => ({
            currentPage,
            pageSize,
            setPage,
            setPageSize,
            resetPage,
            getSliceIndices,
        }),
        [currentPage, pageSize, setPage, setPageSize, resetPage, getSliceIndices]
    );
}
