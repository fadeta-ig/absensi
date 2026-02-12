import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
    getAttendanceRecords,
    getAttendanceByDate,
    createAttendance,
    updateAttendance,
} from "@/lib/services/attendanceService";

export async function GET(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");

    if (session.role === "hr") {
        const records = await getAttendanceRecords(employeeId || undefined);
        return NextResponse.json(records);
    }

    const records = await getAttendanceRecords(session.employeeId);
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

        const existing = await getAttendanceByDate(session.employeeId, today);

        if (existing) {
            if (existing.clockOut) {
                return NextResponse.json(
                    { error: "Anda sudah melakukan clock-in dan clock-out hari ini" },
                    { status: 400 }
                );
            }

            const updated = await updateAttendance(existing.id, {
                clockOut: new Date().toISOString(),
                clockOutLocation: body.location,
                clockOutPhoto: body.photo,
            });

            return NextResponse.json(updated);
        }

        const now = new Date();
        const hour = now.getHours();
        const status = hour > 9 ? "late" : "present";

        const record = await createAttendance({
            employeeId: session.employeeId,
            date: today,
            clockIn: now.toISOString(),
            clockInLocation: body.location,
            clockInPhoto: body.photo,
            status,
        });

        return NextResponse.json(record);
    } catch (err) {
        console.error("[API POST Attendance Error]:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
