import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
    getEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
} from "@/lib/data";

export async function GET() {
    const session = await getSession();
    if (!session || session.role !== "hr") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const employees = getEmployees().map((e) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, faceDescriptor, ...safe } = e;
        return safe;
    });

    return NextResponse.json(employees);
}

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "hr") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const employee = createEmployee({
            ...body,
            password: "hashed_default",
            isActive: true,
            totalLeave: body.totalLeave || 12,
            usedLeave: 0,
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...safe } = employee;
        return NextResponse.json(safe, { status: 201 });
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
        const updated = updateEmployee(id, data);
        if (!updated) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...safe } = updated;
        return NextResponse.json(safe);
    } catch {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "hr") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
        return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const deleted = deleteEmployee(id);
    if (!deleted) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
}
