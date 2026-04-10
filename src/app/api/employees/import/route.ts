import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { validateImport, executeImport } from "@/lib/services/bulkImportService";
import logger from "@/lib/logger";

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const mode = formData.get("mode") as string;

        if (!file) {
            return NextResponse.json({ error: "File Excel (.xlsx) wajib diupload." }, { status: 400 });
        }

        if (!file.name.endsWith(".xlsx")) {
            return NextResponse.json({ error: "Hanya file .xlsx yang diterima." }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();

        if (mode === "validate") {
            const report = await validateImport(buffer);
            return NextResponse.json(report);
        }

        if (mode === "execute") {
            const result = await executeImport(buffer, session.employeeId);
            logger.info("Bulk import executed", {
                created: result.created,
                failed: result.failed,
                performedBy: session.employeeId,
            });
            return NextResponse.json(result, { status: 201 });
        }

        return NextResponse.json(
            { error: "Parameter 'mode' harus 'validate' atau 'execute'." },
            { status: 400 }
        );
    } catch (err: unknown) {
        const prismaError = err as { code?: string };
        if (prismaError?.code === "P2002") {
            return NextResponse.json(
                { error: "Terdapat duplikat data (ID Karyawan atau Email). Periksa file Anda." },
                { status: 400 }
            );
        }
        return serverErrorResponse("BulkImportPOST", err);
    }
}
