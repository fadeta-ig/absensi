const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    const raw = fs.readFileSync('asset_categories_dump.json', 'utf8');
    const oldAssets = JSON.parse(raw);

    const mapped = {
        'HANDPHONE': { name: 'Handphone/Tablet', prefix: 'HP' },
        'LAPTOP': { name: 'Laptop', prefix: 'LT' },
        'NOMOR_HP': { name: 'Nomor Indosat (SIM)', prefix: 'NUM' }
    };

    const catCache = {};

    for (const [key, val] of Object.entries(mapped)) {
        let cat = await prisma.assetCategory.findUnique({ where: { name: val.name } });
        if (!cat) {
            cat = await prisma.assetCategory.create({
                data: { name: val.name, prefix: val.prefix }
            });
            console.log('Created category', cat.name);
        }
        catCache[key] = cat.id;
    }

    let updated = 0;
    for (const asset of oldAssets) {
        if (!asset.category) continue;
        const catId = catCache[asset.category];
        if (catId) {
            await prisma.asset.update({
                where: { id: asset.id },
                data: { categoryId: catId }
            });
            updated++;
        }
    }
    
    console.log(`Updated ${updated} assets with category IDs.`);
    await prisma.$disconnect();
}
main().catch(console.error);
