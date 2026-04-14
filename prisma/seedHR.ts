/**
 * seedHR.ts — Buat akun HR Administrator pertama
 * Jalankan: npx tsx prisma/seedHR.ts
 *
 * Otomatis membuat Division, Department, Position jika belum ada.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function ensureReferenceData() {
    // 1. Division
    const div = await prisma.division.upsert({
        where: { name: "HRGA & IT" },
        update: {},
        create: { name: "HRGA & IT" },
    });

    // 2. Department (FK → Division)
    await prisma.department.upsert({
        where: { name: "HRGA & IT" },
        update: {},
        create: { name: "HRGA & IT", divisionId: div.id },
    });

    // 3. Position
    await prisma.position.upsert({
        where: { name: "Manager" },
        update: {},
        create: { name: "Manager", level: "MANAGER" },
    });

    console.log("✅ Reference data (Division/Department/Position) ready.");
}

async function main() {
    const HR_EMPLOYEE_ID = "WIG001";
    const HR_PASSWORD = "HRAdmin@123";

    await ensureReferenceData();

    // Cek apakah sudah ada
    const existing = await prisma.employee.findUnique({
        where: { employeeId: HR_EMPLOYEE_ID },
    });

    if (existing) {
        console.log(`⚠️  Akun HR Admin sudah ada: ${HR_EMPLOYEE_ID}`);
        console.log(`   Role: ${existing.role}`);
        await prisma.$disconnect();
        return;
    }

    const hashedPassword = await bcrypt.hash(HR_PASSWORD, 12);

    const hr = await prisma.employee.create({
        data: {
            employeeId: HR_EMPLOYEE_ID,
            name: "Admin HR",
            email: "hr@wig.co.id",
            phone: "",
            department: "HRGA & IT",
            division: "HRGA & IT",
            position: "Manager",
            role: "hr",
            level: "MANAGER",
            password: hashedPassword,
            joinDate: new Date(),
            isActive: true,
            bypassLocation: true,
        },
    });

    console.log("\n✅ Akun HR Admin berhasil dibuat!\n");
    console.log("┌─────────────────────────────────────┐");
    console.log(`│  Employee ID : ${hr.employeeId.padEnd(21)} │`);
    console.log(`│  Password    : ${HR_PASSWORD.padEnd(21)} │`);
    console.log(`│  Role        : ${"hr".padEnd(21)} │`);
    console.log(`│  Portal      : http://localhost:3000 │`);
    console.log("└─────────────────────────────────────┘");
    console.log("\n👉 Login → otomatis redirect ke /dashboard");

    await prisma.$disconnect();
}

main().catch(e => {
    console.error("❌ Error:", e);
    prisma.$disconnect();
    process.exit(1);
});
