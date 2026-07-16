import { NextRequest, NextResponse } from "next/server";
import { getEmployeeByEmployeeId, updateEmployee } from "@/lib/services/employeeService";
import { sendPasswordEmail } from "@/lib/services/emailService";
import { checkSensitiveRateLimit } from "@/lib/middleware/rateLimit";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { sendPasswordSchema } from "@/lib/validations/validationSchemas";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

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
    const rateLimited = checkSensitiveRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (session.role !== "hr") return forbiddenResponse();

        const result = await validateBody(request, sendPasswordSchema);
        if ("error" in result) return result.error;

        const { employeeId } = result.data;

        const employee = await getEmployeeByEmployeeId(employeeId);
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

        if (!employee.email) {
            return NextResponse.json(
                { error: "Karyawan tidak memiliki alamat email" },
                { status: 400 }
            );
        }

        const plainPassword = generatePassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        await updateEmployee(employee.id, { password: hashedPassword });

        const emailSent = await sendPasswordEmail(
            employee.email,
            employee.name,
            plainPassword
        );

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
