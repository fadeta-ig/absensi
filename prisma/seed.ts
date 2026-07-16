import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assignOnlyRole, ensureRbac } from "./seedRbac";

const prisma = new PrismaClient();

async function ensureMasterData() {
    const division = await prisma.division.upsert({
        where: { name: "HRGA & IT" }, update: {}, create: { name: "HRGA & IT", isActive: true },
    });
    await prisma.department.upsert({
        where: { name: "HRGA & IT" }, update: { divisionId: division.id },
        create: { name: "HRGA & IT", divisionId: division.id, isActive: true },
    });
    await prisma.position.upsert({ where: { name: "Manager" }, update: {}, create: { name: "Manager", isActive: true } });
    await prisma.position.upsert({ where: { name: "Staff" }, update: {}, create: { name: "Staff", isActive: true } });
}

async function main() {
    console.log("Seeding master data and separated admin accounts...");
    await ensureMasterData();
    await ensureRbac(prisma);

    const superPassword = randomBytes(12).toString("base64url");
    const gaPassword = randomBytes(12).toString("base64url");
    const superUser = await prisma.userAccount.upsert({
        where: { username: "WIG001" },
        update: { displayName: "Admin HR", email: "hr@wig.co.id", passwordHash: await bcrypt.hash(superPassword, 12), isActive: true },
        create: { username: "WIG001", displayName: "Admin HR", email: "hr@wig.co.id", passwordHash: await bcrypt.hash(superPassword, 12) },
    });
    const gaUser = await prisma.userAccount.upsert({
        where: { username: "WIG002" },
        update: { displayName: "Admin GA", email: "ga@wig.co.id", passwordHash: await bcrypt.hash(gaPassword, 12), isActive: true },
        create: { username: "WIG002", displayName: "Admin GA", email: "ga@wig.co.id", passwordHash: await bcrypt.hash(gaPassword, 12) },
    });
    await assignOnlyRole(prisma, superUser.id, "SUPER_ADMIN");
    await assignOnlyRole(prisma, gaUser.id, "GA_ADMIN");

    console.log("Admin users ready (not stored in Employee table).");
    console.log(`WIG001 temporary password: ${superPassword}`);
    console.log(`WIG002 temporary password: ${gaPassword}`);
}

main().catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
}).finally(async () => prisma.$disconnect());
