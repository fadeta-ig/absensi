import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { actorFromSession, logAction } from "@/lib/services/auditService";

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    // Only GA or HR can upload BAST
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const historyId = formData.get("historyId") as string | null;

        if (!file || !historyId) {
            return NextResponse.json({ error: "File atau historyId tidak ditemukan." }, { status: 400 });
        }

        // Verify history exists
        const history = await prisma.assetHistory.findUnique({ where: { id: historyId } });
        if (!history) {
            return NextResponse.json({ error: "Riwayat aset tidak valid." }, { status: 404 });
        }

        // Validate file type
        const allowedTypes = [
            "image/jpeg", "image/png", "image/webp",
            "application/pdf"
        ];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ error: "Format file tidak didukung. Gunakan PDF atau Gambar (JPG, PNG)." }, { status: 400 });
        }

        // Validate file size (max 5MB)
        const MAX_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: "Ukuran file terlalu besar (maksimal 5MB)." }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Save to DB
        const bastDoc = await prisma.assetBastDocument.create({
            data: {
                historyId,
                fileData: buffer,
                mimeType: file.type,
                fileName: file.name,
                uploadedBy: session.username,
                uploadedByUserId: session.userId,
            }
        });

        logger.info("BAST document uploaded", { bastId: bastDoc.id, historyId, uploadedBy: session.username });

        // Create audit log
        await logAction("UPLOAD_BAST", "ASSET_HISTORY", actorFromSession(session), historyId, {
            fileName: file.name,
            mimeType: file.type,
        });

        // Hapus property fileData dari response untuk menghemat bandwidth
        const { fileData, ...responseDoc } = bastDoc;
        void fileData;

        return NextResponse.json(responseDoc, { status: 201 });
    } catch (err) {
        return serverErrorResponse("BASTUpload", err);
    }
}
