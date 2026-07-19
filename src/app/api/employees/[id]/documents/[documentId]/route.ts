import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { canManageHr } from "@/lib/permissions";
import { deleteEmployeeDocument, readEmployeeDocument } from "@/lib/services/employeeDocumentService";
import { actorFromSession, logAction } from "@/lib/services/auditService";

function contentDisposition(filename: string) {
    const fallback = filename.replace(/[^A-Za-z0-9._-]/g, "_") || "document";
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session)) return forbiddenResponse();

    try {
        const { id, documentId } = await params;
        const result = await readEmployeeDocument(id, documentId);
        if (!result) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
        await logAction("DOWNLOAD", "EmployeeDocument", actorFromSession(session), documentId, { employeeDatabaseId: id });
        return new NextResponse(result.buffer, {
            headers: {
                "Content-Type": result.document.mimeType,
                "Content-Length": String(result.buffer.length),
                "Content-Disposition": contentDisposition(result.document.originalName),
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return NextResponse.json({ error: "Berkas dokumen tidak ditemukan di storage." }, { status: 404 });
        return serverErrorResponse("EmployeeDocumentGET", error);
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageHr(session)) return forbiddenResponse();

    try {
        const { id, documentId } = await params;
        const document = await deleteEmployeeDocument(id, documentId);
        if (!document) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
        await logAction("DELETE", "EmployeeDocument", actorFromSession(session), documentId, { employeeDatabaseId: id, type: "EMPLOYEE_DOCUMENT" });
        return NextResponse.json({ success: true });
    } catch (error) {
        return serverErrorResponse("EmployeeDocumentDELETE", error);
    }
}
