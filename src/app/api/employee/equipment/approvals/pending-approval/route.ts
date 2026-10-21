import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { EquipmentError, getApprovalQueue } from "@/lib/services/equipmentService";

const QUEUE_STATUSES = ["DONE", "APPROVED", "ALL"] as const;

/**
 * GET /api/employee/equipment/approvals/pending-approval?status=&from=&to=
 * Antrean approval final + riwayat disetujui. Khusus approver.
 * - status DONE (default): yang menunggu, tanggal = checkedAt
 * - status APPROVED: riwayat disetujui, tanggal = approvedAt
 * - status ALL: gabungan keduanya
 * - from/to inklusif YYYY-MM-DD WIB; tanpa tanggal = semua backlog.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId) return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status") ?? undefined;
        if (status && !(QUEUE_STATUSES as readonly string[]).includes(status)) {
            return NextResponse.json({ error: "Status antrean tidak valid." }, { status: 400 });
        }
        const data = await getApprovalQueue(session, {
            status: (status as "DONE" | "APPROVED" | "ALL" | undefined) ?? undefined,
            from: searchParams.get("from") ?? undefined,
            to: searchParams.get("to") ?? undefined,
        });
        return NextResponse.json({ success: true, data });
    } catch (err) {
        if (err instanceof EquipmentError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("EmployeeEquipmentPendingApprovalGET", err);
    }
}
