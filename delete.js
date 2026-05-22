const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.assetBastDocument.deleteMany();
  console.log('Deleted all old BAST documents');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
