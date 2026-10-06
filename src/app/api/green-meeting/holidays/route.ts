import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    getGreenMeetingHolidays,
    addGreenMeetingHoliday,
    deleteGreenMeetingHoliday,
    GreenMeetingError,
} from "@/lib/services/greenMeetingService";
import { requireGreenMeetingManager } from "../_guard";
import { greenMeetingHolidaySchema } from "@/lib/validations/validationSchemas";
import { z } from "zod";

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
    const { errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, greenMeetingHolidaySchema);
        if ("error" in result) return result.error;

        const holiday = await addGreenMeetingHoliday(result.data);
        return NextResponse.json(holiday, { status: 201 });
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingHolidaysPOST", err);
    }
}

export async function DELETE(request: NextRequest) {
    const { errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const { searchParams } = new URL(request.url);
        const parsed = z.string().trim().min(1, "ID hari libur wajib disertakan.").safeParse(searchParams.get("id") ?? "");
        if (!parsed.success) {
            return NextResponse.json({ error: "ID hari libur wajib disertakan." }, { status: 400 });
        }

        await deleteGreenMeetingHoliday(parsed.data);
        const { ok } = await import("../_guard");
        return ok({ id: parsed.data }, "Hari libur berhasil dihapus.");
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingHolidaysDELETE", err);
    }
}
