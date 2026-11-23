import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
    requireAuth,
    unauthorizedResponse,
    forbiddenResponse,
    validateBody,
    serverErrorResponse,
} from "@/lib/middleware/apiGuard";
import { canUseEmployeePortal } from "@/lib/permissions";
import { stressmeterAnonymousShareSchema } from "@/lib/validations/validationSchemas";
import { submitAnonymousShare } from "@/lib/services/stressmeterService";

// Pembatas anti-spam murni di RAM memakai hash ephemeral per proses (tidak pernah ditulis ke DB atau log)
const EPHEMERAL_SALT = `${Date.now()}-${Math.random()}`;
const MAX_SHARES_PER_HOUR = 5;
const WINDOW_MS = 60 * 60 * 1000;
const shareWindowStore = new Map<string, { count: number; resetAt: number }>();

function isAnonShareRateLimited(sessionKey: string): boolean {
    const now = Date.now();
    const bucketKey = createHash("sha256")
        .update(`${EPHEMERAL_SALT}:${sessionKey}`)
        .digest("hex");

    const entry = shareWindowStore.get(bucketKey);
    if (!entry || now > entry.resetAt) {
        shareWindowStore.set(bucketKey, { count: 1, resetAt: now + WINDOW_MS });
        return false;
    }

    if (entry.count >= MAX_SHARES_PER_HOUR) {
        return true;
    }

    entry.count += 1;
    return false;
}

export async function POST(request: NextRequest) {
    try {
        const session = await requireAuth();
        if (!session) return unauthorizedResponse();
        if (!canUseEmployeePortal(session) || !session.employeeId) {
            return forbiddenResponse();
        }

        if (isAnonShareRateLimited(session.userId)) {
            return NextResponse.json(
                { error: "Batas pengiriman curhat sementara tercapai. Silakan coba lagi nanti." },
                { status: 429 }
            );
        }

        const validation = await validateBody(request, stressmeterAnonymousShareSchema);
        if ("error" in validation) return validation.error;

        // Sengaja tidak meneruskan session / userId / employeeId ke service demi anonimitas struktural
        const created = await submitAnonymousShare({
            topic: validation.data.topic,
            message: validation.data.message,
        });

        return NextResponse.json(
            {
                success: true,
                data: created,
            },
            { status: 201 }
        );
    } catch (error) {
        return serverErrorResponse("EmployeeStressmeterAnonymousSharePOST", error);
    }
}
