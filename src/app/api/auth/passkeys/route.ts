import { NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { listCredentials, PasskeyError } from "@/lib/services/passkeyService";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const data = await listCredentials(session);
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof PasskeyError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("PasskeyList", err);
    }
}
