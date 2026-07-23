export type AuthChangeReason = "login" | "logout" | "session-changed";

export interface AuthChangeEvent {
    id: string;
    reason: AuthChangeReason;
    timestamp: number;
}

const AUTH_CHANGED_STORAGE_KEY = "wig:auth-changed";
const AUTH_CHANGED_EVENT_NAME = "wig:auth-changed";

function createAuthChangeEvent(reason: AuthChangeReason): AuthChangeEvent {
    return {
        id: typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        reason,
        timestamp: Date.now(),
    };
}

function parseAuthChangeEvent(value: string | null): AuthChangeEvent | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value) as Partial<AuthChangeEvent>;
        if (
            typeof parsed.id === "string"
            && typeof parsed.timestamp === "number"
            && (parsed.reason === "login" || parsed.reason === "logout" || parsed.reason === "session-changed")
        ) {
            return parsed as AuthChangeEvent;
        }
    } catch {
        return null;
    }
    return null;
}

export function notifyAuthChanged(reason: AuthChangeReason): void {
    if (typeof window === "undefined") return;

    const event = createAuthChangeEvent(reason);
    const serialized = JSON.stringify(event);

    try {
        window.localStorage.setItem(AUTH_CHANGED_STORAGE_KEY, serialized);
    } catch {
        // Auth flow should not fail if browser storage is unavailable.
    }

    window.dispatchEvent(new CustomEvent<AuthChangeEvent>(AUTH_CHANGED_EVENT_NAME, { detail: event }));
}

export function subscribeAuthChanged(callback: (event: AuthChangeEvent) => void): () => void {
    if (typeof window === "undefined") return () => undefined;

    const handleStorage = (event: StorageEvent) => {
        if (event.key !== AUTH_CHANGED_STORAGE_KEY) return;
        const parsed = parseAuthChangeEvent(event.newValue);
        if (parsed) callback(parsed);
    };

    const handleLocal = (event: Event) => {
        const detail = (event as CustomEvent<AuthChangeEvent>).detail;
        if (detail) callback(detail);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(AUTH_CHANGED_EVENT_NAME, handleLocal);

    return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(AUTH_CHANGED_EVENT_NAME, handleLocal);
    };
}
