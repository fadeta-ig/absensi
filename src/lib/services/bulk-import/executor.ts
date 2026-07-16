import bcrypt from "bcryptjs";
import { prisma } from "../../prisma";
import logger from "@/lib/logger";
import { validateImport } from "./validator";
import { ImportResult } from "./types";

export async function executeImport(buffer: ArrayBuffer, performedBy: string): Promise<ImportResult> {
    const report = await validateImport(buffer);

    if (report.validRows.length === 0) {
        return { created: 0, failed: report.totalRows, errors: report.errors };
    }

    const { randomBytes } = await import("crypto");
    const generatePassword = () => randomBytes(9).toString("base64url"); // 12 chars, URL-safe

    // Generate unique password per employee
    const employeePasswords = report.validRows.map((row) => ({
        row,
        plainPassword: generatePassword(),
    }));

    try {
        const result = await prisma.$transaction(async (tx) => {
            const createPromises = employeePasswords.map(async ({ row, plainPassword }) => {
                const hashedPassword = await bcrypt.hash(plainPassword, 12);
                const employee = await tx.employee.create({
                    data: {
                        employeeId: row.employeeId,
                        name: row.name,
                        email: row.email,
                        phone: row.phone,
                        gender: row.gender,
                        departmentId: row.departmentId!,
                        divisionId: row.divisionId || null,
                        positionId: row.positionId!,
                        role: row.role,
                        joinDate: new Date(row.joinDate + "T00:00:00.000Z"),
                        basicSalary: row.basicSalary ?? 0,
                        totalLeave: row.totalLeave ?? 12,
                        usedLeave: 0,
                        managerId: row.managerId || null,
                        isActive: row.isActive ?? true,
                        statusChangedAt: row.isActive === false ? new Date() : null,
                        password: hashedPassword,
                        bypassLocation: false,
                    },
                });

                if (row.isActive === false) {
                    await tx.employeeStatusHistory.create({
                        data: {
                            employeeId: employee.employeeId,
                            wasActive: true,
                            isActive: false,
                            reason: row.statusReason!,
                            effectiveDate: new Date(`${row.joinDate}T00:00:00.000Z`),
                            changedBy: performedBy,
                        },
                    });
                }

                return employee;
            });

            return Promise.all(createPromises);
        });

        // Fire-and-forget: send password emails to each employee
        const { sendPasswordEmail } = await import("../emailService");
        for (const { row, plainPassword } of employeePasswords.filter(({ row }) => row.isActive !== false)) {
            sendPasswordEmail(row.email, row.name, plainPassword).catch(() => {
                logger.warn("Bulk import: gagal kirim email password", { employeeId: row.employeeId });
            });
        }

        // Build credentials list for Excel export (Option C backup)
        const credentials = employeePasswords.filter(({ row }) => row.isActive !== false).map(({ row, plainPassword }) => ({
            employeeId: row.employeeId,
            name: row.name,
            email: row.email,
            password: plainPassword,
        }));

        logger.info("Bulk import berhasil", { count: result.length, performedBy });
        return { created: result.length, failed: report.errors.length, errors: report.errors, credentials };
    } catch (err) {
        logger.error("Bulk import gagal", { error: err, performedBy });
        throw err;
    }
}
