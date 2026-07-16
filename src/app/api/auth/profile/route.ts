import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

/** Schema validasi untuk update profil mandiri karyawan */
const profileUpdateSchema = z.object({
    phone: z.string().min(6, "Nomor HP minimal 6 digit").max(20, "Nomor HP terlalu panjang").optional(),
    avatarUrl: z.string().nullable().optional(),
});

export type ProfileUpdateBody = z.infer<typeof profileUpdateSchema>;

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) {
        return NextResponse.json({ error: "Akun ini tidak terhubung dengan data karyawan." }, { status: 403 });
    }

    try {
        const employee = await prisma.employee.findUnique({
            where: { employeeId: session.employeeId },
            select: {
                id: true,
                employeeId: true,
                name: true,
                email: true,
                phone: true,
                gender: true,
                joinDate: true,
                isActive: true,
                avatarUrl: true,
                totalLeave: true,
                usedLeave: true,
                departmentRel: { select: { name: true } },
                divisionRel:   { select: { name: true } },
                positionRel:   { select: { name: true } },
                shift:         { select: { name: true } },
                manager:       { select: { name: true, employeeId: true } },
            },
        });

        if (!employee) {
            return NextResponse.json({ error: "Data profil tidak ditemukan" }, { status: 404 });
        }

        return NextResponse.json({
            id:           employee.id,
            employeeId:   employee.employeeId,
            name:         employee.name,
            email:        employee.email,
            phone:        employee.phone,
            gender:       employee.gender,
            joinDate:     employee.joinDate.toISOString(),
            isActive:     employee.isActive,
            avatarUrl:    employee.avatarUrl ?? null,
            role:         session.primaryRole,
            roles:        session.roles,
            totalLeave:   employee.totalLeave,
            usedLeave:    employee.usedLeave,
            department:   employee.departmentRel?.name ?? "-",
            division:     employee.divisionRel?.name ?? "-",
            position:     employee.positionRel?.name ?? "-",
            shift:        employee.shift?.name ?? null,
            managerName:  employee.manager?.name ?? null,
            managerId:    employee.manager?.employeeId ?? null,
        });
    } catch (err) {
        return serverErrorResponse("ProfileGET", err);
    }
}

export async function PUT(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) {
        return NextResponse.json({ error: "Akun ini tidak terhubung dengan data karyawan." }, { status: 403 });
    }

    try {
        const body = await request.json() as unknown;
        const parsed = profileUpdateSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: "Data tidak valid", details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { phone, avatarUrl } = parsed.data;

        // Guard: Karyawan hanya bisa update data dirinya sendiri
        // Tidak ada field yang bisa diubah di luar phone dan avatarUrl
        const updated = await prisma.employee.update({
            where: { employeeId: session.employeeId },
            data: {
                ...(phone !== undefined && { phone }),
                ...(avatarUrl !== undefined && { avatarUrl }),
            },
            select: {
                employeeId: true,
                phone: true,
                avatarUrl: true,
            },
        });

        return NextResponse.json({
            success: true,
            message: "Profil berhasil diperbarui",
            data: updated,
        });
    } catch (err) {
        return serverErrorResponse("ProfilePUT", err);
    }
}
