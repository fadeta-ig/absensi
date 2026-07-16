import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assignOnlyRole, ensureRbac } from "./seedRbac";

const prisma = new PrismaClient();

async function main() {
    await ensureRbac(prisma);
    const passwordHash = await bcrypt.hash("123", 12);
    const superUser = await prisma.userAccount.upsert({
        where: { username: "WIG001" },
        update: { displayName: "Admin HR", email: "hr@wig.co.id", passwordHash, isActive: true },
        create: { username: "WIG001", displayName: "Admin HR", email: "hr@wig.co.id", passwordHash },
    });
    const gaUser = await prisma.userAccount.upsert({
        where: { username: "WIG002" },
        update: { displayName: "Admin GA", email: "ga@wig.co.id", passwordHash, isActive: true },
        create: { username: "WIG002", displayName: "Admin GA", email: "ga@wig.co.id", passwordHash },
    });
    await assignOnlyRole(prisma, superUser.id, "SUPER_ADMIN");
    await assignOnlyRole(prisma, gaUser.id, "GA_ADMIN");
    console.log("Development users ready: WIG001 (Super Admin HR), WIG002 (Admin GA). Password: 123");
}

main().catch((error) => {
    console.error("Development seed failed:", error);
    process.exit(1);
}).finally(async () => prisma.$disconnect());
