const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    const assets = await prisma.$queryRaw`SELECT id, category FROM assets`;
    fs.writeFileSync('asset_categories_dump.json', JSON.stringify(assets, null, 2));
    console.log(`Dumped ${assets.length} assets.`);
    await prisma.$disconnect();
}
main().catch(console.error);
