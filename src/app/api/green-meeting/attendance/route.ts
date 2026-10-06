import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    updateAttendance,
    bulkMarkAllPresent,
    bulkUpdateAttendanceStatus,
    GreenMeetingError,
} from "@/lib/services/greenMeetingService";
import { requireGreenMeetingManager, ok } from "../_guard";
import { greenMeetingAttendanceUpdateSchema } from "@/lib/validations/validationSchemas";
import { z } from "zod";

const attendancePatchSchema = greenMeetingAttendanceUpdateSchema.extend({
    attendanceId: z.string().trim().min(1, "Attendance ID wajib diisi"),
    sessionId: z.string().trim().min(1).optional(),
});

const bulkAttendanceSchema = z.object({
    sessionId: z.string().trim().min(1, "Session ID wajib diisi"),
    action: z.enum(["MARK_ALL_PRESENT", "MARK_SELECTED_PRESENT", "MARK_SELECTED_ALPA"]),
    attendanceIds: z.array(z.string().trim().min(1)).max(500).optional(),
}).refine(
    (data) => {
        if (data.action === "MARK_SELECTED_PRESENT" || data.action === "MARK_SELECTED_ALPA") {
            return (data.attendanceIds?.length ?? 0) > 0;
        }
        return true;
    },
    { message: "Pilih minimal 1 karyawan.", path: ["attendanceIds"] }
);

export async function PATCH(request: NextRequest) {
    const { session, errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, attendancePatchSchema);
        if ("error" in result) return result.error;

        const { attendanceId, sessionId, ...data } = result.data;
        const updated = await updateAttendance(attendanceId, data, session.username, sessionId);
        return ok(updated, "Presensi berhasil diperbarui.");
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingAttendancePATCH", err);
    }
}

export async function POST(request: NextRequest) {
    const { session, errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, bulkAttendanceSchema);
        if ("error" in result) return result.error;

        let updatedAttendances;
        let message = "Presensi berhasil diperbarui.";

        if (result.data.action === "MARK_ALL_PRESENT") {
            if (result.data.attendanceIds && result.data.attendanceIds.length > 0) {
                return NextResponse.json(
                    { error: "MARK_ALL_PRESENT tidak memakai attendanceIds." },
                    { status: 400 }
                );
            }
            updatedAttendances = await bulkMarkAllPresent(result.data.sessionId, session.username);
            message = "Seluruh karyawan berhasil ditandai Hadir.";
        } else if (result.data.action === "MARK_SELECTED_PRESENT") {
            const ids = [...new Set((result.data.attendanceIds || []).map((id) => id.trim()).filter(Boolean))];
            updatedAttendances = await bulkUpdateAttendanceStatus(result.data.sessionId, ids, "HADIR", session.username);
            message = `${ids.length} karyawan terpilih berhasil ditandai Hadir.`;
        } else if (result.data.action === "MARK_SELECTED_ALPA") {
            const ids = [...new Set((result.data.attendanceIds || []).map((id) => id.trim()).filter(Boolean))];
            updatedAttendances = await bulkUpdateAttendanceStatus(result.data.sessionId, ids, "ALPA", session.username);
            message = `${ids.length} karyawan terpilih berhasil ditandai Alpa.`;
        }

        return ok({ attendances: updatedAttendances }, message);
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingAttendanceBulkPOST", err);
    }
}
