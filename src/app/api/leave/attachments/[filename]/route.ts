import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
    LEAVE_ATTACHMENT_MIME_BY_EXT,
    resolveLeaveAttachmentPath,
} from "@/lib/services/leaveService";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ filename: string }> },
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { filename } = await params;
        const targetPath = resolveLeaveAttachmentPath(filename);
        if (!targetPath) {
            return NextResponse.json({ error: "Berkas lampiran tidak ditemukan." }, { status: 404 });
        }

        const leave = await prisma.leaveRequest.findFirst({
            where: { attachmentPath: filename },
            select: { id: true, employeeId: true, attachmentMime: true },
        });
        if (!leave) {
            return NextResponse.json({ error: "Berkas lampiran tidak ditemukan." }, { status: 404 });
        }
        if (!canManageHr(session) && leave.employeeId !== session.employeeId) {
            return forbiddenResponse();
        }

        if (!existsSync(targetPath)) {
            return NextResponse.json({ error: "Berkas lampiran tidak ditemukan." }, { status: 404 });
        }
        const stat = statSync(targetPath);
        if (stat.isDirectory()) {
            return NextResponse.json({ error: "Berkas lampiran tidak ditemukan." }, { status: 404 });
        }

        const ext = path.extname(filename).toLowerCase();
        const buffer = await readFile(targetPath);
        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                "Content-Type": leave.attachmentMime ?? LEAVE_ATTACHMENT_MIME_BY_EXT[ext] ?? "application/octet-stream",
                "Content-Length": String(buffer.length),
                "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
            return NextResponse.json({ error: "Berkas lampiran tidak ditemukan." }, { status: 404 });
        }
        return serverErrorResponse("LeaveAttachmentGET", error);
    }
}
