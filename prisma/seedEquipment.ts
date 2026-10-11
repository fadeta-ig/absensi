import { PrismaClient } from "@prisma/client";

/**
 * Seed inspeksi alat produksi — NON-DESTRUCTIVE (upsert template/units saja).
 * Aman dijalankan ulang. Hanya untuk DB lokal hris_local.
 */
const prisma = new PrismaClient();

function normalizeName(raw: string): string {
    return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

const TEMPLATE_NAME = "Inspeksi Alat Produksi";
const TEMPLATE_ITEMS = ["Kebersihan alat", "Fungsi operasional", "Kelengkapan komponen", "Kondisi fisik"];

const UNITS: Array<{ name: string; brand: string | null }> = [
    { name: "Timbangan Sojikyo 30 kg", brand: "Sojikyo 30 kg" },
    { name: "Timbangan IDEALIFE 3 kg", brand: "IDEALIFE 3 kg" },
    { name: "Termohigrometer HTC 2", brand: null },
    { name: "Termohigrometer Onemed 1", brand: "Onemed 1" },
    { name: "Mixer Bumbu", brand: null },
    { name: "Mixer Serbuk 100 kg", brand: "100 kg" },
    { name: "Mixer Liquid 100 L", brand: "100 L" },
    { name: "Filling Serbuk HF-F60Z", brand: "HF-F60Z" },
    { name: "Counting Kapsul", brand: null },
    { name: "Filling Liquid Manual", brand: null },
    { name: "Sealing Amplop Teh YS-169F", brand: "YS-169F" },
    { name: "Filling Sachet", brand: null },
    { name: "Conveyor Belt", brand: null },
    { name: "Filling Kapsul Manual", brand: null },
    { name: "Cetak Pil", brand: null },
    { name: "Sealer Manual", brand: null },
    { name: "Heat Gun", brand: null },
    { name: "Mesin Homogenizer", brand: null },
    { name: "Mesin Filling Tube", brand: null },
    { name: "Mesin Filling Cairan dan Setengah Padat", brand: null },
    { name: "Pompa Transfer", brand: null },
    { name: "Hand Mixer Getra", brand: "Getra" },
    { name: "Blade Mixer Tube", brand: null },
    { name: "Mesin Coding Batch Domino", brand: "Domino" },
    { name: "Belt Conveyor", brand: null },
    { name: "Manual Filling", brand: null },
    { name: "Heat Gun Bosch", brand: "Bosch" },
    { name: "Plastik Sealer", brand: null },
    { name: "Kompor Listrik", brand: null },
    { name: "Mesin Shrink Tunel", brand: null },
    { name: "Timbangan Kapasitas 50 kg", brand: null },
    { name: "Timbangan Kapasitas 15 kg", brand: null },
    { name: "Timbangan Kapasitas 1 kg", brand: null },
    { name: "Tangki Simpan", brand: null },
    { name: "Gelas Takar 1 lt", brand: null },
    { name: "Gelas Ukur 100 ml", brand: null },
    { name: "Gelas Ukur 50 ml", brand: null },
    { name: "Gelas Ukur 10 ml", brand: null },
    { name: "Panci Stainless 50 cm", brand: null },
    { name: "Panci Stainless 33 cm", brand: null },
    { name: "Silicon Cetakan Sabun Agra dan Izuho", brand: null },
    { name: "Spatula Stainless", brand: null },
    { name: "Spatula Silicon", brand: null },
    { name: "Sendok Stainless", brand: null },
    { name: "Wadah Stainless", brand: null },
    { name: "Toples Kapasitas 16 lt", brand: null },
    { name: "Toples Kapasitas 5 lt", brand: null },
    { name: "Viscometer", brand: null },
    { name: "Neraca Analitik", brand: null },
    { name: "PH Meter", brand: null },
    { name: "Anak Timbangan", brand: null },
    { name: "Climatic Chamber", brand: null },
    { name: "Oven", brand: null },
    { name: "Gelas Beker 2000 ml", brand: null },
    { name: "Gelas Beker 1000 ml", brand: null },
    { name: "Gelas Beker 500 ml", brand: null },
    { name: "Gelas Beker 250 ml", brand: null },
    { name: "Gelas Beker 100 ml", brand: null },
    { name: "Piknometer 10 ml", brand: null },
    { name: "Piknometer 25 ml", brand: null },
    { name: "Cawan Timbang 50x30", brand: null },
    { name: "Termometer", brand: null },
    { name: "Refractometer", brand: null },
    { name: "Digital Caliper", brand: null },
];

async function main() {
    const dbUrl = process.env.DATABASE_URL ?? "";
    // Prod hanya bila eksplisit: flag --prod + CONFIRM_PROD_SEED=1 (mis. deploy awal).
    // Tanpa itu, seed ini hanya untuk DB lokal hris_local. Upsert-only, aman diulang.
    const allowProd = process.argv.includes("--prod") && process.env.CONFIRM_PROD_SEED === "1";
    if (!dbUrl.includes("hris_local") && !allowProd) {
        throw new Error("seedEquipment hanya untuk DB lokal hris_local (atau --prod + CONFIRM_PROD_SEED=1).");
    }
    const template = await prisma.equipmentTemplate.upsert({
        where: { nameNormalized: normalizeName(TEMPLATE_NAME) },
        update: {},
        create: { name: TEMPLATE_NAME, nameNormalized: normalizeName(TEMPLATE_NAME) },
    });
    for (const [idx, itemName] of TEMPLATE_ITEMS.entries()) {
        await prisma.equipmentTemplateItem.upsert({
            where: { templateId_nameNormalized: { templateId: template.id, nameNormalized: normalizeName(itemName) } },
            update: {},
            create: { templateId: template.id, name: itemName, nameNormalized: normalizeName(itemName), sortOrder: idx, requirePhoto: true },
        });
    }
    console.log(`Template OK: ${TEMPLATE_NAME} (${TEMPLATE_ITEMS.length} item)`);
    let created = 0;
    for (const u of UNITS) {
        const res = await prisma.equipmentUnit.upsert({
            where: { nameNormalized: normalizeName(u.name) },
            update: {},
            create: { name: u.name, nameNormalized: normalizeName(u.name), brand: u.brand, templateId: template.id },
        });
        void res;
        created++;
    }
    console.log(`Units OK (tanpa menimpa): ${created} alat`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
}).finally(async () => prisma.$disconnect());
