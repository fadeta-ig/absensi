"use client";

/** Fetch JSON dengan pesan error server diteruskan sebagai Error. */
export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
            (errJson as { error?: string }).error ||
                (errJson as { message?: string }).message ||
                "Permintaan gagal diproses."
        );
    }
    const json = (await res.json()) as { success?: boolean; data?: T } | T;
    // Kompatibel envelope ok() {success,data} vs mentah: kembalikan data bila envelope.
    if (json && typeof json === "object" && "success" in json && "data" in (json as object)) {
        return (json as { data: T }).data;
    }
    return json as T;
}

export function apiGet<T>(url: string, init?: RequestInit): Promise<T> {
    return apiJson<T>(url, init);
}

/** Mutasi JSON (POST/PATCH/DELETE); melempar Error berisi pesan server. */
export function apiSend<T>(
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
    init?: RequestInit
): Promise<T> {
    return apiJson<T>(url, {
        ...init,
        method,
        headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: init?.signal,
    });
}

/** Fetcher tunggal autocomplete karyawan Green Meeting (hindari triple-copy). */
export async function fetchGreenMeetingEmployees(
    q: string,
    signal?: AbortSignal
): Promise<
    Array<{
        id: string;
        employeeId: string;
        name: string;
        department: string;
        departmentId: string | null;
        division: string;
        divisionId: string | null;
        position: string;
    }>
> {
    const res = await fetch(`/api/green-meeting/employees?q=${encodeURIComponent(q)}&limit=8`, { signal });
    if (!res.ok) return [];
    return (await res.json().catch(() => [])) as Array<{
        id: string;
        employeeId: string;
        name: string;
        department: string;
        departmentId: string | null;
        division: string;
        divisionId: string | null;
        position: string;
    }>;
}
