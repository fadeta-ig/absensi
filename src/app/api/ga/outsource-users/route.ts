import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import {
    OutsourceUserError,
    createOutsourceUserAccount,
    isWig002Session,
    listOutsourceUsersForAdmin,
} from "@/lib/services/outsourceUserService";
import {
    createOutsourceUserSchema,
    outsourceModuleKeySchema,
} from "@/lib/validations/validationSchemas";
import type { OutsourceModuleKey } from "@/lib/permissions";

/**
 * GET /api/ga/outsource-users?q=&status=all|active|inactive&module=all|<key>
 * POST /api/ga/outsource-users
 * Manajemen akun Outsource (OS) & RBAC E-Checklist — ketat WIG002-only.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002Session(session)) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const q = searchParams.get("q") ?? undefined;
        const rawStatus = searchParams.get("status");
        const status =
            rawStatus === "active" || rawStatus === "inactive" ? rawStatus : "all";
        const rawModule = searchParams.get("module");
        let moduleFilter: OutsourceModuleKey | "all" = "all";
        if (rawModule && rawModule !== "all") {
            const parsed = outsourceModuleKeySchema.safeParse(rawModule);
            if (!parsed.success) {
                return NextResponse.json({ error: "Filter modul tidak valid." }, { status: 400 });
            }
            moduleFilter = parsed.data;
        }

        const data = await listOutsourceUsersForAdmin(session, { q, status, module: moduleFilter });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof OutsourceUserError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaOutsourceUsersGET", err);
    }
}

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!isWig002Session(session)) return forbiddenResponse();

    try {
        const result = await validateBody(request, createOutsourceUserSchema);
        if ("error" in result) return result.error;

        const created = await createOutsourceUserAccount(session, result.data);
        return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch (err) {
        if (err instanceof OutsourceUserError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GaOutsourceUsersPOST", err);
    }
}
