import { NextResponse } from "next/server";
import { forbiddenResponse, requireAuth, serverErrorResponse, unauthorizedResponse } from "@/lib/middleware/apiGuard";
import { PERMISSIONS } from "@/lib/permissions";
import { isGreetingEditor, listActiveGreetingRules } from "@/lib/services/greetingSettingsService";

/**
 * GET /api/employee/greeting — aturan sapaan aktif + flag editor.
 * Client memilih aturan yang cocok memakai jam/tanggal WIB dari konteks
 * presensi, sehingga sapaan tetap berubah saat jam berganti tanpa reload.
 */
export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId || !session.permissions.includes(PERMISSIONS.EMPLOYEE_SELF)) {
        return forbiddenResponse();
    }

    try {
        const [rules, canEditGreeting] = await Promise.all([
            listActiveGreetingRules(),
            isGreetingEditor(session),
        ]);
        return NextResponse.json(
            { success: true, data: { rules, canEditGreeting } },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (err) {
        return serverErrorResponse("EmployeeGreetingGET", err);
    }
}
