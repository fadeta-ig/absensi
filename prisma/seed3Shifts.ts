import { Prisma, PrismaClient } from "@prisma/client";

type ShiftSeedClient = PrismaClient | Prisma.TransactionClient;

export const STANDARD_3_SHIFTS = [
    {
        name: "Shift 1 — Pagi",
        matchNames: ["Shift 1 — Pagi", "Shift 1 — Pagi (07:00 – 15:00)"],
        isDefault: false,
        earlyCheckIn: 120, // Mulai presensi 2 jam sebelum masuk (05:00 WIB)
        lateCheckIn: 0,    // Toleransi terlambat 0 menit
        earlyCheckOut: 0,  // Boleh pulang lebih awal 0 menit
        lateCheckOut: 120, // Boleh pulang lebih lambat 120 menit
        weekdayStart: "07:00",
        weekdayEnd: "15:00",
        saturdayStart: "07:00",
        saturdayEnd: "12:00",
    },
    {
        name: "Shift 2 — Siang",
        matchNames: ["Shift 2 — Siang", "Shift 2 — Siang (15:00 – 23:00)"],
        isDefault: false,
        earlyCheckIn: 120, // Mulai presensi 2 jam sebelum masuk (13:00 / Sabtu 10:00 WIB)
        lateCheckIn: 0,    // Toleransi terlambat 0 menit
        earlyCheckOut: 0,  // Boleh pulang lebih awal 0 menit
        lateCheckOut: 120, // Boleh pulang lebih lambat 120 menit
        weekdayStart: "15:00",
        weekdayEnd: "23:00",
        saturdayStart: "12:00",
        saturdayEnd: "17:00",
    },
    {
        name: "Shift 3 — Malam",
        matchNames: ["Shift 3 — Malam", "Shift 3 — Malam (23:00 – 07:00)"],
        isDefault: false,
        earlyCheckIn: 120, // Mulai presensi 2 jam sebelum masuk (21:00 / Sabtu 15:00 WIB)
        lateCheckIn: 0,    // Toleransi terlambat 0 menit
        earlyCheckOut: 0,  // Boleh pulang lebih awal 0 menit
        lateCheckOut: 120, // Boleh pulang lebih lambat 120 menit
        weekdayStart: "23:00",
        weekdayEnd: "07:00",
        saturdayStart: "17:00",
        saturdayEnd: "22:00",
    },
];

export async function seed3Shifts(client: ShiftSeedClient) {
    console.log("🌱 Menjalankan Seeding Paket 3-Shift Lapangan (Sen-Jum 8 Jam, Sabtu 5 Jam, Toleransi 120/0/0/120)...");
    const results: string[] = [];

    for (const shiftConfig of STANDARD_3_SHIFTS) {
        let shift = await client.workShift.findFirst({
            where: { name: { in: shiftConfig.matchNames } },
            include: { days: true },
        });

        const buildDays = () =>
            Array.from({ length: 7 }, (_, i) => ({
                dayOfWeek: i,
                startTime: i === 6 ? shiftConfig.saturdayStart : shiftConfig.weekdayStart,
                endTime: i === 6 ? shiftConfig.saturdayEnd : shiftConfig.weekdayEnd,
                isOff: i === 0,
            }));

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
                        create: buildDays(),
                    },
                },
                include: { days: true },
            });
            console.log(`  ✅ Shift baru dibuat: ${shift.name} (${shift.id})`);
            results.push(`Dibuat: ${shift.name}`);
        } else {
            await client.workShiftDay.deleteMany({ where: { shiftId: shift.id } });
            shift = await client.workShift.update({
                where: { id: shift.id },
                data: {
                    earlyCheckIn: shiftConfig.earlyCheckIn,
                    lateCheckIn: shiftConfig.lateCheckIn,
                    earlyCheckOut: shiftConfig.earlyCheckOut,
                    lateCheckOut: shiftConfig.lateCheckOut,
                    days: {
                        create: buildDays(),
                    },
                },
                include: { days: true },
            });
            console.log(`  ✅ Shift disinkronkan: ${shift.name} (${shift.id})`);
            results.push(`Disinkronkan: ${shift.name}`);
        }
    }

    return results;
}

if (typeof require !== "undefined" && require.main === module) {
    const prisma = new PrismaClient();

    prisma.$transaction((tx) => seed3Shifts(tx))
        .then(() => {
            console.log("✨ Seeding Paket 3-Shift 24 Jam selesai dengan sukses.");
        })
        .catch((err) => {
            console.error("❌ Gagal seeding 3-shift:", err);
            process.exitCode = 1;
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}
