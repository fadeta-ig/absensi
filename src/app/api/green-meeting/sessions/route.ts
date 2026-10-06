import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    getOrCreateTodaySession,
    getSessionByDate,
    updateMeetingSession,
    isDateOffDay,
    GreenMeetingError,
} from "@/lib/services/greenMeetingService";
import { requireGreenMeetingManager } from "../_guard";
import { greenMeetingSessionUpdateSchema } from "@/lib/validations/validationSchemas";
import { toWIBDateString, isValidCalendarDate } from "@/lib/timezone";
import { z } from "zod";

const sessionPatchSchema = greenMeetingSessionUpdateSchema.extend({
    sessionId: z.string().trim().min(1, "Session ID wajib diisi"),
});

const sessionPostSchema = z.object({
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.")
        .refine((value) => isValidCalendarDate(value), "Tanggal tidak valid.")
        .optional(),
});

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get("date") || toWIBDateString();
        if (!isValidCalendarDate(dateParam)) {
            return NextResponse.json({ error: "Format tanggal harus YYYY-MM-DD yang valid." }, { status: 400 });
        }

        // Read-only: tidak membuat sesi. Sesi dibuat via POST oleh GA.
        const [meetingSession, offDayInfo] = await Promise.all([
            getSessionByDate(dateParam),
            isDateOffDay(new Date(`${dateParam}T00:00:00+07:00`)),
        ]);

        // Scope bocor: non-manager non-HR hanya boleh lihat scope sendiri.
        // Manager GA + HR pemantau boleh penuh. Data lama tidak dihapus, hanya difilter saat baca.
        const { canManageGreenMeeting } = await import("@/lib/services/greenMeetingService");
        const { PERMISSIONS } = await import("@/lib/permissions");
        const isManager = await canManageGreenMeeting(session);
        const isHr = session.permissions.includes(PERMISSIONS.HR_MANAGE);
        if (isManager || isHr) {
            return NextResponse.json({
                session: meetingSession,
                offDayInfo,
            });
        }
        const scopedAttendances = (meetingSession.attendances as Array<{
            employeeId: string | null; departmentId: string | null; divisionId?: string | null;
        }>).filter(
            (a) =>
                (session.employeeId && a.employeeId === session.employeeId) ||
                (session.departmentId && a.departmentId === session.departmentId)
        );
        const scopedNotes = (meetingSession.notes as Array<{
            isAllTarget: boolean;
            targets: Array<{ targetType: string; departmentId?: string | null; divisionId?: string | null; employeeId?: string | null }>;
        }>).filter((n) => {
            if (n.isAllTarget) return true;
            if (!n.targets || n.targets.length === 0) return false;
            return n.targets.some(
                (t) =>
                    (t.targetType === "DEPARTMENT" && session.departmentId && t.departmentId === session.departmentId) ||
                    (t.targetType === "DIVISION" && session.divisionId && t.divisionId === session.divisionId) ||
                    (t.targetType === "EMPLOYEE" && session.employeeId && t.employeeId === session.employeeId)
            );
        });

        return NextResponse.json({
            session: { ...meetingSession, attendances: scopedAttendances, notes: scopedNotes },
            offDayInfo,
        });
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingSessionsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const { session, errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, sessionPostSchema);
        if ("error" in result) return result.error;

        const meetingSession = await getOrCreateTodaySession(result.data.date, session.username);
        return NextResponse.json(meetingSession, { status: 201 });
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingSessionsPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const { session, errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, sessionPatchSchema);
        if ("error" in result) return result.error;

        const { sessionId, ...data } = result.data;
        if (Object.keys(data).length === 0) {
            return NextResponse.json({ error: "Tidak ada field yang diubah." }, { status: 400 });
        }
        const updated = await updateMeetingSession(sessionId, data);
        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingSessionsPATCH", err);
    }
}
