import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyLogin } from "@/lib/auth";

export async function POST(request: NextRequest) {
    try {
        const { employeeId, password } = await request.json();

        if (!employeeId || !password) {
            return NextResponse.json(
                { error: "ID Karyawan dan password harus diisi" },
                { status: 400 }
            );
        }

        const employee = await verifyLogin(employeeId, password);
        if (!employee) {
            return NextResponse.json(
                { error: "ID Karyawan atau password salah" },
                { status: 401 }
            );
        }

        await createSession(employee);

        return NextResponse.json({
            success: true,
            role: employee.role,
            name: employee.name,
            employeeId: employee.employeeId,
        });
    } catch {
        return NextResponse.json(
            { error: "Server error" },
            { status: 500 }
        );
    }
}
