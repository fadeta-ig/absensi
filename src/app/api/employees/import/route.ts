import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse, parseFormData } from "@/lib/middleware/apiGuard";
import { validateImport, executeImport, DuplicateImportError, type ImportMode } from "@/lib/services/bulk-import";
import logger from "@/lib/logger";
import { actorFromSession } from "@/lib/services/auditService";
import { canManageHr } from "@/lib/permissions";

export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session)) return forbiddenResponse();

    try {
        const parsedForm = await parseFormData(request, "BulkImportPOST");
        if ("error" in parsedForm) return parsedForm.error;
        const formData = parsedForm.data;
        const file = formData.get("file") as File | null;
        const operation = String(formData.get("operation") ?? formData.get("mode") ?? "validate");
        const importMode = String(formData.get("importMode") ?? "create") as ImportMode;
        const allowCreateMaster = String(formData.get("allowCreateMaster") ?? "false") === "true";

        if (!file) {
            return NextResponse.json({ error: "File Excel (.xlsx) wajib diupload." }, { status: 400 });
        }

        if (!file.name.toLowerCase().endsWith(".xlsx")) {
            return NextResponse.json({ error: "Hanya file .xlsx yang diterima." }, { status: 400 });
        }
        if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: "Ukuran file harus lebih dari 0 dan maksimal 10MB." }, { status: 400 });
        }
        if (!["create", "update", "upsert"].includes(importMode)) {
            return NextResponse.json({ error: "Mode impor tidak valid." }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const options = { mode: importMode, allowCreateMaster };

        if (operation === "validate") {
            const report = await validateImport(buffer, options);
            return NextResponse.json(report);
        }

        if (operation === "execute") {
            const result = await executeImport(buffer, actorFromSession(session), options);
            logger.info("Bulk import executed", {
                created: result.created,
                updated: result.updated,
                failedRows: result.failedRows,
                performedBy: session.username,
            });
            return NextResponse.json(result, { status: 201 });
        }

        return NextResponse.json(
            { error: "Parameter 'operation' harus 'validate' atau 'execute'." },
            { status: 400 }
        );
    } catch (err: unknown) {
        if (err instanceof DuplicateImportError) {
            return NextResponse.json({ error: err.message, jobId: err.jobId }, { status: 409 });
        }
        if (err instanceof Error && (
            err.message.includes("Header") || err.message.includes("sheet") || err.message.includes("baris")
            || err.message.includes("dieksekusi") || err.message.includes("ditemukan")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
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
