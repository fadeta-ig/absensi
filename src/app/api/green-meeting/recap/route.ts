import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getMeetingRecap, canManageGreenMeeting, GreenMeetingError } from "@/lib/services/greenMeetingService";
import { toWIBDateString, isValidCalendarDate } from "@/lib/timezone";
import { PERMISSIONS } from "@/lib/permissions";
import { z } from "zod";

const recapQuerySchema = z.object({
    startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Format startDate harus YYYY-MM-DD.")
        .refine((v) => isValidCalendarDate(v), "startDate tidak valid."),
    endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Format endDate harus YYYY-MM-DD.")
        .refine((v) => isValidCalendarDate(v), "endDate tidak valid."),
    includeSessions: z.enum(["true", "false"]).optional().default("false"),
}).refine((v) => v.startDate <= v.endDate, {
    message: "startDate tidak boleh setelah endDate.",
    path: ["startDate"],
});

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    // Rekap lintas periode: GA pengelola atau HR pemantau.
    const isManager = await canManageGreenMeeting(session);
    const isHr = session.permissions.includes(PERMISSIONS.HR_MANAGE);
    if (!isManager && !isHr) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const today = toWIBDateString();
        // Default: 30 hari ke belakang
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const defaultStart = toWIBDateString(thirtyDaysAgo);

        const parsed = recapQuerySchema.safeParse({
            startDate: searchParams.get("startDate") || defaultStart,
            endDate: searchParams.get("endDate") || today,
            includeSessions: searchParams.get("includeSessions") || "false",
        });
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || "Rentang tanggal tidak valid." },
                { status: 400 }
            );
        }
        // Batasi 366 hari kalender inklusif (end-start+1 <= 366) agar payload tetap ringan.
        const spanDays =
            (new Date(`${parsed.data.endDate}T00:00:00Z`).getTime() -
                new Date(`${parsed.data.startDate}T00:00:00Z`).getTime()) /
            86400000;
        if (spanDays < 0 || spanDays + 1 > 366) {
            return NextResponse.json({ error: "Rentang maksimal 366 hari." }, { status: 400 });
        }

        const recap = await getMeetingRecap(parsed.data.startDate, parsed.data.endDate, {
            includeSessions: parsed.data.includeSessions === "true",
        });
        return NextResponse.json(recap);
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingRecapGET", err);
    }
}
