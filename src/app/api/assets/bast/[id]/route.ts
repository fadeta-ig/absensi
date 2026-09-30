import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "fs/promises";
import path from "path";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { actorFromSession, logAction } from "@/lib/services/auditService";
import { canManageGa, canManageHr, canReadAssets } from "@/lib/permissions";

const BAST_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "bast-documents");

function safeResolvedBastPath(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, "/");
    const resolved = path.resolve(BAST_STORAGE_ROOT, normalized);
    if (!resolved.startsWith(`${BAST_STORAGE_ROOT}${path.sep}`)) {
        throw new Error("Lokasi penyimpanan BAST tidak valid.");
    }
    return resolved;
}

function bastServeHeaders(doc: { mimeType: string | null; fileName: string | null }) {
    return {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${(doc.fileName ?? "bast").replace(/[\r\n"]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    };
}

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
        await prisma.assetBastDocument.delete({
            where: { id }
        });

        logger.info("BAST document deleted", { bastId: id, deletedBy: session.username });

        // Audit log
        await logAction("DELETE_BAST", "ASSET_BAST", actorFromSession(session), id, {
            fileName: bastDoc.fileName,
        });

        // Hapus berkas fisik SETELAH db delete sukses (abaikan bila sudah tidak ada).
        if (bastDoc.filePath) {
            try {
                await unlink(safeResolvedBastPath(bastDoc.filePath));
            } catch (err) {
                if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
                    logger.warn("BAST file cleanup failed", { bastId: id, filePath: bastDoc.filePath, error: err });
                }
            }
        }

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

        if (!doc) {
            return new NextResponse("File tidak ditemukan", { status: 404 });
        }

        // Dual-read: file baru di disk (filePath) diutamakan; blob lama (fileData) sebagai fallback.
        if (doc.filePath) {
            try {
                const fileBuffer = await readFile(safeResolvedBastPath(doc.filePath));
                return new NextResponse(fileBuffer, {
                    headers: bastServeHeaders(doc),
                });
            } catch (err) {
                if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
                    const message = err instanceof Error ? err.message : "";
                    if (!message.includes("Lokasi penyimpanan BAST tidak valid")) {
                        throw err;
                    }
                }
                // ENOENT / path tidak valid → lanjut ke fallback blob lama bila ada.
            }
        }

        if (!doc.fileData || doc.fileData.length === 0) {
            return new NextResponse("File tidak ditemukan", { status: 404 });
        }

        return new NextResponse(doc.fileData, {
            headers: bastServeHeaders(doc),
        });
    } catch (err) {
        return serverErrorResponse("BASTGet", err);
    }
}
