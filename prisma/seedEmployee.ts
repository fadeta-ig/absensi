/**
 * seedEmployee.ts — Buat 1 akun dummy karyawan untuk testing
 * Jalankan: npx tsx prisma/seedEmployee.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    const EMP_EMPLOYEE_ID = "ID25999999";
    const EMP_PASSWORD = "123";   // ← bisa diganti

    // Cek apakah sudah ada
    const existing = await prisma.employee.findUnique({
        where: { employeeId: EMP_EMPLOYEE_ID },
    });

    if (existing) {
        console.log(`⚠️  Akun karyawan dummy sudah ada: ${EMP_EMPLOYEE_ID}`);
        console.log(`   Nama: ${existing.name}`);
        console.log(`   Role: ${existing.role}`);
        await prisma.$disconnect();
        return;
    }

    const hashedPassword = await bcrypt.hash(EMP_PASSWORD, 12);

    const emp = await prisma.employee.create({
        data: {
            employeeId: EMP_EMPLOYEE_ID,
            name: "Karyawan Demo",
            email: "demo@wig.co.id",
            phone: "081200000000",
            departmentId: "HRGA & IT",
            divisionId: "Operation and Supply Chain Management",
            positionId: "Staff",
            role: "employee",
            password: hashedPassword,
            joinDate: new Date(),
            totalLeave: 12,
            usedLeave: 0,
            isActive: true,
            bypassLocation: true,
        },
    });

    console.log("\n✅ Akun karyawan dummy berhasil dibuat!\n");
    console.log("┌─────────────────────────────────────┐");
    console.log(`│  Employee ID : ${emp.employeeId.padEnd(21)} │`);
    console.log(`│  Nama        : ${emp.name.padEnd(21)} │`);
    console.log(`│  Password    : ${EMP_PASSWORD.padEnd(21)} │`);
    console.log(`│  Role        : ${"employee".padEnd(21)} │`);
    console.log(`│  Portal      : http://localhost:3000 │`);
    console.log("└─────────────────────────────────────┘");
    console.log("\n👉 Login → otomatis redirect ke /employee");

    await prisma.$disconnect();
}

main().catch(e => {
    console.error("❌ Error:", e);
    prisma.$disconnect();
    process.exit(1);
});
