import { NextRequest, NextResponse } from "next/server";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkLoginRateLimit, checkRateLimit } from "@/lib/middleware/rateLimit";
import { verifyAuthentication, PasskeyError } from "@/lib/services/passkeyService";
import { passkeyAuthVerifySchema } from "@/lib/validations/validationSchemas";
import { createSession, issuePrincipalForUserId } from "@/lib/auth";
import { getLandingPath } from "@/lib/permissions";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export async function POST(request: NextRequest) {
    try {
        const result = await validateBody(request, passkeyAuthVerifySchema);
        if ("error" in result) return result.error;

        const username = result.data.username?.trim() || null;
        if (username) {
            const limited = checkLoginRateLimit(request.headers, username);
            if (limited) return limited;
        } else {
            const limited = checkRateLimit(request.headers, "passkey-anon", 10, 60_000);
            if (limited) return limited;
        }

        const { userId } = await verifyAuthentication(username, result.data.response as unknown as AuthenticationResponseJSON);
        const user = await issuePrincipalForUserId(userId);
        if (!user) {
            return NextResponse.json({ error: "Login passkey gagal. Coba lagi atau gunakan password." }, { status: 401 });
        }

        await createSession(user, false);
        const { logAction } = await import("@/lib/services/auditService");
        await logAction("LOGIN_PASSKEY", "USER_ACCOUNT", { userId: user.userId, identifier: user.username, type: "USER" }, user.userId).catch(() => undefined);

        return NextResponse.json({
            success: true,
            roles: user.roles,
            permissions: user.permissions,
            primaryRole: user.primaryRole,
            landingPath: getLandingPath(user),
            name: user.name,
        });
    } catch (err) {
        if (err instanceof PasskeyError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("PasskeyAuthVerify", err);
    }
}
