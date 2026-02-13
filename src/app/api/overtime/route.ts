import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
    getOvertimeRequests,
    getOvertimeRequestById,
    createOvertimeRequest,
    updateOvertimeRequest,
    deleteOvertimeRequest,
} from "@/lib/services/overtimeService";

function calculateHours(startTime: string, endTime: string): number {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    const diff = endMinutes - startMinutes;
    return Math.round((diff / 60) * 100) / 100;
}

export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const overtime = await getOvertimeRequests(
            session.role === "hr" ? undefined : session.employeeId
        );
        return NextResponse.json(overtime);
    } catch {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { date, startTime, endTime, reason } = body;

        if (!date || !startTime || !endTime || !reason) {
            return NextResponse.json(
                { error: "Tanggal, jam mulai, jam selesai, dan alasan harus diisi" },
                { status: 400 }
            );
        }

        const hours = calculateHours(startTime, endTime);
        if (hours <= 0) {
            return NextResponse.json(
                { error: "Jam selesai harus setelah jam mulai" },
                { status: 400 }
            );
        }
        if (hours > 8) {
            return NextResponse.json(
                { error: "Maksimal lembur 8 jam per hari" },
                { status: 400 }
            );
        }

        const overtime = await createOvertimeRequest({
            employeeId: session.employeeId,
            date,
            startTime,
            endTime,
            hours,
            reason,
            status: "pending",
            createdAt: new Date().toISOString(),
        });

        return NextResponse.json(overtime, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { id, status, date, startTime, endTime, reason } = body;

        if (!id) {
            return NextResponse.json({ error: "ID harus diisi" }, { status: 400 });
        }

        const existing = await getOvertimeRequestById(id);
        if (!existing) {
            return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
        }

        // Only HR can update status
        if (status && session.role !== "hr") {
            return NextResponse.json(
                { error: "Hanya HR yang dapat mengubah status" },
                { status: 403 }
            );
        }

        // Employees can only edit their own pending requests
        if (session.role !== "hr") {
            if (existing.employeeId !== session.employeeId) {
                return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
            }
            if (existing.status !== "pending") {
                return NextResponse.json(
                    { error: "Tidak dapat mengedit yang sudah diproses" },
                    { status: 400 }
                );
            }
        }

        const updateData: Record<string, unknown> = {};
        if (session.role === "hr" && status !== undefined) {
            updateData.status = status;
        }
        if (date !== undefined) updateData.date = date;
        if (reason !== undefined) updateData.reason = reason;
        if (startTime !== undefined && endTime !== undefined) {
            const hours = calculateHours(startTime, endTime);
            if (hours <= 0 || hours > 8) {
                return NextResponse.json({ error: "Jam tidak valid" }, { status: 400 });
            }
            updateData.startTime = startTime;
            updateData.endTime = endTime;
            updateData.hours = hours;
        }

        const updated = await updateOvertimeRequest(id, updateData);
        if (!updated) {
            return NextResponse.json({ error: "Gagal mengupdate" }, { status: 404 });
        }

        return NextResponse.json(updated);
    } catch {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID harus diisi" }, { status: 400 });
        }

        const existing = await getOvertimeRequestById(id);
        if (!existing) {
            return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
        }

        if (session.role !== "hr" && existing.employeeId !== session.employeeId) {
            return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
        }

        const deleted = await deleteOvertimeRequest(id);
        if (!deleted) {
            return NextResponse.json({ error: "Gagal menghapus" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
