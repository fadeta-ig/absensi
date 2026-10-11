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
    listQcEvidenceFor,
    requireQcMember,
    saveQcEvidence,
} from "@/lib/services/equipmentService";
import {
    DEFAULT_UPLOAD_LIMITS_MB,
    getUploadLimit,
} from "@/lib/services/appSettingsService";

function qcEvidenceServeUrl(id: string): string {
    return `/api/employee/equipment/qc-evidence/${id}`;
}

/**
 * POST /api/employee/equipment/qc-evidence
 * Multipart: inspectionId (string) + photo (File JPEG) + note? (opsional).
 * Hanya anggota QC, hanya saat inspeksi SUBMITTED.
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        await requireQcMember(session);

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
        const parsedForm = await parseFormData(request, "EmployeeEquipmentQcEvidencePOST");
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
        const saved = await saveQcEvidence({
            inspectionId,
            buffer,
            mime: file.type,
            uploaderUserId: session.userId,
            note,
        });

        return NextResponse.json(
            {
                success: true,
                data: { id: saved.id, url: qcEvidenceServeUrl(saved.id) },
            },
            { status: 201 }
        );
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentQcEvidencePOST", err);
    }
}

/**
 * GET /api/employee/equipment/qc-evidence?inspectionId=…
 * Auth: yang terlibat (QC / pemulai / karyawan aktif / WIG002 / atasan — dicek service).
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

        const photos = await listQcEvidenceFor(session, inspectionId);
        return NextResponse.json({
            success: true,
            data: photos.map((photo) => ({ ...photo, url: qcEvidenceServeUrl(photo.id) })),
        });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentQcEvidenceGET", err);
    }
}
