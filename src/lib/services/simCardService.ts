import { prisma } from "../prisma";
import { SimCard } from "@prisma/client";

export async function getSimCards() {
    return prisma.simCard.findMany({
        include: { assignedTo: { select: { name: true, departmentRel: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" }
    });
}

export async function getSimCardById(id: string) {
    return prisma.simCard.findUnique({
        where: { id },
        include: { assignedTo: { select: { name: true } } }
    });
}

export async function createSimCard(data: any) {
    return prisma.simCard.create({
        data: {
            phoneNumber: data.phoneNumber,
            provider: data.provider,
            expiredDate: data.expiredDate ? new Date(data.expiredDate) : null,
            assignedToId: data.assignedToId || null,
            assignedAt: data.assignedToId ? new Date() : null,
            notes: data.notes
        }
    });
}

export async function updateSimCard(id: string, data: any) {
    const existing = await prisma.simCard.findUnique({ where: { id } });
    if (!existing) return null;

    let assignedAt = existing.assignedAt;
    if (data.assignedToId !== undefined && data.assignedToId !== existing.assignedToId) {
        assignedAt = data.assignedToId ? new Date() : null;
    }

    return prisma.simCard.update({
        where: { id },
        data: {
            ...(data.phoneNumber !== undefined && { phoneNumber: data.phoneNumber }),
            ...(data.provider !== undefined && { provider: data.provider }),
            ...(data.expiredDate !== undefined && { expiredDate: data.expiredDate ? new Date(data.expiredDate) : null }),
            ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId || null }),
            ...(data.notes !== undefined && { notes: data.notes }),
            assignedAt
        }
    });
}

export async function deleteSimCard(id: string) {
    try {
        await prisma.simCard.delete({ where: { id } });
        return true;
    } catch {
        return false;
    }
}
