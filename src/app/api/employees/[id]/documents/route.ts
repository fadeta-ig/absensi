import { DocumentType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { canManageHr } from "@/lib/permissions";
import { EMPLOYEE_DOCUMENT_TYPES, listEmployeeDocuments, uploadEmployeeDocument } from "@/lib/services/employeeDocumentService";
import { actorFromSession, logAction } from "@/lib/services/auditService";

async function requireHr() {
    const session = await requireAuth();
    if (!session) return { response: unauthorizedResponse() } as const;
    if (!canManageHr(session)) return { response: forbiddenResponse() } as const;
    return { session } as const;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;
    const auth = await requireHr();
    if ("response" in auth) return auth.response;

    try {
        const { id } = await params;
        const result = await listEmployeeDocuments(id);
        if (!result) return NextResponse.json({ error: "Karyawan tidak ditemukan." }, { status: 404 });
        await logAction("VIEW_DOCUMENT_LIST", "EmployeeDocument", actorFromSession(auth.session), id, { employeeId: result.employee.employeeId });
        return NextResponse.json({
            employeeIsActive: result.employee.isActive,
            documents: result.documents.map((document) => ({ ...document, downloadUrl: `/api/employees/${id}/documents/${document.id}` })),
        });
    } catch (error) {
        return serverErrorResponse("EmployeeDocumentsGET", error);
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;
    const auth = await requireHr();
    if ("response" in auth) return auth.response;

    try {
        const { id } = await params;
        const formData = await request.formData();
        const file = formData.get("file");
        const type = String(formData.get("type") ?? "");
        const title = String(formData.get("title") ?? "").trim();
        const expiresAt = String(formData.get("expiresAt") ?? "").trim() || null;
        const notes = String(formData.get("notes") ?? "").trim() || null;

        if (!(file instanceof File)) return NextResponse.json({ error: "File wajib dipilih." }, { status: 400 });
        if (!EMPLOYEE_DOCUMENT_TYPES.includes(type as DocumentType)) return NextResponse.json({ error: "Jenis dokumen tidak valid." }, { status: 400 });
        if (!title || title.length > 191) return NextResponse.json({ error: "Judul dokumen wajib diisi dan maksimal 191 karakter." }, { status: 400 });
        if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return NextResponse.json({ error: "Tanggal kedaluwarsa tidak valid." }, { status: 400 });

        const document = await uploadEmployeeDocument({
            employeeDatabaseId: id,
            type: type as DocumentType,
            title,
            file,
            expiresAt,
            notes,
            uploadedByUserId: auth.session.userId,
        });
        await logAction("UPLOAD", "EmployeeDocument", actorFromSession(auth.session), document.id, { employeeDatabaseId: id, type, title });
        return NextResponse.json({ ...document, downloadUrl: `/api/employees/${id}/documents/${document.id}` }, { status: 201 });
    } catch (error) {
        if (error instanceof Error && (error.message.includes("Dokumen") || error.message.includes("dokumen") || error.message.includes("Karyawan") || error.message.includes("file"))) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return serverErrorResponse("EmployeeDocumentsPOST", error);
    }
}
