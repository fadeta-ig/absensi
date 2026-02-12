import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getShifts, createShift, updateShift, deleteShift } from "@/lib/services/shiftService";

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(await getShifts());
}

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "hr") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const shift = await createShift(body);
        return NextResponse.json(shift, { status: 201 });
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
        const shift = await updateShift(id, data);
        if (!shift) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json(shift);
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

    const success = await deleteShift(id);
    if (!success) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
}
