import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPayslips, createPayslip } from "@/lib/data";

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role === "hr") {
        return NextResponse.json(getPayslips());
    }

    return NextResponse.json(getPayslips(session.id));
}

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "hr") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const payslip = createPayslip({
            ...body,
            issuedDate: new Date().toISOString(),
        });
        return NextResponse.json(payslip, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
