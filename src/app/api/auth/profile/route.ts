import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse, validateBody } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { unlink } from "fs/promises";
import {
    AvatarUploadError,
    parseAvatarDataUrl,
    resolveAvatarLimitBytes,
    resolveAvatarPath,
    saveAvatarBuffer,
} from "@/lib/services/avatarService";
import { avatarUrlSchema } from "@/lib/validations/validationSchemas";

/** Schema validasi untuk update profil mandiri karyawan */
const profileUpdateSchema = z.object({
    phone: z.string().min(6, "Nomor HP minimal 6 digit").max(20, "Nomor HP terlalu panjang").optional(),
    avatarUrl: avatarUrlSchema.nullable().optional(),
});

export type ProfileUpdateBody = z.infer<typeof profileUpdateSchema>;

export async function GET() {
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
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) {
        return NextResponse.json({ error: "Akun ini tidak terhubung dengan data karyawan." }, { status: 403 });
    }

    try {
        const result = await validateBody(request, profileUpdateSchema);
        if ("error" in result) return result.error;

        const { phone, avatarUrl: avatarInput } = result.data;

        // Guard: Karyawan hanya bisa update data dirinya sendiri
        // Tidak ada field yang bisa diubah di luar phone dan avatarUrl
        let avatarUrl: string | null | undefined;
        let avatarPath: string | null | undefined;
        if (avatarInput !== undefined) {
            if (avatarInput === null) {
                avatarUrl = null;
                avatarPath = null;
            } else if (avatarInput.startsWith("data:")) {
                // Base64 valid → simpan ke storage/avatars/{employeeId}/{uuid}.ext,
                // balas URL serve privat; klien render opaque via avatarUrl.
                const maxBytes = await resolveAvatarLimitBytes();
                const parsed = parseAvatarDataUrl(avatarInput, maxBytes);
                const saved = await saveAvatarBuffer(session.employeeId, parsed.buffer, parsed.mime, maxBytes);
                avatarUrl = saved.serveUrl;
                avatarPath = saved.relativePath;
            } else {
                // URL https:// eksternal tetap disimpan apa adanya; path dikosongkan.
                avatarUrl = avatarInput;
                avatarPath = null;
            }
        }

        const previous = avatarPath !== undefined
            ? await prisma.employee.findUnique({
                where: { employeeId: session.employeeId },
                select: { avatarPath: true },
            })
            : null;

        const updated = await prisma.employee.update({
            where: { employeeId: session.employeeId },
            data: {
                ...(phone !== undefined && { phone }),
                ...(avatarUrl !== undefined && { avatarUrl }),
                ...(avatarPath !== undefined && { avatarPath }),
            },
            select: {
                employeeId: true,
                phone: true,
                avatarUrl: true,
            },
        });

        // Best-effort: hapus berkas avatar lama yang sudah diganti/dikosongkan.
        const stalePath = previous?.avatarPath;
        if (stalePath && stalePath !== avatarPath) {
            const [staleOwner, ...rest] = stalePath.split("/");
            const staleFile = rest.join("/");
            const staleAbsolute = staleOwner && staleFile ? resolveAvatarPath(staleOwner, staleFile) : null;
            if (staleAbsolute) {
                await unlink(staleAbsolute).catch(() => undefined);
            }
        }

        return NextResponse.json({
            success: true,
            message: "Profil berhasil diperbarui",
            data: updated,
        });
    } catch (err) {
        if (err instanceof AvatarUploadError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return serverErrorResponse("ProfilePUT", err);
    }
}