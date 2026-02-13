import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEmployeeByEmployeeId, updateEmployee } from "@/lib/services/employeeService";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { currentPassword, newPassword } = await request.json();

        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { error: "Password saat ini dan password baru harus diisi" },
                { status: 400 }
            );
        }

        if (newPassword.length < 8) {
            return NextResponse.json(
                { error: "Password baru minimal 8 karakter" },
                { status: 400 }
            );
        }

        const employee = await getEmployeeByEmployeeId(session.employeeId);
        if (!employee) {
            return NextResponse.json(
                { error: "Karyawan tidak ditemukan" },
                { status: 404 }
            );
        }

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, employee.password);
        if (!isValid) {
            return NextResponse.json(
                { error: "Password saat ini salah" },
                { status: 401 }
            );
        }

        // Hash and update new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await updateEmployee(employee.id, { password: hashedPassword });

        return NextResponse.json({
            success: true,
            message: "Password berhasil diubah",
        });
    } catch {
        return NextResponse.json(
            { error: "Server error" },
            { status: 500 }
        );
    }
}
