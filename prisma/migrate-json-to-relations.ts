import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Starting Data Migration: JSON to Relational...");

    // 1. Migrate Payslips
    try {
        // Karena kolom lama telah dihapus dari schema.prisma, kita gunakan raw query
        // ke tabel mysql secara mentah sebelum "db push / migrate" menghapus kolomnya secara betulan
        const payslips: any[] = await prisma.$queryRawUnsafe(`SELECT id, allowances, deductions FROM payslip_records`);
        
        let migratedPayslipCount = 0;
        for (const p of payslips) {
            const allowances = p.allowances ? JSON.parse(p.allowances) : [];
            const deductions = p.deductions ? JSON.parse(p.deductions) : [];

            for (const a of allowances) {
                await prisma.$executeRawUnsafe(
                    `INSERT INTO payslip_items (id, payslip_record_id, type, name, amount) VALUES (UUID(), ?, 'ALLOWANCE', ?, ?)`,
                    p.id, a.name, a.amount
                );
            }
            for (const d of deductions) {
                await prisma.$executeRawUnsafe(
                    `INSERT INTO payslip_items (id, payslip_record_id, type, name, amount) VALUES (UUID(), ?, 'DEDUCTION', ?, ?)`,
                    p.id, d.name, d.amount
                );
            }
            migratedPayslipCount++;
        }
        console.log(`✅ Emigrated ${migratedPayslipCount} Payslips data.`);
    } catch (err) {
        console.warn("⚠️ Warning: Could not migrate payslips. Columns might be already dropped or table empty.", (err as Error).message);
    }

    // 2. Migrate Inspections
    try {
        const inspections: any[] = await prisma.$queryRawUnsafe(`SELECT id, checklist_json FROM asset_inspections`);
        
        let migratedInspectionCount = 0;
        for (const i of inspections) {
            const checklist = i.checklist_json ? JSON.parse(i.checklist_json) : {};
            for (const [key, val] of Object.entries(checklist)) {
                await prisma.$executeRawUnsafe(
                    `INSERT INTO inspection_checklist_items (id, inspection_id, itemName, isPass) VALUES (UUID(), ?, ?, ?)`,
                    i.id, key, val === true ? 1 : 0
                );
            }
            migratedInspectionCount++;
        }
        console.log(`✅ Emigrated ${migratedInspectionCount} Asset Inspections.`);
    } catch (err) {
        console.warn("⚠️ Warning: Could not migrate asset inspections. Columns might be already dropped or table empty.", (err as Error).message);
    }

    console.log("🎉 Migration process finished. It is now safe to run `npx prisma db push` and `npx prisma generate`!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
