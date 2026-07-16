import { prisma } from "@/lib/prisma";
import { toWIBDateString } from "@/lib/timezone";
import type { Prisma } from "@prisma/client";

type DbClient = typeof prisma | Prisma.TransactionClient;

export class EmployeeStatusError extends Error {
    constructor(message: string, public readonly status: number = 400) {
        super(message);
        this.name = "EmployeeStatusError";
    }
}

export type EmployeeStatusChangeInput = {
    isActive: boolean;
    reason: string;
    effectiveDate: string;
    reassignManagerId?: string | null;
};

async function collectDescendantIds(client: DbClient, employeeId: string): Promise<string[]> {
    const visited = new Set<string>([employeeId]);
    const descendants: string[] = [];
    let queue = [employeeId];

    while (queue.length > 0) {
        const children = await client.employee.findMany({
            where: { managerId: { in: queue } },
            select: { employeeId: true },
        });

        const next: string[] = [];
        for (const child of children) {
            if (visited.has(child.employeeId)) continue;
            visited.add(child.employeeId);
            descendants.push(child.employeeId);
            next.push(child.employeeId);
        }
        queue = next;
    }

    return descendants;
}

export async function getEmployeeStatusOverview(id: string) {
    const employee = await prisma.employee.findUnique({
        where: { id },
        select: {
            id: true,
            employeeId: true,
            name: true,
            role: true,
            isActive: true,
            statusChangedAt: true,
        },
    });
    if (!employee) return null;

    const descendantIds = await collectDescendantIds(prisma, employee.employeeId);

    const [
        directReports,
        assignedAssets,
        simCards,
        pendingLeaves,
        pendingOvertimes,
        pendingCorrections,
        pendingLetters,
        openAssetTickets,
        pushSubscriptions,
        statusHistory,
        eligibleManagers,
    ] = await Promise.all([
        prisma.employee.findMany({
            where: { managerId: employee.employeeId, isActive: true },
            select: { employeeId: true, name: true, positionRel: { select: { name: true } } },
            orderBy: { name: "asc" },
        }),
        prisma.asset.findMany({
            where: { assignedToId: employee.employeeId },
            select: { id: true, assetCode: true, name: true, status: true, kondisi: true },
            orderBy: { assetCode: "asc" },
        }),
        prisma.simCard.findMany({
            where: { assignedToId: employee.employeeId },
            select: { id: true, phoneNumber: true, provider: true },
            orderBy: { phoneNumber: "asc" },
        }),
        prisma.leaveRequest.count({ where: { employeeId: employee.employeeId, status: "pending" } }),
        prisma.overtimeRequest.count({ where: { employeeId: employee.employeeId, status: "pending" } }),
        prisma.attendanceCorrection.count({ where: { employeeId: employee.employeeId, status: "PENDING" } }),
        prisma.letterRequest.count({ where: { employeeId: employee.employeeId, status: "PENDING" } }),
        prisma.assetTicket.count({
            where: {
                employeeId: employee.employeeId,
                status: { notIn: ["REJECTED", "RESOLVED"] },
            },
        }),
        prisma.pushSubscription.count({ where: { employeeId: employee.employeeId } }),
        prisma.employeeStatusHistory.findMany({
            where: { employeeId: employee.employeeId },
            include: { actor: { select: { employeeId: true, name: true } } },
            orderBy: { createdAt: "desc" },
        }),
        prisma.employee.findMany({
            where: {
                isActive: true,
                employeeId: { notIn: [employee.employeeId, ...descendantIds] },
            },
            select: { employeeId: true, name: true, positionRel: { select: { name: true } } },
            orderBy: { name: "asc" },
        }),
    ]);

    return {
        employee,
        impact: {
            directReports,
            assignedAssets,
            simCards,
            pendingRequests: {
                leave: pendingLeaves,
                overtime: pendingOvertimes,
                attendanceCorrection: pendingCorrections,
                letter: pendingLetters,
                assetTicket: openAssetTickets,
            },
            pushSubscriptions,
        },
        history: statusHistory,
        eligibleManagers,
    };
}

export async function changeEmployeeStatus(
    id: string,
    input: EmployeeStatusChangeInput,
    changedBy: string
) {
    const effectiveDate = new Date(`${input.effectiveDate}T00:00:00.000Z`);
    if (
        Number.isNaN(effectiveDate.getTime()) ||
        effectiveDate.toISOString().slice(0, 10) !== input.effectiveDate
    ) {
        throw new EmployeeStatusError("Tanggal efektif tidak valid.");
    }
    if (input.effectiveDate > toWIBDateString()) {
        throw new EmployeeStatusError("Tanggal efektif masa depan belum didukung. Pilih hari ini atau tanggal sebelumnya.");
    }

    return prisma.$transaction(async (tx) => {
        const employee = await tx.employee.findUnique({
            where: { id },
            select: { id: true, employeeId: true, name: true, role: true, isActive: true },
        });
        if (!employee) throw new EmployeeStatusError("Karyawan tidak ditemukan.", 404);
        if (employee.isActive === input.isActive) {
            throw new EmployeeStatusError(
                `Karyawan sudah berstatus ${input.isActive ? "aktif" : "nonaktif"}.`,
                409
            );
        }

        const actor = await tx.employee.findUnique({
            where: { employeeId: changedBy },
            select: { employeeId: true, role: true, isActive: true },
        });
        if (!actor || actor.role !== "hr" || !actor.isActive) {
            throw new EmployeeStatusError("Akun HR pelaksana tidak valid.", 403);
        }

        const directReports = await tx.employee.findMany({
            where: { managerId: employee.employeeId, isActive: true },
            select: { employeeId: true },
        });

        if (!input.isActive) {
            if (employee.employeeId === changedBy) {
                throw new EmployeeStatusError("Anda tidak dapat menonaktifkan akun sendiri.", 409);
            }

            if (employee.role === "hr") {
                const activeHrCount = await tx.employee.count({ where: { role: "hr", isActive: true } });
                if (activeHrCount <= 1) {
                    throw new EmployeeStatusError("HR aktif terakhir tidak dapat dinonaktifkan.", 409);
                }
            }

            if (directReports.length > 0 && input.reassignManagerId === undefined) {
                throw new EmployeeStatusError("Tentukan pengalihan atasan untuk bawahan aktif.", 409);
            }

            if (input.reassignManagerId) {
                const replacementManager = await tx.employee.findUnique({
                    where: { employeeId: input.reassignManagerId },
                    select: { employeeId: true, isActive: true },
                });
                if (!replacementManager?.isActive) {
                    throw new EmployeeStatusError("Atasan pengganti tidak ditemukan atau tidak aktif.", 409);
                }

                const descendantIds = await collectDescendantIds(tx, employee.employeeId);
                if (descendantIds.includes(replacementManager.employeeId)) {
                    throw new EmployeeStatusError("Atasan pengganti tidak boleh berasal dari hierarki bawahannya.", 409);
                }
            }

            if (directReports.length > 0) {
                await tx.employee.updateMany({
                    where: { managerId: employee.employeeId },
                    data: { managerId: input.reassignManagerId ?? null },
                });
            }

            // Push endpoints are credentials for delivery and must not remain attached after offboarding.
            await tx.pushSubscription.deleteMany({ where: { employeeId: employee.employeeId } });
        }

        const updated = await tx.employee.update({
            where: { id: employee.id },
            data: {
                isActive: input.isActive,
                statusChangedAt: new Date(),
                sessionVersion: { increment: 1 },
            },
            select: {
                id: true,
                employeeId: true,
                name: true,
                role: true,
                isActive: true,
                statusChangedAt: true,
            },
        });

        const history = await tx.employeeStatusHistory.create({
            data: {
                employeeId: employee.employeeId,
                wasActive: employee.isActive,
                isActive: input.isActive,
                reason: input.reason,
                effectiveDate,
                changedBy,
            },
            include: { actor: { select: { employeeId: true, name: true } } },
        });

        await tx.auditLog.create({
            data: {
                action: input.isActive ? "REACTIVATE_EMPLOYEE" : "DEACTIVATE_EMPLOYEE",
                entity: "EMPLOYEE",
                entityId: employee.id,
                performedBy: changedBy,
                details: JSON.stringify({
                    employeeId: employee.employeeId,
                    employeeName: employee.name,
                    from: employee.isActive ? "ACTIVE" : "INACTIVE",
                    to: input.isActive ? "ACTIVE" : "INACTIVE",
                    effectiveDate: input.effectiveDate,
                    reason: input.reason,
                    reassignManagerId: input.reassignManagerId ?? null,
                    reassignedDirectReports: directReports.length,
                }),
            },
        });

        return { employee: updated, history };
    });
}
