import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    serverErrorResponse,
    validateBody,
} from "@/lib/middleware/apiGuard";
import { isValidCalendarDate } from "@/lib/timezone";
import { PERMISSIONS } from "@/lib/permissions";
import { CleaningError, isWig002 } from "@/lib/services/cleaningService";
import { getParafStatus, signDailyParaf } from "@/lib/services/cleaningParafService";
import { z } from "zod";

const parafPostSchema = z.object({
    roomId: z.string().uuid("roomId harus berupa UUID."),
    wibDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Format wibDate harus YYYY-MM-DD.")
        .refine((value) => isValidCalendarDate(value), "Tanggal wibDate tidak valid."),
    signerEmployeeId: z.string().trim().min(1, "signerEmployeeId wajib diisi.").max(100).optional(),
    idempotencyKey: z.string().trim().min(1).max(100).optional(),
});

function isReviewerSession(session: { employeeId: string | null; permissions: string[] }): boolean {
    return Boolean(session.employeeId) && session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF);
}

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const roomId = searchParams.get("roomId") ?? "";
        const wibDate = searchParams.get("wibDate") ?? searchParams.get("date") ?? "";

        if (!roomId) {
            return NextResponse.json({ error: "Parameter roomId wajib diisi." }, { status: 400 });
        }
        if (!wibDate || !isValidCalendarDate(wibDate)) {
            return NextResponse.json({ error: "Parameter wibDate wajib diisi (YYYY-MM-DD)." }, { status: 400 });
        }

        const status = await getParafStatus(roomId, wibDate);

        if (isWig002(session)) {
            return NextResponse.json({ success: true, data: status });
        }

        const { isCleaningTopViewer } = await import("@/lib/services/appSettingsService");
        if (await isCleaningTopViewer(session).catch(() => false)) {
            return NextResponse.json({ success: true, data: status });
        }

        if (!isReviewerSession(session) || !session.employeeId) {
            return forbiddenResponse();
        }

        const isReviewer =
            status.reviewers !== null &&
            (status.reviewers.inspectedByEmployeeId === session.employeeId ||
                status.reviewers.knownByEmployeeId === session.employeeId);
        if (!isReviewer) {
            return forbiddenResponse();
        }

        return NextResponse.json({ success: true, data: status });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningParafGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const validation = await validateBody(request, parafPostSchema);
    if ("error" in validation) return validation.error;

    try {
        const headerKey = request.headers.get("x-idempotency-key")?.trim() || undefined;
        const idempotencyKey = validation.data.idempotencyKey ?? headerKey;

        let signerEmployeeId = validation.data.signerEmployeeId?.trim() || "";

        if (isWig002(session)) {
            if (!signerEmployeeId) {
                return NextResponse.json(
                    { error: "signerEmployeeId wajib diisi untuk paraf oleh WIG002." },
                    { status: 400 }
                );
            }
        } else {
            if (!isReviewerSession(session) || !session.employeeId) {
                return forbiddenResponse();
            }
            if (!signerEmployeeId) {
                signerEmployeeId = session.employeeId;
            }
            if (signerEmployeeId !== session.employeeId) {
                return NextResponse.json(
                    { error: "Anda hanya dapat memaraf sebagai diri sendiri." },
                    { status: 403 }
                );
            }
        }

        const result = await signDailyParaf({
            roomId: validation.data.roomId,
            wibDate: validation.data.wibDate,
            signerEmployeeId,
            idempotencyKey,
            operator: isWig002(session)
                ? { userId: session.userId, username: session.username, name: session.name }
                : null,
        });

        return NextResponse.json({ success: true, data: result }, { status: 201 });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningParafPOST", err);
    }
}
