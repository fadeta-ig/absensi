import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Seeding database...");

    // 1. Create shifts
    const shiftPagi = await prisma.workShift.upsert({
        where: { id: "shift-001" },
        update: {},
        create: {
            id: "shift-001",
            name: "Shift Pagi",
            startTime: "08:00",
            endTime: "17:00",
            isDefault: true,
        },
    });

    // 2. Create Departments
    const deptIT = await prisma.department.upsert({
        where: { name: "IT" },
        update: {},
        create: { name: "IT", code: "IT", description: "Information Technology" }
    });

    const deptHR = await prisma.department.upsert({
        where: { name: "Human Resources" },
        update: {},
        create: { name: "Human Resources", code: "HR", description: "Human Resources Department" }
    });

    // 3. Create Divisions
    const divHRGA = await prisma.division.upsert({
        where: { name_departmentId: { name: "HRGA-IT", departmentId: deptIT.id } },
        update: {},
        create: { name: "HRGA-IT", departmentId: deptIT.id }
    });

    const divOps = await prisma.division.upsert({
        where: { name_departmentId: { name: "Operations", departmentId: deptHR.id } },
        update: {},
        create: { name: "Operations", departmentId: deptHR.id }
    });

    // 4. Create Positions (Standalone now)
    const posStaff = await prisma.position.upsert({
        where: { name: "Staff" },
        update: {},
        create: { name: "Staff" }
    });

    const posManager = await prisma.position.upsert({
        where: { name: "Manager" },
        update: {},
        create: { name: "Manager" }
    });

    console.log("✅ Master data (Shifts, Depts, Divisions, Positions) seeded");

    const hashedPassword = await bcrypt.hash("password123", 10);

    // 5. Create employees
    const hrAdmin = await prisma.employee.upsert({
        where: { employeeId: "WIG001" },
        update: {
            password: hashedPassword,
            isActive: true,
            role: "hr",
        },
        create: {
            id: "emp-001",
            employeeId: "WIG001",
            name: "Admin HR",
            email: "hr@wig.co.id",
            phone: "08123456789",
            department: "Human Resources",
            division: "Operations",
            position: "Manager",
            role: "hr",
            password: hashedPassword,
            joinDate: "2024-01-15",
            totalLeave: 12,
            usedLeave: 2,
            isActive: true,
            shiftId: "shift-001",
        },
    });

    const budi = await prisma.employee.upsert({
        where: { employeeId: "WIG002" },
        update: {
            password: hashedPassword,
            isActive: true,
        },
        create: {
            id: "emp-002",
            employeeId: "WIG002",
            name: "Budi Santoso",
            email: "budi@wig.co.id",
            phone: "08198765432",
            department: "IT",
            division: "HRGA-IT",
            position: "Staff",
            role: "employee",
            password: hashedPassword,
            joinDate: "2024-03-01",
            totalLeave: 12,
            usedLeave: 5,
            isActive: true,
            shiftId: "shift-001",
        },
    });

    console.log(`✅ Employees seeded: ${hrAdmin.name}, ${budi.name}`);

    // 6. Create news
    await prisma.newsItem.upsert({
        where: { id: "news-001" },
        update: {},
        create: {
            id: "news-001",
            title: "Selamat Datang di WIG Attendance System",
            content:
                "Sistem absensi digital PT Wijaya Inovasi Gemilang kini telah aktif. Silakan gunakan fitur absensi dengan face recognition untuk pencatatan kehadiran yang lebih akurat.",
            category: "announcement",
            author: "Admin HR",
            createdAt: new Date().toISOString(),
            isPinned: true,
        },
    });

    console.log("✅ News seeded");
    console.log("🎉 Seeding complete!");
}

main()
    .catch((e) => {
        console.error("❌ Seed error:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
