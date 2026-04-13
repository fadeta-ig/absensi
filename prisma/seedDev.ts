/**
 * seedDev.ts — Seed ringan untuk development & testing
 *
 * Isi:
 *  - Master data minimal (shift, divisi, departemen, jabatan)
 *  - Akun HR Admin  : WIG001 / 123
 *  - Akun GA Admin  : WIG002 / 123
 *  - TIDAK ada karyawan (gunakan: npm run db:seed:employee)
 *  - TIDAK ada aset
 *
 * Jalankan: npx tsx prisma/seedDev.ts
 * atau    : npm run db:seed:dev
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────

const tryClear = async (fn: () => Promise<unknown>, name: string) => {
    try { await fn(); } catch { console.warn(`  ⚠ Skip clear ${name}`); }
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log("🌱 [DEV] Seeding database minimal...\n");

    // ── 1. Clear semua data (FK-safe order) ──────────────────────────────────
    console.log("🗑  Clearing existing data...");
    await tryClear(() => prisma.assetHistory.deleteMany({}),       "assetHistory");
    await tryClear(() => prisma.asset.deleteMany({}),              "asset");
    await tryClear(() => prisma.pushSubscription.deleteMany({}),   "pushSubscription");
    await tryClear(() => prisma.todoItem.deleteMany({}),           "todoItem");
    await tryClear(() => prisma.newsItem.deleteMany({}),           "newsItem");
    await tryClear(() => (prisma as any).visit?.deleteMany({}),          "visit");
    await tryClear(() => (prisma as any).attendance?.deleteMany({}),     "attendance");
    await tryClear(() => (prisma as any).leaveRequest?.deleteMany({}),   "leaveRequest");
    await tryClear(() => (prisma as any).overtimeRequest?.deleteMany({}), "overtimeRequest");
    await tryClear(() => (prisma as any).payslip?.deleteMany({}),        "payslip");
    await tryClear(() => (prisma as any).employeePayrollComponent?.deleteMany({}), "employeePayrollComponent");
    await tryClear(() => prisma.employee.deleteMany({}),           "employee");
    await tryClear(() => (prisma as any).workShiftDay?.deleteMany({}),   "workShiftDay");
    await tryClear(() => prisma.workShift.deleteMany({}),          "workShift");
    await tryClear(() => prisma.department.deleteMany({}),         "department");
    await tryClear(() => prisma.division.deleteMany({}),           "division");
    await tryClear(() => prisma.position.deleteMany({}),           "position");
    console.log("✅ Data lama berhasil dihapus\n");

    // ── 2. WorkShift ─────────────────────────────────────────────────────────
    await prisma.workShift.create({
        data: {
            id: "shift-001",
            name: "Shift Reguler (Senin–Sabtu)",
            isDefault: true,
            days: {
                create: [
                    { dayOfWeek: 0, startTime: "08:00", endTime: "17:00", isOff: true  },
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
    console.log("✅ WorkShift: Shift Reguler (Senin–Sabtu)");

    // ── 3. Master Data minimal ────────────────────────────────────────────────
    // Divisions
    const divHRGA = await prisma.division.create({ data: { name: "HRGA & IT", isActive: true } });
    const divOps  = await prisma.division.create({ data: { name: "Operation and Supply Chain Management", isActive: true } });
    const divSales = await prisma.division.create({ data: { name: "Sales Marketing & Bussiness Development", isActive: true } });
    const divFin  = await prisma.division.create({ data: { name: "Finance, Accounting, Invesment & Tax", isActive: true } });
    console.log("✅ Divisions: 4");

    // Departments
    await prisma.department.create({ data: { name: "HRGA & IT",  isActive: true, divisionId: divHRGA.id } });
    await prisma.department.create({ data: { name: "Operation",  isActive: true, divisionId: divOps.id  } });
    await prisma.department.create({ data: { name: "Supply Chain Management", isActive: true, divisionId: divOps.id } });
    await prisma.department.create({ data: { name: "Creative Marketing", isActive: true, divisionId: divSales.id } });
    await prisma.department.create({ data: { name: "Finance, Accounting, Tax & Invesment", isActive: true, divisionId: divFin.id } });
    console.log("✅ Departments: 5");

    // Positions
    await prisma.position.create({ data: { name: "Manager",  level: "MANAGER",    isActive: true } });
    await prisma.position.create({ data: { name: "Staff",    level: "STAFF",       isActive: true } });
    await prisma.position.create({ data: { name: "Supervisor", level: "SUPERVISOR", isActive: true } });
    await prisma.position.create({ data: { name: "General Affairs Staff", level: "STAFF", isActive: true } });
    console.log("✅ Positions: 4");

    // ── 4. Admin accounts ────────────────────────────────────────────────────
    const hashedAdmin = await bcrypt.hash("123", 12);

    // HR Admin — WIG001
    await prisma.employee.create({
        data: {
            id: "emp-001",
            employeeId: "WIG001",
            name: "Admin HR",
            email: "hr@wig.co.id",
            phone: "",
            department: "HRGA & IT",
            division: "HRGA & IT",
            position: "Manager",
            role: "hr",
            level: "MANAGER",
            password: hashedAdmin,
            joinDate: new Date("2024-01-01"),
            totalLeave: 12,
            usedLeave: 0,
            isActive: true,
            bypassLocation: true,
            shiftId: "shift-001",
        },
    });

    // GA Admin — WIG002
    await prisma.employee.create({
        data: {
            id: "emp-002",
            employeeId: "WIG002",
            name: "Admin GA",
            email: "ga@wig.co.id",
            phone: "",
            department: "HRGA & IT",
            division: "Operation and Supply Chain Management",
            position: "General Affairs Staff",
            role: "ga",
            level: "STAFF",
            password: hashedAdmin,
            joinDate: new Date("2024-01-01"),
            totalLeave: 12,
            usedLeave: 0,
            isActive: true,
            bypassLocation: true,
            shiftId: "shift-001",
        },
    });
    console.log("✅ Employees: WIG001 (Admin HR), WIG002 (Admin GA)");

    // ── 5. News (1 item) ─────────────────────────────────────────────────────
    await prisma.newsItem.create({
        data: {
            id: "news-001",
            title: "Selamat Datang di WIG HRIS System",
            content: "Mode development aktif. Gunakan akun WIG001 (HR) atau WIG002 (GA) untuk login.",
            category: "announcement",
            author: "Admin HR",
            isPinned: true,
        },
    });
    console.log("✅ News: 1 item");

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log("\n🎉 [DEV] Seeding selesai!");
    console.log("   👤 Akun    : WIG001 (HR Admin) · WIG002 (GA Admin)");
    console.log("   🔑 Password: 123 (semua akun)");
    console.log("   📦 Aset    : tidak ada");
    console.log("\n💡 Tambah dummy karyawan: npm run db:seed:employee");
}

main()
    .catch((e) => {
        console.error("❌ Seed error:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
