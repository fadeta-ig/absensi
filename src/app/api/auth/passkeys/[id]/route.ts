import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { revokeCredential, PasskeyError } from "@/lib/services/passkeyService";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { id } = await params;
        await revokeCredential(session, id, { userId: session.userId, username: session.username });
        return NextResponse.json({ success: true, message: "Perangkat dihapus." });
    } catch (err) {
        if (err instanceof PasskeyError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("PasskeyRevoke", err);
    }
}
