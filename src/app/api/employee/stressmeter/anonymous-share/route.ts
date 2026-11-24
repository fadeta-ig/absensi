import { createHash, randomBytes } from "node:crypto";
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
import {
    getEmployeeFullNameForShare,
    submitAnonymousShare,
} from "@/lib/services/stressmeterService";

// Pembatas anti-spam murni di RAM memakai salt acak kriptografis per proses (tidak pernah ditulis ke DB/log)
const EPHEMERAL_SALT = randomBytes(32).toString("hex");
const MAX_SHARES_PER_HOUR = 5;
const WINDOW_MS = 60 * 60 * 1000;
const EVICTION_THRESHOLD = 500;
const shareWindowStore = new Map<string, { count: number; resetAt: number }>();

function evictExpiredBuckets(now: number): void {
    for (const [key, entry] of shareWindowStore) {
        if (now > entry.resetAt) {
            shareWindowStore.delete(key);
        }
    }
}

function isAnonShareRateLimited(sessionKey: string): boolean {
    const now = Date.now();
    if (shareWindowStore.size > EVICTION_THRESHOLD) {
        evictExpiredBuckets(now);
    }

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

        // Bila karyawan tidak opt-in, jangan query maupun teruskan identitas apa pun demi anonimitas struktural.
        // Bila opt-in, nama lengkap diambil otoritatif dari server (bukan dari payload klien) agar tidak dapat dipalsukan.
        const senderName = validation.data.includeSenderName
            ? await getEmployeeFullNameForShare(session.employeeId, session.name)
            : null;

        const created = await submitAnonymousShare({
            topic: validation.data.topic,
            message: validation.data.message,
            senderName,
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
