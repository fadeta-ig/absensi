import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assignOnlyRole, ensureRbac } from "./seedRbac";

const prisma = new PrismaClient();

async function main() {
    const employeeId = "ID25999999";
    const password = "123";
    await ensureRbac(prisma);

    const division = await prisma.division.upsert({ where: { name: "HRGA & IT" }, update: {}, create: { name: "HRGA & IT" } });
    const department = await prisma.department.upsert({ where: { name: "HRGA & IT" }, update: { divisionId: division.id }, create: { name: "HRGA & IT", divisionId: division.id } });
    const position = await prisma.position.upsert({ where: { name: "Staff" }, update: {}, create: { name: "Staff" } });

    const employee = await prisma.employee.upsert({
        where: { employeeId },
        update: { name: "Karyawan Demo", email: "demo@wig.co.id", isActive: true },
        create: {
            employeeId, name: "Karyawan Demo", email: "demo@wig.co.id", phone: "081200000000",
            departmentId: department.id, divisionId: division.id, positionId: position.id,
            joinDate: new Date(), totalLeave: 12, usedLeave: 0, isActive: true, bypassLocation: true,
        },
    });
    const user = await prisma.userAccount.upsert({
        where: { username: employeeId },
        update: { employeeId, displayName: employee.name, email: employee.email, passwordHash: await bcrypt.hash(password, 12), isActive: true },
        create: { username: employeeId, employeeId, displayName: employee.name, email: employee.email, passwordHash: await bcrypt.hash(password, 12) },
    });
    await assignOnlyRole(prisma, user.id, "EMPLOYEE_USER");
    console.log(`Karyawan demo ready: ${employeeId} / ${password}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
}).finally(async () => prisma.$disconnect());
