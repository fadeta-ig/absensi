"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface UseFormDraftOptions<T> {
  key: string;
  initialValue: T;
  debounceMs?: number;
  enabled?: boolean;
  maxAgeHours?: number; // Expiration time in hours (default: 24)
}

interface StoredDraft<T> {
  data: T;
  timestamp: string;
}

export function useFormDraft<T>({
  key,
  initialValue,
  debounceMs = 500,
  enabled = true,
  maxAgeHours = 24,
}: UseFormDraftOptions<T>) {
  const [formData, setFormData] = useState<T>(initialValue);
  const [hasDraft, setHasDraft] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const isInitializedRef = useRef(false);

  // 1. Read draft from localStorage on mount
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    try {
      const savedRaw = localStorage.getItem(key);
      if (savedRaw) {
        const parsed: StoredDraft<T> = JSON.parse(savedRaw);
        const draftDate = new Date(parsed.timestamp);
        const now = new Date();
        const ageInHours = (now.getTime() - draftDate.getTime()) / (1000 * 60 * 60);

        // Check if draft has expired
        if (ageInHours <= maxAgeHours) {
          setFormData(parsed.data);
          setHasDraft(true);
          setLastSaved(draftDate);
        } else {
          // Expired draft, clean it up
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error(`[useFormDraft] Failed to load draft for key "${key}":`, error);
    } finally {
      isInitializedRef.current = true;
    }
  }, [key, enabled, maxAgeHours]);

  // 2. Debounced sync to localStorage whenever formData changes
  useEffect(() => {
    if (!enabled || !isInitializedRef.current || typeof window === "undefined") return;

    const handler = setTimeout(() => {
      try {
        const payload: StoredDraft<T> = {
          data: formData,
          timestamp: new Date().toISOString(),
        };
        localStorage.setItem(key, JSON.stringify(payload));
        setHasDraft(true);
        setLastSaved(new Date());
      } catch (error) {
        console.error(`[useFormDraft] Failed to persist draft for key "${key}":`, error);
      }
    }, debounceMs);

    return () => clearTimeout(handler);
  }, [formData, key, debounceMs, enabled]);

  // 3. Helper to clear stored draft after successful submit or manual reset
  const clearDraft = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`[useFormDraft] Failed to clear draft for key "${key}":`, error);
      }
      setHasDraft(false);
      setLastSaved(null);
    }
  }, [key]);

  return {
    formData,
    setFormData,
    hasDraft,
    lastSaved,
    clearDraft,
  };
}
