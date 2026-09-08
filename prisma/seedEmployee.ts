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

    // 2. Karyawan Test (daffatgi02@gmail.com / 123)
    const daffaEmail = "daffatgi02@gmail.com";
    const daffaPassword = "123";
    const daffaEmployeeId = "WIG-EMP-004";

    let daffaEmp = await prisma.employee.findUnique({ where: { employeeId: daffaEmployeeId } });
    if (!daffaEmp) {
        daffaEmp = await prisma.employee.findUnique({ where: { email: daffaEmail } });
    }

    if (daffaEmp) {
        daffaEmp = await prisma.employee.update({
            where: { id: daffaEmp.id },
            data: {
                email: daffaEmail,
                name: "Daffa",
                isActive: true,
                departmentId: department.id,
                divisionId: division.id,
                positionId: position.id,
            },
        });
    } else {
        daffaEmp = await prisma.employee.create({
            data: {
                employeeId: daffaEmployeeId,
                name: "Daffa",
                email: daffaEmail,
                phone: "081234567890",
                departmentId: department.id,
                divisionId: division.id,
                positionId: position.id,
                joinDate: new Date(),
                totalLeave: 12,
                usedLeave: 0,
                isActive: true,
                bypassLocation: true,
            },
        });
    }

    const daffaPasswordHash = await bcrypt.hash(daffaPassword, 12);
    let daffaUser = await prisma.userAccount.findFirst({
        where: {
            OR: [
                { username: daffaEmail },
                { username: daffaEmp.employeeId },
                { email: daffaEmail },
            ],
        },
    });

    if (daffaUser) {
        daffaUser = await prisma.userAccount.update({
            where: { id: daffaUser.id },
            data: {
                username: daffaEmail,
                email: daffaEmail,
                displayName: daffaEmp.name,
                employeeId: daffaEmp.employeeId,
                passwordHash: daffaPasswordHash,
                isActive: true,
                sessionVersion: { increment: 1 },
            },
        });
    } else {
        daffaUser = await prisma.userAccount.create({
            data: {
                username: daffaEmail,
                email: daffaEmail,
                displayName: daffaEmp.name,
                employeeId: daffaEmp.employeeId,
                passwordHash: daffaPasswordHash,
                isActive: true,
            },
        });
    }
    await assignOnlyRole(prisma, daffaUser.id, "EMPLOYEE_USER");

    console.log(`[SEED] Karyawan ready:`);
    console.log(`  - Username / Email : ${daffaEmail}`);
    console.log(`  - Password         : ${daffaPassword}`);
    console.log(`  - Employee ID      : ${daffaEmp.employeeId}`);
    console.log(`  - Role             : EMPLOYEE_USER`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
}).finally(async () => prisma.$disconnect());
