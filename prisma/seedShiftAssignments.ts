import { PrismaClient } from "@prisma/client";
import { toUTCDateKey, toWIBDateString, isValidCalendarDate } from "../src/lib/timezone";

const prisma = new PrismaClient();

/**
 * Backfill roster awal: 1 assignment per karyawan dari shiftId kini.
 * Additive only — tidak mengubah/menghapus data existing.
 * Pemakaian: npx tsx prisma/seedShiftAssignments.ts [YYYY-MM-DD]
 */
async function main() {
    const cutover = process.argv[2] ?? toWIBDateString();
    if (!isValidCalendarDate(cutover)) {
        throw new Error(`Tanggal cutover tidak valid: ${cutover}. Gunakan YYYY-MM-DD.`);
    }
    const fromDate = toUTCDateKey(cutover);
    const employees = await prisma.employee.findMany({
        where: { shiftId: { not: null } },
        select: { employeeId: true, shiftId: true },
    });
    let created = 0;
    let skipped = 0;
    for (const employee of employees) {
        const existing = await prisma.shiftAssignment.findFirst({
            where: {
                employeeId: employee.employeeId,
                effectiveFrom: { lte: fromDate },
                OR: [{ effectiveTo: null }, { effectiveTo: { gt: fromDate } }],
            },
            select: { id: true },
        });
        if (existing || !employee.shiftId) {
            skipped++;
            continue;
        }
        // Cap agar tidak menabrak assignment masa depan yang sudah ada.
        const nextFuture = await prisma.shiftAssignment.findFirst({
            where: { employeeId: employee.employeeId, effectiveFrom: { gt: fromDate } },
            orderBy: { effectiveFrom: "asc" },
            select: { effectiveFrom: true },
        });
        await prisma.shiftAssignment.create({
            data: {
                employeeId: employee.employeeId,
                shiftId: employee.shiftId,
                effectiveFrom: fromDate,
                effectiveTo: nextFuture?.effectiveFrom ?? null,
            },
        });
        created++;
    }
    console.log(`Shift roster backfill selesai: ${created} dibuat, ${skipped} dilewati (cutover ${cutover}).`);
}

main().catch((error) => {
    console.error("Backfill roster gagal:", error);
    process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
