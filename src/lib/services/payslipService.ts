import { prisma } from "../prisma";
import { PayslipRecord } from "@/types";

export async function getPayslips(employeeId?: string): Promise<PayslipRecord[]> {
    const rows = await prisma.payslipRecord.findMany({
        where: employeeId ? { employeeId } : undefined,
        orderBy: { issuedDate: "desc" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => ({
        ...r,
        allowances: r.allowances as PayslipRecord["allowances"],
        deductions: r.deductions as PayslipRecord["deductions"],
    })) as PayslipRecord[];
}

export async function createPayslip(data: Omit<PayslipRecord, "id">): Promise<PayslipRecord> {
    const row = await prisma.payslipRecord.create({
        data: {
            employeeId: data.employeeId,
            period: data.period,
            basicSalary: data.basicSalary,
            allowances: JSON.parse(JSON.stringify(data.allowances)),
            deductions: JSON.parse(JSON.stringify(data.deductions)),
            overtime: data.overtime,
            netSalary: data.netSalary,
            issuedDate: data.issuedDate,
            notes: data.notes,
        },
    });
    return {
        ...row,
        allowances: row.allowances as PayslipRecord["allowances"],
        deductions: row.deductions as PayslipRecord["deductions"],
    } as PayslipRecord;
}
