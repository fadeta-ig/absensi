import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function seedGreenMeeting() {
    console.log("🌱 Seeding Green Meeting initial configuration & units...");

    // 1. Inisialisasi Konfigurasi Modul Green Meeting
    const config = await prisma.greenMeetingConfig.upsert({
        where: { id: "default" },
        update: {},
        create: {
            id: "default",
            picRole: "GA",
            defaultRoom: "Ruang Rapat Utama Lt. 2",
            defaultTime: "08:30",
            maxDeadlineExtensions: 3,
            offDaysWeekly: "0,6", // Minggu dan Sabtu
            updatedBy: "System Seeder",
        },
    });
    console.log(`✅ Green Meeting Config ready: PIC = ${config.picRole}, Max Extensions = ${config.maxDeadlineExtensions}`);

    // 2. Daftarkan seluruh Departemen Aktif ke Unit Kerja Green Meeting
    const departments = await prisma.department.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
    });

    let unitsCreated = 0;
    for (const dept of departments) {
        await prisma.greenMeetingUnit.upsert({
            where: { departmentId: dept.id },
            update: { isActiveInMeeting: true },
            create: {
                departmentId: dept.id,
                isActiveInMeeting: true,
                isDefaultRequired: true,
            },
        });
        unitsCreated++;
    }
    console.log(`✅ Registered ${unitsCreated} active departments as Green Meeting Work Units.`);

    // 3. Tambahkan contoh hari libur nasional / operasional
    const holidays = [
        { date: new Date("2026-01-01T00:00:00.000Z"), description: "Tahun Baru Masehi" },
        { date: new Date("2026-08-17T00:00:00.000Z"), description: "Hari Kemerdekaan RI" },
        { date: new Date("2026-12-25T00:00:00.000Z"), description: "Hari Raya Natal" },
    ];

    for (const h of holidays) {
        await prisma.greenMeetingHoliday.upsert({
            where: { date: h.date },
            update: {},
            create: {
                date: h.date,
                description: h.description,
            },
        });
    }
    console.log(`✅ Registered default Green Meeting holidays.`);
}

async function main() {
    try {
        await seedGreenMeeting();
    } catch (e) {
        console.error("❌ Error seeding Green Meeting:", e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    void main();
}
