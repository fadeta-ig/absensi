import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assignOnlyRole, ensureRbac } from "./seedRbac";

const prisma = new PrismaClient();

async function main() {
    const password = "HRAdmin@123";
    await ensureRbac(prisma);
    const user = await prisma.userAccount.upsert({
        where: { username: "WIG001" },
        update: { displayName: "Admin HR", email: "hr@wig.co.id", passwordHash: await bcrypt.hash(password, 12), isActive: true },
        create: { username: "WIG001", displayName: "Admin HR", email: "hr@wig.co.id", passwordHash: await bcrypt.hash(password, 12) },
    });
    await assignOnlyRole(prisma, user.id, "SUPER_ADMIN");
    console.log("Super Admin HR ready: WIG001 / HRAdmin@123");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
}).finally(async () => prisma.$disconnect());
