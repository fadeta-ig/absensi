import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { AVATAR_STORAGE_ROOT } from "@/lib/services/avatarService";

const AVATAR_FILENAME_PATTERN = /^[A-Za-z0-9-]+\.(jpg|jpeg|png|webp)$/i;

const AVATAR_MIME_BY_EXT: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
};

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ filename: string }> },
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { filename } = await params;
        if (!AVATAR_FILENAME_PATTERN.test(filename)) {
            return NextResponse.json({ error: "Avatar tidak ditemukan." }, { status: 404 });
        }

        const employee = await prisma.employee.findFirst({
            where: { avatarPath: { endsWith: `/${filename}` } },
            select: { employeeId: true, avatarPath: true },
        });
        if (!employee?.avatarPath) {
            return NextResponse.json({ error: "Avatar tidak ditemukan." }, { status: 404 });
        }
        // Privat: pemilik (self) atau hr.manage.
        if (!canManageHr(session) && employee.employeeId !== session.employeeId) {
            return forbiddenResponse();
        }

        const resolved = path.resolve(AVATAR_STORAGE_ROOT, employee.avatarPath);
        if (!resolved.startsWith(`${AVATAR_STORAGE_ROOT}${path.sep}`)) {
            return NextResponse.json({ error: "Avatar tidak ditemukan." }, { status: 404 });
        }
        if (!existsSync(resolved)) {
            return NextResponse.json({ error: "Berkas avatar tidak ditemukan di storage." }, { status: 404 });
        }
        const stat = statSync(resolved);
        if (stat.isDirectory()) {
            return NextResponse.json({ error: "Avatar tidak ditemukan." }, { status: 404 });
        }

        const ext = path.extname(filename).toLowerCase();
        const buffer = await readFile(resolved);
        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                "Content-Type": AVATAR_MIME_BY_EXT[ext] ?? "application/octet-stream",
                "Content-Length": String(buffer.length),
                "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
            return NextResponse.json({ error: "Berkas avatar tidak ditemukan di storage." }, { status: 404 });
        }
        return serverErrorResponse("AvatarGET", error);
    }
}
