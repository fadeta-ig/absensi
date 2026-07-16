import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { requireAuth, unauthorizedResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { faceDescriptorSchema } from "@/lib/validations/validationSchemas";
import { canManageHr } from "@/lib/permissions";

/** GET — Check if current employee has a face registered */
export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return NextResponse.json({ error: "Akun tidak terhubung dengan data karyawan" }, { status: 403 });

    const employee = await prisma.employee.findUnique({
        where: { employeeId: session.employeeId },
        select: { faceDescriptor: true },
    });

    if (!employee) {
        return NextResponse.json(
            { error: "Data karyawan tidak ditemukan" },
            { status: 404 }
        );
    }

    const descriptorRaw = employee.faceDescriptor as string | null;
    const descriptor = descriptorRaw ? JSON.parse(descriptorRaw) : null;
    return NextResponse.json({
        hasFace: !!descriptor && Array.isArray(descriptor) && descriptor.length === 128,
        descriptor,
    });
}

/** POST — Save face descriptor for current employee */
export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!session.employeeId) return NextResponse.json({ error: "Akun tidak terhubung dengan data karyawan" }, { status: 403 });

        const result = await validateBody(request, faceDescriptorSchema);
        if ("error" in result) return result.error;

        const { descriptor } = result.data;

        const employee = await prisma.employee.findUnique({
            where: { employeeId: session.employeeId },
            select: { faceDescriptor: true },
        });

        if (!employee) {
            return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 });
        }

        if (employee.faceDescriptor) {
            return NextResponse.json(
                { error: "Wajah sudah terdaftar. Hubungi HR untuk mereset data wajah Anda." },
                { status: 403 }
            );
        }

        const isValidNumbers = descriptor.every(
            (v: number) => typeof v === "number" && !isNaN(v)
        );
        if (!isValidNumbers) {
            return NextResponse.json(
                { error: "Data face descriptor mengandung nilai tidak valid" },
                { status: 400 }
            );
        }

        await prisma.employee.update({
            where: { employeeId: session.employeeId },
            data: { faceDescriptor: JSON.stringify(descriptor) },
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        return serverErrorResponse("FaceEnroll", err);
    }
}

/** DELETE — Remove face descriptor for current employee */
export async function DELETE(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!session.employeeId) return NextResponse.json({ error: "Akun tidak terhubung dengan data karyawan" }, { status: 403 });
        
        if (!canManageHr(session)) {
            return NextResponse.json({ error: "Hanya HR yang dapat menghapus data wajah." }, { status: 403 });
        }

        await prisma.employee.update({
            where: { employeeId: session.employeeId },
            data: { faceDescriptor: null },
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        return serverErrorResponse("FaceDelete", err);
    }
}
