import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Seeding database...");

    // Create shifts first (referenced by employees)
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

    const shiftSiang = await prisma.workShift.upsert({
        where: { id: "shift-002" },
        update: {},
        create: {
            id: "shift-002",
            name: "Shift Siang",
            startTime: "14:00",
            endTime: "22:00",
            isDefault: false,
        },
    });

    const shiftMalam = await prisma.workShift.upsert({
        where: { id: "shift-003" },
        update: {},
        create: {
            id: "shift-003",
            name: "Shift Malam",
            startTime: "22:00",
            endTime: "06:00",
            isDefault: false,
        },
    });

    console.log(`✅ Shifts: ${shiftPagi.name}, ${shiftSiang.name}, ${shiftMalam.name}`);

    // Create employees
    const hrAdmin = await prisma.employee.upsert({
        where: { employeeId: "WIG001" },
        update: {},
        create: {
            id: "emp-001",
            employeeId: "WIG001",
            name: "Admin HR",
            email: "hr@wig.co.id",
            phone: "08123456789",
            department: "Human Resources",
            position: "HR Manager",
            role: "hr",
            password: "password123",
            joinDate: "2024-01-15",
            totalLeave: 12,
            usedLeave: 2,
            isActive: true,
            shiftId: "shift-001",
        },
    });

    const budi = await prisma.employee.upsert({
        where: { employeeId: "WIG002" },
        update: {},
        create: {
            id: "emp-002",
            employeeId: "WIG002",
            name: "Budi Santoso",
            email: "budi@wig.co.id",
            phone: "08198765432",
            department: "Engineering",
            position: "Software Engineer",
            role: "employee",
            password: "password123",
            joinDate: "2024-03-01",
            totalLeave: 12,
            usedLeave: 5,
            isActive: true,
            shiftId: "shift-001",
        },
    });

    console.log(`✅ Employees: ${hrAdmin.name}, ${budi.name}`);

    // Create news
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

    await prisma.newsItem.upsert({
        where: { id: "news-002" },
        update: {},
        create: {
            id: "news-002",
            title: "Kebijakan Work From Home 2026",
            content:
                "Mulai bulan Maret 2026, kebijakan WFH akan diterapkan maksimal 2 hari per minggu. Detail lebih lanjut akan diinformasikan melalui email resmi perusahaan.",
            category: "policy",
            author: "Admin HR",
            createdAt: new Date().toISOString(),
            isPinned: false,
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
