import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { isWig002, AppointmentError } from "@/lib/services/appointmentService";
import {
    getMeetingTopViewerInfos,
    setMeetingTopViewers,
    removeMeetingTopViewer,
    AppSettingsError,
} from "@/lib/services/appSettingsService";
import { meetingTopViewersSchema } from "@/lib/validations/validationSchemas";
import { validateBody } from "@/lib/middleware/apiGuard";
import { z } from "zod";

/**
 * GET/POST/DELETE /api/ga/meeting-settings/top-viewers — daftar pemantau
 * e-meeting (max 5), HANYA oleh WIG002.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const infos = await getMeetingTopViewerInfos();
        return NextResponse.json({ success: true, data: infos });
    } catch (err) {
        return serverErrorResponse("MeetingTopViewersGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    const validation = await validateBody(request, meetingTopViewersSchema);
    if ("error" in validation) return validation.error;

    try {
        const result = await setMeetingTopViewers(validation.data.employeeIds, session.userId);
        const infos = await getMeetingTopViewerInfos();
        return NextResponse.json({ success: true, data: { ...result, infos } });
    } catch (err) {
        if (err instanceof AppSettingsError || err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingTopViewersPOST", err);
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
        const result = await removeMeetingTopViewer(parsed.data, session.userId);
        const infos = await getMeetingTopViewerInfos();
        return NextResponse.json({ success: true, data: { ...result, infos } });
    } catch (err) {
        if (err instanceof AppSettingsError || err instanceof AppointmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingTopViewersDELETE", err);
    }
}
