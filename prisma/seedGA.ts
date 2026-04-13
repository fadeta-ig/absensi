/**
 * seedGA.ts — Buat akun GA (General Affairs) pertama
 * Jalankan: npx tsx prisma/seedGA.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Generate unique ID format: ID25 + 6 digit angka random (total 10 karakter) */
function generateID25(): string {
    const digits = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
    return `ID25${digits}`;
}

async function main() {
    const GA_EMPLOYEE_ID = generateID25();
    const GA_PASSWORD = "123";   // ← bisa diganti

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
            name: "General Affairs",
            email: "ga@wig.co.id",
            phone: "08100000001",
            department: "HRGA & IT",
            division: "Operation and Supply Chain Management",
            position: "General Affairs Staff",
            role: "ga",
            level: "STAFF",
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
