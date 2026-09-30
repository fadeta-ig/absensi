import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse, parseJsonBody, parseFormData, type SessionPayload } from "@/lib/middleware/apiGuard";
import { sanitizeObject } from "@/lib/middleware/sanitize";
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
import { hasExpectedSignature } from "@/lib/fileMagic";
import { getUploadLimit } from "@/lib/services/appSettingsService";
import logger from "@/lib/logger";
import { actorFromSession, logAction } from "@/lib/services/auditService";
import { VisitPhotoValidationError, type VisitPhotoInput } from "@/lib/services/visitPhotoService";

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

// ─── Multipart (jalur hemat: File terkompresi, bukan JSON-base64) ───

/** Metadata sejajar urutan File `photos` pada FormData multipart. */
const visitPhotoMetaSchema = z.object({
    capturedAtDevice: z.string().datetime({ offset: true }).nullable().optional(),
    category: z.enum(["LOKASI", "AKTIVITAS", "HASIL", "DOKUMEN", "LAINNYA"]).optional().default("LAINNYA"),
    caption: z.string().trim().max(200, "Keterangan foto maksimal 200 karakter").nullable().optional(),
});

const visitPhotoMetaListSchema = z.array(visitPhotoMetaSchema)
    .min(2, "Minimal 2 foto bukti kunjungan")
    .max(5, "Maksimal 5 foto bukti kunjungan");

interface MultipartClockPayload {
    action: "clock_in" | "clock_out";
    id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    location: any;
    result?: string | null;
    photos: VisitPhotoInput[];
}

/**
 * Parse FormData { payload JSON, photosMeta JSON, photos File[] } menjadi payload
 * clock. File dibatasi setting upload.visitPhoto.maxMb (fallback bawaan) dan
 * dicek magic-byte JPEG — klaim MIME klien tidak dipercaya begitu saja.
 */
async function parseMultipartClockPayload(
    request: NextRequest,
): Promise<{ data: MultipartClockPayload } | { error: NextResponse }> {
    const parsedForm = await parseFormData(request, "VisitsPOSTMultipart");
    if ("error" in parsedForm) return { error: parsedForm.error };
    const form = parsedForm.data;

    const payloadRaw = form.get("payload");
    if (typeof payloadRaw !== "string" || payloadRaw.length === 0) {
        return { error: NextResponse.json({ error: "Payload clock in/out tidak ditemukan pada form-data." }, { status: 400 }) };
    }
    let payload: Record<string, unknown>;
    try {
        payload = sanitizeObject(JSON.parse(payloadRaw) as Record<string, unknown>);
    } catch {
        return { error: NextResponse.json({ error: "Format payload clock tidak valid." }, { status: 400 }) };
    }

    if (payload.action !== "clock_in" && payload.action !== "clock_out") {
        return { error: NextResponse.json({ error: "Action tidak valid." }, { status: 400 }) };
    }

    const metaRaw = form.get("photosMeta");
    let meta: unknown = [];
    try {
        meta = typeof metaRaw === "string" && metaRaw.length > 0 ? JSON.parse(metaRaw) : [];
    } catch {
        return { error: NextResponse.json({ error: "Format metadata foto tidak valid." }, { status: 400 }) };
    }
    const metaResult = visitPhotoMetaListSchema.safeParse(
        Array.isArray(meta) ? meta.map((item) => sanitizeObject(item as Record<string, unknown>)) : meta,
    );
    if (!metaResult.success) {
        return {
            error: NextResponse.json(
                { error: "Data tidak valid", details: metaResult.error.issues.map((issue) => issue.message) },
                { status: 400 },
            ),
        };
    }

    const files = form.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length !== metaResult.data.length) {
        return { error: NextResponse.json({ error: "Jumlah file foto tidak sesuai dengan metadata foto." }, { status: 400 }) };
    }

    let perPhotoBytes: number;
    try {
        const limitMb = await getUploadLimit("upload.visitPhoto.maxMb");
        perPhotoBytes = Math.floor((Number.isFinite(limitMb) && limitMb > 0 ? limitMb : 2) * 1024 * 1024);
    } catch {
        perPhotoBytes = 2 * 1024 * 1024;
    }

    const photos: VisitPhotoInput[] = [];
    for (const file of files) {
        if (file.size > perPhotoBytes) {
            return {
                error: NextResponse.json(
                    { error: `Ukuran setiap foto maksimal ${(perPhotoBytes / (1024 * 1024)).toFixed(perPhotoBytes % (1024 * 1024) === 0 ? 0 : 1)} MB.` },
                    { status: 413 },
                ),
            };
        }
        if (file.type !== "image/jpeg") {
            return { error: NextResponse.json({ error: "Foto harus berformat JPEG dari kamera aplikasi." }, { status: 400 }) };
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        if (!hasExpectedSignature("image/jpeg", buffer)) {
            return { error: NextResponse.json({ error: "Isi foto tidak sesuai dengan format JPEG." }, { status: 400 }) };
        }
        photos.push({ buffer } as VisitPhotoInput);
    }

    const metas = metaResult.data;
    const photosWithMeta: VisitPhotoInput[] = photos.map((photo, index) => ({
        ...(photo as { buffer: Buffer }),
        capturedAtDevice: metas[index].capturedAtDevice ?? "",
        category: metas[index].category ?? "LAINNYA",
        caption: metas[index].caption ?? null,
    }));

    return {
        data: {
            action: payload.action,
            id: typeof payload.id === "string" ? payload.id : "",
            location: payload.location,
            result: typeof payload.result === "string" ? payload.result : (payload.result ?? null) as string | null,
            photos: photosWithMeta,
        },
    };
}

/**
 * Foto buffer diteruskan ke visitService yang tipenya masih VisitPhotoDraft
 * (milik worker lain — JANGAN ubah). visitPhotoService.prepareVisitPhotos
 * sudah menerima VisitPhotoInput (dataUrl lama ATAU buffer baru).
 */
function asLegacyPhotoArray(photos: VisitPhotoInput[]): Parameters<typeof clockInVisit>[1]["photos"] {
    return photos as unknown as Parameters<typeof clockInVisit>[1]["photos"];
}

async function executeClockIn(
    session: SessionPayload,
    input: { id: string; location: { lat: number; lng: number; accuracyMeters?: number | null; acquiredAt?: string | null }; photos: VisitPhotoInput[] },
): Promise<NextResponse> {
    const { id, location, photos } = input;

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

    const updated = await clockInVisit(id, { location, photos: asLegacyPhotoArray(photos) });
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

async function executeClockOut(
    session: SessionPayload,
    input: { id: string; location: { lat: number; lng: number; accuracyMeters?: number | null; acquiredAt?: string | null }; photos: VisitPhotoInput[]; result?: string | null },
): Promise<NextResponse> {
    const { id, location, photos, result: visitResult } = input;

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

    const updated = await clockOutVisit(id, { location, photos: asLegacyPhotoArray(photos), result: visitResult });
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

    const contentType = request.headers.get("content-type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");

    // ── Multipart hemat (FormData: payload JSON + photos File[]) ──
    // Klien modern (MultiPhotoCapture terkompresi) lewat sini; JSON-base64 lama tetap di bawah.
    if (isMultipart) {
        try {
            const parsed = await parseMultipartClockPayload(request);
            if ("error" in parsed) return parsed.error;
            const { action, id, location, result, photos } = parsed.data;

            // Validasi sisa field memakai skema yang sama; foto placeholder
            // sepanjang meta agar batas jumlah tetap ditegakkan skema.
            const schema = action === "clock_in" ? visitClockInSchema : visitClockOutSchema;
            const checked = await validateBody(request, schema, {
                action,
                id,
                location,
                ...(action === "clock_out" ? { result: result ?? null } : {}),
                photos: photos.map(() => ""),
            });
            if ("error" in checked) return checked.error;

            if (action === "clock_in") {
                return executeClockIn(session, { id: checked.data.id, location: checked.data.location, photos });
            }
            const clockOutData = checked.data as { id: string; location: typeof checked.data.location; result?: string | null };
            return executeClockOut(session, { id: clockOutData.id, location: clockOutData.location, photos, result: clockOutData.result ?? null });
        } catch (err) {
            if (err instanceof VisitPhotoValidationError) {
                return NextResponse.json({ error: err.message }, { status: 400 });
            }
            return serverErrorResponse("VisitsPOST", err);
        }
    }

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
            return executeClockIn(session, { id, location, photos });
        }

        // ── Clock Out ─────────────────────────────────────────
        if (action === "clock_out") {
            const result = await validateBody(request, visitClockOutSchema, body);
            if ("error" in result) return result.error;

            const { id, location, photos, result: visitResult } = result.data;
            return executeClockOut(session, { id, location, photos, result: visitResult });
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