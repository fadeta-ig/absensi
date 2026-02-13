import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEmployeeByEmployeeId, updateEmployee } from "@/lib/services/employeeService";
import { sendPasswordEmail } from "@/lib/services/emailService";
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
    try {
        const session = await getSession();
        if (!session || session.role !== "hr") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { employeeId } = await request.json();

        if (!employeeId) {
            return NextResponse.json(
                { error: "Employee ID harus diisi" },
                { status: 400 }
            );
        }

        const employee = await getEmployeeByEmployeeId(employeeId);
        if (!employee) {
            return NextResponse.json(
                { error: "Karyawan tidak ditemukan" },
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
                { error: "Karyawan tidak memiliki email" },
                { status: 400 }
            );
        }

        // Generate random password
        const plainPassword = generatePassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // Update employee password
        await updateEmployee(employee.id, { password: hashedPassword });

        // Send email
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
                : `Password berhasil di-generate (cek console log)`,
        });
    } catch {
        return NextResponse.json(
            { error: "Server error" },
            { status: 500 }
        );
    }
}
