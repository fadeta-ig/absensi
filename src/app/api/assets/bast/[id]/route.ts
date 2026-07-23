import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { actorFromSession, logAction } from "@/lib/services/auditService";
import { canManageGa, canManageHr, canReadAssets } from "@/lib/permissions";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    // Only GA or HR can delete BAST
    if (!canManageGa(session) && !canManageHr(session)) return forbiddenResponse();

    try {
        const id = (await params).id;
        
        const bastDoc = await prisma.assetBastDocument.findUnique({
            where: { id }
        });

        if (!bastDoc) {
            return NextResponse.json({ error: "Dokumen BAST tidak ditemukan" }, { status: 404 });
        }

        // Hapus record dari DB
        // fileData otomatis terhapus karena merupakan field di record ini
        await prisma.assetBastDocument.delete({
            where: { id }
        });

        logger.info("BAST document deleted", { bastId: id, deletedBy: session.username });

        // Audit log
        await logAction("DELETE_BAST", "ASSET_BAST", actorFromSession(session), id, {
            fileName: bastDoc.fileName,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        return serverErrorResponse("BASTDelete", err);
    }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canReadAssets(session)) return forbiddenResponse();

    try {
        const id = (await params).id;
        const doc = await prisma.assetBastDocument.findUnique({
            where: { id }
        });

        if (!doc || !doc.fileData) {
            return new NextResponse("File tidak ditemukan", { status: 404 });
        }

        return new NextResponse(doc.fileData, {
            headers: {
                "Content-Type": doc.mimeType || "application/octet-stream",
                "Content-Disposition": `inline; filename="${doc.fileName.replace(/[\r\n"]/g, "_")}"`
            }
        });
    } catch (err) {
        return serverErrorResponse("BASTGet", err);
    }
}
