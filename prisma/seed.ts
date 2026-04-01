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
            isDefault: true,
            days: {
                create: [
                    { dayOfWeek: 0, startTime: "08:00", endTime: "17:00", isOff: true },
                    { dayOfWeek: 1, startTime: "08:00", endTime: "17:00", isOff: false },
                    { dayOfWeek: 2, startTime: "08:00", endTime: "17:00", isOff: false },
                    { dayOfWeek: 3, startTime: "08:00", endTime: "17:00", isOff: false },
                    { dayOfWeek: 4, startTime: "08:00", endTime: "17:00", isOff: false },
                    { dayOfWeek: 5, startTime: "08:00", endTime: "17:00", isOff: false },
                    { dayOfWeek: 6, startTime: "08:00", endTime: "13:00", isOff: false },
                ],
            },
        },
    });

    // 1. Create Divisions
    const divCorporate = await prisma.division.upsert({
        where: { name: "Corporate Services" },
        update: {},
        create: { name: "Corporate Services" }
    });

    const divTech = await prisma.division.upsert({
        where: { name: "Technology" },
        update: {},
        create: { name: "Technology" }
    });

    // 2. Create Departments
    const deptIT = await prisma.department.upsert({
        where: { name: "IT" },
        update: {},
        create: {
            name: "IT",
            code: "IT",
            description: "Information Technology",
            divisionId: divTech.id
        }
    });

    const deptHR = await prisma.department.upsert({
        where: { name: "Human Resources" },
        update: {},
        create: {
            name: "Human Resources",
            code: "HR",
            description: "Human Resources Department",
            divisionId: divCorporate.id
        }
    });

    // 3. Create Positions (Standalone)
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

    console.log("✅ Master data (Shifts, Divisions, Depts, Positions) seeded");

    const hashedPassword = await bcrypt.hash("123", 10);

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
