import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
    getAttendanceRecords,
    getAttendanceByDate,
    createAttendance,
    updateAttendance,
} from "@/lib/data";

export async function GET(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");

    if (session.role === "hr") {
        const records = getAttendanceRecords(employeeId || undefined);
        return NextResponse.json(records);
    }

    const records = getAttendanceRecords(session.id);
    return NextResponse.json(records);
}

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const today = new Date().toISOString().split("T")[0];

        const existing = getAttendanceByDate(session.id, today);

        if (existing) {
            if (existing.clockOut) {
                return NextResponse.json(
                    { error: "Anda sudah melakukan clock-in dan clock-out hari ini" },
                    { status: 400 }
                );
            }

            const updated = updateAttendance(existing.id, {
                clockOut: new Date().toISOString(),
                clockOutLocation: body.location,
                clockOutPhoto: body.photo,
            });

            return NextResponse.json(updated);
        }

        const now = new Date();
        const hour = now.getHours();
        const status = hour > 9 ? "late" : "present";

        const record = createAttendance({
            employeeId: session.id,
            date: today,
            clockIn: now.toISOString(),
            clockInLocation: body.location,
            clockInPhoto: body.photo,
            status,
        });

        return NextResponse.json(record);
    } catch {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
