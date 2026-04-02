import { prisma } from "../prisma";
import { PayslipRecord } from "@/types";
import logger from "@/lib/logger";

const d2s = (d: Date | string | null | undefined): string => {
    if (!d) return "";
    return d instanceof Date ? d.toISOString().split("T")[0] : String(d);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPayslipRecord(row: any): PayslipRecord {
    return {
        id: row.id,
        employeeId: row.employeeId,
        period: row.period,
        basicSalary: row.basicSalary,
        allowances: row.allowances ? JSON.parse(row.allowances as string) : [],
        deductions: row.deductions ? JSON.parse(row.deductions as string) : [],
        overtime: row.overtime,
        netSalary: row.netSalary,
        issuedDate: d2s(row.issuedDate),
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
