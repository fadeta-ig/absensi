import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";

function decodeDataUrl(value: string): { bytes: Buffer; mimeType: string } | null {
    const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) return null;
    return { mimeType: match[1], bytes: Buffer.from(match[2], "base64") };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.permissions.includes(PERMISSIONS.HR_MANAGE)) return forbiddenResponse();

    try {
        const { id } = await context.params;
        const phase = new URL(request.url).searchParams.get("phase");
        if (phase !== "clockIn" && phase !== "clockOut") {
            return NextResponse.json({ error: "Jenis foto presensi tidak valid." }, { status: 400 });
        }
        const row = await prisma.attendanceRecord.findUnique({
            where: { id },
            select: { clockInPhoto: true, clockOutPhoto: true },
        });
        const encoded = phase === "clockIn" ? row?.clockInPhoto : row?.clockOutPhoto;
        const decoded = encoded ? decodeDataUrl(encoded) : null;
        if (!decoded) return NextResponse.json({ error: "Foto presensi tidak ditemukan." }, { status: 404 });

        const body = new Uint8Array(decoded.bytes);
        return new NextResponse(new Blob([body], { type: decoded.mimeType }), {
            headers: {
                "Content-Type": decoded.mimeType,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        return serverErrorResponse("AttendancePhotoGET", error);
    }
}
