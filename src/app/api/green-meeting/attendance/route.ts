import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    updateAttendance,
    bulkMarkAllPresent,
    bulkUpdateAttendanceStatus,
    canManageGreenMeeting,
    GreenMeetingError,
} from "@/lib/services/greenMeetingService";
import { greenMeetingAttendanceUpdateSchema } from "@/lib/validations/validationSchemas";
import { z } from "zod";

const attendancePatchSchema = greenMeetingAttendanceUpdateSchema.extend({
    attendanceId: z.string().min(1, "Attendance ID wajib diisi"),
});

const bulkAttendanceSchema = z.object({
    sessionId: z.string().min(1, "Session ID wajib diisi"),
    action: z.enum(["MARK_ALL_PRESENT", "MARK_SELECTED_PRESENT", "MARK_SELECTED_ALPA"]),
    attendanceIds: z.array(z.string()).optional(),
});

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const isManager = await canManageGreenMeeting(session);
    if (!isManager) return forbiddenResponse();

    try {
        const result = await validateBody(request, attendancePatchSchema);
        if ("error" in result) return result.error;

        const { attendanceId, ...data } = result.data;
        const updated = await updateAttendance(attendanceId, data, session.username);
        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingAttendancePATCH", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const isManager = await canManageGreenMeeting(session);
    if (!isManager) return forbiddenResponse();

    try {
        const result = await validateBody(request, bulkAttendanceSchema);
        if ("error" in result) return result.error;

        let updatedAttendances;
        let message = "Presensi berhasil diperbarui.";

        if (result.data.action === "MARK_ALL_PRESENT") {
            updatedAttendances = await bulkMarkAllPresent(result.data.sessionId, session.username);
            message = "Seluruh perwakilan departemen berhasil ditandai Hadir.";
        } else if (result.data.action === "MARK_SELECTED_PRESENT") {
            const ids = result.data.attendanceIds || [];
            updatedAttendances = await bulkUpdateAttendanceStatus(result.data.sessionId, ids, "HADIR", session.username);
            message = `${ids.length} departemen terpilih berhasil ditandai Hadir.`;
        } else if (result.data.action === "MARK_SELECTED_ALPA") {
            const ids = result.data.attendanceIds || [];
            updatedAttendances = await bulkUpdateAttendanceStatus(result.data.sessionId, ids, "ALPA", session.username);
            message = `${ids.length} departemen terpilih berhasil ditandai Alpa.`;
        }

        return NextResponse.json({
            message,
            attendances: updatedAttendances,
        });
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingAttendanceBulkPOST", err);
    }
}
