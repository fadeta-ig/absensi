import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse, parseJsonBody } from "@/lib/middleware/apiGuard";
import {
    getVisitReports,
    getVisitReportById,
    createVisitDraft,
    updateVisitDraft,
    clockInVisit,
    clockOutVisit,
    verifyVisit,
    deleteVisitReport,
} from "@/lib/services/visitService";
import {
    visitDraftSchema,
    visitClockInSchema,
    visitClockOutSchema,
    visitUpdateDraftSchema,
    visitVerifySchema,
} from "@/lib/validations/validationSchemas";
import { calculateDistance } from "@/lib/utils";
import logger from "@/lib/logger";
import { actorFromSession, logAction } from "@/lib/services/auditService";
import { VisitPhotoValidationError } from "@/lib/services/visitPhotoService";

const MAX_VISIT_REQUEST_BYTES = 16 * 1024 * 1024;

// ─── Helpers ────────────────────────────────────────────────────

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

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr" && !session.employeeId) return forbiddenResponse();

    try {
        const visits = await getVisitReports(
            session.role === "hr" ? undefined : session.employeeId ?? undefined
        );
        return NextResponse.json(visits);
    } catch (err) {
        return serverErrorResponse("VisitsGET", err);
    }
}

// ─── POST ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_VISIT_REQUEST_BYTES) {
        return NextResponse.json(
            { error: "Ukuran total permintaan foto terlalu besar (maksimal 16 MB)." },
            { status: 413 },
        );
    }

    try {
        const parsedBody = await parseJsonBody<Record<string, unknown>>(request, "VisitsPOST");
        if ("error" in parsedBody) return parsedBody.error;
        const body = parsedBody.data;
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
            await logAction("CLOCK_IN", "VISIT", actorFromSession(session), id, {
                photoEvidence: updated.photos
                    ?.filter((photo) => photo.phase === "CLOCK_IN")
                    .map((photo) => ({ id: photo.id, sha256: photo.sha256Original })),
            });
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
            await logAction("CLOCK_OUT", "VISIT", actorFromSession(session), id, {
                photoEvidence: updated.photos
                    ?.filter((photo) => photo.phase === "CLOCK_OUT")
                    .map((photo) => ({ id: photo.id, sha256: photo.sha256Original })),
            });
            return NextResponse.json(updated);
        }

        return NextResponse.json({ error: "Action tidak valid." }, { status: 400 });
    } catch (err) {
        if (err instanceof VisitPhotoValidationError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return serverErrorResponse("VisitsPOST", err);
    }
}

// ─── PUT ────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const parsedBody = await parseJsonBody<Record<string, unknown>>(request, "VisitsPUT");
        if ("error" in parsedBody) return parsedBody.error;
        const body = parsedBody.data;
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

            logger.info("Visit draft updated", { visitId: id, updatedBy: session.username });
            return NextResponse.json(updated);
        }

        // ── HR Verification ────────────────────────────────────
        if (action === "verify") {
            if (session.role !== "hr") return forbiddenResponse();

            const result = await validateBody(request, visitVerifySchema, body);
            if ("error" in result) return result.error;

            const { id, hrChecked } = result.data;

            const existing = await getVisitReportById(id);
            if (!existing) {
                return NextResponse.json({ error: "Kunjungan tidak ditemukan." }, { status: 404 });
            }

            if (existing.status !== "clocked_out") {
                return NextResponse.json({
                    error: "Validasi hanya dapat dilakukan setelah karyawan clock out.",
                }, { status: 400 });
            }

            const updated = await verifyVisit(id, hrChecked);

            if (!updated) {
                return NextResponse.json({ error: "Gagal memproses validasi." }, { status: 400 });
            }

            logger.info(`Visit verified: ${hrChecked}`, { visitId: id, by: session.username });
            return NextResponse.json(updated);
        }

        return NextResponse.json({ error: "Action tidak valid." }, { status: 400 });
    } catch (err) {
        return serverErrorResponse("VisitsPUT", err);
    }
}

// ─── DELETE ─────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
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
            return NextResponse.json({ error: "Status kunjungan berubah sebelum draft dihapus." }, { status: 409 });
        }

        logger.info("Visit draft deleted", { visitId: id, deletedBy: session.username });
        return NextResponse.json({ success: true, message: "Draft kunjungan berhasil dihapus." });
    } catch (err) {
        return serverErrorResponse("VisitsDELETE", err);
    }
}