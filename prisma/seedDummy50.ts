import { PrismaClient, EmploymentType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assignOnlyRole, ensureRbac } from "./seedRbac";

const prisma = new PrismaClient();

const DUMMY_NAMES = [
    { name: "Budi Santoso", gender: "Laki-Laki" },
    { name: "Siti Rahmawati", gender: "Perempuan" },
    { name: "Ahmad Fauzi", gender: "Laki-Laki" },
    { name: "Dewi Lestari", gender: "Perempuan" },
    { name: "Rizky Pratama", gender: "Laki-Laki" },
    { name: "Nurul Hidayah", gender: "Perempuan" },
    { name: "Fajar Nugraha", gender: "Laki-Laki" },
    { name: "Tri Wahyuni", gender: "Perempuan" },
    { name: "Hendra Setiawan", gender: "Laki-Laki" },
    { name: "Putri Anggraini", gender: "Perempuan" },
    { name: "Agus Prasetyo", gender: "Laki-Laki" },
    { name: "Maya Sari", gender: "Perempuan" },
    { name: "Bayu Wicaksono", gender: "Laki-Laki" },
    { name: "Indah Permata", gender: "Perempuan" },
    { name: "Dimas Saputra", gender: "Laki-Laki" },
    { name: "Rina Melati", gender: "Perempuan" },
    { name: "Eko Purnomo", gender: "Laki-Laki" },
    { name: "Dian Kusuma", gender: "Perempuan" },
    { name: "Aditya Pratama", gender: "Laki-Laki" },
    { name: "Anisa Rahma", gender: "Perempuan" },
    { name: "Yusuf Maulana", gender: "Laki-Laki" },
    { name: "Sri Wahyuningrum", gender: "Perempuan" },
    { name: "Bambang Pamungkas", gender: "Laki-Laki" },
    { name: "Lestari Wulandari", gender: "Perempuan" },
    { name: "Fikri Ramadhan", gender: "Laki-Laki" },
    { name: "Nadia Safitri", gender: "Perempuan" },
    { name: "Ilham Akbar", gender: "Laki-Laki" },
    { name: "Tari Handayani", gender: "Perempuan" },
    { name: "Wahyu Hidayat", gender: "Laki-Laki" },
    { name: "Ratna Juwita", gender: "Perempuan" },
    { name: "Aris Munandar", gender: "Laki-Laki" },
    { name: "Citra Kirana", gender: "Perempuan" },
    { name: "Gilang Ramadhan", gender: "Laki-Laki" },
    { name: "Fitriani Utami", gender: "Perempuan" },
    { name: "Danang Wijaya", gender: "Laki-Laki" },
    { name: "Widya Astuti", gender: "Perempuan" },
    { name: "Reza Pahlevi", gender: "Laki-Laki" },
    { name: "Novita Sari", gender: "Perempuan" },
    { name: "Satria Bagus", gender: "Laki-Laki" },
    { name: "Mega Pratiwi", gender: "Perempuan" },
    { name: "Bagus Kurniawan", gender: "Laki-Laki" },
    { name: "Ayu Lestari", gender: "Perempuan" },
    { name: "Rian Hidayat", gender: "Laki-Laki" },
    { name: "Kartika Dewi", gender: "Perempuan" },
    { name: "Hadi Pranoto", gender: "Laki-Laki" },
    { name: "Sari Indah", gender: "Perempuan" },
    { name: "Joko Susilo", gender: "Laki-Laki" },
    { name: "Dwi Astuti", gender: "Perempuan" },
    { name: "Arif Rahman", gender: "Laki-Laki" },
    { name: "Yuliana Safitri", gender: "Perempuan" },
];

async function main() {
    console.log("=== SEEDING 50 DUMMY EMPLOYEES (MODEL DAFFA / PASSWORD: 123) ===");
    await ensureRbac(prisma);

    // 1. Setup Divisions
    const divHRGA = await prisma.division.upsert({ where: { name: "HRGA & IT" }, update: {}, create: { name: "HRGA & IT", isActive: true } });
    const divOps = await prisma.division.upsert({ where: { name: "Operasional" }, update: {}, create: { name: "Operasional", isActive: true } });
    const divFin = await prisma.division.upsert({ where: { name: "Keuangan & Akuntansi" }, update: {}, create: { name: "Keuangan & Akuntansi", isActive: true } });
    const divMkt = await prisma.division.upsert({ where: { name: "Pemasaran & Bisnis" }, update: {}, create: { name: "Pemasaran & Bisnis", isActive: true } });

    // 2. Setup Departments
    const deptIT = await prisma.department.upsert({ where: { name: "Teknologi Informasi" }, update: { divisionId: divHRGA.id }, create: { name: "Teknologi Informasi", divisionId: divHRGA.id, isActive: true } });
    const deptHR = await prisma.department.upsert({ where: { name: "Sumber Daya Manusia" }, update: { divisionId: divHRGA.id }, create: { name: "Sumber Daya Manusia", divisionId: divHRGA.id, isActive: true } });
    const deptGA = await prisma.department.upsert({ where: { name: "General Affairs" }, update: { divisionId: divHRGA.id }, create: { name: "General Affairs", divisionId: divHRGA.id, isActive: true } });
    const deptOps = await prisma.department.upsert({ where: { name: "Logistik & Gudang" }, update: { divisionId: divOps.id }, create: { name: "Logistik & Gudang", divisionId: divOps.id, isActive: true } });
    const deptProd = await prisma.department.upsert({ where: { name: "Produksi" }, update: { divisionId: divOps.id }, create: { name: "Produksi", divisionId: divOps.id, isActive: true } });
    const deptFin = await prisma.department.upsert({ where: { name: "Finance & Tax" }, update: { divisionId: divFin.id }, create: { name: "Finance & Tax", divisionId: divFin.id, isActive: true } });
    const deptMkt = await prisma.department.upsert({ where: { name: "Sales & Marketing" }, update: { divisionId: divMkt.id }, create: { name: "Sales & Marketing", divisionId: divMkt.id, isActive: true } });

    const departmentsList = [
        { dept: deptIT, div: divHRGA },
        { dept: deptHR, div: divHRGA },
        { dept: deptGA, div: divHRGA },
        { dept: deptOps, div: divOps },
        { dept: deptProd, div: divOps },
        { dept: deptFin, div: divFin },
        { dept: deptMkt, div: divMkt },
    ];

    // 3. Setup Positions
    const posManager = await prisma.position.upsert({ where: { name: "Manager" }, update: {}, create: { name: "Manager", isActive: true } });
    const posSpv = await prisma.position.upsert({ where: { name: "Supervisor" }, update: {}, create: { name: "Supervisor", isActive: true } });
    const posSenior = await prisma.position.upsert({ where: { name: "Senior Staff" }, update: {}, create: { name: "Senior Staff", isActive: true } });
    const posStaff = await prisma.position.upsert({ where: { name: "Staff" }, update: {}, create: { name: "Staff", isActive: true } });
    const posJunior = await prisma.position.upsert({ where: { name: "Junior Staff" }, update: {}, create: { name: "Junior Staff", isActive: true } });
    const posIntern = await prisma.position.upsert({ where: { name: "Intern" }, update: {}, create: { name: "Intern", isActive: true } });

    const positionsList = [posManager, posSpv, posSenior, posStaff, posStaff, posJunior, posIntern];

    // 4. Precompute common password hash for speed
    const defaultPassword = "123";
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    let createdCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < DUMMY_NAMES.length; i++) {
        const item = DUMMY_NAMES[i];
        const num = 101 + i; // 101 .. 150
        const employeeId = `WIG-EMP-${num}`;
        const email = `karyawan${num}@wig.co.id`;
        const phone = `0812${String(34560000 + num)}`;

        const deptChoice = departmentsList[i % departmentsList.length];
        const posChoice = positionsList[i % positionsList.length];

        // Status: 5 out of 50 are inactive (num: 110, 120, 130, 140, 150)
        const isActive = num % 10 !== 0;

        // Employment types: PERMANENT (majority), CONTRACT, PROBATION, INTERN
        let employmentType: EmploymentType = EmploymentType.PERMANENT;
        if (i % 7 === 0) employmentType = EmploymentType.CONTRACT;
        else if (i % 11 === 0) employmentType = EmploymentType.PROBATION;
        else if (i % 17 === 0) employmentType = EmploymentType.INTERN;

        const joinDate = new Date(2023, (i * 2) % 12, (i % 25) + 1);

        // Upsert Employee
        const emp = await prisma.employee.upsert({
            where: { employeeId },
            update: {
                name: item.name,
                email,
                phone,
                gender: item.gender,
                departmentId: deptChoice.dept.id,
                divisionId: deptChoice.div.id,
                positionId: posChoice.id,
                isActive,
                employmentType,
                bypassLocation: i % 5 === 0, // some can bypass location for testing
            },
            create: {
                employeeId,
                name: item.name,
                email,
                phone,
                gender: item.gender,
                departmentId: deptChoice.dept.id,
                divisionId: deptChoice.div.id,
                positionId: posChoice.id,
                joinDate,
                totalLeave: 12,
                usedLeave: i % 4,
                isActive,
                employmentType,
                bypassLocation: i % 5 === 0,
            },
        });

        // Upsert UserAccount (allows login with employeeId or email / password: 123)
        let user = await prisma.userAccount.findFirst({
            where: {
                OR: [
                    { username: email },
                    { username: employeeId },
                    { email },
                ],
            },
        });

        if (user) {
            user = await prisma.userAccount.update({
                where: { id: user.id },
                data: {
                    username: employeeId,
                    email,
                    displayName: emp.name,
                    employeeId: emp.employeeId,
                    passwordHash,
                    isActive,
                    sessionVersion: { increment: 1 },
                },
            });
            updatedCount++;
        } else {
            user = await prisma.userAccount.create({
                data: {
                    username: employeeId,
                    email,
                    displayName: emp.name,
                    employeeId: emp.employeeId,
                    passwordHash,
                    isActive,
                },
            });
            createdCount++;
        }

        await assignOnlyRole(prisma, user.id, "EMPLOYEE_USER");
    }

    console.log(`[SEED SUCCESS] 50 Karyawan dummy berhasil diproses:`);
    console.log(`- Created: ${createdCount}`);
    console.log(`- Updated: ${updatedCount}`);
    console.log(`- Total Sample Range: WIG-EMP-101 s/d WIG-EMP-150`);
    console.log(`- Semua akun aktif dapat login menggunakan Employee ID atau Email dengan Password: "${defaultPassword}"`);
    console.log(`- Role: EMPLOYEE_USER (sama persis dengan Karyawan Daffa)`);
}

main()
    .catch((error) => {
        console.error("[SEED ERROR]:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
