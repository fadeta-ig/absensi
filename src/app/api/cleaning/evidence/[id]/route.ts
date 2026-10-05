import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import {
    hasCleaningEvidenceAccess,
    readCleaningEvidenceFile,
    resolveCleaningEvidencePath,
} from "@/lib/services/cleaningEvidenceService";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { id } = await params;
        if (!id || typeof id !== "string") {
            return NextResponse.json({ error: "Evidence tidak ditemukan." }, { status: 404 });
        }

        const evidence = await prisma.cleaningEvidencePhoto.findUnique({
            where: { id },
            select: {
                id: true,
                roomId: true,
                wibDate: true,
                filePath: true,
                mimeType: true,
            },
        });
        if (!evidence) {
            return NextResponse.json({ error: "Evidence tidak ditemukan." }, { status: 404 });
        }

        const allowed = await hasCleaningEvidenceAccess(session, {
            roomId: evidence.roomId,
            wibDate: evidence.wibDate,
        });
        // Samakan dengan 404 agar tidak bisa dibedakan ID ada/tidak.
        if (!allowed) {
            return NextResponse.json({ error: "Evidence tidak ditemukan." }, { status: 404 });
        }

        // Guard path: pola relatif + root + separator (lihat cleaningEvidenceService).
        const absolutePath = resolveCleaningEvidencePath(evidence.filePath);
        if (!absolutePath) {
            return NextResponse.json({ error: "Berkas evidence tidak ditemukan." }, { status: 404 });
        }

        let buffer: Buffer;
        try {
            buffer = await readCleaningEvidenceFile(evidence.filePath);
        } catch (err) {
            if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
                return NextResponse.json({ error: "Berkas evidence tidak ditemukan di storage." }, { status: 404 });
            }
            throw err;
        }

        const contentType = ALLOWED_MIME_TYPES.has(evidence.mimeType)
            ? evidence.mimeType
            : "application/octet-stream";
        const filename = `cleaning-evidence-${evidence.id}.${contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg"}`;

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": contentType,
                "Content-Length": String(buffer.length),
                "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
            return NextResponse.json({ error: "Berkas evidence tidak ditemukan di storage." }, { status: 404 });
        }
        return serverErrorResponse("CleaningEvidenceGET", error);
    }
}
