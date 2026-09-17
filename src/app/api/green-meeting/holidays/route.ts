import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    getGreenMeetingHolidays,
    addGreenMeetingHoliday,
    deleteGreenMeetingHoliday,
    canManageGreenMeeting,
} from "@/lib/services/greenMeetingService";
import { greenMeetingHolidaySchema } from "@/lib/validations/validationSchemas";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const holidays = await getGreenMeetingHolidays();
        return NextResponse.json(holidays);
    } catch (err) {
        return serverErrorResponse("GreenMeetingHolidaysGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const isManager = await canManageGreenMeeting(session);
    if (!isManager) return forbiddenResponse();

    try {
        const result = await validateBody(request, greenMeetingHolidaySchema);
        if ("error" in result) return result.error;

        const holiday = await addGreenMeetingHoliday(result.data);
        return NextResponse.json(holiday, { status: 201 });
    } catch (err) {
        return serverErrorResponse("GreenMeetingHolidaysPOST", err);
    }
}

export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const isManager = await canManageGreenMeeting(session);
    if (!isManager) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "ID hari libur wajib disertakan." }, { status: 400 });
        }

        await deleteGreenMeetingHoliday(id);
        return NextResponse.json({ success: true, message: "Hari libur berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("GreenMeetingHolidaysDELETE", err);
    }
}
