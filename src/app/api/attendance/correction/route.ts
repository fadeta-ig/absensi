import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { AttendanceCorrectionError, submitCorrection, getCorrectionsByUser, getAllCorrections, resolveCorrection } from "@/lib/services/attendanceCorrectionService";
import { attendanceCorrectionCreateSchema, attendanceCorrectionUpdateSchema } from "@/lib/validations/validationSchemas";
import logger from "@/lib/logger";
import { addCalendarDays, toWIBDateString } from "@/lib/timezone";

function canManageCorrections(session: Awaited<ReturnType<typeof requireAuth>>): boolean {
    return Boolean(session && session.username === "WIG001" && session.permissions.includes("hr.manage"));
}

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        if (canManageCorrections(session)) {
            const records = await getAllCorrections();
            return NextResponse.json(records);
        }
        if (!session.employeeId) return forbiddenResponse();

        const records = await getCorrectionsByUser(session.employeeId);
        return NextResponse.json(records);
    } catch (err) {
        return serverErrorResponse("AttendanceCorrectionGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const result = await validateBody(request, attendanceCorrectionCreateSchema);
        if ("error" in result) return result.error;
        const body = result.data;
        const serverWibDate = toWIBDateString();
        if (body.targetDate >= serverWibDate) {
            return NextResponse.json({ error: "Tanggal koreksi harus sebelum hari ini." }, { status: 400 });
        }

        const clockOutDate = body.proposedClockOut ? toWIBDateString(new Date(body.proposedClockOut)) : null;
        const nextDate = addCalendarDays(body.targetDate, 1);
        // Clock-in H+1 divalidasi penuh di service (butuh jadwal shift):
        // diterima bila shift targetDate overnight + dalam jendela + tanpa record H+1.
        if (clockOutDate && clockOutDate !== body.targetDate && clockOutDate !== nextDate) {
            return NextResponse.json({ error: "Usulan jam pulang hanya boleh pada tanggal target atau H+1." }, { status: 400 });
        }

        const correction = await submitCorrection({
            employeeId: session.employeeId,
            ...body
        });

        logger.info("Correction submitted", { id: correction.id, by: session.employeeId });
        return NextResponse.json(correction, { status: 201 });
    } catch (err) {
        if (err instanceof AttendanceCorrectionError) {
            return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
        }
        return serverErrorResponse("AttendanceCorrectionPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageCorrections(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, attendanceCorrectionUpdateSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        const updated = await resolveCorrection(body.id, body.status, session.username);
        logger.info("Correction resolved", { id: body.id, status: body.status, by: session.username });
        
        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof AttendanceCorrectionError) {
            return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
        }
        return serverErrorResponse("AttendanceCorrectionPATCH", err);
    }
}
