import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import {
    getVisitReports,
    getVisitReportById,
    createVisitReport,
    updateVisitReport,
    deleteVisitReport,
} from "@/lib/services/visitService";
import { visitCreateSchema, visitUpdateSchema } from "@/lib/validations/validationSchemas";
import { toWIBDateString } from "@/lib/timezone";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const visits = await getVisitReports(
            session.role === "hr" ? undefined : session.employeeId
        );
        return NextResponse.json(visits);
    } catch (err) {
        return serverErrorResponse("VisitsGET", err);
    }
}

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const result = await validateBody(request, visitCreateSchema);
        if ("error" in result) return result.error;
        const body = result.data;

        const visit = await createVisitReport({
            ...body,
            employeeId: session.employeeId,
            date: toWIBDateString(),
            status: "pending",
            createdAt: new Date().toISOString(),
        });

        logger.info("Visit report created", { employeeId: session.employeeId, visitId: visit.id });
        return NextResponse.json(visit, { status: 201 });
    } catch (err) {
        return serverErrorResponse("VisitsPOST", err);
    }
}

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const result = await validateBody(request, visitUpdateSchema);
        if ("error" in result) return result.error;
        const { id, status, notes, ...data } = result.data;

        const existing = await getVisitReportById(id);
        if (!existing) {
            return NextResponse.json({ error: "Laporan kunjungan tidak ditemukan." }, { status: 404 });
        }

        // Only HR can update status and admin notes
        if ((status !== undefined || notes !== undefined) && session.role !== "hr") {
            return forbiddenResponse();
        }

        // Employees can only edit their own pending visits
        if (session.role !== "hr") {
            if (existing.employeeId !== session.employeeId) {
                return forbiddenResponse();
            }
            if (existing.status !== "pending") {
                return NextResponse.json(
                    { error: "Tidak dapat mengubah laporan yang sudah diproses oleh HR." },
                    { status: 400 }
                );
            }
        }

        const updateData: Record<string, unknown> = { ...data };
        if (session.role === "hr") {
            if (status !== undefined) updateData.status = status;
            if (notes !== undefined) updateData.notes = notes;
        }

        const updated = await updateVisitReport(id, updateData);
        if (!updated) {
            return NextResponse.json({ error: "Gagal memperbarui laporan kunjungan." }, { status: 404 });
        }

        logger.info("Visit report updated", { visitId: id, updatedBy: session.employeeId });
        return NextResponse.json(updated);
    } catch (err) {
        return serverErrorResponse("VisitsPUT", err);
    }
}

export async function DELETE(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID laporan diperlukan." }, { status: 400 });
        }

        const existing = await getVisitReportById(id);
        if (!existing) {
            return NextResponse.json({ error: "Laporan kunjungan tidak ditemukan." }, { status: 404 });
        }

        if (session.role !== "hr" && existing.employeeId !== session.employeeId) {
            return forbiddenResponse();
        }

        if (session.role !== "hr" && existing.status !== "pending") {
            return NextResponse.json({ error: "Tidak dapat menghapus laporan yang sudah diproses." }, { status: 400 });
        }

        const deleted = await deleteVisitReport(id);
        if (!deleted) {
            return NextResponse.json({ error: "Gagal menghapus laporan kunjungan." }, { status: 404 });
        }

        logger.info("Visit report deleted", { visitId: id, deletedBy: session.employeeId });
        return NextResponse.json({ success: true, message: "Laporan kunjungan berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("VisitsDELETE", err);
    }
}
