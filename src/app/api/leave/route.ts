import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getLeaveRequests, createLeaveRequest, updateLeaveRequest } from "@/lib/data";

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.role === "hr") {
        return NextResponse.json(await getLeaveRequests());
    }

    return NextResponse.json(await getLeaveRequests(session.employeeId));
}

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const leave = await createLeaveRequest({
            ...body,
            employeeId: session.employeeId,
            status: "pending",
            createdAt: new Date().toISOString(),
        });
        return NextResponse.json(leave, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "hr") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { id, ...data } = body;
        const updated = await updateLeaveRequest(id, data);
        if (!updated) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json(updated);
    } catch (err) {
        console.error("[API PUT Leave Error]:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
