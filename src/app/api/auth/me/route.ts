import { NextResponse } from "next/server";
import { getEmployeeById } from "@/lib/services/employeeService";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { requireAuth, unauthorizedResponse } from "@/lib/middleware/apiGuard";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const employee = await getEmployeeById(session.id);
    if (!employee) {
        return NextResponse.json(
            { error: "Data pengguna tidak ditemukan" },
            { status: 404 }
        );
    }

    const { password: _pw, faceDescriptor: _fd, sessionVersion: _sessionVersion, ...safeEmployee } = employee;
    void _pw;
    void _fd;
    void _sessionVersion;
    return NextResponse.json(safeEmployee);
}
