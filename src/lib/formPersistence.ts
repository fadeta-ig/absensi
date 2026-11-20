/**
 * Client-side form draft persistence engine for the Employee Portal.
 *
 * Security & integrity guarantees:
 * - Every entry is namespaced by authenticated owner (`userId::employeeId`) in BOTH the
 *   storage key and the JSON envelope, preventing cross-account data leaks.
 * - Optional baseline snapshots allow edit forms to reject stale drafts when fresher
 *   server data exists.
 * - Corrupted JSON, schema mismatches, and expired drafts (TTL) are auto-purged without
 *   throwing or breaking live UI state.
 * - `QuotaExceededError` triggers expired-draft pruning and degrades silently without
 *   interrupting the user.
 * - Never store secrets (passwords), live anti-fraud telemetry (selfie/GPS/Wi-Fi),
 *   biometric signatures, or large binary attachments here.
 */

export const DRAFT_STORAGE_PREFIX = "wits:emp-draft:v1:";
export const ACTIVE_OWNER_KEY = "wits:emp-draft:active-owner";
export const DRAFT_SCHEMA_VERSION = 1;
export const DEFAULT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface DraftEnvelope<T> {
    version: number;
    owner: string;
    formKey: string;
    updatedAt: number;
    expiresAt: number;
    baseline?: unknown;
    data: T;
}

export interface ReadDraftOptions<T> {
    /** Runtime validator for the persisted payload. Invalid data is removed and ignored. */
    validate?: (value: unknown) => value is T;
    /** Current server snapshot for edit forms; mismatches mark the draft as stale and discard it. */
    expectedBaseline?: unknown;
    /** Explicitly enable baseline comparison (useful when expectedBaseline can be `null` or `""`). */
    hasExpectedBaseline?: boolean;
    /** Override current timestamp (for deterministic tests). */
    now?: number;
    /** Override Storage implementation (for unit tests). */
    storage?: Storage | null;
}

export type ReadDraftResult<T> =
    | { status: "found"; data: T; updatedAt: number; baseline?: unknown }
    | { status: "missing" }
    | { status: "expired" }
    | { status: "stale" }
    | { status: "invalid" };

export interface WriteDraftOptions {
    ttlMs?: number;
    baseline?: unknown;
    hasBaseline?: boolean;
    now?: number;
    storage?: Storage | null;
}

export function getBrowserLocalStorage(): Storage | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function resolveStorage(override?: Storage | null): Storage | null {
    if (override !== undefined) return override;
    return getBrowserLocalStorage();
}

/**
 * Builds a deterministic, collision-safe owner scope for an authenticated employee session.
 * Returns `null` if no valid authenticated user identity is present.
 */
export function buildOwnerScope(
    userId?: string | null,
    employeeId?: string | null
): string | null {
    const cleanUserId = typeof userId === "string" ? userId.trim() : "";
    if (!cleanUserId) return null;
    const cleanEmployeeId = typeof employeeId === "string" ? employeeId.trim() : "";
    return `${cleanUserId}::${cleanEmployeeId || "none"}`;
}

/** Builds the physical `localStorage` key for `(owner, formKey)`. */
export function buildDraftStorageKey(owner: string, formKey: string): string {
    return `${DRAFT_STORAGE_PREFIX}${encodeURIComponent(owner)}::${formKey}`;
}

/** Extracts the owner prefix segment from a draft storage key, or `null` if unrelated. */
function extractOwnerFromKey(storageKey: string): string | null {
    if (!storageKey.startsWith(DRAFT_STORAGE_PREFIX)) return null;
    const rest = storageKey.slice(DRAFT_STORAGE_PREFIX.length);
    const sepIndex = rest.indexOf("::");
    if (sepIndex <= 0) return null;
    try {
        return decodeURIComponent(rest.slice(0, sepIndex));
    } catch {
        return null;
    }
}

/**
 * Structural deep equality for plain JSON-serializable values.
 * Object key order does not matter. Protected by max depth against pathological input.
 */
export function deepEqual(a: unknown, b: unknown, depth = 0): boolean {
    if (Object.is(a, b)) return true;
    if (depth > 16) return false;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
        return false;
    }

    const aIsArray = Array.isArray(a);
    const bIsArray = Array.isArray(b);
    if (aIsArray !== bIsArray) return false;

    if (aIsArray && bIsArray) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i += 1) {
            if (!deepEqual(a[i], b[i], depth + 1)) return false;
        }
        return true;
    }

    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA).filter((k) => objA[k] !== undefined);
    const keysB = Object.keys(objB).filter((k) => objB[k] !== undefined);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
        if (!deepEqual(objA[key], objB[key], depth + 1)) return false;
    }
    return true;
}

function safeRemoveKey(storage: Storage, key: string): void {
    try {
        storage.removeItem(key);
    } catch {
        // Ignore storage removal errors in restricted browser modes.
    }
}

function listDraftKeys(storage: Storage): string[] {
    const keys: string[] = [];
    try {
        for (let i = 0; i < storage.length; i += 1) {
            const key = storage.key(i);
            if (key && key.startsWith(DRAFT_STORAGE_PREFIX)) {
                keys.push(key);
            }
        }
    } catch {
        return [];
    }
    return keys;
}

/** Reads and validates a draft for `(owner, formKey)`. Auto-purges invalid, expired, or stale drafts. */
export function readEmployeeDraft<T>(
    owner: string | null,
    formKey: string | null,
    options?: ReadDraftOptions<T>
): ReadDraftResult<T> {
    const storage = resolveStorage(options?.storage);
    if (!owner || !formKey || !storage) {
        return { status: "missing" };
    }

    const key = buildDraftStorageKey(owner, formKey);
    let raw: string | null = null;
    try {
        raw = storage.getItem(key);
    } catch {
        return { status: "missing" };
    }

    if (!raw) {
        return { status: "missing" };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        safeRemoveKey(storage, key);
        return { status: "invalid" };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        safeRemoveKey(storage, key);
        return { status: "invalid" };
    }

    const envelope = parsed as Partial<DraftEnvelope<unknown>>;
    if (
        envelope.version !== DRAFT_SCHEMA_VERSION ||
        envelope.owner !== owner ||
        envelope.formKey !== formKey ||
        typeof envelope.updatedAt !== "number" ||
        !Number.isFinite(envelope.updatedAt) ||
        typeof envelope.expiresAt !== "number" ||
        !Number.isFinite(envelope.expiresAt) ||
        !("data" in envelope)
    ) {
        safeRemoveKey(storage, key);
        return { status: "invalid" };
    }

    const now = options?.now ?? Date.now();
    if (now >= envelope.expiresAt) {
        safeRemoveKey(storage, key);
        return { status: "expired" };
    }

    if (options?.validate && !options.validate(envelope.data)) {
        safeRemoveKey(storage, key);
        return { status: "invalid" };
    }

    const checkBaseline =
        options?.hasExpectedBaseline === true || options?.expectedBaseline !== undefined;
    if (checkBaseline) {
        if (!("baseline" in envelope) || !deepEqual(envelope.baseline, options?.expectedBaseline)) {
            safeRemoveKey(storage, key);
            return { status: "stale" };
        }
    }

    return {
        status: "found",
        data: envelope.data as T,
        updatedAt: envelope.updatedAt,
        baseline: envelope.baseline,
    };
}

/** Writes a draft envelope for `(owner, formKey)`. Handles quota errors gracefully. */
export function writeEmployeeDraft<T>(
    owner: string | null,
    formKey: string | null,
    data: T,
    options?: WriteDraftOptions
): boolean {
    const storage = resolveStorage(options?.storage);
    if (!owner || !formKey || !storage) {
        return false;
    }

    const now = options?.now ?? Date.now();
    const ttlMs = options?.ttlMs ?? DEFAULT_DRAFT_TTL_MS;
    const envelope: DraftEnvelope<T> = {
        version: DRAFT_SCHEMA_VERSION,
        owner,
        formKey,
        updatedAt: now,
        expiresAt: now + ttlMs,
        data,
    };
    if (options?.hasBaseline === true || options?.baseline !== undefined) {
        envelope.baseline = options.baseline;
    }

    let serialized: string;
    try {
        serialized = JSON.stringify(envelope);
    } catch {
        return false;
    }

    const key = buildDraftStorageKey(owner, formKey);
    try {
        storage.setItem(key, serialized);
        return true;
    } catch {
        // Likely QuotaExceededError — prune expired drafts once and retry.
        pruneExpiredEmployeeDrafts(storage, now);
        try {
            storage.setItem(key, serialized);
            return true;
        } catch {
            return false;
        }
    }
}

/** Removes a single draft entry for `(owner, formKey)`. */
export function removeEmployeeDraft(
    owner: string | null,
    formKey: string | null,
    storageOverride?: Storage | null
): void {
    const storage = resolveStorage(storageOverride);
    if (!owner || !formKey || !storage) return;
    safeRemoveKey(storage, buildDraftStorageKey(owner, formKey));
}

/** Removes expired or unparseable draft entries across all owners. */
export function pruneExpiredEmployeeDrafts(
    storageOverride?: Storage | null,
    now = Date.now()
): number {
    const storage = resolveStorage(storageOverride);
    if (!storage) return 0;

    let removed = 0;
    for (const key of listDraftKeys(storage)) {
        try {
            const raw = storage.getItem(key);
            if (!raw) {
                safeRemoveKey(storage, key);
                removed += 1;
                continue;
            }
            const parsed = JSON.parse(raw) as Partial<DraftEnvelope<unknown>>;
            if (
                !parsed ||
                typeof parsed !== "object" ||
                parsed.version !== DRAFT_SCHEMA_VERSION ||
                typeof parsed.expiresAt !== "number" ||
                !Number.isFinite(parsed.expiresAt) ||
                now >= parsed.expiresAt
            ) {
                safeRemoveKey(storage, key);
                removed += 1;
            }
        } catch {
            safeRemoveKey(storage, key);
            removed += 1;
        }
    }
    return removed;
}

/**
 * Synchronizes active authenticated owner in browser storage.
 * Immediately removes all drafts belonging to any OTHER account and prunes expired drafts.
 */
export function syncActiveDraftOwner(
    owner: string | null,
    storageOverride?: Storage | null,
    now = Date.now()
): { sweptForeignCount: number; prunedExpiredCount: number } {
    const storage = resolveStorage(storageOverride);
    if (!storage) {
        return { sweptForeignCount: 0, prunedExpiredCount: 0 };
    }

    if (!owner) {
        safeRemoveKey(storage, ACTIVE_OWNER_KEY);
        return { sweptForeignCount: 0, prunedExpiredCount: 0 };
    }

    let sweptForeignCount = 0;
    let prunedExpiredCount = 0;

    for (const key of listDraftKeys(storage)) {
        const keyOwner = extractOwnerFromKey(key);
        if (keyOwner !== owner) {
            safeRemoveKey(storage, key);
            sweptForeignCount += 1;
            continue;
        }

        // Verify envelope owner & TTL as defense-in-depth.
        try {
            const raw = storage.getItem(key);
            if (!raw) {
                safeRemoveKey(storage, key);
                prunedExpiredCount += 1;
                continue;
            }
            const parsed = JSON.parse(raw) as Partial<DraftEnvelope<unknown>>;
            if (parsed.owner !== owner) {
                safeRemoveKey(storage, key);
                sweptForeignCount += 1;
            } else if (
                parsed.version !== DRAFT_SCHEMA_VERSION ||
                typeof parsed.expiresAt !== "number" ||
                now >= parsed.expiresAt
            ) {
                safeRemoveKey(storage, key);
                prunedExpiredCount += 1;
            }
        } catch {
            safeRemoveKey(storage, key);
            prunedExpiredCount += 1;
        }
    }

    try {
        storage.setItem(ACTIVE_OWNER_KEY, owner);
    } catch {
        // Ignore quota/storage errors on marker write.
    }

    return { sweptForeignCount, prunedExpiredCount };
}

/** Clears all drafts owned by a specific account. */
export function clearEmployeeDraftsForOwner(
    owner: string | null,
    storageOverride?: Storage | null
): number {
    const storage = resolveStorage(storageOverride);
    if (!owner || !storage) return 0;

    let removed = 0;
    for (const key of listDraftKeys(storage)) {
        if (extractOwnerFromKey(key) === owner) {
            safeRemoveKey(storage, key);
            removed += 1;
        }
    }
    try {
        if (storage.getItem(ACTIVE_OWNER_KEY) === owner) {
            safeRemoveKey(storage, ACTIVE_OWNER_KEY);
        }
    } catch {
        // Ignore
    }
    return removed;
}

/** Clears EVERY employee portal form draft across all owners (e.g., on explicit logout). */
export function clearAllEmployeeDrafts(storageOverride?: Storage | null): number {
    const storage = resolveStorage(storageOverride);
    if (!storage) return 0;

    let removed = 0;
    for (const key of listDraftKeys(storage)) {
        safeRemoveKey(storage, key);
        removed += 1;
    }
    safeRemoveKey(storage, ACTIVE_OWNER_KEY);
    return removed;
}

/** Helper to check if a value is a plain non-null record for runtime validators. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Helper to format a list of previously attached filenames for re-attach reminders. */
export function formatReattachHint(names: readonly string[] | null | undefined): string | null {
    if (!names || names.length === 0) return null;
    const cleaned = names.map((n) => n.trim()).filter(Boolean);
    if (cleaned.length === 0) return null;
    if (cleaned.length === 1) {
        return `Lampiran sebelumnya (${cleaned[0]}) perlu dipilih ulang sebelum mengirim.`;
    }
    return `${cleaned.length} lampiran sebelumnya (${cleaned.slice(0, 2).join(", ")}${cleaned.length > 2 ? ", ..." : ""}) perlu dipilih ulang sebelum mengirim.`;
}
