import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    parseFormData,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { sanitizeString } from "@/lib/middleware/sanitize";
import {
    EquipmentError,
    listEquipmentEvidenceByInspection,
    requireActiveInternalEmployee,
    saveEquipmentEvidence,
} from "@/lib/services/equipmentService";
import {
    DEFAULT_UPLOAD_LIMITS_MB,
    getUploadLimit,
} from "@/lib/services/appSettingsService";

function evidenceServeUrl(id: string): string {
    return `/api/employee/equipment/evidence/${id}`;
}

/**
 * POST /api/employee/equipment/evidence
 * Multipart: inspectionId (string) + photo (File JPEG) + note? (opsional).
 * Satu tempat upload per inspeksi (maks 5 foto) — mewakili semua item.
 * Auth: karyawan internal aktif (dicek di service).
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        // Mode bebas: cukup karyawan internal aktif.
        await requireActiveInternalEmployee(session);
        // Tolak dini berkas raksasa sebelum seluruh body dibaca ke memori.
        const contentLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(contentLength) && contentLength > 0) {
            const limitMb = await getUploadLimit("upload.equipmentEvidence.maxMb").catch(
                () => DEFAULT_UPLOAD_LIMITS_MB["upload.equipmentEvidence.maxMb"]
            );
            const maxBytes = Math.floor(limitMb * 1024 * 1024) + 2 * 1024 * 1024;
            if (contentLength > maxBytes) {
                return NextResponse.json(
                    { error: `Ukuran foto maksimal ${limitMb} MB.` },
                    { status: 413 }
                );
            }
        }
        const parsedForm = await parseFormData(request, "EmployeeEquipmentEvidencePOST");
        if ("error" in parsedForm) return parsedForm.error;
        const form = parsedForm.data;

        const rawInspectionId = form.get("inspectionId");
        const inspectionId = typeof rawInspectionId === "string" ? rawInspectionId.trim() : "";
        if (!inspectionId) {
            return NextResponse.json({ error: "inspectionId wajib diisi." }, { status: 400 });
        }

        const file = form.get("photo");
        if (!(file instanceof File) || file.size === 0) {
            return NextResponse.json({ error: "Foto wajib disertakan." }, { status: 400 });
        }
        // Klaim MIME klien tidak dipercaya begitu saja — magic byte dicek service.
        if (file.type !== "image/jpeg") {
            return NextResponse.json(
                { error: "Foto harus berformat JPEG dari kamera aplikasi." },
                { status: 400 }
            );
        }

        const rawNote = form.get("note");
        const note =
            typeof rawNote === "string" && rawNote.trim()
                ? sanitizeString(rawNote).slice(0, 500)
                : null;

        const buffer = Buffer.from(await file.arrayBuffer());
        const saved = await saveEquipmentEvidence({
            inspectionId,
            buffer,
            mime: file.type,
            uploaderUserId: session.userId,
            note,
        });

        return NextResponse.json(
            {
                success: true,
                data: { id: saved.id, url: evidenceServeUrl(saved.id) },
            },
            { status: 201 }
        );
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentEvidencePOST", err);
    }
}

/**
 * GET /api/employee/equipment/evidence?inspectionId=…
 * Auth: karyawan internal yang terlibat (QC / pemulai / karyawan aktif — dicek service).
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const inspectionId = (searchParams.get("inspectionId") ?? "").trim();
        if (!inspectionId) {
            return NextResponse.json(
                { error: "Parameter inspectionId wajib diisi." },
                { status: 400 }
            );
        }

        const photos = await listEquipmentEvidenceByInspection(session, inspectionId);
        return NextResponse.json({
            success: true,
            data: photos.map((photo) => ({ ...photo, url: evidenceServeUrl(photo.id) })),
        });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentEvidenceGET", err);
    }
}
