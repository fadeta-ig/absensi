import { prisma } from "../prisma";
import { PayslipRecord } from "@/types";
import logger from "@/lib/logger";
import { toDateString } from "@/lib/utils";

// ─── Date helpers imported from @/lib/utils ────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPayslipRecord(row: any): PayslipRecord {
    return {
        id: row.id,
        employeeId: row.employeeId,
        period: row.period,
        basicSalary: row.basicSalary,
        items: row.items || [],
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
        include: { items: true },
    });
    return rows.map(toPayslipRecord);
}

export async function createPayslip(data: Omit<PayslipRecord, "id" | "items"> & { allowances: { name: string; amount: number }[], deductions: { name: string; amount: number }[] }): Promise<PayslipRecord> {
    logger.info("Payslip dibuat", { employeeId: data.employeeId, period: data.period, netSalary: data.netSalary });

    const itemsPayload = [
        ...data.allowances.map(a => ({ type: "ALLOWANCE" as const, name: a.name, amount: a.amount })),
        ...data.deductions.map(d => ({ type: "DEDUCTION" as const, name: d.name, amount: d.amount }))
    ];

    const row = await prisma.payslipRecord.create({
        data: {
            employeeId: data.employeeId,
            period: data.period,
            basicSalary: data.basicSalary,
            overtime: data.overtime,
            netSalary: data.netSalary,
            issuedDate: new Date(data.issuedDate),
            notes: data.notes,
            items: {
                create: itemsPayload
            }
        },
        include: { items: true }
    });
    return toPayslipRecord(row);
}
