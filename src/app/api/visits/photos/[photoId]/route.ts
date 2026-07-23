import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { canManageHr } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { actorFromSession, logAction } from "@/lib/services/auditService";
import { readVisitPhotoFile } from "@/lib/services/visitPhotoService";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ photoId: string }> },
) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { photoId } = await params;
        const variant = request.nextUrl.searchParams.get("variant") ?? "stamped";
        if (variant !== "stamped" && variant !== "original") {
            return NextResponse.json({ error: "Varian foto tidak valid." }, { status: 400 });
        }

        const photo = await prisma.visitPhoto.findUnique({
            where: { id: photoId },
            select: {
                id: true,
                originalPath: true,
                stampedPath: true,
                sha256Original: true,
                visit: { select: { employeeId: true } },
            },
        });
        if (!photo) {
            return NextResponse.json({ error: "Foto kunjungan tidak ditemukan." }, { status: 404 });
        }
        if (!canManageHr(session) && photo.visit.employeeId !== session.employeeId) {
            return forbiddenResponse();
        }

        const buffer = await readVisitPhotoFile(
            variant === "original" ? photo.originalPath : photo.stampedPath,
        );
        if (variant === "original") {
            await logAction(
                "VIEW_ORIGINAL_PHOTO",
                "VISIT_PHOTO",
                actorFromSession(session),
                photo.id,
                { visitEmployeeId: photo.visit.employeeId },
            );
        }

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": "image/jpeg",
                "Content-Length": String(buffer.length),
                "Content-Disposition": `inline; filename="visit-${photo.id}-${variant}.jpg"`,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "X-Original-SHA256": photo.sha256Original,
            },
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
            return NextResponse.json({ error: "Berkas foto tidak ditemukan di storage." }, { status: 404 });
        }
        return serverErrorResponse("VisitPhotoGET", error);
    }
}
