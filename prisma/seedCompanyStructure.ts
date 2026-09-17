import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assignOnlyRole, ensureRbac } from "./seedRbac";

const prisma = new PrismaClient();

// Data Struktur Organisasi dari Permintaan User
const DIVISIONS_DATA = [
    { name: "CEO" },
    { name: "Direksi" },
    { name: "Finance, Accounting, Invesment & Tax" },
    { name: "HRGA" },
    { name: "Sales Marketing & Bussiness Development" },
    { name: "SGA" },
    { name: "Operation and Supply Chain Management" },
];

const DEPARTMENTS_DATA = [
    { name: "CEO", divisionName: "CEO", code: "CEO" },
    { name: "Direksi", divisionName: "Direksi", code: "BOD" },
    { name: "Finance, Accounting, Invesment & Tax", divisionName: "Finance, Accounting, Invesment & Tax", code: "FAIT" },
    { name: "HRGA", divisionName: "HRGA", code: "HRGA" },
    { name: "Creative Marketing", divisionName: "Sales Marketing & Bussiness Development", code: "MKT" },
    { name: "SGA", divisionName: "SGA", code: "SGA" },
    { name: "Packaging Development", divisionName: "Operation and Supply Chain Management", code: "PKG" },
    { name: "Research & Development", divisionName: "Operation and Supply Chain Management", code: "RND" },
    { name: "Supply Chain Management", divisionName: "Operation and Supply Chain Management", code: "SCM" },
    { name: "Operation and Maintenance", divisionName: "Operation and Supply Chain Management", code: "OPM" },
    { name: "IT, Market Research and Media Development Supervisor", divisionName: "Operation and Supply Chain Management", code: "ITMR" },
];

const POSITIONS_DATA = [
    "Chief Executive Officer",
    "General Manager",
    "Deputy General Manager",
    "Manager of Finance, Accounting, Tax & Invesment",
    "Supervisor of Finance, Accounting, Tax & Invesment",
    "Finance, Accounting & Tax Staff",
    "Staff Finance, Accounting, Invesment & Tax",
    "General Affair Staff",
    "General Affair Support",
    "Staff Human Resources",
    "Corsec & Reseptionist",
    "Chief of Security",
    "Brand Owner Everyoung",
    "Brand Owner Shinyoung",
    "Affiliate Specialist",
    "Admin Marketplace",
    "Content Creator Staff",
    "Customer Sevice",
    "Host Live",
    "Staff (Umum)",
    "Supervisor of Packaging Development",
    "Packaging Develompment Staff",
    "Quality & RnD Supervisor",
    "Research & Development Specialist",
    "Quality & Regulatory Staff",
    "Quality Control Staff",
    "Regulatory Staff",
    "Supply Planner",
    "Purchasing Admin",
    "Purchasing Staff",
    "Staff Purchasing",
    "Manager Operational",
    "Supervisor Operation & Maintenance",
    "Foreman Produksi",
    "Foreman Warehouse",
    "Warehouse Staff",
    "Driver Warehouse",
    "IT, Market Research and Media Development Supervisor",
    "IT Staff",
];

// Sample Karyawan (1-2 orang per departemen, nama Indonesia realistis)
const EMPLOYEES_SEED_DATA = [
    // 1. CEO
    {
        deptName: "CEO",
        positionName: "Chief Executive Officer",
        name: "Ir. Bambang Trihatmojo",
        email: "bambang.ceo@wig.co.id",
        employeeId: "WIG-0010",
    },
    // 2. Direksi
    {
        deptName: "Direksi",
        positionName: "General Manager",
        name: "Drs. Hendra Gunawan",
        email: "hendra.gm@wig.co.id",
        employeeId: "WIG-0011",
    },
    {
        deptName: "Direksi",
        positionName: "Deputy General Manager",
        name: "Ratna Sari Dewi, M.M.",
        email: "ratna.dgm@wig.co.id",
        employeeId: "WIG-0012",
    },
    // 3. Finance, Accounting, Invesment & Tax
    {
        deptName: "Finance, Accounting, Invesment & Tax",
        positionName: "Manager of Finance, Accounting, Tax & Invesment",
        name: "Agus Pratama, S.E., Ak.",
        email: "agus.pratama@wig.co.id",
        employeeId: "WIG-0013",
    },
    {
        deptName: "Finance, Accounting, Invesment & Tax",
        positionName: "Finance, Accounting & Tax Staff",
        name: "Siti Nurhaliza, S.Ak.",
        email: "siti.nurhaliza@wig.co.id",
        employeeId: "WIG-0014",
    },
    // 4. HRGA
    {
        deptName: "HRGA",
        positionName: "Staff Human Resources",
        name: "Maya Kartika, S.Psi.",
        email: "maya.kartika@wig.co.id",
        employeeId: "WIG-0015",
    },
    {
        deptName: "HRGA",
        positionName: "General Affair Staff",
        name: "Rizky Firmansyah",
        email: "rizky.firmansyah@wig.co.id",
        employeeId: "WIG-0016",
    },
    // 5. Creative Marketing
    {
        deptName: "Creative Marketing",
        positionName: "Brand Owner Everyoung",
        name: "Jessica Vania",
        email: "jessica.vania@wig.co.id",
        employeeId: "WIG-0017",
    },
    {
        deptName: "Creative Marketing",
        positionName: "Content Creator Staff",
        name: "Dimas Anggara",
        email: "dimas.anggara@wig.co.id",
        employeeId: "WIG-0018",
    },
    // 6. SGA
    {
        deptName: "SGA",
        positionName: "Staff (Umum)",
        name: "Surya Kencana",
        email: "surya.kencana@wig.co.id",
        employeeId: "WIG-0019",
    },
    {
        deptName: "SGA",
        positionName: "Staff (Umum)",
        name: "Budi Haryanto",
        email: "budi.haryanto@wig.co.id",
        employeeId: "WIG-0020",
    },
    // 7. Packaging Development
    {
        deptName: "Packaging Development",
        positionName: "Supervisor of Packaging Development",
        name: "Doni Setiawan, S.T.",
        email: "doni.setiawan@wig.co.id",
        employeeId: "WIG-0021",
    },
    {
        deptName: "Packaging Development",
        positionName: "Packaging Develompment Staff",
        name: "Anisa Rahma",
        email: "anisa.rahma@wig.co.id",
        employeeId: "WIG-0022",
    },
    // 8. Research & Development
    {
        deptName: "Research & Development",
        positionName: "Quality & RnD Supervisor",
        name: "Dr. apt. Farhan Ramadhan",
        email: "farhan.ramadhan@wig.co.id",
        employeeId: "WIG-0023",
    },
    {
        deptName: "Research & Development",
        positionName: "Research & Development Specialist",
        name: "Citra Lestari, S.Farm.",
        email: "citra.lestari@wig.co.id",
        employeeId: "WIG-0024",
    },
    // 9. Supply Chain Management
    {
        deptName: "Supply Chain Management",
        positionName: "Supply Planner",
        name: "Bayu Wicaksono",
        email: "bayu.wicaksono@wig.co.id",
        employeeId: "WIG-0025",
    },
    {
        deptName: "Supply Chain Management",
        positionName: "Purchasing Staff",
        name: "Nadia Putri",
        email: "nadia.putri@wig.co.id",
        employeeId: "WIG-0026",
    },
    // 10. Operation and Maintenance
    {
        deptName: "Operation and Maintenance",
        positionName: "Manager Operational",
        name: "Ir. Wahyu Hidayat",
        email: "wahyu.hidayat@wig.co.id",
        employeeId: "WIG-0027",
    },
    {
        deptName: "Operation and Maintenance",
        positionName: "Foreman Produksi",
        name: "Eko Prasetyo",
        email: "eko.prasetyo@wig.co.id",
        employeeId: "WIG-0028",
    },
    // 11. IT, Market Research and Media Development Supervisor
    {
        deptName: "IT, Market Research and Media Development Supervisor",
        positionName: "IT, Market Research and Media Development Supervisor",
        name: "Aditya Pratama, S.Kom.",
        email: "aditya.pratama@wig.co.id",
        employeeId: "WIG-0029",
    },
    {
        deptName: "IT, Market Research and Media Development Supervisor",
        positionName: "IT Staff",
        name: "Gilang Ramadhan",
        email: "gilang.ramadhan@wig.co.id",
        employeeId: "WIG-0030",
    },
];

export async function seedCompanyStructure() {
    console.log("🚀 Starting Company Structure & Clean Seeding...");
    const defaultPasswordHash = await bcrypt.hash("123", 12);

    // 1. Pastikan RBAC Roles & Permissions Terpasang
    await ensureRbac(prisma);

    // 2. Bersihkan seluruh departemen, divisi, posisi, dan karyawan lama yang tidak ada di tabel resmi
    console.log("🧹 Purging obsolete legacy departments, divisions, positions, and dummy employees...");
    const validDeptNames = DEPARTMENTS_DATA.map((d) => d.name);
    const validDivNames = DIVISIONS_DATA.map((d) => d.name);
    const validPosNames = POSITIONS_DATA;
    const validEmpIds = EMPLOYEES_SEED_DATA.map((e) => e.employeeId);

    // Temukan karyawan yang tidak ada di daftar valid
    const obsoleteEmployees = await prisma.employee.findMany({
        where: { employeeId: { notIn: validEmpIds } },
        select: { id: true, employeeId: true },
    });

    for (const emp of obsoleteEmployees) {
        await prisma.attendanceRecord.deleteMany({ where: { employeeId: emp.employeeId } }).catch(() => {});
        await prisma.leaveRequest.deleteMany({ where: { employeeId: emp.employeeId } }).catch(() => {});
        await prisma.overtimeRequest.deleteMany({ where: { employeeId: emp.employeeId } }).catch(() => {});
        await prisma.visitReport.deleteMany({ where: { employeeId: emp.employeeId } }).catch(() => {});
        await prisma.todoItem.deleteMany({ where: { employeeId: emp.employeeId } }).catch(() => {});
        await prisma.attendanceCorrection.deleteMany({ where: { employeeId: emp.employeeId } }).catch(() => {});
        await prisma.employeeBirthdayPreparation.deleteMany({ where: { employeeId: emp.employeeId } }).catch(() => {});
        await prisma.payslipRecord.deleteMany({ where: { employeeId: emp.employeeId } }).catch(() => {});
        await prisma.letterRequest.deleteMany({ where: { employeeId: emp.employeeId } }).catch(() => {});
        await prisma.employeeDocument.deleteMany({ where: { employeeId: emp.employeeId } }).catch(() => {});
        await prisma.assetTicket.deleteMany({ where: { employeeId: emp.employeeId } }).catch(() => {});
        await prisma.userAccount.deleteMany({ where: { employeeId: emp.employeeId } }).catch(() => {});
        await prisma.employee.delete({ where: { id: emp.id } }).catch(() => {});
    }

    // Bersihkan user accounts lain yang tidak valid (kecuali WIG001 dan WIG002)
    await prisma.userAccount.deleteMany({
        where: {
            username: {
                notIn: ["WIG001", "WIG002", ...validEmpIds],
            },
        },
    });

    // Bersihkan GreenMeetingAttendance & GreenMeetingUnit untuk departemen yang tidak valid
    const obsoleteDepts = await prisma.department.findMany({
        where: { name: { notIn: validDeptNames } },
        select: { id: true },
    });
    const obsoleteDeptIds = obsoleteDepts.map((d) => d.id);

    if (obsoleteDeptIds.length > 0) {
        const obsoleteUnits = await prisma.greenMeetingUnit.findMany({
            where: { departmentId: { in: obsoleteDeptIds } },
            select: { id: true },
        });
        const obsoleteUnitIds = obsoleteUnits.map((u) => u.id);

        if (obsoleteUnitIds.length > 0) {
            await prisma.greenMeetingAttendance.deleteMany({
                where: { unitId: { in: obsoleteUnitIds } },
            });
            await prisma.greenMeetingUnit.deleteMany({
                where: { id: { in: obsoleteUnitIds } },
            });
        }

        await prisma.department.deleteMany({
            where: { id: { in: obsoleteDeptIds } },
        });
    }

    // Bersihkan divisi yang tidak valid
    await prisma.division.deleteMany({
        where: { name: { notIn: validDivNames } },
    });

    // Bersihkan posisi yang tidak valid
    await prisma.position.deleteMany({
        where: { name: { notIn: validPosNames } },
    });

    // 3. Pastikan Akun Utama WIG001 & WIG002 Aktif dengan Password "123"
    console.log("👑 Setting up WIG001 (Admin HR) & WIG002 (Admin GA) with password '123'...");
    const superUser = await prisma.userAccount.upsert({
        where: { username: "WIG001" },
        update: {
            displayName: "Admin HR",
            email: "hr@wig.co.id",
            passwordHash: defaultPasswordHash,
            isActive: true,
        },
        create: {
            username: "WIG001",
            displayName: "Admin HR",
            email: "hr@wig.co.id",
            passwordHash: defaultPasswordHash,
            isActive: true,
        },
    });
    await assignOnlyRole(prisma, superUser.id, "SUPER_ADMIN");

    const gaUser = await prisma.userAccount.upsert({
        where: { username: "WIG002" },
        update: {
            displayName: "Admin GA",
            email: "ga@wig.co.id",
            passwordHash: defaultPasswordHash,
            isActive: true,
        },
        create: {
            username: "WIG002",
            displayName: "Admin GA",
            email: "ga@wig.co.id",
            passwordHash: defaultPasswordHash,
            isActive: true,
        },
    });
    await assignOnlyRole(prisma, gaUser.id, "GA_ADMIN");

    // 4. Seeding Seluruh Divisi
    console.log("🏢 Seeding 7 Divisions...");
    const divisionMap = new Map<string, string>(); // name -> id
    for (const div of DIVISIONS_DATA) {
        const d = await prisma.division.upsert({
            where: { name: div.name },
            update: { isActive: true },
            create: { name: div.name, isActive: true },
        });
        divisionMap.set(d.name, d.id);
    }

    // 5. Seeding Seluruh Departemen
    console.log("📂 Seeding 11 Departments...");
    const departmentMap = new Map<string, { id: string; divisionId: string }>(); // name -> {id, divisionId}
    for (const dept of DEPARTMENTS_DATA) {
        const divId = divisionMap.get(dept.divisionName)!;
        const d = await prisma.department.upsert({
            where: { name: dept.name },
            update: {
                divisionId: divId,
                code: dept.code,
                isActive: true,
            },
            create: {
                name: dept.name,
                divisionId: divId,
                code: dept.code,
                isActive: true,
            },
        });
        departmentMap.set(d.name, { id: d.id, divisionId: divId });
    }

    // 6. Seeding Seluruh Jabatan (Positions)
    console.log("💼 Seeding 39 Positions...");
    const positionMap = new Map<string, string>(); // name -> id
    for (const posName of POSITIONS_DATA) {
        const p = await prisma.position.upsert({
            where: { name: posName },
            update: { isActive: true },
            create: { name: posName, isActive: true },
        });
        positionMap.set(p.name, p.id);
    }

    // 7. Seeding Karyawan & Akun Pengguna (Password: 123)
    console.log("👥 Seeding Employees & User Accounts (1-2 orang per departemen)...");
    for (const emp of EMPLOYEES_SEED_DATA) {
        const deptInfo = departmentMap.get(emp.deptName);
        if (!deptInfo) continue;
        const posId = positionMap.get(emp.positionName) || Array.from(positionMap.values())[0];

        // Upsert Employee
        const employeeRecord = await prisma.employee.upsert({
            where: { employeeId: emp.employeeId },
            update: {
                name: emp.name,
                email: emp.email,
                departmentId: deptInfo.id,
                divisionId: deptInfo.divisionId,
                positionId: posId,
                isActive: true,
            },
            create: {
                employeeId: emp.employeeId,
                name: emp.name,
                email: emp.email,
                phone: "08123456789",
                departmentId: deptInfo.id,
                divisionId: deptInfo.divisionId,
                positionId: posId,
                joinDate: new Date("2024-01-01"),
                totalLeave: 12,
                usedLeave: 0,
                isActive: true,
                bypassLocation: true,
                privateProfile: {
                    create: {
                        birthDate: new Date("1995-05-15"),
                        birthPlace: "Jakarta",
                    },
                },
            },
        });

        // Upsert PrivateProfile for birthDate
        await prisma.employeePrivateProfile.upsert({
            where: { employeeId: emp.employeeId },
            update: { birthDate: new Date("1995-05-15"), birthPlace: "Jakarta" },
            create: { employeeId: emp.employeeId, birthDate: new Date("1995-05-15"), birthPlace: "Jakarta" },
        });

        // Upsert UserAccount
        const user = await prisma.userAccount.upsert({
            where: { username: emp.employeeId },
            update: {
                email: emp.email,
                displayName: emp.name,
                employeeId: emp.employeeId,
                passwordHash: defaultPasswordHash,
                isActive: true,
            },
            create: {
                username: emp.employeeId,
                email: emp.email,
                displayName: emp.name,
                employeeId: emp.employeeId,
                passwordHash: defaultPasswordHash,
                isActive: true,
            },
        });

        await assignOnlyRole(prisma, user.id, "EMPLOYEE_USER");
    }

    // 8. Seeding Modul Green Meeting (Departemen Terdaftar, Notulen Kosong)
    console.log("🌱 Setting up Green Meeting configuration & clean state...");
    await prisma.greenMeetingConfig.upsert({
        where: { id: "default" },
        update: {
            picRole: "GA",
            defaultRoom: "Ruang Rapat Utama Lt. 2",
            defaultTime: "08:30",
            maxDeadlineExtensions: 3,
            offDaysWeekly: "0,6",
        },
        create: {
            id: "default",
            picRole: "GA",
            defaultRoom: "Ruang Rapat Utama Lt. 2",
            defaultTime: "08:30",
            maxDeadlineExtensions: 3,
            offDaysWeekly: "0,6",
            updatedBy: "System Seeder",
        },
    });

    // Daftarkan seluruh 11 Departemen ke GreenMeetingUnit
    for (const [, dept] of departmentMap.entries()) {
        await prisma.greenMeetingUnit.upsert({
            where: { departmentId: dept.id },
            update: { isActiveInMeeting: true, isDefaultRequired: true },
            create: {
                departmentId: dept.id,
                isActiveInMeeting: true,
                isDefaultRequired: true,
            },
        });
    }

    // "untuk notulen green meeting kosongan aja gausa ada data apapun."
    console.log("🧹 Clearing all Green Meeting sample notes & action items...");
    await prisma.greenMeetingNoteTarget.deleteMany({});
    await prisma.greenMeetingDeadlineHistory.deleteMany({});
    await prisma.greenMeetingNote.deleteMany({});

    console.log("✅ Seeding completed successfully!");
    console.log("─────────────────────────────────────────────────────────────────");
    console.log("🔑 Kredensial Login Testing (Semua Password: 123):");
    console.log("   • Admin HR : Username: WIG001    | Password: 123 | Role: SUPER_ADMIN");
    console.log("   • Admin GA : Username: WIG002    | Password: 123 | Role: GA_ADMIN");
    console.log(`   • Karyawan : Total ${EMPLOYEES_SEED_DATA.length} Akun (Username: WIG-0010 s/d WIG-0030 | Password: 123)`);
    console.log("   • Notulen Green Meeting : Kosong Bersih (Siap Diuji dari Awal)");
    console.log("─────────────────────────────────────────────────────────────────");
}

async function main() {
    try {
        await seedCompanyStructure();
    } catch (e) {
        console.error("❌ Seeding failed:", e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    void main();
}
