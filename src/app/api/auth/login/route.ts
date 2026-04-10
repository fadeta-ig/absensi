import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyLogin } from "@/lib/auth";
import { checkLoginRateLimit } from "@/lib/middleware/rateLimit";
import { validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { loginSchema } from "@/lib/validations/validationSchemas";

export async function POST(request: NextRequest) {
    const rateLimited = checkLoginRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    try {
        const result = await validateBody(request, loginSchema);
        if ("error" in result) return result.error;

        const { employeeId, password, rememberMe } = result.data;

        const employee = await verifyLogin(employeeId, password);
        if (!employee) {
            return NextResponse.json(
                { error: "ID Karyawan atau password salah" },
                { status: 401 }
            );
        }

        await createSession(employee, rememberMe);

        return NextResponse.json({
            success: true,
            role: employee.role,
            name: employee.name,
        });
    } catch (err) {
        return serverErrorResponse("Login", err);
    }
}
