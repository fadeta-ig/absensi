import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkLoginRateLimit, checkRateLimit, getClientIp } from "@/lib/middleware/rateLimit";
import { getAuthenticationOptions, PasskeyError } from "@/lib/services/passkeyService";
import { passkeyAuthOptionsSchema } from "@/lib/validations/validationSchemas";

export async function POST(request: NextRequest) {
    try {
        const result = await validateBody(request, passkeyAuthOptionsSchema);
        if ("error" in result) return result.error;

        const username = result.data.username?.trim() || null;
        if (username) {
            const limited = checkLoginRateLimit(request.headers, username);
            if (limited) return limited;
        } else {
            const limited = checkRateLimit(request.headers, "passkey-anon", 10, 60_000);
            if (limited) return limited;
        }

        const { options } = await getAuthenticationOptions(username, username ? null : getClientIp(request.headers));
        return NextResponse.json({ success: true, data: options });
    } catch (err) {
        if (err instanceof PasskeyError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("PasskeyAuthOptions", err);
    }
}
