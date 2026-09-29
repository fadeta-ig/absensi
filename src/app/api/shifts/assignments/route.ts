import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { assignShiftsBulk, cancelAssignment, getRosterForDate, ShiftAssignmentError } from "@/lib/services/shiftAssignmentService";
import { PERMISSIONS } from "@/lib/permissions";
import { isValidCalendarDate, toWIBDateString } from "@/lib/timezone";
import { z } from "zod";
import logger from "@/lib/logger";

const rosterAssignSchema = z.object({
    assignments: z.array(z.object({
        employeeId: z.string().min(1, "ID karyawan harus diisi"),
        shiftId: z.string().min(1, "Shift harus diisi"),
        effectiveFrom: z.string().refine(isValidCalendarDate, "Tanggal berlaku harus YYYY-MM-DD yang valid"),
        effectiveTo: z.string().refine(isValidCalendarDate, "Tanggal selesai harus YYYY-MM-DD yang valid").nullable().optional(),
    })).min(1, "Minimal 1 penugasan").max(200, "Maksimal 200 penugasan per batch"),
});

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const today = toWIBDateString();
        const date = new URL(request.url).searchParams.get("date") ?? today;
        const roster = await getRosterForDate(date);
        return NextResponse.json({ date, today, roster }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
        if (err instanceof ShiftAssignmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("ShiftRosterGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const result = await validateBody(request, rosterAssignSchema);
        if ("error" in result) return result.error;

        const outcome = await assignShiftsBulk(result.data.assignments, session.userId ?? null);
        logger.info("Shift roster bulk assigned", {
            applied: outcome.applied,
            by: session.username,
        });
        return NextResponse.json({ success: true, ...outcome }, { status: 201 });
    } catch (err) {
        if (err instanceof ShiftAssignmentError) {
            return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
        }
        return serverErrorResponse("ShiftRosterPOST", err);
    }
}

const rosterCancelSchema = z.object({
    employeeId: z.string().min(1, "ID karyawan harus diisi"),
    effectiveFrom: z.string().refine(isValidCalendarDate, "Tanggal berlaku harus YYYY-MM-DD yang valid"),
});

export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const result = await validateBody(request, rosterCancelSchema);
        if ("error" in result) return result.error;

        await cancelAssignment(result.data.employeeId, result.data.effectiveFrom);
        logger.info("Shift roster assignment cancelled", {
            employeeId: result.data.employeeId,
            effectiveFrom: result.data.effectiveFrom,
            by: session.username,
        });
        return NextResponse.json({ success: true });
    } catch (err) {
        if (err instanceof ShiftAssignmentError) {
            return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
        }
        return serverErrorResponse("ShiftRosterDELETE", err);
    }
}
