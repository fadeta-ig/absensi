import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse, validateBody } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { payslipCreateSchema } from "@/lib/validations/validationSchemas";
import { getPayslips, createPayslip, deletePayslip } from "@/lib/services/payslipService";
import { actorFromSession, logAction } from "@/lib/services/auditService";
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

        if (!session.employeeId) return forbiddenResponse();
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

        await logAction("CREATE", "PAYSLIP", actorFromSession(session), payslip.id, {
            period: body.period, 
            targetEmployee: payslip.employeeId 
        });
        logger.info("Payslip issued", { targetEmployee: payslip.employeeId, issuedBy: session.username });
        return NextResponse.json(payslip, { status: 201 });
    } catch (err) {
        return serverErrorResponse("PayslipsPOST", err);
    }
}

export async function DELETE(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "ID payslip diperlukan." }, { status: 400 });
        }

        await deletePayslip(id);
        
        await logAction("DELETE", "PAYSLIP", actorFromSession(session), id);
        logger.info("Payslip deleted", { id, deletedBy: session.username });
        return NextResponse.json({ success: true, message: "Slip gaji berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("PayslipsDELETE", err);
    }
}
