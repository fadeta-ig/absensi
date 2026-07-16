import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import {
    getVisitReports,
    getVisitReportById,
    createVisitDraft,
    updateVisitDraft,
    clockInVisit,
    clockOutVisit,
    approveVisit,
    rejectVisit,
    deleteVisitReport,
} from "@/lib/services/visitService";
import {
    visitDraftSchema,
    visitClockInSchema,
    visitClockOutSchema,
    visitUpdateDraftSchema,
    visitApprovalSchema,
} from "@/lib/validations/validationSchemas";
import { calculateDistance } from "@/lib/utils";
import logger from "@/lib/logger";

// ─── Helpers ────────────────────────────────────────────────────

function parseLocation(raw: string | null | undefined): { lat: number; lng: number } | null {
    if (!raw) return null;
    try {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
        return null;
    }
}

/** Validate that the device location is within the visit's target radius */
function validateLocationProximity(
    deviceLat: number,
    deviceLng: number,
    targetLat: number,
    targetLng: number,
    radiusMeters: number
): { isWithinRadius: boolean; distanceMeters: number } {
    const distanceMeters = calculateDistance(deviceLat, deviceLng, targetLat, targetLng);
    return {
        isWithinRadius: distanceMeters <= radiusMeters,
        distanceMeters: Math.round(distanceMeters),
    };
}

// ─── GET ────────────────────────────────────────────────────────

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

// ─── POST ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const body = await request.json();
        const action = body.action as string;

        // ── Create Draft ──────────────────────────────────────
        if (action === "create_draft") {
            const result = await validateBody(request, visitDraftSchema, body);
            if ("error" in result) return result.error;

            const visit = await createVisitDraft({
                ...result.data,
                employeeId: session.employeeId,
            });

            logger.info("Visit draft created", { employeeId: session.employeeId, visitId: visit.id });
            return NextResponse.json(visit, { status: 201 });
        }

        // ── Clock In ──────────────────────────────────────────
        if (action === "clock_in") {
            const result = await validateBody(request, visitClockInSchema, body);
            if ("error" in result) return result.error;

            const { id, location, photos } = result.data;

            // Fetch existing visit to check location
            const existing = await getVisitReportById(id);
            if (!existing) {
                return NextResponse.json({ error: "Kunjungan tidak ditemukan." }, { status: 404 });
            }

            if (existing.employeeId !== session.employeeId) {
                return forbiddenResponse();
            }

            if (existing.status !== "draft") {
                return NextResponse.json({ error: "Clock in hanya bisa dilakukan pada kunjungan draft." }, { status: 400 });
            }

            // Validate location proximity
            if (existing.visitLocation) {
                const proximity = validateLocationProximity(
                    location.lat, location.lng,
                    existing.visitLocation.lat, existing.visitLocation.lng,
                    existing.visitRadius
                );

                if (!proximity.isWithinRadius) {
                    return NextResponse.json({
                        error: `Anda berada ${proximity.distanceMeters}m dari lokasi kunjungan. Maksimal jarak: ${existing.visitRadius}m.`,
                    }, { status: 400 });
                }
            }

            const updated = await clockInVisit(id, { location, photos });
            if (!updated) {
                return NextResponse.json({ error: "Gagal melakukan clock in." }, { status: 400 });
            }

            logger.info("Visit clock in", { visitId: id, employeeId: session.employeeId });
            return NextResponse.json(updated);
        }

        // ── Clock Out ─────────────────────────────────────────
        if (action === "clock_out") {
            const result = await validateBody(request, visitClockOutSchema, body);
            if ("error" in result) return result.error;

            const { id, location, photos, result: visitResult } = result.data;

            const existing = await getVisitReportById(id);
            if (!existing) {
                return NextResponse.json({ error: "Kunjungan tidak ditemukan." }, { status: 404 });
            }

            if (existing.employeeId !== session.employeeId) {
                return forbiddenResponse();
            }

            if (existing.status !== "clocked_in") {
                return NextResponse.json({ error: "Clock out hanya bisa dilakukan pada kunjungan yang sudah clock in." }, { status: 400 });
            }

            // Validate location proximity
            if (existing.visitLocation) {
                const proximity = validateLocationProximity(
                    location.lat, location.lng,
                    existing.visitLocation.lat, existing.visitLocation.lng,
                    existing.visitRadius
                );

                if (!proximity.isWithinRadius) {
                    return NextResponse.json({
                        error: `Anda berada ${proximity.distanceMeters}m dari lokasi kunjungan. Maksimal jarak: ${existing.visitRadius}m.`,
                    }, { status: 400 });
                }
            }

            const updated = await clockOutVisit(id, { location, photos, result: visitResult });
            if (!updated) {
                return NextResponse.json({ error: "Gagal melakukan clock out." }, { status: 400 });
            }

            logger.info("Visit clock out", { visitId: id, employeeId: session.employeeId });
            return NextResponse.json(updated);
        }

        return NextResponse.json({ error: "Action tidak valid." }, { status: 400 });
    } catch (err) {
        return serverErrorResponse("VisitsPOST", err);
    }
}

// ─── PUT ────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const body = await request.json();
        const action = body.action as string;

        // ── Update Draft ──────────────────────────────────────
        if (action === "update_draft") {
            const result = await validateBody(request, visitUpdateDraftSchema, body);
            if ("error" in result) return result.error;

            const { id, ...data } = result.data;

            const existing = await getVisitReportById(id);
            if (!existing) {
                return NextResponse.json({ error: "Kunjungan tidak ditemukan." }, { status: 404 });
            }

            if (session.role !== "hr" && existing.employeeId !== session.employeeId) {
                return forbiddenResponse();
            }

            if (existing.status !== "draft") {
                return NextResponse.json({ error: "Hanya draft yang dapat diubah." }, { status: 400 });
            }

            const updated = await updateVisitDraft(id, data);
            if (!updated) {
                return NextResponse.json({ error: "Gagal memperbarui draft kunjungan." }, { status: 400 });
            }

            logger.info("Visit draft updated", { visitId: id, updatedBy: session.employeeId });
            return NextResponse.json(updated);
        }

        // ── HR Approval ───────────────────────────────────────
        if (action === "approve" || action === "reject") {
            if (session.role !== "hr") return forbiddenResponse();

            const result = await validateBody(request, visitApprovalSchema, body);
            if ("error" in result) return result.error;

            const { id, status, rejectionReason } = result.data;

            const existing = await getVisitReportById(id);
            if (!existing) {
                return NextResponse.json({ error: "Kunjungan tidak ditemukan." }, { status: 404 });
            }

            if (!["clocked_out", "pending_approval"].includes(existing.status)) {
                return NextResponse.json({
                    error: "Persetujuan hanya dapat dilakukan setelah karyawan clock out.",
                }, { status: 400 });
            }

            let updated;
            if (status === "approved") {
                updated = await approveVisit(id);
            } else {
                updated = await rejectVisit(id, rejectionReason!);
            }

            if (!updated) {
                return NextResponse.json({ error: "Gagal memproses persetujuan." }, { status: 400 });
            }

            logger.info(`Visit ${status}`, { visitId: id, by: session.employeeId });
            return NextResponse.json(updated);
        }

        return NextResponse.json({ error: "Action tidak valid." }, { status: 400 });
    } catch (err) {
        return serverErrorResponse("VisitsPUT", err);
    }
}

// ─── DELETE ─────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID kunjungan diperlukan." }, { status: 400 });
        }

        const existing = await getVisitReportById(id);
        if (!existing) {
            return NextResponse.json({ error: "Kunjungan tidak ditemukan." }, { status: 404 });
        }

        if (session.role !== "hr" && existing.employeeId !== session.employeeId) {
            return forbiddenResponse();
        }

        if (existing.status !== "draft") {
            return NextResponse.json({ error: "Hanya draft yang dapat dihapus." }, { status: 400 });
        }

        const deleted = await deleteVisitReport(id);
        if (!deleted) {
            return NextResponse.json({ error: "Gagal menghapus kunjungan." }, { status: 404 });
        }

        logger.info("Visit draft deleted", { visitId: id, deletedBy: session.employeeId });
        return NextResponse.json({ success: true, message: "Draft kunjungan berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("VisitsDELETE", err);
    }
}
