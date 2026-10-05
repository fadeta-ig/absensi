import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    parseFormData,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { sanitizeString } from "@/lib/middleware/sanitize";
import { prisma } from "@/lib/prisma";
import {
    CleaningEvidenceError,
    checkEvidenceVerificationStatus,
    hasCleaningEvidenceAccess,
    listCleaningEvidenceByItem,
    saveCleaningEvidence,
} from "@/lib/services/cleaningEvidenceService";
import { isWig002 } from "@/lib/services/cleaningService";
import {
    DEFAULT_UPLOAD_LIMITS_MB,
    getCleaningEvidenceMaxPhotos,
    getUploadLimit,
} from "@/lib/services/appSettingsService";

function evidenceServeUrl(id: string): string {
    return `/api/cleaning/evidence/${id}`;
}

async function resolveItemContext(checklistItemId: string) {
    const item = await prisma.cleaningDailyChecklistItem.findUnique({
        where: { id: checklistItemId },
        select: {
            id: true,
            checklist: { select: { roomId: true, wibDate: true } },
        },
    });
    if (!item?.checklist) return null;
    return item;
}

/**
 * POST /api/cleaning/evidence (Tahap 3, endpoint TERPISAH).
 * Multipart: checklistItemId (string) + photo (File JPEG) + note? (opsional).
 * Auth: WIG002 ATAU pekerja assignment-efektif pada wibDate item.
 * SENGAJA lepas guard hari-ini: susulan tanggal lampau OK tanpa buka centang lama.
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        // Tolak dini berkas raksasa sebelum seluruh body dibaca ke memori.
        const contentLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(contentLength) && contentLength > 0) {
            const limitMb = await getUploadLimit("upload.cleaningEvidence.maxMb").catch(
                () => DEFAULT_UPLOAD_LIMITS_MB["upload.cleaningEvidence.maxMb"]
            );
            const maxBytes = Math.floor(limitMb * 1024 * 1024) + 2 * 1024 * 1024;
            if (contentLength > maxBytes) {
                return NextResponse.json(
                    { error: `Ukuran foto maksimal ${limitMb} MB.` },
                    { status: 413 }
                );
            }
        }
        const parsedForm = await parseFormData(request, "CleaningEvidencePOST");
        if ("error" in parsedForm) return parsedForm.error;
        const form = parsedForm.data;

        const rawItemId = form.get("checklistItemId");
        const checklistItemId = typeof rawItemId === "string" ? rawItemId.trim() : "";
        if (!checklistItemId) {
            return NextResponse.json({ error: "checklistItemId wajib diisi." }, { status: 400 });
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
                ? sanitizeString(rawNote).slice(0, 1000)
                : null;

        const item = await resolveItemContext(checklistItemId);
        if (!item) {
            return NextResponse.json({ error: "Item checklist tidak ditemukan." }, { status: 404 });
        }

        if (!isWig002(session)) {
            if (!session.permissions.includes("cleaning.execute")) return forbiddenResponse();
            const assignment = await prisma.cleaningWorkerAssignment.findFirst({
                where: {
                    userId: session.userId,
                    roomId: item.checklist.roomId,
                    startsOnWibDate: { lte: item.checklist.wibDate },
                    OR: [{ endsOnWibDate: null }, { endsOnWibDate: { gt: item.checklist.wibDate } }],
                },
                select: { id: true },
            });
            if (!assignment) return forbiddenResponse();
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const saved = await saveCleaningEvidence({
            checklistItemId: item.id,
            buffer,
            mime: file.type,
            uploaderUserId: session.userId,
            note,
        });

        // A3: tandai foto susulan yang masuk setelah paraf/TTD agar atasan tahu
        // foto ini belum tercakup pemeriksaan tersebut (aditif, bentuk lama tetap ada).
        const verification = await checkEvidenceVerificationStatus(
            item.checklist.roomId,
            item.checklist.wibDate
        ).catch(() => null);

        return NextResponse.json(
            {
                success: true,
                data: {
                    id: saved.id,
                    url: evidenceServeUrl(saved.id),
                    mimeType: saved.mimeType,
                    size: saved.size,
                    capturedAt: saved.capturedAt,
                    note: saved.note,
                    verification,
                    ...(verification?.needsReverify
                        ? {
                            warning:
                                "Foto ditambahkan setelah pemeriksaan/tanda tangan. Minta atasan memeriksa ulang.",
                        }
                        : {}),
                },
            },
            { status: 201 }
        );
    } catch (err) {
        if (err instanceof CleaningEvidenceError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("CleaningEvidencePOST", err);
    }
}

/**
 * GET /api/cleaning/evidence?checklistItemId=… (Tahap 3, list kecil per item).
 * Auth: reuse guard serve Tahap 1 (pemilik ruangan-tanggal / WIG002 / reviewer)
 * sehingga atasan dapat melihat foto di detail tanpa ubah service paraf.
 * Balas juga maxPhotos + maxMb agar klien mengunci sesuai setting.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { searchParams } = new URL(request.url);
        const checklistItemId = (searchParams.get("checklistItemId") ?? "").trim();
        if (!checklistItemId) {
            return NextResponse.json(
                { error: "Parameter checklistItemId wajib diisi." },
                { status: 400 }
            );
        }

        const item = await resolveItemContext(checklistItemId);
        if (!item) {
            return NextResponse.json({ error: "Item checklist tidak ditemukan." }, { status: 404 });
        }

        const allowed = await hasCleaningEvidenceAccess(session, {
            roomId: item.checklist.roomId,
            wibDate: item.checklist.wibDate,
        });
        if (!allowed) return forbiddenResponse();

        const [photos, maxPhotos, maxMb] = await Promise.all([
            listCleaningEvidenceByItem(item.id),
            getCleaningEvidenceMaxPhotos(),
            getUploadLimit("upload.cleaningEvidence.maxMb"),
        ]);

        return NextResponse.json({
            success: true,
            data: photos.map((photo) => ({ ...photo, url: evidenceServeUrl(photo.id) })),
            maxPhotos,
            maxMb,
        });
    } catch (err) {
        return serverErrorResponse("CleaningEvidenceGET", err);
    }
}
