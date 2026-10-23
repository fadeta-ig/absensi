import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { isWig002 } from "@/lib/services/appointmentService";
import { searchActiveEmployees } from "@/lib/services/employeeSearchService";
import { z } from "zod";

const employeesQuerySchema = z.object({
    q: z.string().trim().max(50).optional().default(""),
    limit: z.coerce.number().int().min(1).max(200).optional().default(20),
    exclude: z.string().trim().max(100).optional(),
});

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();

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
        const query = parsed.data.q.trim();
        const limit = parsed.data.limit;
        // Default: sembunyikan diri sendiri dari hasil (penyelenggara otomatis peserta).
        // WIG002 tanpa employeeId tidak difilter.
        const exclude = parsed.data.exclude ?? session.employeeId ?? undefined;

        const data = await searchActiveEmployees({ q: query, limit, excludeEmployeeId: exclude });

        return NextResponse.json({ success: true, data });
    } catch (err) {
        return serverErrorResponse("AppointmentEmployeesGET", err);
    }
}
