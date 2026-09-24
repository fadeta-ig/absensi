import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getAvailableUsersForAssignment, isWig002, CleaningError } from "@/lib/services/cleaningService";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const workerType = searchParams.get("workerType");

        if (workerType !== "INTERNAL" && workerType !== "OUTSOURCE") {
            return NextResponse.json(
                { error: "Parameter workerType wajib diisi dengan nilai INTERNAL atau OUTSOURCE." },
                { status: 422 }
            );
        }

        const users = await getAvailableUsersForAssignment(session, workerType);
        return NextResponse.json({ success: true, data: users });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningAvailableUsersGET", err);
    }
}
