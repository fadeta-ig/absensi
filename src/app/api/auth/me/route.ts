import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getEmployeeById } from "@/lib/services/employeeService";

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const employee = await getEmployeeById(session.id);
    if (!employee) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, faceDescriptor, ...safeEmployee } = employee;
    return NextResponse.json(safeEmployee);
}
