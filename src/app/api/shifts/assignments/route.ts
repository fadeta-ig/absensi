import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import {
    assignShiftsBulk,
    cancelAssignment,
    getRosterForDate,
    ShiftAssignmentError,
    updateAssignmentEnd,
} from "@/lib/services/shiftAssignmentService";
import { actorFromSession, logAction } from "@/lib/services/auditService";
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
    replaceFuture: z.boolean().optional(),
    dryRun: z.boolean().optional(),
});

const rosterCancelSchema = z.object({
    employeeId: z.string().min(1, "ID karyawan harus diisi"),
    effectiveFrom: z.string().refine(isValidCalendarDate, "Tanggal berlaku harus YYYY-MM-DD yang valid"),
});

const rosterUpdateEndSchema = z.object({
    employeeId: z.string().min(1, "ID karyawan harus diisi"),
    effectiveFrom: z.string().refine(isValidCalendarDate, "Tanggal berlaku harus YYYY-MM-DD yang valid"),
    effectiveTo: z.string().refine(isValidCalendarDate, "Tanggal selesai harus YYYY-MM-DD yang valid").nullable(),
});

function errorResponse(err: ShiftAssignmentError): NextResponse {
    return NextResponse.json(
        {
            error: err.message,
            code: err.code,
            ...(err.details !== undefined ? { details: err.details } : {}),
        },
        { status: err.statusCode },
    );
}

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
        if (err instanceof ShiftAssignmentError) return errorResponse(err);
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

        const { assignments, replaceFuture, dryRun } = result.data;
        const outcome = await assignShiftsBulk(assignments, session.userId ?? null, { replaceFuture, dryRun });
        if (outcome.dryRun) {
            return NextResponse.json({ success: true, ...outcome }, { status: 200 });
        }
        await logAction(
            "ROSTER_ASSIGN_BULK",
            "ShiftAssignment",
            actorFromSession(session),
            outcome.results.length === 1 ? outcome.results[0].employeeId : undefined,
            {
                applied: outcome.applied,
                replaceFuture: replaceFuture === true,
                results: outcome.results,
                actions: outcome.plan.map((item) => ({
                    employeeId: item.employeeId,
                    actions: item.actions,
                })).filter((entry) => entry.actions.length > 0),
            },
        );
        logger.info("Shift roster bulk assigned", {
            applied: outcome.applied,
            replaceFuture: replaceFuture === true,
            by: session.username,
        });
        return NextResponse.json({ success: true, ...outcome }, { status: 201 });
    } catch (err) {
        if (err instanceof ShiftAssignmentError) return errorResponse(err);
        return serverErrorResponse("ShiftRosterPOST", err);
    }
}

export async function PATCH(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const result = await validateBody(request, rosterUpdateEndSchema);
        if ("error" in result) return result.error;

        const updated = await updateAssignmentEnd(
            result.data.employeeId,
            result.data.effectiveFrom,
            result.data.effectiveTo,
        );
        if (updated.changed) {
            await logAction(
                "ROSTER_UPDATE_END",
                "ShiftAssignment",
                actorFromSession(session),
                updated.id,
                {
                    employeeId: updated.employeeId,
                    shiftId: updated.shiftId,
                    effectiveFrom: updated.effectiveFrom,
                    previousEffectiveTo: updated.previousEffectiveTo,
                    effectiveTo: updated.effectiveTo,
                },
            );
            logger.info("Shift roster assignment end date updated", {
                employeeId: updated.employeeId,
                effectiveFrom: updated.effectiveFrom,
                previousEffectiveTo: updated.previousEffectiveTo,
                effectiveTo: updated.effectiveTo,
                by: session.username,
            });
        }
        return NextResponse.json({ success: true, assignment: updated });
    } catch (err) {
        if (err instanceof ShiftAssignmentError) return errorResponse(err);
        return serverErrorResponse("ShiftRosterPATCH", err);
    }
}

export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const result = await validateBody(request, rosterCancelSchema);
        if ("error" in result) return result.error;

        const cancelled = await cancelAssignment(result.data.employeeId, result.data.effectiveFrom);
        await logAction(
            "ROSTER_CANCEL",
            "ShiftAssignment",
            actorFromSession(session),
            cancelled.id,
            cancelled as unknown as Record<string, unknown>,
        );
        logger.info("Shift roster assignment cancelled", {
            employeeId: result.data.employeeId,
            effectiveFrom: result.data.effectiveFrom,
            by: session.username,
        });
        return NextResponse.json({ success: true, cancelled });
    } catch (err) {
        if (err instanceof ShiftAssignmentError) return errorResponse(err);
        return serverErrorResponse("ShiftRosterDELETE", err);
    }
}
