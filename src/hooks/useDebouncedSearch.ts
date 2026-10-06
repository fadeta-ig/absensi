"use client";

import { useEffect, useRef, useState } from "react";

interface DebouncedSearchResult<T> {
    results: T[];
    searching: boolean;
}

/**
 * Pencarian debounce + AbortController terpusat.
 * Fetch sebelumnya dibatalkan saat query berubah; hasil basi diabaikan.
 */
export function useDebouncedSearch<T>(
    query: string,
    fetcher: (query: string, signal: AbortSignal) => Promise<T[]>,
    delay = 300,
    minLength = 2
): DebouncedSearchResult<T> {
    const [results, setResults] = useState<T[]>([]);
    const [searching, setSearching] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seqRef = useRef(0);

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        const q = query.trim();
        if (q.length < minLength) {
            setResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const seq = ++seqRef.current;
        const controller = new AbortController();
        timerRef.current = setTimeout(async () => {
            try {
                const data = await fetcher(q, controller.signal);
                if (seqRef.current === seq) setResults(data);
            } catch {
                if (seqRef.current === seq) setResults([]);
            } finally {
                if (seqRef.current === seq) setSearching(false);
            }
        }, delay);
        return () => {
            controller.abort();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [query, fetcher, delay, minLength]);

    return { results, searching };
}
