import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkRateLimit } from "@/lib/middleware/rateLimit";
import { getRegistrationOptions } from "@/lib/services/passkeyService";
import { PasskeyError } from "@/lib/services/passkeyService";

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const limited = checkRateLimit(request.headers, "passkey-register", 20, 60_000);
        if (limited) return limited;

        const { options } = await getRegistrationOptions(session);
        return NextResponse.json({ success: true, data: options });
    } catch (err) {
        if (err instanceof PasskeyError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("PasskeyRegisterOptions", err);
    }
}
