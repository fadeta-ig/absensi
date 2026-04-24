import { prisma } from "./src/lib/prisma";

async function main() {
  const categories = await prisma.assetCategory.findMany();
  console.log(JSON.stringify(categories, null, 2));
}

main();
