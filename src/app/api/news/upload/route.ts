import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse, parseFormData } from "@/lib/middleware/apiGuard";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import logger from "@/lib/logger";
import { ALLOWED_UPLOAD_MIME, assertAllowedFile, extensionForMime } from "@/lib/fileMagic";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "news");

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const parsedForm = await parseFormData(request, "NewsUploadPOST");
        if ("error" in parsedForm) return parsedForm.error;
        const formData = parsedForm.data;
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "File tidak ditemukan." }, { status: 400 });
        }

        // Validate file type (images and documents for news)
        if (!ALLOWED_UPLOAD_MIME.includes(file.type)) {
            return NextResponse.json({ error: "Format file tidak didukung. Gunakan Gambar atau Dokumen (PDF, Word, Excel, PPT)." }, { status: 400 });
        }

        // Validate file size (max 10MB)
        const MAX_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: "Ukuran file terlalu besar (maksimal 10MB)." }, { status: 400 });
        }

        // Ensure upload directory exists
        await mkdir(UPLOAD_DIR, { recursive: true });

        // Generate unique filename (extension derived from server-side MIME map, never from file.name)
        const ext = extensionForMime(file.type);
        if (!ext) {
            return NextResponse.json({ error: "Format file tidak didukung. Gunakan Gambar atau Dokumen (PDF, Word, Excel, PPT)." }, { status: 400 });
        }
        const uniqueName = `${randomUUID()}${ext}`;
        const filePath = path.join(UPLOAD_DIR, uniqueName);

        // Write file to disk
        const buffer = Buffer.from(await file.arrayBuffer());
        try {
            assertAllowedFile(buffer, file.type);
        } catch (err) {
            return NextResponse.json({ error: err instanceof Error ? err.message : "Isi file tidak valid." }, { status: 400 });
        }
        await writeFile(filePath, buffer);

        logger.info("News image uploaded", { filename: uniqueName, uploadedBy: session.username });

        return NextResponse.json({
            url: `/uploads/news/${uniqueName}`,
            name: file.name,
        });
    } catch (err) {
        return serverErrorResponse("NewsUpload", err);
    }
}
