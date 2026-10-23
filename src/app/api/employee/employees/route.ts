import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { searchActiveEmployees } from "@/lib/services/employeeSearchService";
import { z } from "zod";

const employeesQuerySchema = z.object({
    q: z.string().trim().max(50).optional().default(""),
    limit: z.coerce.number().int().min(1).max(200).optional().default(20),
    exclude: z.string().trim().max(100).optional(),
});

/**
 * GET /api/employee/employees?q=&limit=&exclude=
 * Cari karyawan aktif (nama/ID) untuk picker lintas modul employee/GA.
 * Bentuk respons identik dengan /api/appointments/employees.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const parsed = employeesQuerySchema.safeParse({
            q: searchParams.get("q") ?? "",
            limit: searchParams.get("limit") ?? undefined,
            exclude: searchParams.get("exclude") ?? undefined,
        });
        if (!parsed.success) {
            return NextResponse.json({ error: "Parameter pencarian tidak valid." }, { status: 400 });
        }
        const data = await searchActiveEmployees({
            q: parsed.data.q.trim(),
            limit: parsed.data.limit,
            excludeEmployeeId: parsed.data.exclude ?? session.employeeId ?? undefined,
        });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        return serverErrorResponse("EmployeeEmployeesGET", err);
    }
}
