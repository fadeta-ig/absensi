"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEmployeeDraftOwner } from "@/components/employee/EmployeeDraftContext";
import {
    DEFAULT_DRAFT_TTL_MS,
    readEmployeeDraft,
    removeEmployeeDraft,
    writeEmployeeDraft,
} from "@/lib/formPersistence";

export interface UseEmployeeDraftOptions<T> {
    /** Unique logical form key inside Employee Portal (e.g. "overtime:create", "assets:ticket:damage:123"). */
    formKey: string | null;
    /** Live form state value to persist. */
    value: T;
    /** Returns true if `value` contains meaningful user edits worth persisting; false removes any stored draft. */
    isDirty: (value: T) => boolean;
    /** Optional runtime type guard applied when reading stored drafts. */
    validate?: (raw: unknown) => raw is T;
    /** Optional server baseline snapshot for edit forms; mismatches auto-discard stale drafts. */
    baseline?: unknown;
    /** Explicitly marks `baseline` as active (useful when baseline can be null/empty string). */
    hasBaseline?: boolean;
    /** Enable/disable persistence (e.g. wait for server data load or disable in read-only mode). */
    enabled?: boolean;
    /** Called once when a valid draft is restored for the active `(owner, formKey)`. */
    onRestore: (draft: T, meta: { updatedAt: number }) => void;
    /** Optional callback fired if a stale draft was discarded because server data changed. */
    onStaleDiscarded?: () => void;
    /** Debounce delay in ms (default 250ms). Flush still runs immediately on pagehide/beforeunload/unmount. */
    debounceMs?: number;
    /** Time-to-live in ms (default 24h). */
    ttlMs?: number;
    /** Optional explicit owner scope override; defaults to `EmployeeDraftContext`. */
    ownerOverride?: string | null;
}

export interface UseEmployeeDraftResult {
    /** True when a stored draft was restored for the current form session and not yet cleared/discarded. */
    restored: boolean;
    /** Clears stored draft & suppresses re-saving until state returns clean or changes (call after successful submit). */
    clearDraft: () => void;
    /** Clears stored draft and hides the restored notice (use for explicit user "Reset / Buang draf"). */
    discardDraft: () => void;
    /** Hides the restored indicator without deleting the underlying draft. */
    dismissRestored: () => void;
    /** Immediately flushes the latest committed state to storage. */
    flushNow: () => void;
}

interface CommittedSnapshot<T> {
    identity: string;
    owner: string;
    formKey: string;
    value: T;
    dirty: boolean;
    baseline: unknown;
    hasBaseline: boolean;
    ttlMs: number;
}

export function useEmployeeDraft<T>({
    formKey,
    value,
    isDirty,
    validate,
    baseline,
    hasBaseline = false,
    enabled = true,
    onRestore,
    onStaleDiscarded,
    debounceMs = 250,
    ttlMs = DEFAULT_DRAFT_TTL_MS,
    ownerOverride,
}: UseEmployeeDraftOptions<T>): UseEmployeeDraftResult {
    const contextOwner = useEmployeeDraftOwner();
    const owner = ownerOverride !== undefined ? ownerOverride : contextOwner;
    const activeIdentity = enabled && owner && formKey ? `${owner}::${formKey}` : null;

    const [restored, setRestored] = useState(false);

    // Keep latest callbacks/baseline in refs updated in Effect 1 (React 19 strict-safe).
    const onRestoreRef = useRef(onRestore);
    const onStaleDiscardedRef = useRef(onStaleDiscarded);
    const isDirtyRef = useRef(isDirty);
    const validateRef = useRef(validate);
    const baselineRef = useRef(baseline);
    const hasBaselineRef = useRef(hasBaseline);
    const ttlMsRef = useRef(ttlMs);

    const hydratedIdentityRef = useRef<string | null>(null);
    const skipSaveInCommitRef = useRef(false);
    const clearedRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const committedRef = useRef<CommittedSnapshot<T> | null>(null);
    const activeIdentityRef = useRef<string | null>(activeIdentity);
    const activeOwnerRef = useRef<string | null>(owner);
    const activeFormKeyRef = useRef<string | null>(formKey);

    const cancelTimer = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const flushSnapshot = useCallback((snapshot: CommittedSnapshot<T> | null) => {
        if (!snapshot || clearedRef.current) return;
        if (snapshot.dirty) {
            writeEmployeeDraft(snapshot.owner, snapshot.formKey, snapshot.value, {
                ttlMs: snapshot.ttlMs,
                baseline: snapshot.baseline,
                hasBaseline: snapshot.hasBaseline,
            });
        } else {
            removeEmployeeDraft(snapshot.owner, snapshot.formKey);
        }
    }, []);

    // Effect 1: Synchronize callback/metadata refs before hydration & save effects run.
    useEffect(() => {
        onRestoreRef.current = onRestore;
        onStaleDiscardedRef.current = onStaleDiscarded;
        isDirtyRef.current = isDirty;
        validateRef.current = validate;
        baselineRef.current = baseline;
        hasBaselineRef.current = hasBaseline;
        ttlMsRef.current = ttlMs;
        activeIdentityRef.current = activeIdentity;
        activeOwnerRef.current = owner;
        activeFormKeyRef.current = formKey;
    });

    // Effect 2: Hydrate once per active `(owner, formKey)` activation, and flush outgoing identity on switch/unmount.
    useEffect(() => {
        if (!activeIdentity || !owner || !formKey) {
            hydratedIdentityRef.current = null;
            committedRef.current = null;
            clearedRef.current = false;
            queueMicrotask(() => setRestored(false));
            return;
        }

        const expectedBaselineActive =
            hasBaselineRef.current || baselineRef.current !== undefined;

        const result = readEmployeeDraft<T>(owner, formKey, {
            validate: validateRef.current,
            expectedBaseline: baselineRef.current,
            hasExpectedBaseline: expectedBaselineActive,
        });

        hydratedIdentityRef.current = activeIdentity;
        clearedRef.current = false;
        skipSaveInCommitRef.current = true;

        if (result.status === "found") {
            committedRef.current = {
                identity: activeIdentity,
                owner,
                formKey,
                value: result.data,
                dirty: true,
                baseline: baselineRef.current,
                hasBaseline: expectedBaselineActive,
                ttlMs: ttlMsRef.current,
            };
            onRestoreRef.current(result.data, { updatedAt: result.updatedAt });
            queueMicrotask(() => setRestored(true));
        } else {
            committedRef.current = null;
            queueMicrotask(() => setRestored(false));
            if (result.status === "stale") {
                onStaleDiscardedRef.current?.();
            }
        }

        const capturedIdentity = activeIdentity;

        const handleLifecycleFlush = () => {
            if (
                committedRef.current &&
                committedRef.current.identity === capturedIdentity &&
                !clearedRef.current
            ) {
                cancelTimer();
                flushSnapshot(committedRef.current);
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                handleLifecycleFlush();
            }
        };

        window.addEventListener("pagehide", handleLifecycleFlush);
        window.addEventListener("beforeunload", handleLifecycleFlush);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.removeEventListener("pagehide", handleLifecycleFlush);
            window.removeEventListener("beforeunload", handleLifecycleFlush);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            cancelTimer();
            if (
                committedRef.current &&
                committedRef.current.identity === capturedIdentity &&
                !clearedRef.current
            ) {
                flushSnapshot(committedRef.current);
            }
        };
    }, [activeIdentity, owner, formKey, cancelTimer, flushSnapshot]);

    // Effect 3: Persist value changes with short debounce after hydration completes.
    useEffect(() => {
        if (!activeIdentity || !owner || !formKey) return;
        if (hydratedIdentityRef.current !== activeIdentity) return;

        if (skipSaveInCommitRef.current) {
            skipSaveInCommitRef.current = false;
            return;
        }

        const dirty = isDirtyRef.current(value);

        // Once form returns to a clean/empty state after clearDraft(), lift suppression so future edits persist.
        if (!dirty && clearedRef.current) {
            clearedRef.current = false;
            committedRef.current = {
                identity: activeIdentity,
                owner,
                formKey,
                value,
                dirty: false,
                baseline: baselineRef.current,
                hasBaseline: hasBaselineRef.current || baselineRef.current !== undefined,
                ttlMs: ttlMsRef.current,
            };
            cancelTimer();
            removeEmployeeDraft(owner, formKey);
            return;
        }

        if (clearedRef.current) {
            return;
        }

        const snapshot: CommittedSnapshot<T> = {
            identity: activeIdentity,
            owner,
            formKey,
            value,
            dirty,
            baseline: baselineRef.current,
            hasBaseline: hasBaselineRef.current || baselineRef.current !== undefined,
            ttlMs: ttlMsRef.current,
        };
        committedRef.current = snapshot;

        cancelTimer();
        if (!dirty) {
            removeEmployeeDraft(owner, formKey);
            return;
        }

        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            if (
                committedRef.current &&
                committedRef.current.identity === activeIdentity &&
                !clearedRef.current
            ) {
                flushSnapshot(committedRef.current);
            }
        }, debounceMs);
    }, [activeIdentity, owner, formKey, value, debounceMs, cancelTimer, flushSnapshot]);

    const clearDraft = useCallback(() => {
        cancelTimer();
        clearedRef.current = true;
        committedRef.current = null;
        setRestored(false);
        removeEmployeeDraft(activeOwnerRef.current, activeFormKeyRef.current);
    }, [cancelTimer]);

    const discardDraft = useCallback(() => {
        clearDraft();
    }, [clearDraft]);

    const dismissRestored = useCallback(() => {
        setRestored(false);
    }, []);

    const flushNow = useCallback(() => {
        cancelTimer();
        if (
            committedRef.current &&
            committedRef.current.identity === activeIdentityRef.current &&
            !clearedRef.current
        ) {
            flushSnapshot(committedRef.current);
        }
    }, [cancelTimer, flushSnapshot]);

    return {
        restored,
        clearDraft,
        discardDraft,
        dismissRestored,
        flushNow,
    };
}
