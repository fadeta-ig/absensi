import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPayslips, createPayslip } from "@/lib/services/payslipService";

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role === "hr") {
        return NextResponse.json(await getPayslips());
    }

    return NextResponse.json(await getPayslips(session.employeeId));
}

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "hr") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const payslip = await createPayslip({
            ...body,
            issuedDate: new Date().toISOString(),
        });
        return NextResponse.json(payslip, { status: 201 });
    } catch (err) {
        console.error("[API POST Payslip Error]:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
