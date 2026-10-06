import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    quickMarkPresentByEmployee,
    GreenMeetingError,
} from "@/lib/services/greenMeetingService";
import { requireGreenMeetingManager, ok } from "../../_guard";
import { z } from "zod";

const quickMarkSchema = z.object({
    sessionId: z.string().trim().min(1, "Session ID wajib diisi"),
    employeeId: z.string().trim().min(1, "employeeId wajib diisi").max(100),
});

/**
 * POST /api/green-meeting/attendance/quick — cari nama karyawan lalu tandai Hadir.
 * Dept/divisi terisi otomatis dari master HR. Guard: GA pengelola saja.
 */
export async function POST(request: NextRequest) {
    const { session, errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, quickMarkSchema);
        if ("error" in result) return result.error;

        const marked = await quickMarkPresentByEmployee(
            result.data.sessionId,
            result.data.employeeId,
            session.username
        );
        return ok(marked, "Karyawan ditandai Hadir.", 201);
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingAttendanceQuickPOST", err);
    }
}
