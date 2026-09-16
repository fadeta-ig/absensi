import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";

const MIME_TYPES: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain; charset=utf-8",
};

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const { path: segments } = await params;
        if (!segments || segments.length === 0) {
            return NextResponse.json({ error: "Path berkas tidak valid." }, { status: 400 });
        }

        const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
        const targetPath = path.resolve(uploadsRoot, ...segments);

        // Path traversal guard: must strictly stay inside public/uploads
        if (!targetPath.startsWith(uploadsRoot)) {
            return NextResponse.json({ error: "Akses berkas ditolak." }, { status: 403 });
        }

        if (!existsSync(targetPath)) {
            return NextResponse.json({ error: "Berkas tidak ditemukan." }, { status: 404 });
        }

        const stat = statSync(targetPath);
        if (stat.isDirectory()) {
            return NextResponse.json({ error: "Path merujuk ke direktori." }, { status: 400 });
        }

        const ext = path.extname(targetPath).toLowerCase();
        const mimeType = MIME_TYPES[ext] || "application/octet-stream";
        const filename = path.basename(targetPath);
        const buffer = await readFile(targetPath);

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                "Content-Type": mimeType,
                "Content-Length": String(buffer.length),
                "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
                "X-Frame-Options": "SAMEORIGIN",
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "public, max-age=3600, must-revalidate",
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Gagal membaca berkas.", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
