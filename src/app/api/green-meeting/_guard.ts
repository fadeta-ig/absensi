import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse } from "@/lib/middleware/apiGuard";
import { canManageGreenMeeting } from "@/lib/services/greenMeetingService";
import type { SessionPayload } from "@/lib/auth";

/**
 * Guard bersama route Green Meeting: sesi aktif + hak kelola GA.
 * Mengembalikan { session } bila lolos, atau { errorResponse } untuk langsung di-return.
 */
export async function requireGreenMeetingManager(): Promise<
    { session: SessionPayload; errorResponse: null } | { session: null; errorResponse: NextResponse }
> {
    const session = await requireAuth();
    if (!session) return { session: null, errorResponse: unauthorizedResponse() };

    const isManager = await canManageGreenMeeting(session);
    if (!isManager) return { session: null, errorResponse: forbiddenResponse() };

    return { session, errorResponse: null };
}

/** Envelope sukses baku: { success: true, data, message? }. */
export function ok<T>(data: T, message?: string, status = 200) {
    return NextResponse.json(
        { success: true, data, ...(message ? { message } : {}) },
        { status }
    );
}
