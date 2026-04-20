import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse, validateBody } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { payslipCreateSchema } from "@/lib/validations/validationSchemas";
import { getPayslips, createPayslip } from "@/lib/services/payslipService";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        if (session.role === "hr") {
            const payslips = await getPayslips();
            return NextResponse.json(payslips);
        }

        const payslips = await getPayslips(session.employeeId);
        return NextResponse.json(payslips);
    } catch (err) {
        return serverErrorResponse("PayslipsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const result = await validateBody(request, payslipCreateSchema);
        if ("error" in result) return result.error;
        const body = result.data;
        
        const payslip = await createPayslip({
            ...body,
            issuedDate: new Date().toISOString(),
        });

        logger.info("Payslip issued", { targetEmployee: payslip.employeeId, issuedBy: session.employeeId });
        return NextResponse.json(payslip, { status: 201 });
    } catch (err) {
        return serverErrorResponse("PayslipsPOST", err);
    }
}
