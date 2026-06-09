import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";

export async function logAction(
    action: string,
    entity: string,
    performedBy: string,
    entityId?: string,
    details?: Record<string, unknown> | unknown[] | string | number | boolean
) {
    try {
        await prisma.auditLog.create({
            data: {
                action,
                entity,
                performedBy,
                entityId,
                details: details ? JSON.stringify(details) : null,
            },
        });
    } catch (error) {
        // We log the error but don't throw it to prevent breaking the main operation
        logger.error("[Audit Service] Failed to log action:", { error });
    }
}
