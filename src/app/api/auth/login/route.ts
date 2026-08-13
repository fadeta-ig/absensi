import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyLogin } from "@/lib/auth";
import { checkLoginRateLimit } from "@/lib/middleware/rateLimit";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { loginSchema } from "@/lib/validations/validationSchemas";
import { getLandingPath } from "@/lib/permissions";

export async function POST(request: NextRequest) {
    try {
        const result = await validateBody(request, loginSchema);
        if ("error" in result) return result.error;

        const { employeeId, password, rememberMe } = result.data;
        const rateLimited = checkLoginRateLimit(request.headers, employeeId);
        if (rateLimited) return rateLimited;

        const user = await verifyLogin(employeeId, password);
        if (!user) {
            return NextResponse.json(
                { error: "Username atau password salah" },
                { status: 401 }
            );
        }

        await createSession(user, rememberMe);

        return NextResponse.json({
            success: true,
            roles: user.roles,
            permissions: user.permissions,
            primaryRole: user.primaryRole,
            landingPath: getLandingPath(user),
            name: user.name,
        });
    } catch (err) {
        return serverErrorResponse("Login", err);
    }
}
