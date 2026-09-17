import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assignOnlyRole, ensureRbac } from "./seedRbac";

const prisma = new PrismaClient();

async function main() {
    await ensureRbac(prisma);

    const division = await prisma.division.upsert({ where: { name: "HRGA & IT" }, update: {}, create: { name: "HRGA & IT" } });
    const department = await prisma.department.upsert({ where: { name: "HRGA & IT" }, update: { divisionId: division.id }, create: { name: "HRGA & IT", divisionId: division.id } });
    const position = await prisma.position.upsert({ where: { name: "Staff" }, update: {}, create: { name: "Staff" } });

    // 1. Karyawan Demo standard (ID25999999 / 123)
    const demoEmp = await prisma.employee.upsert({
        where: { employeeId: "ID25999999" },
        update: { name: "Karyawan Demo", email: "demo@wig.co.id", isActive: true },
        create: {
            employeeId: "ID25999999", name: "Karyawan Demo", email: "demo@wig.co.id", phone: "081200000000",
            departmentId: department.id, divisionId: division.id, positionId: position.id,
            joinDate: new Date(), totalLeave: 12, usedLeave: 0, isActive: true, bypassLocation: true,
        },
    });
    const demoUser = await prisma.userAccount.upsert({
        where: { username: "ID25999999" },
        update: { employeeId: "ID25999999", displayName: demoEmp.name, email: demoEmp.email, passwordHash: await bcrypt.hash("123", 12), isActive: true },
        create: { username: "ID25999999", employeeId: "ID25999999", displayName: demoEmp.name, email: demoEmp.email, passwordHash: await bcrypt.hash("123", 12) },
    });
    await assignOnlyRole(prisma, demoUser.id, "EMPLOYEE_USER");

    console.log(`[SEED] Demo Employee ID25999999 ready (Password: 123)`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
}).finally(async () => prisma.$disconnect());
