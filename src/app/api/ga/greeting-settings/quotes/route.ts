import { NextRequest, NextResponse } from "next/server";
import {
    forbiddenResponse,
    requireAuth,
    serverErrorResponse,
    unauthorizedResponse,
} from "@/lib/middleware/apiGuard";
import {
    canManageGreeting,
    listEmployeeGreetingQuotes,
} from "@/lib/services/greetingSettingsService";

/**
 * GET /api/ga/greeting-settings/quotes — daftar quotes kiriman karyawan untuk kurasi.
 * Dapat diakses oleh WIG001 (hr.manage), WIG002 (ga.manage), atau karyawan editor terpilih.
 * Tidak pernah mengembalikan skor bintang Stressmeter agar privasi HR tetap terjaga.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!(await canManageGreeting(session))) return forbiddenResponse();

    try {
        const sp = request.nextUrl.searchParams;
        const page = Number.parseInt(sp.get("page") ?? "1", 10);
        const limit = Number.parseInt(sp.get("limit") ?? "15", 10);

        const data = await listEmployeeGreetingQuotes({
            status: sp.get("status"),
            slot: sp.get("slot"),
            search: sp.get("search"),
            page: Number.isFinite(page) ? page : 1,
            limit: Number.isFinite(limit) ? limit : 15,
        });

        return NextResponse.json(
            { success: true, data },
            { headers: { "Cache-Control": "private, no-store" } }
        );
    } catch (err) {
        return serverErrorResponse("GreetingQuotesGET", err);
    }
}
