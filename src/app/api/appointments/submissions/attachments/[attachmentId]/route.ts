import { NextRequest, NextResponse } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { MeetingTaskError, getSubmissionAttachment } from "@/lib/services/meetingTaskService";
import { isWig002 } from "@/lib/services/appointmentService";

export async function GET(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (!session.employeeId && !isWig002(session)) return forbiddenResponse();

    try {
        const { attachmentId } = await params;
        const file = await getSubmissionAttachment(session, attachmentId);
        const stat = statSync(file.filePath);
        const stream = createReadStream(file.filePath);
        const readable = new ReadableStream({
            start(controller) {
                stream.on("data", (chunk) => controller.enqueue(chunk));
                stream.on("end", () => controller.close());
                stream.on("error", (err) => controller.error(err));
            },
            cancel() {
                stream.destroy();
            },
        });
        return new NextResponse(readable, {
            headers: {
                "Content-Type": file.mimeType,
                "Content-Length": String(stat.size),
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (err) {
        if (err instanceof MeetingTaskError) {
            return NextResponse.json({ error: err.message }, { status: err.statusCode });
        }
        return serverErrorResponse("MeetingTaskAttachmentGET", err);
    }
}
