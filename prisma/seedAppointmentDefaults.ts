import { PrismaClient } from "@prisma/client";

/**
 * Seed default Appointment+Room — NON-DESTRUCTIVE (upsert AppSetting saja).
 * Aman dijalankan ulang. JANGAN jalankan seed destruktif (db:seed/db:reset) di sini.
 */
const prisma = new PrismaClient();

async function main() {
    const dbUrl = process.env.DATABASE_URL ?? "";
    if (!dbUrl.includes("hris_local")) {
        throw new Error("seedAppointmentDefaults hanya untuk DB lokal hris_local.");
    }
    const defaults: Array<[string, string]> = [
        ["appointment.pic.employeeIds", JSON.stringify([])],
        ["appointment.reminder.offsets", JSON.stringify([1440])],
        ["meeting.task.maxExtensions", "3"],
    ];
    for (const [key, value] of defaults) {
        await prisma.appSetting.upsert({
            where: { key },
            update: {},
            create: { key, value },
        });
        console.log(`AppSetting OK (tanpa menimpa): ${key}`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
}).finally(async () => prisma.$disconnect());
