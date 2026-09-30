import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { actorFromSession } from "@/lib/services/auditService";
import {
    canFixEmployeeNip,
    previewNipFixImpact,
    fixEmployeeNip,
    NipFixError,
} from "@/lib/services/employeeNipService";

const nipFixQuerySchema = z.object({
    employeeUuid: z.string().uuid("ID karyawan tidak valid."),
    newEmployeeId: z.string().trim().min(3).max(50),
});

const nipFixBodySchema = nipFixQuerySchema.extend({
    acknowledged: z.literal(true, { message: "Konfirmasi kesadaran wajib dicentang." }),
});

function toErrorResponse(error: unknown) {
    if (error instanceof NipFixError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return serverErrorResponse("FixEmployeeNip", error);
}

/** Preview dampak — hanya WIG001. */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canFixEmployeeNip(session)) return forbiddenResponse();

    try {
        const params = Object.fromEntries(request.nextUrl.searchParams.entries());
        const parsed = nipFixQuerySchema.safeParse(params);
        if (!parsed.success) {
            return NextResponse.json({ error: "Parameter tidak valid." }, { status: 400 });
        }
        const impact = await previewNipFixImpact(parsed.data.employeeUuid, parsed.data.newEmployeeId);
        return NextResponse.json(impact);
    } catch (error) {
        return toErrorResponse(error);
    }
}

/** Eksekusi perbaikan NIP — hanya WIG001 + checkbox sadar. */
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canFixEmployeeNip(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, nipFixBodySchema);
        if ("error" in result) return result.error;

        const fixed = await fixEmployeeNip(
            result.data.employeeUuid,
            result.data.newEmployeeId,
            session,
            actorFromSession(session),
        );
        return NextResponse.json({
            success: true,
            message: `NIP berhasil diperbaiki dari ${fixed.oldEmployeeId} menjadi ${fixed.newEmployeeId}. Akun terkait wajib login ulang.`,
            data: fixed,
        });
    } catch (error) {
        return toErrorResponse(error);
    }
}
