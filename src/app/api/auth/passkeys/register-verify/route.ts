import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkRateLimit } from "@/lib/middleware/rateLimit";
import { verifyRegistration, PasskeyError } from "@/lib/services/passkeyService";
import { passkeyRegisterVerifySchema } from "@/lib/validations/validationSchemas";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const limited = checkRateLimit(request.headers, "passkey-register", 20, 60_000);
        if (limited) return limited;

        const result = await validateBody(request, passkeyRegisterVerifySchema);
        if ("error" in result) return result.error;

        const out = await verifyRegistration(
            session,
            result.data.response as unknown as RegistrationResponseJSON,
            result.data.label ?? null,
            { userId: session.userId, username: session.username }
        );
        return NextResponse.json({ success: true, data: out }, { status: 201 });
    } catch (err) {
        if (err instanceof PasskeyError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("PasskeyRegisterVerify", err);
    }
}
