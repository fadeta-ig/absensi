import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { isWig002, AppointmentError } from "@/lib/services/appointmentService";
import {
    getMeetingReceptionistInfos,
    setMeetingReceptionists,
    removeMeetingReceptionist,
    AppSettingsError,
} from "@/lib/services/appSettingsService";
import { meetingReceptionistsSchema } from "@/lib/validations/validationSchemas";
import { validateBody } from "@/lib/middleware/apiGuard";
import { z } from "zod";

/**
 * GET/POST/DELETE /api/ga/meeting-settings/receptionists — daftar resepsionis
 * e-meeting (max 5), HANYA oleh WIG002.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const infos = await getMeetingReceptionistInfos();
        return NextResponse.json({ success: true, data: infos });
    } catch (err) {
        return serverErrorResponse("MeetingReceptionistsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    const validation = await validateBody(request, meetingReceptionistsSchema);
    if ("error" in validation) return validation.error;

    try {
        const result = await setMeetingReceptionists(validation.data.employeeIds, session.userId);
        const infos = await getMeetingReceptionistInfos();
        return NextResponse.json({ success: true, data: { ...result, infos } });
    } catch (err) {
        if (err instanceof AppSettingsError || err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingReceptionistsPOST", err);
    }
}

export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const parsed = z.string().trim().min(1, "ID wajib diisi.").max(100).safeParse(searchParams.get("id") ?? "");
        if (!parsed.success) {
            return NextResponse.json({ error: "Parameter id wajib diisi." }, { status: 400 });
        }
        const result = await removeMeetingReceptionist(parsed.data, session.userId);
        const infos = await getMeetingReceptionistInfos();
        return NextResponse.json({ success: true, data: { ...result, infos } });
    } catch (err) {
        if (err instanceof AppSettingsError || err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingReceptionistsDELETE", err);
    }
}
