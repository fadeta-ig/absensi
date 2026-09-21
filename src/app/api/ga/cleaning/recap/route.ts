import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getRecap, isWig002, CleaningError } from "@/lib/services/cleaningService";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const month = searchParams.get("month");

        if (!month) {
            return NextResponse.json({ error: "Parameter month wajib diisi (YYYY-MM)." }, { status: 400 });
        }

        const recap = await getRecap(session, month);
        return NextResponse.json({ success: true, data: recap });
    } catch (err) {
        if (err instanceof CleaningError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaCleaningRecapGET", err);
    }
}
