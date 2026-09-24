import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse, validateBody } from "@/lib/middleware/apiGuard";
import { isWig002, CleaningError } from "@/lib/services/cleaningService";
import {
    listGaApprovals,
    getGaApprovalDetail,
    openApprovalPeriod,
} from "@/lib/services/cleaningApprovalService";
import { z } from "zod";

const openApprovalSchema = z.object({
    roomId: z.string().uuid("roomId harus berupa UUID."),
    monthWib: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format monthWib harus YYYY-MM."),
    inspectedByEmployeeId: z.string().min(1, "inspectedByEmployeeId wajib diisi."),
    knownByEmployeeId: z.string().min(1, "knownByEmployeeId wajib diisi."),
});

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const roomId = searchParams.get("roomId");
        const monthWib = searchParams.get("monthWib") || searchParams.get("month");
        const mode = searchParams.get("mode");

        if (roomId && monthWib && mode === "detail") {
            const detail = await getGaApprovalDetail(session, roomId, monthWib);
            return NextResponse.json({ success: true, data: detail });
        }

        const status = searchParams.get("status") || undefined;
        const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
        const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20;

        const result = await listGaApprovals(session, {
            roomId: roomId || undefined,
            monthWib: monthWib || undefined,
            status,
            page,
            limit,
        });

        return NextResponse.json({ success: true, ...result });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningApprovalsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    const validation = await validateBody(request, openApprovalSchema);
    if ("error" in validation) return validation.error;

    try {
        const result = await openApprovalPeriod(session, validation.data);
        return NextResponse.json(
            {
                success: true,
                data: result.approval,
                derivedStatus: result.derivedStatus,
                isNew: result.isNew,
            },
            { status: result.isNew ? 201 : 200 }
        );
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningApprovalsPOST", err);
    }
}
