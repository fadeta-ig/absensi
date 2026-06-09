import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import logger from "@/lib/logger";
import { calculateAllBpjs } from "@/lib/services/bpjsService";
import { calculateMonthlyPph21, type Pph21Input } from "@/lib/services/pph21Service";

export async function GET(req: Request) {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        logger.error("[Cron Payroll] CRON_SECRET not configured.");
        return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
        logger.warn("[Cron Payroll] Unauthorized generate-payroll attempt.");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const url = new URL(req.url);
        const periodParam = url.searchParams.get("period"); // Optional e.g. "2024-01"
        
        const now = new Date();
        // Generate for previous month if not specified
        const targetDate = periodParam ? new Date(periodParam + "-01T00:00:00Z") : new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const periodStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;

        logger.info(`[Cron Payroll] Generating payroll for period: ${periodStr}`);

        const employees = await prisma.employee.findMany({
            where: { isActive: true },
            include: { payrollComponents: { include: { component: true } } }
        });

        let generatedCount = 0;
        const failedEmployees: string[] = [];

        for (const emp of employees) {
            try {
                // Skip if payslip already exists
                const existing = await prisma.payslipRecord.findUnique({
                    where: { employeeId_period: { employeeId: emp.employeeId, period: periodStr } }
                });
                if (existing) continue;

                // 1. Gather Allowances & Deductions
                const items: any[] = [];
                let totalAllowance = 0;
                let totalDeduction = 0;

                for (const pc of emp.payrollComponents) {
                    items.push({
                        type: pc.component.type === "earning" ? "ALLOWANCE" : "DEDUCTION",
                        name: pc.component.name,
                        amount: pc.amount
                    });
                    if (pc.component.type === "earning") totalAllowance += pc.amount;
                    else totalDeduction += pc.amount;
                }

                // 2. Overtime
                const overtimes = await prisma.overtimeRequest.findMany({
                    where: {
                        employeeId: emp.employeeId,
                        status: "approved",
                        date: {
                            gte: new Date(targetDate.getFullYear(), targetDate.getMonth(), 1),
                            lt: new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1)
                        }
                    }
                });
                const totalOvertime = overtimes.reduce((sum, o) => sum + o.overtimePay, 0);

                const grossMonthlyIncome = emp.basicSalary + totalAllowance + totalOvertime;

                // 3. BPJS Calculation
                const bpjs = calculateAllBpjs({ grossMonthlyIncome, jkkRiskLevel: 1 }); // Default to Level 1
                items.push({ type: "DEDUCTION", name: "BPJS Kesehatan (1%)", amount: bpjs.kesehatan.contribution.employee });
                items.push({ type: "DEDUCTION", name: "BPJS JHT (2%)", amount: bpjs.ketenagakerjaan.jht.contribution.employee });
                items.push({ type: "DEDUCTION", name: "BPJS JP (1%)", amount: bpjs.ketenagakerjaan.jp.contribution.employee });
                
                totalDeduction += bpjs.kesehatan.contribution.employee + bpjs.ketenagakerjaan.totalEmployee;

                // 4. PPh21 Calculation
                const pph21Input: Pph21Input = {
                    grossMonthlyIncome,
                    ptkpStatus: "TK/0", // Assuming default
                    month: targetDate.getMonth() + 1
                };
                
                const pph21Result = calculateMonthlyPph21(pph21Input);
                const pph21Month = pph21Result.pph21Monthly;

                if (pph21Month > 0) {
                    items.push({ type: "DEDUCTION", name: "PPh21", amount: pph21Month });
                    totalDeduction += pph21Month;
                }

                // 5. Final Calculation
                const netSalary = grossMonthlyIncome - totalDeduction;

                await prisma.payslipRecord.create({
                    data: {
                        employeeId: emp.employeeId,
                        period: periodStr,
                        basicSalary: emp.basicSalary,
                        overtime: totalOvertime,
                        netSalary: netSalary,
                        issuedDate: new Date(),
                        notes: "Auto-generated by system",
                        items: {
                            create: items
                        }
                    }
                });
                generatedCount++;
            } catch (err) {
                logger.error(`[Cron Payroll] Error generating for employee ${emp.employeeId}`, { err });
                failedEmployees.push(emp.employeeId);
            }
        }

        logger.info(`[Cron Payroll] Generated ${generatedCount} payslips. Failed: ${failedEmployees.length}`);

        await prisma.auditLog.create({
            data: {
                action: "GENERATE_PAYROLL",
                entity: "PayslipRecord",
                performedBy: "SYSTEM_CRON",
                details: JSON.stringify({ period: periodStr, generated: generatedCount, failed: failedEmployees }),
            }
        });

        return NextResponse.json({
            success: true,
            period: periodStr,
            generatedCount,
            failedEmployees
        });

    } catch (error) {
        logger.error("[Cron Payroll] Failed to generate payroll", { error });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
