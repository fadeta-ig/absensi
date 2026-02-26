import { prisma } from "../prisma";
import { PayslipRecord } from "@/types";
import logger from "@/lib/logger";

export async function getPayslips(employeeId?: string): Promise<PayslipRecord[]> {
    const rows = await prisma.payslipRecord.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: { issuedDate: "desc" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => ({
        ...r,
        allowances: r.allowances ? JSON.parse(r.allowances as unknown as string) : [],
        deductions: r.deductions ? JSON.parse(r.deductions as unknown as string) : [],
    })) as PayslipRecord[];
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
            issuedDate: data.issuedDate,
            notes: data.notes,
        },
    });
    return {
        ...row,
        allowances: row.allowances ? JSON.parse(row.allowances as unknown as string) : [],
        deductions: row.deductions ? JSON.parse(row.deductions as unknown as string) : [],
    } as PayslipRecord;
}
