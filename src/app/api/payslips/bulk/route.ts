import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import logger from "@/lib/logger";

// ─── Schema ───────────────────────────────────────────────────────────────────

const bulkPayslipSchema = z.object({
    period:      z.string().regex(/^\d{4}-\d{2}$/, "Format periode harus YYYY-MM"),
    employeeIds: z.array(z.string().min(1)).min(1, "Minimal 1 karyawan harus dipilih"),
});

// ─── POST: Generate payslip massal ────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const body = await request.json() as unknown;
        const parsed = bulkPayslipSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: "Data tidak valid", details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { period, employeeIds } = parsed.data;

        // Check already existing payslips for this period
        const existingPayslips = await prisma.payslipRecord.findMany({
            where: { period, employeeId: { in: employeeIds } },
            select: { employeeId: true },
        });
        const existingSet = new Set(existingPayslips.map((p) => p.employeeId));

        // Filter only employees that don't have payslips yet
        const toProcess = employeeIds.filter((id) => !existingSet.has(id));

        if (toProcess.length === 0) {
            return NextResponse.json({
                created: 0,
                skipped: existingPayslips.length,
                results: [],
                message: "Semua karyawan yang dipilih sudah memiliki payslip untuk periode ini.",
            });
        }

        // Fetch employee data with payroll components
        const employees = await prisma.employee.findMany({
            where: { employeeId: { in: toProcess }, isActive: true },
            include: {
                payrollComponents: {
                    include: { component: true },
                },
            },
        });

        // Fetch approved overtime for period
        const periodStart = new Date(`${period}-01T00:00:00`);
        const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0, 23, 59, 59);
        const overtimeRequests = await prisma.overtimeRequest.findMany({
            where: {
                employeeId: { in: toProcess },
                status: "approved",
                date: { gte: periodStart, lte: periodEnd },
            },
        });

        // Build overtime map: employeeId → total overtimePay
        const overtimeMap = new Map<string, number>();
        for (const ot of overtimeRequests) {
            const current = overtimeMap.get(ot.employeeId) ?? 0;
            overtimeMap.set(ot.employeeId, current + (ot.overtimePay ?? 0));
        }

        // Fetch master components for fallback
        const masterComponents = await prisma.payrollComponent.findMany({
            where: { isActive: true },
        });

        const createdPayslips: { employeeId: string; name: string; netSalary: number }[] = [];

        for (const emp of employees) {
            // Determine allowances and deductions
            let allowances: { name: string; amount: number }[];
            let deductions: { name: string; amount: number }[];

            if (emp.payrollComponents.length > 0) {
                allowances = emp.payrollComponents
                    .filter((pc) => pc.component.type === "earning")
                    .map((pc) => ({ name: pc.component.name, amount: pc.amount }));
                deductions = emp.payrollComponents
                    .filter((pc) => pc.component.type === "deduction")
                    .map((pc) => ({ name: pc.component.name, amount: pc.amount }));
            } else {
                allowances = masterComponents
                    .filter((c) => c.type === "earning")
                    .map((c) => ({ name: c.name, amount: c.defaultAmount }));
                deductions = masterComponents
                    .filter((c) => c.type === "deduction")
                    .map((c) => ({ name: c.name, amount: c.defaultAmount }));
            }

            const totalAllowances = allowances.reduce((sum, a) => sum + a.amount, 0);
            const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
            const overtime = overtimeMap.get(emp.employeeId) ?? 0;
            const netSalary = emp.basicSalary + totalAllowances + overtime - totalDeductions;

            const items = [
                ...allowances.filter((a) => a.amount > 0).map((a) => ({ type: "ALLOWANCE" as const, name: a.name, amount: a.amount })),
                ...deductions.filter((d) => d.amount > 0).map((d) => ({ type: "DEDUCTION" as const, name: d.name, amount: d.amount })),
            ];

            await prisma.payslipRecord.create({
                data: {
                    employeeId: emp.employeeId,
                    period,
                    basicSalary: emp.basicSalary,
                    overtime,
                    netSalary,
                    issuedDate: new Date(),
                    items: { create: items },
                },
            });

            createdPayslips.push({
                employeeId: emp.employeeId,
                name: emp.name,
                netSalary,
            });
        }

        logger.info("Bulk payslip generated", {
            period,
            created: createdPayslips.length,
            skipped: existingPayslips.length,
            by: session.username,
        });

        return NextResponse.json({
            created: createdPayslips.length,
            skipped: existingPayslips.length,
            results: createdPayslips,
            message: `${createdPayslips.length} payslip berhasil dibuat. ${existingPayslips.length} dilewati (sudah ada).`,
        }, { status: 201 });

    } catch (err) {
        return serverErrorResponse("BulkPayslipPOST", err);
    }
}
