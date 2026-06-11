import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Seeding database (complete replacement)...");

    // ── 1. Clean slate (FK-safe order) ──────────────────────────────────────
    console.log("🗑  Clearing existing data...");
    const tryClear = async (fn: () => Promise<unknown>, name: string) => {
        try { await fn(); } catch { console.warn(`  ⚠ Skip clear ${name} (table may not exist or has constraints)`); }
    };

    await tryClear(() => prisma.assetHistory.deleteMany({}), "assetHistory");
    await tryClear(() => prisma.asset.deleteMany({}), "asset");
    await tryClear(() => prisma.simCard.deleteMany({}), "simCard");
    await tryClear(() => prisma.pushSubscription.deleteMany({}), "pushSubscription");
    await tryClear(() => prisma.todoItem.deleteMany({}), "todoItem");
    await tryClear(() => prisma.newsItem.deleteMany({}), "newsItem");
    await tryClear(() => prisma.assetCategory.deleteMany({}), "assetCategory");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).visit?.deleteMany({}), "visit");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).attendance?.deleteMany({}), "attendance");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).leaveRequest?.deleteMany({}), "leaveRequest");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).overtimeRequest?.deleteMany({}), "overtimeRequest");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).payslip?.deleteMany({}), "payslip");
    await tryClear(() => (prisma as any).attendanceCorrection?.deleteMany({}), "attendanceCorrection");
    await tryClear(() => (prisma as any).payslipItem?.deleteMany({}), "payslipItem");
    await tryClear(() => (prisma as any).inspectionChecklistItem?.deleteMany({}), "inspectionChecklistItem");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).employeePayrollComponent?.deleteMany({}), "employeePayrollComponent");
    await tryClear(() => prisma.employee.updateMany({ data: { managerId: null } }), "employee manager nullify");
    await tryClear(() => prisma.employee.deleteMany({}), "employee");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tryClear(() => (prisma as any).workShiftDay?.deleteMany({}), "workShiftDay");
    await tryClear(() => prisma.workShift.deleteMany({}), "workShift");
    await tryClear(() => prisma.department.deleteMany({}), "department");
    await tryClear(() => prisma.division.deleteMany({}), "division");
    await tryClear(() => prisma.position.deleteMany({}), "position");

    console.log("✅ Data lama berhasil dihapus");

    // ── 2. WorkShift ─────────────────────────────────────────────────────────
    const shift = await prisma.workShift.create({
        data: {
            id: "shift-001",
            name: "Shift Reguler (Senin–Sabtu)",
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
    console.log(`✅ WorkShift: ${shift.name}`);

    // ── 3. Master Data (Division, Department, Position) ──────────────────────
    const divisionsSet = new Set<string>();
    const departmentsMap = new Map<string, string>(); // department -> division
    const positionsMap = new Map<string, string>(); // position -> level

    // Add admin data requirements
    divisionsSet.add("HRGA & IT");
    divisionsSet.add("Operation and Supply Chain Management");
    departmentsMap.set("HRGA & IT", "HRGA & IT");
    positionsMap.set("Manager", "MANAGER");
    positionsMap.set("Staff", "STAFF");

    const divIdMap = new Map<string, string>();
    const deptIdMap = new Map<string, string>();
    const posIdMap = new Map<string, string>();

    // Seed Divisions
    for (const div of divisionsSet) {
        const record = await prisma.division.upsert({
            where: { name: div },
            update: {},
            create: { name: div, isActive: true },
        });
        divIdMap.set(div, record.id);
    }
    console.log(`✅ Divisions seeded: ${divisionsSet.size}`);

    // Seed Departments
    for (const [dept, div] of departmentsMap) {
        const divisionId = divIdMap.get(div);
        if (divisionId) {
            const record = await prisma.department.upsert({
                where: { name: dept },
                update: { divisionId },
                create: { name: dept, isActive: true, divisionId },
            });
            deptIdMap.set(dept, record.id);
        }
    }
    console.log(`✅ Departments seeded: ${departmentsMap.size}`);

    // Seed Positions
    for (const [pos, level] of positionsMap) {
        const record = await prisma.position.upsert({
            where: { name: pos },
            update: {},
            create: { name: pos, isActive: true },
        });
        posIdMap.set(pos, record.id);
    }
    console.log(`✅ Positions seeded: ${positionsMap.size}`);

    // ── 4. Employees ─────────────────────────────────────────────────────────
    // Generate cryptographically random passwords — NEVER use hardcoded passwords
    const { randomBytes } = await import("crypto");
    const generatePassword = () => randomBytes(9).toString("base64url"); // 12 chars, URL-safe
    const adminPassword = generatePassword();
    const gaPassword = generatePassword();

    const hashedAdmin = await bcrypt.hash(adminPassword, 10);
    const hashedGA = await bcrypt.hash(gaPassword, 10);

    // Admin HR (akun sistem — WIG001)
    await prisma.employee.upsert({
        where: { employeeId: "WIG001" },
        update: {
            name: "Admin HR",
            email: "hr@wig.co.id",
            departmentId: deptIdMap.get("HRGA & IT")!,
            divisionId: divIdMap.get("HRGA & IT")!,
            positionId: posIdMap.get("Manager")!,
            role: "hr",
            password: hashedAdmin,
            shiftId: "shift-001",
        },
        create: {
            id: "emp-001",
            employeeId: "WIG001",
            name: "Admin HR",
            email: "hr@wig.co.id",
            phone: "",
            departmentId: deptIdMap.get("HRGA & IT")!,
            divisionId: divIdMap.get("HRGA & IT")!,
            positionId: posIdMap.get("Manager")!,
            role: "hr",
            password: hashedAdmin,
            joinDate: new Date("2024-01-01"),
            totalLeave: 12,
            usedLeave: 0,
            isActive: true,
            shiftId: "shift-001",
        },
    });

    // Admin GA (akun sistem — WIG002)
    await prisma.employee.upsert({
        where: { employeeId: "WIG002" },
        update: {
            name: "Admin GA",
            email: "ga@wig.co.id",
            departmentId: deptIdMap.get("HRGA & IT")!,
            divisionId: divIdMap.get("Operation and Supply Chain Management")!,
            positionId: posIdMap.get("Staff")!,
            role: "ga",
            password: hashedGA,
            shiftId: "shift-001",
        },
        create: {
            id: "emp-002",
            employeeId: "WIG002",
            name: "Admin GA",
            email: "ga@wig.co.id",
            phone: "",
            departmentId: deptIdMap.get("HRGA & IT")!,
            divisionId: divIdMap.get("Operation and Supply Chain Management")!,
            positionId: posIdMap.get("Staff")!,
            role: "ga",
            password: hashedGA,
            joinDate: new Date("2024-01-01"),
            totalLeave: 12,
            usedLeave: 0,
            isActive: true,
            shiftId: "shift-001",
        },
    });

    console.log(`✅ Employees seeded: WIG001 (Admin HR) dan WIG002 (Admin GA)`);

    // ╔════════════════════════════════════════════════════════════════╗
    // ║  CREDENTIALS — CATAT DENGAN AMAN, TIDAK DITAMPILKAN LAGI    ║
    // ╚════════════════════════════════════════════════════════════════╝
    console.log("\n🔐 ═══ GENERATED CREDENTIALS (simpan di tempat aman!) ═══");
    console.log(`   WIG001 (Admin HR)  → Password: ${adminPassword}`);
    console.log(`   WIG002 (Admin GA)  → Password: ${gaPassword}`);
    console.log("   ⚠️  Segera ubah password setelah login pertama!\n");

    console.log(`\n🎉 Seeding complete!`);
    console.log(`   👥 Karyawan  : 2 (Admin Sistem)`);
}

main()
    .catch((e) => {
        console.error("❌ Seed error:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
