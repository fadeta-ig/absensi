import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

export interface AppointmentListItem {
    id: string;
    title: string;
    status: string;
    lifecycle?: string;
    startAt: string;
    endAt: string;
    isFullDay: boolean;
    meetingLink: string | null;
    requesterEmployeeId: string | null;
    room: { id: string; name: string } | null;
    participants: Array<{ id: string; employeeId: string | null; guestName: string | null; isExternal: boolean; attendance: string; inviteStatus?: string; inviteRespondedAt?: string | null; inviteNote?: string | null; employee?: { name: string } | null }>;
}

export function participantDisplayName(p: { employeeId: string | null; guestName: string | null; employee?: { name: string } | null }): string {
    if (p.employeeId) return p.employee?.name ?? p.employeeId;
    return p.guestName ?? "Tamu";
}

export interface AppointmentListFilter {
    q?: string;
    roomId?: string;
    status?: string;
}

export async function fetchUpcomingAppointments(
    signal: AbortSignal,
    filter: AppointmentListFilter = {}
): Promise<{ items: AppointmentListItem[]; error: string | null }> {
    const t = new Date();
    const from = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    const params = new URLSearchParams({ from, limit: "30" });
    if (filter.q?.trim()) params.set("q", filter.q.trim());
    if (filter.roomId) params.set("roomId", filter.roomId);
    if (filter.status) params.set("status", filter.status);
    try {
        const res = await fetch(`/api/appointments?${params.toString()}`, { signal });
        if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat meeting mendatang."));
        const json: unknown = await res.json();
        const items =
            json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)
                ? (json as { data: AppointmentListItem[] }).data
                : [];
        return { items, error: null };
    } catch (error) {
        if (signal.aborted) return { items: [], error: null };
        reportClientError("useAppointments", "Gagal memuat mendatang", error);
        return { items: [], error: error instanceof Error ? error.message : "Gagal memuat." };
    }
}

export async function fetchMonthAppointments(
    year: number,
    month: number,
    signal: AbortSignal,
    filter: AppointmentListFilter = {}
): Promise<{ items: AppointmentListItem[]; error: string | null }> {
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const params = new URLSearchParams({ from, to, limit: "100" });
    if (filter.q?.trim()) params.set("q", filter.q.trim());
    if (filter.roomId) params.set("roomId", filter.roomId);
    if (filter.status) params.set("status", filter.status);
    try {
        const res = await fetch(`/api/appointments?${params.toString()}`, { signal });
        if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat meeting."));
        const json: unknown = await res.json();
        const items =
            json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)
                ? (json as { data: AppointmentListItem[] }).data
                : [];
        return { items, error: null };
    } catch (error) {
        if (signal.aborted) return { items: [], error: null };
        reportClientError("useAppointments", "Gagal memuat janji rapat", error, { year, month });
        return { items: [], error: error instanceof Error ? error.message : "Gagal memuat meeting." };
    }
}
