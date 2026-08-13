import { NextRequest, NextResponse } from "next/server";
import { sendPasswordEmail } from "@/lib/services/emailService";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { sendPasswordSchema } from "@/lib/validations/validationSchemas";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { canManageHr } from "@/lib/permissions";
import { actorFromSession, logAction } from "@/lib/services/auditService";

function generatePassword(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const bytes = randomBytes(10);
    let password = "";
    for (let i = 0; i < 10; i++) {
        password += chars[bytes[i] % chars.length];
    }
    return password;
}

export async function POST(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canManageHr(session)) return forbiddenResponse();

        const result = await validateBody(request, sendPasswordSchema);
        if ("error" in result) return result.error;

        const { employeeId } = result.data;

        const employee = await prisma.employee.findUnique({
            where: { employeeId },
            select: {
                id: true,
                employeeId: true,
                name: true,
                email: true,
                isActive: true,
                userAccount: { select: { id: true, isActive: true } },
            },
        });
        if (!employee) {
            return NextResponse.json(
                { error: "Data karyawan tidak ditemukan" },
                { status: 404 }
            );
        }

        if (!employee.isActive) {
            return NextResponse.json(
                { error: "Karyawan tidak aktif" },
                { status: 400 }
            );
        }

        if (!employee.userAccount?.isActive) {
            return NextResponse.json(
                { error: "Akun login karyawan tidak aktif atau belum tersedia" },
                { status: 400 }
            );
        }

        if (!employee.email) {
            return NextResponse.json(
                { error: "Karyawan tidak memiliki alamat email" },
                { status: 400 }
            );
        }

        const plainPassword = generatePassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        await prisma.userAccount.update({
            where: { id: employee.userAccount.id },
            data: {
                passwordHash: hashedPassword,
                passwordChangedAt: new Date(),
                sessionVersion: { increment: 1 },
            },
        });

        const emailSent = await sendPasswordEmail(
            employee.email,
            employee.name,
            plainPassword
        );

        await logAction("RESET_PASSWORD", "USER_ACCOUNT", actorFromSession(session), employee.userAccount.id, {
            username: employee.employeeId,
            emailSent,
        });

        return NextResponse.json({
            success: true,
            emailSent,
            message: emailSent
                ? `Password berhasil dikirim ke ${employee.email}`
                : "Password berhasil diperbarui. Email gagal terkirim, periksa konfigurasi SMTP.",
        });
    } catch (err) {
        return serverErrorResponse("SendPassword", err);
    }
}
