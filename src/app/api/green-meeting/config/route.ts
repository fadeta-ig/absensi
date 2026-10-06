import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getGreenMeetingConfig, updateGreenMeetingConfig, canManageGreenMeeting, GreenMeetingError } from "@/lib/services/greenMeetingService";
import { requireGreenMeetingManager } from "../_guard";
import { greenMeetingConfigUpdateSchema } from "@/lib/validations/validationSchemas";
import logger from "@/lib/logger";

export async function GET() {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const config = await getGreenMeetingConfig();
        const isManager = await canManageGreenMeeting(session);
        return NextResponse.json({ ...config, canManage: isManager });
    } catch (err) {
        return serverErrorResponse("GreenMeetingConfigGET", err);
    }
}

export async function PATCH(request: NextRequest) {
    const { session, errorResponse } = await requireGreenMeetingManager();
    if (errorResponse) return errorResponse;

    try {
        const result = await validateBody(request, greenMeetingConfigUpdateSchema);
        if ("error" in result) return result.error;

        const updated = await updateGreenMeetingConfig(result.data, session.username);
        logger.info("Green Meeting config updated", {
            updatedBy: session.username,
            picRole: updated.picRole,
        });

        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof GreenMeetingError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("GreenMeetingConfigPATCH", err);
    }
}
