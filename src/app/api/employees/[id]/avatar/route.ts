import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { AvatarUploadError, setEmployeeAvatarByHr } from "@/lib/services/avatarService";
import { hrAvatarUploadSchema } from "@/lib/validations/validationSchemas";
import { actorFromSession, logAction } from "@/lib/services/auditService";

function canManageAvatars(session: Awaited<ReturnType<typeof requireAuth>>): boolean {
    return Boolean(session && session.username === "WIG001" && session.permissions.includes("hr.manage"));
}

/**
 * PUT /api/employees/[id]/avatar — unggah/hapus PAS foto karyawan oleh HR (WIG001).
 * Body: { avatarUrl: data-URL JPG/PNG/WebP | null }. Berkas lama tidak dihapus.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!canManageAvatars(session)) return forbiddenResponse();

    try {
        const { id } = await params;
        const result = await validateBody(request, hrAvatarUploadSchema);
        if ("error" in result) return result.error;

        const updated = await setEmployeeAvatarByHr(id, result.data.avatarUrl);
        await logAction("UPDATE_AVATAR", "Employee", actorFromSession(session), updated.id, {
            employeeId: updated.employeeId,
            cleared: result.data.avatarUrl === null,
        });
        return NextResponse.json({ success: true, data: updated });
    } catch (err) {
        if (err instanceof AvatarUploadError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeAvatarPUT", err);
    }
}
