import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedCompanyStructure } from "./seedCompanyStructure";
import { assignOnlyRole } from "./seedRbac";

const prisma = new PrismaClient();

function normalizeName(raw: string): string {
    return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

async function seedCleaningModule() {
    console.log("🧹 Seeding Cleaning Module (Kebersihan)...");
    const defaultPasswordHash = await bcrypt.hash("123", 12);

    // 1. Bersihkan data modul kebersihan lama
    await prisma.cleaningApprovalIdempotency.deleteMany({});
    await prisma.cleaningMonthlyApprovalSignature.deleteMany({});
    await prisma.cleaningMonthlyApproval.deleteMany({});
    await prisma.cleaningDailyChecklistItem.deleteMany({});
    await prisma.cleaningDailyChecklist.deleteMany({});
    await prisma.cleaningWorkerAssignment.deleteMany({});
    await prisma.cleaningRoom.deleteMany({});
    await prisma.cleaningTemplateItem.deleteMany({});
    await prisma.cleaningTemplate.deleteMany({});

    // 2. Buat Template Standar Kebersihan Ruangan
    const template = await prisma.cleaningTemplate.create({
        data: {
            name: "Template Standar Kebersihan Ruangan",
            nameNormalized: normalizeName("Template Standar Kebersihan Ruangan"),
            isActive: true,
            items: {
                create: [
                    { name: "Pintu", nameNormalized: normalizeName("Pintu"), sortOrder: 1, isActive: true },
                    { name: "Lantai", nameNormalized: normalizeName("Lantai"), sortOrder: 2, isActive: true },
                    { name: "Kaca & Jendela", nameNormalized: normalizeName("Kaca & Jendela"), sortOrder: 3, isActive: true },
                    { name: "Meja & Kursi", nameNormalized: normalizeName("Meja & Kursi"), sortOrder: 4, isActive: true },
                    { name: "Tempat Sampah", nameNormalized: normalizeName("Tempat Sampah"), sortOrder: 5, isActive: true },
                    { name: "Saklar & Stop Kontak", nameNormalized: normalizeName("Saklar & Stop Kontak"), sortOrder: 6, isActive: true },
                    { name: "Langit-langit & AC", nameNormalized: normalizeName("Langit-langit & AC"), sortOrder: 7, isActive: true },
                ],
            },
        },
        include: {
            items: { orderBy: { sortOrder: "asc" } },
        },
    });
    console.log(`✅ Template dibuat: ${template.name} (${template.items.length} items)`);

    // 3. Buat 2 Ruangan: "Ruangan CEO" & "Ruangan Loby Utama"
    const roomCeo = await prisma.cleaningRoom.create({
        data: {
            name: "Ruangan CEO",
            nameNormalized: normalizeName("Ruangan CEO"),
            templateId: template.id,
            isActive: true,
        },
    });

    const roomLoby = await prisma.cleaningRoom.create({
        data: {
            name: "Ruangan Loby Utama",
            nameNormalized: normalizeName("Ruangan Loby Utama"),
            templateId: template.id,
            isActive: true,
        },
    });
    console.log(`✅ 2 Ruangan dibuat: ${roomCeo.name}, ${roomLoby.name}`);

    // 4. Buat 2 Akun Outsource (tanpa Employee record, password 123)
    const outsourceBudi = await prisma.userAccount.upsert({
        where: { username: "outsource_budi" },
        update: {
            displayName: "Budi Santoso (Outsource)",
            email: "budi.outsource@wig.co.id",
            passwordHash: defaultPasswordHash,
            employeeId: null,
            isActive: true,
        },
        create: {
            username: "outsource_budi",
            displayName: "Budi Santoso (Outsource)",
            email: "budi.outsource@wig.co.id",
            passwordHash: defaultPasswordHash,
            employeeId: null,
            isActive: true,
        },
    });
    await assignOnlyRole(prisma, outsourceBudi.id, "CLEANING_WORKER");

    const outsourceJoko = await prisma.userAccount.upsert({
        where: { username: "outsource_joko" },
        update: {
            displayName: "Joko Widodo (Outsource)",
            email: "joko.outsource@wig.co.id",
            passwordHash: defaultPasswordHash,
            employeeId: null,
            isActive: true,
        },
        create: {
            username: "outsource_joko",
            displayName: "Joko Widodo (Outsource)",
            email: "joko.outsource@wig.co.id",
            passwordHash: defaultPasswordHash,
            employeeId: null,
            isActive: true,
        },
    });
    await assignOnlyRole(prisma, outsourceJoko.id, "CLEANING_WORKER");
    console.log("✅ 2 Akun Outsource dibuat (outsource_budi & outsource_joko) - Role: CLEANING_WORKER, Password: 123");

    // 5. Penetapan Petugas Kebersihan (Hanya outsource, tanpa karyawan internal)
    await prisma.cleaningWorkerAssignment.createMany({
        data: [
            {
                roomId: roomCeo.id,
                userId: outsourceBudi.id,
                workerType: "OUTSOURCE",
                startsOnWibDate: "2026-08-01",
                endsOnWibDate: null,
            },
            {
                roomId: roomLoby.id,
                userId: outsourceJoko.id,
                workerType: "OUTSOURCE",
                startsOnWibDate: "2026-08-01",
                endsOnWibDate: null,
            },
        ],
    });
    console.log("✅ Petugas kebersihan ditetapkan ke ruangan (100% outsourcing)");

    // 6. Checklist Penuh Bulan Lalu: Agustus 2026 (1 s/d 31 Agustus)
    console.log("📅 Membuat checklist lengkap untuk seluruh bulan Agustus 2026 (1-31 Agustus)...");
    const rooms = [
        { room: roomCeo, workerId: outsourceBudi.id },
        { room: roomLoby, workerId: outsourceJoko.id },
    ];

    for (let day = 1; day <= 31; day++) {
        const dayStr = String(day).padStart(2, "0");
        const wibDate = `2026-08-${dayStr}`;
        const timeCeo = new Date(`${wibDate}T09:30:00+07:00`);
        const timeLoby = new Date(`${wibDate}T09:45:00+07:00`);

        for (const { room, workerId } of rooms) {
            const time = room.id === roomCeo.id ? timeCeo : timeLoby;
            await prisma.cleaningDailyChecklist.create({
                data: {
                    roomId: room.id,
                    wibDate,
                    roomNameSnapshot: room.name,
                    createdAt: time,
                    updatedAt: time,
                    items: {
                        create: template.items.map((item) => ({
                            templateItemId: item.id,
                            itemNameSnapshot: item.name,
                            sortOrder: item.sortOrder,
                            isActive: true,
                            isComplete: true,
                            lastChangedByUserId: workerId,
                            lastChangedAt: time,
                            createdAt: time,
                            updatedAt: time,
                        })),
                    },
                },
            });
        }
    }
    console.log("✅ Checklist Agustus 2026 (31 hari) selesai penuh untuk Ruangan CEO dan Ruangan Loby Utama.");

    // Tambahkan juga checklist September 2026 s/d hari ini (1 s/d 22 September)
    console.log("📅 Membuat checklist September 2026 (1-22 September)...");
    for (let day = 1; day <= 22; day++) {
        const dayStr = String(day).padStart(2, "0");
        const wibDate = `2026-09-${dayStr}`;
        const timeCeo = new Date(`${wibDate}T09:30:00+07:00`);
        const timeLoby = new Date(`${wibDate}T09:45:00+07:00`);

        for (const { room, workerId } of rooms) {
            const time = room.id === roomCeo.id ? timeCeo : timeLoby;
            await prisma.cleaningDailyChecklist.create({
                data: {
                    roomId: room.id,
                    wibDate,
                    roomNameSnapshot: room.name,
                    createdAt: time,
                    updatedAt: time,
                    items: {
                        create: template.items.map((item) => ({
                            templateItemId: item.id,
                            itemNameSnapshot: item.name,
                            sortOrder: item.sortOrder,
                            isActive: true,
                            isComplete: true,
                            lastChangedByUserId: workerId,
                            lastChangedAt: time,
                            createdAt: time,
                            updatedAt: time,
                        })),
                    },
                },
            });
        }
    }
    console.log("✅ Checklist September 2026 (22 hari) selesai dibuat.");

    // 7. Periode Persetujuan Bulanan Agustus 2026 & September 2026
    // Reviewer:
    // Diperiksa Oleh: Ir. Wahyu Hidayat (WIG-0027, Manager Operational)
    // Mengetahui: Drs. Hendra Gunawan (WIG-0011, General Manager / Direksi)
    const managerEmp = await prisma.employee.findUniqueOrThrow({ where: { employeeId: "WIG-0027" } });
    const direksiEmp = await prisma.employee.findUniqueOrThrow({ where: { employeeId: "WIG-0011" } });

    console.log(`👔 Reviewer ditugaskan:`);
    console.log(`   • Diperiksa Oleh (Manager) : ${managerEmp.name} (NIP: ${managerEmp.employeeId})`);
    console.log(`   • Mengetahui (Direksi)     : ${direksiEmp.name} (NIP: ${direksiEmp.employeeId})`);

    // Buka periode Agustus 2026 (Canvas TTD sengaja KOSONG tanpa signature record)
    await prisma.cleaningMonthlyApproval.createMany({
        data: [
            {
                roomId: roomCeo.id,
                roomNameSnapshot: roomCeo.name,
                monthWib: "2026-08",
                inspectedByEmployeeId: managerEmp.employeeId,
                knownByEmployeeId: direksiEmp.employeeId,
            },
            {
                roomId: roomLoby.id,
                roomNameSnapshot: roomLoby.name,
                monthWib: "2026-08",
                inspectedByEmployeeId: managerEmp.employeeId,
                knownByEmployeeId: direksiEmp.employeeId,
            },
            // Buka juga periode September 2026 (Canvas TTD juga KOSONG)
            {
                roomId: roomCeo.id,
                roomNameSnapshot: roomCeo.name,
                monthWib: "2026-09",
                inspectedByEmployeeId: managerEmp.employeeId,
                knownByEmployeeId: direksiEmp.employeeId,
            },
            {
                roomId: roomLoby.id,
                roomNameSnapshot: roomLoby.name,
                monthWib: "2026-09",
                inspectedByEmployeeId: managerEmp.employeeId,
                knownByEmployeeId: direksiEmp.employeeId,
            },
        ],
    });
    console.log("✅ Periode persetujuan Agustus 2026 & September 2026 telah dibuka.");
    console.log("📝 Kanvas tanda tangan dikosongkan (status: WAITING_FOR_SIGNATURES) agar siap dicoba manual!");
}

async function main() {
    console.log("=================================================================");
    console.log("🚀 Menjalankan Reset & Master Seeding Lengkap Presensi & HRIS WIG");
    console.log("=================================================================");

    // 1. Seed Struktur Perusahaan & Karyawan Resmi
    await seedCompanyStructure();

    // 2. Seed Modul Kebersihan Sesuai Permintaan Khusus
    await seedCleaningModule();

    console.log("=================================================================");
    console.log("🎉 SEEDING SELESAI DENGAN SUKSES!");
    console.log("=================================================================");
    console.log("📋 Akun Login untuk Testing (Semua Password: 123):");
    console.log("   • Admin GA: WIG002 (Kelola Ruangan, Rekap, Buka & Monitor Persetujuan)");
    console.log("   • Admin HR: WIG001 (Super Admin)");
    console.log("   • Manager Operational (Diperiksa Oleh): WIG-0027 (Ir. Wahyu Hidayat)");
    console.log("   • Direksi / General Manager (Mengetahui): WIG-0011 (Drs. Hendra Gunawan)");
    console.log("   • Petugas Kebersihan Outsource 1: outsource_budi");
    console.log("   • Petugas Kebersihan Outsource 2: outsource_joko");
    console.log("=================================================================");
}

main()
    .catch((error) => {
        console.error("❌ Seed failed:", error);
        process.exit(1);
    })
    .finally(async () => prisma.$disconnect());
