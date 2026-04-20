/**
 * linkAssetEmployees.ts
 * 
 * Script untuk memigrasikan data aset existing.
 * Mencari aset dengan holderType = "EMPLOYEE" dan mencocokkan `assignedToName`
 * dengan tabel Employee untuk mengisi `assignedToId`.
 * 
 * Jalankan dengan: npx tsx prisma/linkAssetEmployees.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🔄 Memulai migrasi link aset ke karyawan...");

    const assets = await prisma.asset.findMany({
        where: { holderType: "EMPLOYEE", assignedToId: null },
    });

    if (assets.length === 0) {
        console.log("✅ Tidak ada aset yang perlu di-link. Semua sudah terhubung atau kosong.");
        return;
    }

    console.log(`Ditemukan ${assets.length} aset dengan holderType EMPLOYEE yang belum punya assignedToId.`);

    const employees = await prisma.employee.findMany({
        select: { id: true, employeeId: true, name: true }
    });

    let matched = 0;
    let unmatched = 0;

    for (const asset of assets) {
        if (!asset.assignedToName) {
            unmatched++;
            continue;
        }

        // Cari karyawan dengan nama yang persis sama (case-insensitive trim)
        const targetName = asset.assignedToName.trim().toLowerCase();
        const emp = employees.find(e => e.name.trim().toLowerCase() === targetName);

        if (emp) {
            await prisma.asset.update({
                where: { id: asset.id },
                data: { assignedToId: emp.employeeId }
            });
            console.log(`🔗 [LINKED] Aset ${asset.assetCode} (${asset.name}) -> Karyawan: ${emp.name}`);
            matched++;
        } else {
            console.log(`❌ [UNMATCHED] Aset ${asset.assetCode} (${asset.name}) -> Nama: "${asset.assignedToName}" tidak ditemukan di database karyawan aktif.`);
            unmatched++;
        }
    }

    console.log(`\n🎉 Migrasi selesai!`);
    console.log(`✅ Berhasil di-link : ${matched}`);
    console.log(`⚠️ Gagal match name : ${unmatched} (bisa jadi typo atau karyawan tidak aktif/tidak ada)`);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
