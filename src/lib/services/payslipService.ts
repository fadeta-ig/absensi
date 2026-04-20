import { prisma } from "../prisma";
import { PayslipRecord } from "@/types";
import logger from "@/lib/logger";
import { toDateString } from "@/lib/utils";

// ─── Date helpers imported from @/lib/utils ────────────────────

function toPayslipRecord(row: {
    id: string;
    employeeId: string;
    period: string;
    basicSalary: number;
    allowances: string;
    deductions: string;
    overtime: number;
    netSalary: number;
    issuedDate: Date;
    notes: string | null;
}): PayslipRecord {
    return {
        id: row.id,
        employeeId: row.employeeId,
        period: row.period,
        basicSalary: row.basicSalary,
        allowances: row.allowances ? JSON.parse(row.allowances as string) : [],
        deductions: row.deductions ? JSON.parse(row.deductions as string) : [],
        overtime: row.overtime,
        netSalary: row.netSalary,
        issuedDate: toDateString(row.issuedDate),
        notes: row.notes ?? null,
    };
}

export async function getPayslips(employeeId?: string): Promise<PayslipRecord[]> {
    const rows = await prisma.payslipRecord.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: { issuedDate: "desc" },
    });
    return rows.map(toPayslipRecord);
}

export async function createPayslip(data: Omit<PayslipRecord, "id">): Promise<PayslipRecord> {
    logger.info("Payslip dibuat", { employeeId: data.employeeId, period: data.period, netSalary: data.netSalary });
    const row = await prisma.payslipRecord.create({
        data: {
            employeeId: data.employeeId,
            period: data.period,
            basicSalary: data.basicSalary,
            allowances: JSON.stringify(data.allowances),
            deductions: JSON.stringify(data.deductions),
            overtime: data.overtime,
            netSalary: data.netSalary,
            issuedDate: new Date(data.issuedDate),
            notes: data.notes,
        },
    });
    return toPayslipRecord(row);
}
