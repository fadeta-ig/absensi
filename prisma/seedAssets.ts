/**
 * seedAssets.ts — Import data aset WIG dari JSON ke database
 *
 * Jalankan dengan: npx ts-node --project tsconfig.json -e "require('./prisma/seedAssets.ts')"
 * Atau: npx tsx prisma/seedAssets.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Data Source ─────────────────────────────────────────────
const hpData = require("../dataPerusahaan/data_hp_pegawai.json");
const laptopData = require("../dataPerusahaan/data_laptop_pegawai.json");
const nomorData = require("../dataPerusahaan/data_nomor_hp_pegawai.json");

// ─── Helpers ─────────────────────────────────────────────────

/** Karyawan aktif berdasarkan database_karyawan.json */
const ACTIVE_EMPLOYEES = new Set([
    "Apt. Jose Amadeus Abdi A.L.P, S.Farm",
    "Dinda Budiarti, S.M., CWM.",
    "Rika Nidiawati, A.Md.PJK.",
    "Tri Sapta Mahardika, CSBA.",
    "Serli Indriani, A.Md.PJK.",
    "Andhika Yogatama Yanuar",
    "Syahril Qudus Ibnu Ahmad, S.E., Ak., M.Acc., CFRM",
    "Wicaksono Aji Pamungkas, S.I.Kom., M.A., CSBA.",
    "Ir. Anang Siswanto, ST.,MT.,IPM., ASEAN ENG., ASCA., ASCP, CSCM., CFDM., CPPIM., CIOMP., CRMP., CSBA., MMC., MBA.",
    "Endru Riski Hermansya",
    "Ricky Aditya Perdana, S.T.",
    "Refo Ganggawasa Utomo",
    "Aris Sudirman, S.T.",
    "Dimas Bhranta Putera Adi, S.T., CIOMP., CSCM.",
    "Wahyu Agus Widadi",
    "A'isyah Qurota A'yun, S.Si", "Aisyah Qurota Ayun, S.Si",
    "Fadeta Ilhan Gandhi, S.T.",
    "Ratri Yuliana, S.T.",
    "Kania Gayatri, S.TP.",
    "R. Ibnu Wicaksono Wibowo",
    "Daffa Fakhuddin Arrozy, S.T.",
    "Nuralim",
    "Aryo Wicaksono, S.E.",
    "Andy Anuari",
    "Vina Hanifa, S.T.",
    "Apt. Febrian Nurrohman, S. Farm.", "Apt. Febrian Nurrohman, S.Farm.",
    "Dwi Trisno Dini, S.Si",
    "Winarsih",
    "Tyas Arum Muninggar, S.Psi",
    "Ade Nuroktav Rahardi Putra, S.Sn.",
    "Iqbida Denik Medianti",
    "Rafel Sutan Normansyah S.H",
    "Wisnu Wijayanto S.H",
    "Mufti Fatimah, S.M",
    "Jalu Adi Pratomo S.H",
    "Apt. Scholastica Dani Widyasari, S.Farm",
    "Dea Ayu Permata Sari, A.Md.I.Kom",
    "Anisah Marlina Boru Regar, S.H",
    "Kharisma Nur Shafilla Andisyah Putri, S.I.Kom",
    "Noviani Nurul Alifah, S.Hum",
    "Yuliani Anisa Maya Pradipta, S.T.P",
    "Mochamad Zidane Zulkarnaen",
    "Detavia Putri Anggraeni",
    "Arnold Ega Pradipta, S.E",
    "Ida Rahmawati, S.Fill",
    "Harfi Muthia Rahmi, S.Psi., M.Psi., Psikolog",
    "Arif Chandra Setiawan, ST",
]);

const TEAM_KEYWORDS = ["Tim Warehouse", "Tim Creative", "Tim Herbanova", "Tim "];
const GA_KEYWORD = "GA(General Affairs)";

function kondisiMapper(kondisi: string): "BAIK" | "KURANG_BAIK" | "RUSAK" {
    const k = kondisi.toLowerCase().trim();
    if (k === "rusak") return "RUSAK";
    if (k.includes("kurang") || k === "flexible gate") return "KURANG_BAIK";
    return "BAIK";
}

/** Apakah keterangan mengindikasikan aset lelang (Company Owned secret) */
function isAuctionAsset(ket: string): boolean {
    return ket.toLowerCase().includes("lelang");
}

function resolveHolder(pic: string, keterangan: string): {
    holderType: "EMPLOYEE" | "FORMER_EMPLOYEE" | "TEAM" | "GA_POOL" | "COMPANY_OWNED";
    assignedToName: string | null;
    status: "AVAILABLE" | "IN_USE" | "COMPANY_OWNED";
} {
    // Aset lelang → COMPANY_OWNED, hidden dari HR
    if (isAuctionAsset(keterangan)) {
        return { holderType: "COMPANY_OWNED", assignedToName: pic, status: "COMPANY_OWNED" };
    }

    // Di brankas GA → AVAILABLE
    if (pic === GA_KEYWORD) {
        return { holderType: "GA_POOL", assignedToName: null, status: "AVAILABLE" };
    }

    // Tim → TEAM
    if (TEAM_KEYWORDS.some(t => pic.startsWith(t))) {
        return { holderType: "TEAM", assignedToName: pic, status: "IN_USE" };
    }

    // Mantan karyawan (tidak ada di DB aktif)
    if (!ACTIVE_EMPLOYEES.has(pic)) {
        return { holderType: "FORMER_EMPLOYEE", assignedToName: pic, status: "IN_USE" };
    }

    // Karyawan aktif
    return { holderType: "EMPLOYEE", assignedToName: pic, status: "IN_USE" };
}

/** Parse expired date dari string seperti "June 2026" */
function parseExpiredDate(str: string): Date | null {
    try {
        const d = new Date(str + " 1"); // "June 2026 1" → valid date
        if (isNaN(d.getTime())) return null;
        // Set ke akhir bulan
        d.setMonth(d.getMonth() + 1, 0);
        return d;
    } catch {
        return null;
    }
}

// ─── Main Seed ────────────────────────────────────────────────

async function main() {
    console.log("🌱 Seeding aset perusahaan WIG...\n");

    // Clear dahulu (opsional, hati-hati di production)
    const existing = await prisma.asset.count();
    if (existing > 0) {
        console.log(`⚠️  Sudah ada ${existing} aset di database. Melewati seed (jalankan dengan --force untuk replace).`);
        console.log("   Tip: Hapus semua assets di DB dulu jika ingin re-seed.\n");
        await prisma.$disconnect();
        return;
    }

    let totalCreated = 0;

    // Ensure categories exist
    const catHp = await prisma.assetCategory.upsert({
        where: { name: "Handphone/Tablet" },
        update: {},
        create: { name: "Handphone/Tablet", prefix: "HP" }
    });
    const catLaptop = await prisma.assetCategory.upsert({
        where: { name: "Laptop" },
        update: {},
        create: { name: "Laptop", prefix: "LT" }
    });
    const catNum = await prisma.assetCategory.upsert({
        where: { name: "Nomor Indosat (SIM)" },
        update: {},
        create: { name: "Nomor Indosat (SIM)", prefix: "NUM" }
    });

    // ── 1. Handphone ──────────────────────────────────────────
    console.log(`📱 Seeding ${hpData.total} Handphone...`);
    for (let i = 0; i < hpData.data.length; i++) {
        const item = hpData.data[i];
        const { holderType, assignedToName, status } = resolveHolder(item.pic, item.keterangan || "");
        const kondisi = kondisiMapper(item.kondisi);
        const assetCode = `HP-${String(i + 1).padStart(3, "0")}`;

        await prisma.asset.create({
            data: {
                assetCode,
                name: item.type,
                categoryId: catHp.id,
                kondisi,
                status,
                holderType,
                assignedToName,
                assignedAt: assignedToName ? new Date() : null,
                keterangan: item.keterangan || null,
            },
        });
        totalCreated++;
    }
    console.log(`   ✅ ${hpData.total} Handphone selesai`);

    // ── 2. Laptop ─────────────────────────────────────────────
    console.log(`💻 Seeding ${laptopData.total} Laptop...`);
    for (let i = 0; i < laptopData.data.length; i++) {
        const item = laptopData.data[i];
        const { holderType, assignedToName, status } = resolveHolder(item.pic, item.keterangan || "");
        const kondisi = kondisiMapper(item.kondisi);
        const assetCode = `LT-${String(i + 1).padStart(3, "0")}`;

        await prisma.asset.create({
            data: {
                assetCode,
                name: item.type,
                categoryId: catLaptop.id,
                kondisi,
                status,
                holderType,
                assignedToName,
                assignedAt: assignedToName ? new Date() : null,
                keterangan: item.keterangan || null,
            },
        });
        totalCreated++;
    }
    console.log(`   ✅ ${laptopData.total} Laptop selesai`);

    // ── 3. Nomor HP (SIM Indosat) ─────────────────────────────
    console.log(`📞 Seeding ${nomorData.total} Nomor Indosat...`);
    for (let i = 0; i < nomorData.data.length; i++) {
        const item = nomorData.data[i];
        const { holderType, assignedToName, status } = resolveHolder(item.pic, "");
        const assetCode = `NUM-${String(i + 1).padStart(3, "0")}`;
        const expiredDate = parseExpiredDate(item.note_expired_date || "");

        await prisma.asset.create({
            data: {
                assetCode,
                name: `Nomor Indosat 0${item.nomor_indosat}`,
                categoryId: catNum.id,
                kondisi: "BAIK",
                status,
                holderType,
                assignedToName,
                assignedAt: assignedToName ? new Date() : null,
                nomorIndosat: `0${item.nomor_indosat}`,
                expiredDate: expiredDate ?? null,
                keterangan: item.note_expired_date ? `Expired: ${item.note_expired_date}` : null,
            },
        });
        totalCreated++;
    }
    console.log(`   ✅ ${nomorData.total} Nomor Indosat selesai`);

    console.log(`\n🎉 Seeding selesai! Total: ${totalCreated} aset berhasil diimport.`);
    console.log("\nRingkasan holder types:");

    const summary = await prisma.asset.groupBy({
        by: ["holderType"],
        _count: { id: true },
    });
    summary.forEach(s => console.log(`   ${s.holderType}: ${s._count.id} aset`));

    await prisma.$disconnect();
}

main().catch(e => {
    console.error("❌ Error saat seeding:", e);
    prisma.$disconnect();
    process.exit(1);
});
