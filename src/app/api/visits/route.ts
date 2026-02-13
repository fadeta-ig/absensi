import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
    getVisitReports,
    createVisitReport,
    updateVisitReport,
    deleteVisitReport,
} from "@/lib/services/visitService";

export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // HR sees all visits, employee only their own
        const visits = await getVisitReports(
            session.role === "hr" ? undefined : session.employeeId
        );
        return NextResponse.json(visits);
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
        const { clientName, clientAddress, purpose, result, location, photo, notes } = body;

        if (!clientName || !clientAddress || !purpose) {
            return NextResponse.json(
                { error: "Nama klien, alamat, dan tujuan harus diisi" },
                { status: 400 }
            );
        }

        const visit = await createVisitReport({
            employeeId: session.employeeId,
            date: new Date().toISOString().split("T")[0],
            clientName,
            clientAddress,
            purpose,
            result: result || null,
            location: location || null,
            photo: photo || null,
            status: "pending",
            notes: notes || null,
            createdAt: new Date().toISOString(),
        });

        return NextResponse.json(visit, { status: 201 });
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
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: "ID harus diisi" }, { status: 400 });
        }

        // Only HR can update status
        if (updates.status && session.role !== "hr") {
            return NextResponse.json(
                { error: "Hanya HR yang dapat mengubah status" },
                { status: 403 }
            );
        }

        const updated = await updateVisitReport(id, updates);
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

        const deleted = await deleteVisitReport(id);
        if (!deleted) {
            return NextResponse.json({ error: "Gagal menghapus" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
