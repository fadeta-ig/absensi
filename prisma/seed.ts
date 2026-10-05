import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedCompanyStructure } from "./seedCompanyStructure";
import { assignOnlyRole } from "./seedRbac";

const prisma = new PrismaClient();

function normalizeName(raw: string): string {
    return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function seedCleaningModule() {
    console.log("🧹 Seeding Cleaning Module (Kebersihan)...");
    const defaultPasswordHash = await bcrypt.hash("123", 12);

    // 1. Bersihkan TOTAL data modul kebersihan (fresh Oktober, tanpa Sep/Agu)
    await prisma.cleaningEvidencePhoto.deleteMany({});
    await prisma.cleaningDailyParaf.deleteMany({});
    await prisma.cleaningHoliday.deleteMany({});
    await prisma.cleaningApprovalIdempotency.deleteMany({});
    await prisma.cleaningMonthlyApprovalSignature.deleteMany({});
    await prisma.cleaningMonthlyApproval.deleteMany({});
    await prisma.cleaningDailyChecklistItem.deleteMany({});
    await prisma.cleaningDailyChecklist.deleteMany({});
    await prisma.cleaningWorkerAssignment.deleteMany({});
    await prisma.cleaningRoom.deleteMany({});
    await prisma.cleaningTemplateItem.deleteMany({});
    await prisma.cleaningTemplate.deleteMany({});

    // 2. Template Standar: 20 item per checklist
    const ITEM_NAMES = [
        "Pintu", "Lantai", "Kaca & Jendela", "Meja & Kursi", "Tempat Sampah",
        "Saklar & Stop Kontak", "Langit-langit & AC", "Lampu", "Dinding", "Gorden",
        "TV", "Dispenser", "Sofa Tunggu", "Wastafel", "Cermin",
        "Kloset", "Dispenser Sabun", "Tangga", "Pegangan Tangga", "Pintu Kaca",
    ];
    const template = await prisma.cleaningTemplate.create({
        data: {
            name: "Template Standar Kebersihan Ruangan",
            nameNormalized: normalizeName("Template Standar Kebersihan Ruangan"),
            isActive: true,
            items: {
                create: ITEM_NAMES.map((name, idx) => ({
                    name,
                    nameNormalized: normalizeName(name),
                    sortOrder: idx + 1,
                    isActive: true,
                })),
            },
        },
        include: {
            items: { orderBy: { sortOrder: "asc" } },
        },
    });
    console.log(`✅ Template dibuat: ${template.name} (${template.items.length} items)`);

    // 3. Buat 10 Ruangan
    const ROOM_NAMES = [
        "Resepsionis", "Ruang Direksi", "Ruang Meeting", "Loby Utama", "Pantry",
        "Musholla", "Toilet Lantai 1", "Gudang", "Parkir", "Pos Security",
    ];
    const rooms: Array<{ id: string; name: string }> = [];
    for (const roomName of ROOM_NAMES) {
        const room = await prisma.cleaningRoom.create({
            data: {
                name: roomName,
                nameNormalized: normalizeName(roomName),
                templateId: template.id,
                isActive: true,
            },
        });
        rooms.push(room);
    }
    console.log(`✅ ${rooms.length} Ruangan dibuat.`);

    // 4. Akun Outsource heri & ismail (tanpa Employee record, password 123)
    const outsourceHeri = await prisma.userAccount.upsert({
        where: { username: "heri" },
        update: {
            displayName: "Heri",
            email: "heri@outsource.wig.co.id",
            passwordHash: defaultPasswordHash,
            employeeId: null,
            isActive: true,
        },
        create: {
            username: "heri",
            displayName: "Heri",
            email: "heri@outsource.wig.co.id",
            passwordHash: defaultPasswordHash,
            employeeId: null,
            isActive: true,
        },
    });
    await assignOnlyRole(prisma, outsourceHeri.id, "CLEANING_WORKER");

    const outsourceIsmail = await prisma.userAccount.upsert({
        where: { username: "ismail" },
        update: {
            displayName: "Ismail",
            email: "ismail@outsource.wig.co.id",
            passwordHash: defaultPasswordHash,
            employeeId: null,
            isActive: true,
        },
        create: {
            username: "ismail",
            displayName: "Ismail",
            email: "ismail@outsource.wig.co.id",
            passwordHash: defaultPasswordHash,
            employeeId: null,
            isActive: true,
        },
    });
    await assignOnlyRole(prisma, outsourceIsmail.id, "CLEANING_WORKER");
    console.log("✅ 2 Akun Outsource (heri & ismail) - Role: CLEANING_WORKER, Password: 123");

    // 5. Penetapan selang-seling ke 10 ruangan mulai 2026-10-01
    const workers = [outsourceHeri, outsourceIsmail];
    await prisma.cleaningWorkerAssignment.createMany({
        data: rooms.map((room, idx) => ({
            roomId: room.id,
            userId: workers[idx % workers.length].id,
            workerType: "OUTSOURCE" as const,
            startsOnWibDate: "2026-10-01",
            endsOnWibDate: null,
        })),
    });
    console.log("✅ Petugas kebersihan ditetapkan ke 10 ruangan (selang-seling heri/ismail)");

    // 6. Checklist KOSONG 1-5 Oktober 2026 (belum dikerjakan, tanpa foto/paraf)
    console.log("📅 Membuat checklist kosong 1-5 Oktober 2026 untuk 10 ruangan...");
    for (let day = 1; day <= 5; day++) {
        const dayStr = String(day).padStart(2, "0");
        const wibDate = `2026-10-${dayStr}`;

        for (const room of rooms) {
            await prisma.cleaningDailyChecklist.create({
                data: {
                    roomId: room.id,
                    wibDate,
                    roomNameSnapshot: room.name,
                    items: {
                        create: template.items.map((item) => ({
                            templateItemId: item.id,
                            itemNameSnapshot: item.name,
                            sortOrder: item.sortOrder,
                            isActive: true,
                            isComplete: false,
                        })),
                    },
                },
            });
        }
    }
    console.log("✅ Checklist 1-5 Oktober 2026 kosong (10 ruangan × 20 item, belum dikerjakan).");

    // 7. Rekap bulanan SENGAJA belum dibuka (buka di akhir bulan via dashboard GA).
    // Reviewer saat dibuka nanti:
    // Diperiksa Oleh: Wahyu Agus Widadi (ID-24090027)
    // Mengetahui: Dimas Bhranta Putera Adi (ID-24070021)
    console.log("📝 Periode persetujuan Oktober 2026 belum dibuka (akhir bulan).");
}

async function main() {
    console.log("=================================================================");
    console.log("🚀 Menjalankan Reset & Master Seeding Lengkap Presensi & HRIS WIG");
    console.log("=================================================================");
    console.log("⚠️  SEED INI MENGHAPUS DATA (wipe). Hanya untuk database kosong/lokal.");

    const { assertSafeToWipe } = await import("./seedSafety");
    await assertSafeToWipe(prisma, "prisma/seed.ts");

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
    console.log("   • Diperiksa Oleh: ID-24090027 (Wahyu Agus Widadi)");
    console.log("   • Mengetahui: ID-24070021 (Dimas Bhranta Putera Adi)");
    console.log("   • Petugas Kebersihan Outsource 1: heri");
    console.log("   • Petugas Kebersihan Outsource 2: ismail");
    console.log("=================================================================");
}

// Guard: main() HANYA jalan bila file ini dieksekusi langsung
// (`npx tsx prisma/seed.ts`). Import dari runner lain (mis. modul cleaning
// saja) TIDAK boleh memicu seedCompanyStructure yang menghapus data.
const invokedDirectly =
    typeof process.argv[1] === "string" &&
    process.argv[1].replace(/\\/g, "/").endsWith("prisma/seed.ts");
if (invokedDirectly) {
    main()
        .catch((error) => {
            console.error("❌ Seed failed:", error);
            process.exit(1);
        })
        .finally(async () => prisma.$disconnect());
}
