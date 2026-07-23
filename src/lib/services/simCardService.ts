import { prisma } from "../prisma";

interface SimCardInput {
    phoneNumber: string;
    provider: string;
    expiredDate?: string | Date | null;
    assignedToId?: string | null;
    notes?: string | null;
}

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

export async function createSimCard(data: SimCardInput) {
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

export async function updateSimCard(id: string, data: Partial<SimCardInput>) {
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
    const existing = await prisma.simCard.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return false;
    await prisma.simCard.delete({ where: { id } });
    return true;
}
