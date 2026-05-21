import { prisma } from "@/lib/prisma";

export async function logAction(
    action: string,
    entity: string,
    performedBy: string,
    entityId?: string,
    details?: any
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
        console.error("[Audit Service] Failed to log action:", error);
    }
}
