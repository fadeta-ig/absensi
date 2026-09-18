import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const STANDARD_3_SHIFTS = [
    {
        name: "Shift 1 — Pagi (07:00 – 15:00)",
        isDefault: false,
        earlyCheckIn: 30,  // Mulai presensi 06:30
        lateCheckIn: 15,   // Batas tepat waktu 07:15
        earlyCheckOut: 0,  // Jam pulang minimal 15:00
        lateCheckOut: 60,  // Batas toleransi pulang 16:00
        startTime: "07:00",
        endTime: "15:00",
    },
    {
        name: "Shift 2 — Siang (15:00 – 23:00)",
        isDefault: false,
        earlyCheckIn: 30,  // Mulai presensi 14:30
        lateCheckIn: 15,   // Batas tepat waktu 15:15
        earlyCheckOut: 0,  // Jam pulang minimal 23:00
        lateCheckOut: 60,  // Batas toleransi pulang 00:00
        startTime: "15:00",
        endTime: "23:00",
    },
    {
        name: "Shift 3 — Malam (23:00 – 07:00)",
        isDefault: false,
        earlyCheckIn: 30,  // Mulai presensi 22:30
        lateCheckIn: 15,   // Batas tepat waktu 23:15
        earlyCheckOut: 0,  // Jam pulang minimal 07:00 (+1)
        lateCheckOut: 60,  // Batas toleransi pulang 08:00 (+1)
        startTime: "23:00",
        endTime: "07:00",
    },
];

export async function seed3Shifts(client: PrismaClient = prisma) {
    console.log("🌱 Menjalankan Seeding Paket 3-Shift 24 Jam (Format 07:00)...");
    const results: string[] = [];

    for (const shiftConfig of STANDARD_3_SHIFTS) {
        let shift = await client.workShift.findFirst({
            where: { name: shiftConfig.name },
            include: { days: true },
        });

        if (!shift) {
            shift = await client.workShift.create({
                data: {
                    name: shiftConfig.name,
                    isDefault: shiftConfig.isDefault,
                    earlyCheckIn: shiftConfig.earlyCheckIn,
                    lateCheckIn: shiftConfig.lateCheckIn,
                    earlyCheckOut: shiftConfig.earlyCheckOut,
                    lateCheckOut: shiftConfig.lateCheckOut,
                    days: {
                        create: Array.from({ length: 7 }, (_, i) => ({
                            dayOfWeek: i,
                            startTime: shiftConfig.startTime,
                            endTime: shiftConfig.endTime,
                            isOff: false, // Operasional 24/7 aktif 7 hari (rotasi off day diatur per roster/karyawan)
                        })),
                    },
                },
                include: { days: true },
            });
            console.log(`  ✅ Shift baru dibuat: ${shift.name} (${shift.id})`);
            results.push(`Dibuat: ${shift.name}`);
        } else {
            console.log(`  ℹ️ Shift sudah ada: ${shift.name} (${shift.id})`);
            results.push(`Sudah ada: ${shift.name}`);
        }
    }

    return results;
}

if (require.main === module) {
    seed3Shifts()
        .then(() => {
            console.log("✨ Seeding Paket 3-Shift 24 Jam selesai dengan sukses.");
            process.exit(0);
        })
        .catch((err) => {
            console.error("❌ Gagal seeding 3-shift:", err);
            process.exit(1);
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}
