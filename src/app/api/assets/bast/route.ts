import { NextRequest, NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse, parseFormData } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { actorFromSession, logAction } from "@/lib/services/auditService";
import { assertAllowedFile } from "@/lib/fileMagic";
import { getUploadLimit } from "@/lib/services/appSettingsService";

const BAST_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "bast-documents");

function safeResolvedBastPath(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, "/");
    const resolved = path.resolve(BAST_STORAGE_ROOT, normalized);
    if (!resolved.startsWith(`${BAST_STORAGE_ROOT}${path.sep}`)) {
        throw new Error("Lokasi penyimpanan BAST tidak valid.");
    }
    return resolved;
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    // Only GA or HR can upload BAST
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const parsedForm = await parseFormData(request, "BASTUploadPOST");
        if ("error" in parsedForm) return parsedForm.error;
        const formData = parsedForm.data;
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

        // Validate file size via app settings (fallback bawaan bila DB belum ada/gagal)
        const bastMaxMb = await getUploadLimit("upload.bast.maxMb");
        const MAX_SIZE = Math.floor(bastMaxMb * 1024 * 1024);
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: `Ukuran file terlalu besar (maksimal ${bastMaxMb}MB).` }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        if (buffer.length > MAX_SIZE) {
            return NextResponse.json({ error: `Ukuran file terlalu besar (maksimal ${bastMaxMb}MB).` }, { status: 400 });
        }
        let extension: string;
        try {
            extension = assertAllowedFile(buffer, file.type);
        } catch (err) {
            return NextResponse.json({ error: err instanceof Error ? err.message : "Isi file tidak valid." }, { status: 400 });
        }

        // Simpan berkas baru ke disk privat (bukan ke kolom blob DB).
        const safeHistoryDir = historyId.replace(/[^A-Za-z0-9_-]/g, "_") || "unknown";
        const relativePath = path.join(safeHistoryDir, `${randomUUID()}${extension}`).replace(/\\/g, "/");
        const absolutePath = safeResolvedBastPath(relativePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, buffer, { flag: "wx" });

        // Save to DB (file baru: filePath disk + metadata; fileData dikosongkan)
        let bastDoc;
        try {
            bastDoc = await prisma.assetBastDocument.create({
                data: {
                    historyId,
                    fileData: Buffer.alloc(0),
                    mimeType: file.type,
                    fileName: file.name,
                    filePath: relativePath,
                    uploadedBy: session.username,
                    uploadedByUserId: session.userId,
                }
            });
        } catch (err) {
            await unlink(absolutePath).catch(() => undefined);
            throw err;
        }

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
