import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse, parseJsonBody, validateBody } from "@/lib/middleware/apiGuard";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const subscribeSchema = z.object({
    endpoint: z.string().url("Endpoint harus berupa URL valid"),
    keys: z.object({
        p256dh: z.string().min(1, "p256dh key diperlukan"),
        auth: z.string().min(1, "auth key diperlukan"),
    }),
});

/** POST — subscribe to push notifications */
export async function POST(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const result = await validateBody(request, subscribeSchema);
        if ("error" in result) return result.error;

        const { endpoint, keys } = result.data;

        await prisma.pushSubscription.upsert({
            where: { endpoint },
            update: {
                p256dh: keys.p256dh,
                auth: keys.auth,
                userId: session.userId,
            },
            create: {
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                userId: session.userId,
            },
        });

        return NextResponse.json({ success: true, message: "Notifikasi push berhasil diaktifkan." });
    } catch (err) {
        return serverErrorResponse("PushSubscribePOST", err);
    }
}

/** DELETE — unsubscribe from push notifications */
export async function DELETE(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const body = await parseJsonBody<{ endpoint?: unknown }>(request, "PushSubscribeDELETE");
        if ("error" in body) return body.error;
        const { endpoint } = body.data;

        if (typeof endpoint === "string" && endpoint) {
            await prisma.pushSubscription.deleteMany({
                where: { endpoint, userId: session.userId },
            });
        }

        return NextResponse.json({ success: true, message: "Notifikasi push dinonaktifkan." });
    } catch (err) {
        return serverErrorResponse("PushSubscribeDELETE", err);
    }
}
