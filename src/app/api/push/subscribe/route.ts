import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
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
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const body = await request.json();
        const parsed = subscribeSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || "Data subscription tidak valid." },
                { status: 400 },
            );
        }

        const { endpoint, keys } = parsed.data;

        await prisma.pushSubscription.upsert({
            where: { endpoint },
            update: {
                p256dh: keys.p256dh,
                auth: keys.auth,
                employeeId: session.employeeId,
            },
            create: {
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                employeeId: session.employeeId,
            },
        });

        return NextResponse.json({ success: true, message: "Notifikasi push berhasil diaktifkan." });
    } catch (err) {
        return serverErrorResponse("PushSubscribePOST", err);
    }
}

/** DELETE — unsubscribe from push notifications */
export async function DELETE(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();

    try {
        const { endpoint } = await request.json();

        if (endpoint) {
            await prisma.pushSubscription.deleteMany({
                where: { endpoint, employeeId: session.employeeId },
            });
        }

        return NextResponse.json({ success: true, message: "Notifikasi push dinonaktifkan." });
    } catch (err) {
        return serverErrorResponse("PushSubscribeDELETE", err);
    }
}
