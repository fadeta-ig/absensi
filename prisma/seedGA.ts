import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assignOnlyRole, ensureRbac } from "./seedRbac";

const prisma = new PrismaClient();

async function main() {
    const password = "GAAdmin@123";
    await ensureRbac(prisma);
    const user = await prisma.userAccount.upsert({
        where: { username: "WIG002" },
        update: { displayName: "Admin GA", email: "ga@wig.co.id", passwordHash: await bcrypt.hash(password, 12), isActive: true },
        create: { username: "WIG002", displayName: "Admin GA", email: "ga@wig.co.id", passwordHash: await bcrypt.hash(password, 12) },
    });
    await assignOnlyRole(prisma, user.id, "GA_ADMIN");
    console.log("Admin GA ready: WIG002 / GAAdmin@123");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
}).finally(async () => prisma.$disconnect());
