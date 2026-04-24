import { Prisma } from "@prisma/client";

/**
 * Konfigurasi include standar untuk query aset.
 * Memastikan semua relasi yang dibutuhkan untuk `toAsset` selalu terambil.
 */
export const ASSIGNED_TO_INCLUDE = {
    assignedTo: {
        select: {
            employeeId: true,
            name: true,
            departmentRel: { select: { name: true } },
            positionRel: { select: { name: true } },
        },
    },
    categoryRel: true,
    inspections: {
        orderBy: { inspectedAt: "desc" },
        take: 1,
    },
} as const satisfies Prisma.AssetInclude;
