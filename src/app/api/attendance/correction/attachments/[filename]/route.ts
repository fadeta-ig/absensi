import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import path from "path";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import {
    CORRECTION_ATTACHMENT_MIME_TYPES,
    resolveCorrectionAttachmentPath,
} from "@/lib/services/correctionAttachments";

function canManageCorrections(session: Awaited<ReturnType<typeof requireAuth>>): boolean {
    return Boolean(session && session.username === "WIG001" && session.permissions.includes("hr.manage"));
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ filename: string }> },
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { filename } = await params;
        const targetPath = resolveCorrectionAttachmentPath(filename);
        if (!targetPath) {
            return NextResponse.json({ error: "Berkas lampiran tidak ditemukan." }, { status: 404 });
        }

        let allowed = canManageCorrections(session);
        if (!allowed) {
            if (!session.employeeId) return forbiddenResponse();
            const owned = await prisma.attendanceCorrection.findFirst({
                where: {
                    employeeId: session.employeeId,
                    attachmentUrl: {
                        in: [
                            `/api/attendance/correction/attachments/${filename}`,
                            `/uploads/attendance-corrections/${filename}`,
                        ],
                    },
                },
                select: { id: true },
            });
            if (!owned) return forbiddenResponse();
            allowed = true;
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
                "Content-Type": CORRECTION_ATTACHMENT_MIME_TYPES[ext] || "application/octet-stream",
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
        return serverErrorResponse("CorrectionAttachmentGET", error);
    }
}
