import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { changePasswordSchema } from "@/lib/validations/validationSchemas";
import { sendPasswordChangedEmail } from "@/lib/services/emailService";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();

        const result = await validateBody(request, changePasswordSchema);
        if ("error" in result) return result.error;

        const { currentPassword, newPassword } = result.data;

        const user = await prisma.userAccount.findUnique({
            where: { id: session.userId },
            select: { id: true, passwordHash: true, email: true, displayName: true },
        });
        if (!user) {
            return NextResponse.json(
                { error: "Akun pengguna tidak ditemukan" },
                { status: 404 }
            );
        }

        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValid) {
            return NextResponse.json(
                { error: "Password saat ini salah" },
                { status: 401 }
            );
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await prisma.userAccount.update({
            where: { id: user.id },
            data: {
                passwordHash: hashedPassword,
                passwordChangedAt: new Date(),
                sessionVersion: { increment: 1 },
            },
        });

        // Dispatch background email notification
        sendPasswordChangedEmail(user.email, user.displayName).catch((error) => {
            logger.warn("Password changed notification email failed", {
                userId: user.id,
                email: user.email,
                error,
            });
        });

        const response = NextResponse.json({
            success: true,
            message: "Password berhasil diubah. Silakan login kembali.",
        });
        response.cookies.delete("session");
        return response;
    } catch (err) {
        return serverErrorResponse("ChangePassword", err);
    }
}
