import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, validateBody, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getGreenMeetingConfig, updateGreenMeetingConfig, canManageGreenMeeting } from "@/lib/services/greenMeetingService";
import { greenMeetingConfigSchema } from "@/lib/validations/validationSchemas";
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
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    const isManager = await canManageGreenMeeting(session);
    if (!isManager) return forbiddenResponse();

    try {
        const result = await validateBody(request, greenMeetingConfigSchema);
        if ("error" in result) return result.error;

        const updated = await updateGreenMeetingConfig(result.data, session.username);
        logger.info("Green Meeting config updated", {
            updatedBy: session.username,
            picRole: updated.picRole,
        });

        return NextResponse.json(updated);
    } catch (err) {
        return serverErrorResponse("GreenMeetingConfigPATCH", err);
    }
}
