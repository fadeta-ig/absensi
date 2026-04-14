/**
 * seedGA.ts — Buat akun GA (General Affairs) pertama
 * Jalankan: npx tsx prisma/seedGA.ts
 *
 * Otomatis membuat Division, Department, Position jika belum ada.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    const GA_EMPLOYEE_ID = "WIG002";
    const GA_PASSWORD = "GAAdmin@123";

    // 1. Division
    const div = await prisma.division.upsert({
        where: { name: "Operation and Supply Chain Management" },
        update: {},
        create: { name: "Operation and Supply Chain Management" },
    });

    // 2. Department — reuse HRGA & IT division if needed
    const hrgaDiv = await prisma.division.upsert({
        where: { name: "HRGA & IT" },
        update: {},
        create: { name: "HRGA & IT" },
    });

    const department = await prisma.department.upsert({
        where: { name: "HRGA & IT" },
        update: {},
        create: { name: "HRGA & IT", divisionId: hrgaDiv.id },
    });

    // 3. Position
    const position = await prisma.position.upsert({
        where: { name: "General Affairs Staff" },
        update: {},
        create: { name: "General Affairs Staff" },
    });

    console.log("✅ Reference data (Division/Department/Position) ready.");

    // Cek apakah sudah ada
    const existing = await prisma.employee.findUnique({
        where: { employeeId: GA_EMPLOYEE_ID },
    });

    if (existing) {
        console.log(`⚠️  Akun GA sudah ada: ${GA_EMPLOYEE_ID}`);
        console.log(`   Role: ${existing.role}`);
        await prisma.$disconnect();
        return;
    }

    const hashedPassword = await bcrypt.hash(GA_PASSWORD, 12);

    const ga = await prisma.employee.create({
        data: {
            employeeId: GA_EMPLOYEE_ID,
            name: "Admin GA",
            email: "ga@wig.co.id",
            phone: "",
            departmentId: department.id,
            divisionId: div.id,
            positionId: position.id,
            role: "ga",
            password: hashedPassword,
            joinDate: new Date(),
            isActive: true,
            bypassLocation: true,
        },
    });

    console.log("\n✅ Akun GA berhasil dibuat!\n");
    console.log("┌─────────────────────────────────────┐");
    console.log(`│  Employee ID : ${ga.employeeId.padEnd(21)} │`);
    console.log(`│  Password    : ${GA_PASSWORD.padEnd(21)} │`);
    console.log(`│  Role        : ${"ga".padEnd(21)} │`);
    console.log(`│  Portal      : http://localhost:3000 │`);
    console.log("└─────────────────────────────────────┘");
    console.log("\n👉 Login dari halaman biasa → otomatis redirect ke /ga");

    await prisma.$disconnect();
}

main().catch(e => {
    console.error("❌ Error:", e);
    prisma.$disconnect();
    process.exit(1);
});
