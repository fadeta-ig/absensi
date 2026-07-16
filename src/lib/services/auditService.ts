import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import type { SessionPayload } from "@/lib/auth";

export interface AuditActor {
    userId?: string | null;
    identifier: string;
    name?: string | null;
    role?: string | null;
    type?: "USER" | "SYSTEM";
}

export function actorFromSession(session: SessionPayload): AuditActor {
    return {
        userId: session.userId,
        identifier: session.username,
        name: session.name,
        role: session.primaryRole,
        type: "USER",
    };
}

export const SYSTEM_ACTOR: AuditActor = {
    userId: null,
    identifier: "SYSTEM_CRON",
    name: "System Cron",
    role: "SYSTEM",
    type: "SYSTEM",
};

export async function logAction(
    action: string,
    entity: string,
    actor: AuditActor,
    entityId?: string,
    details?: Record<string, unknown> | unknown[] | string | number | boolean
) {
    try {
        await prisma.auditLog.create({
            data: {
                action,
                entity,
                actorType: actor.type ?? "USER",
                actorUserId: actor.userId ?? null,
                actorIdentifier: actor.identifier,
                actorName: actor.name ?? null,
                actorRole: actor.role ?? null,
                entityId,
                details: details ? JSON.stringify(details) : null,
            },
        });
    } catch (error) {
        logger.error("[Audit Service] Failed to log action:", { error });
    }
}
