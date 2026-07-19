import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import logger from "@/lib/logger";
import type { AuditActor } from "@/lib/services/auditService";
import { applyEmployeePrivateData } from "@/lib/services/employeePrivateService";
import { normalizeEmployeeId } from "@/lib/security/pii";
import { SYSTEM_ROLES } from "@/lib/permissions";
import { prepareImport } from "./validator";
import type { ImportOptions, ImportResult } from "./types";

export class DuplicateImportError extends Error {
    constructor(public readonly jobId: string) {
        super("File dengan mode dan opsi yang sama sudah pernah dieksekusi.");
        this.name = "DuplicateImportError";
    }
}

function asDate(value: string | null | undefined): Date | null {
    return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function nameKey(value: string | null | undefined): string {
    return value?.trim().toLocaleLowerCase("id-ID") ?? "";
}

export async function executeImport(buffer: ArrayBuffer, performedBy: AuditActor, options: ImportOptions): Promise<ImportResult> {
    const checksum = createHash("sha256").update(Buffer.from(buffer)).digest("hex");
    const optionsHash = createHash("sha256").update(JSON.stringify({ allowCreateMaster: options.allowCreateMaster })).digest("hex");
    const previousJob = await prisma.employeeImportJob.findUnique({
        where: { checksum_mode_optionsHash: { checksum, mode: options.mode, optionsHash } },
        select: { id: true },
    });
    if (previousJob) throw new DuplicateImportError(previousJob.id);

    const report = await prepareImport(buffer, options);
    const mutableRows = report.preparedRows.filter((row) => row.action === "CREATE" || row.action === "UPDATE");
    if (mutableRows.length === 0) throw new Error("Tidak ada baris Create atau Update yang dapat dieksekusi.");

    const credentials = new Map<string, { plainPassword: string; passwordHash: string }>();
    await Promise.all(report.preparedRows.filter((row) => row.action === "CREATE").map(async (row) => {
        const plainPassword = randomBytes(9).toString("base64url");
        credentials.set(row.employeeId, { plainPassword, passwordHash: await bcrypt.hash(plainPassword, 12) });
    }));

    try {
        const transactionResult = await prisma.$transaction(async (tx) => {
            const job = await tx.employeeImportJob.create({
                data: {
                    checksum,
                    mode: options.mode,
                    optionsHash,
                    status: "PROCESSING",
                    totalRows: report.totalRows,
                    actorUserId: performedBy.userId ?? null,
                    actorIdentifier: performedBy.identifier,
                },
            });

            const employeeRole = await tx.role.findUnique({ where: { code: SYSTEM_ROLES.EMPLOYEE_USER }, select: { id: true } });
            if (!employeeRole) throw new Error("Role EMPLOYEE_USER belum dikonfigurasi.");

            if (options.allowCreateMaster) {
                const missingDivisions = report.missingReferences.filter((item) => item.type === "division" && item.canCreate);
                for (const reference of missingDivisions) {
                    const exists = await tx.division.findFirst({ where: { name: reference.name } });
                    if (!exists) await tx.division.create({ data: { name: reference.name.trim(), isActive: true } });
                }
                const missingPositions = report.missingReferences.filter((item) => item.type === "position" && item.canCreate);
                for (const reference of missingPositions) {
                    const exists = await tx.position.findFirst({ where: { name: reference.name } });
                    if (!exists) await tx.position.create({ data: { name: reference.name.trim(), isActive: true } });
                }
                for (const reference of report.missingReferences.filter((item) => item.type === "department" && item.canCreate)) {
                    const exists = await tx.department.findFirst({ where: { name: reference.name } });
                    if (exists) continue;
                    const division = await tx.division.findFirst({ where: { name: reference.parentName! } });
                    if (!division) throw new Error(`Divisi ${reference.parentName} tidak ditemukan untuk departemen ${reference.name}.`);
                    await tx.department.create({ data: { name: reference.name.trim(), divisionId: division.id, isActive: true } });
                }
            }

            const [departments, divisions, positions] = await Promise.all([
                tx.department.findMany({ where: { isActive: true }, select: { id: true, name: true, divisionId: true } }),
                tx.division.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
                tx.position.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
            ]);
            const departmentByName = new Map(departments.map((row) => [nameKey(row.name), row]));
            const divisionByName = new Map(divisions.map((row) => [nameKey(row.name), row]));
            const positionByName = new Map(positions.map((row) => [nameKey(row.name), row]));

            let created = 0;
            let updated = 0;
            const emailQueue: Array<{ email: string; name: string; password: string; employeeId: string }> = [];

            for (const row of mutableRows) {
                const department = row.department ? departmentByName.get(nameKey(row.department)) : undefined;
                const division = row.division ? divisionByName.get(nameKey(row.division)) : undefined;
                const position = row.position ? positionByName.get(nameKey(row.position)) : undefined;

                if (row.action === "CREATE") {
                    const credential = credentials.get(row.employeeId)!;
                    const employee = await tx.employee.create({
                        data: {
                            employeeId: row.employeeId,
                            employeeIdNormalized: normalizeEmployeeId(row.employeeId),
                            name: row.name!,
                            academicTitle: row.academicTitle ?? null,
                            preferredName: row.preferredName ?? null,
                            email: row.email!,
                            phone: row.phone!,
                            alternatePhone: row.alternatePhone ?? null,
                            gender: row.gender!,
                            employmentType: row.employmentType ?? "PERMANENT",
                            departmentId: department?.id ?? row.departmentId!,
                            divisionId: division?.id ?? department?.divisionId ?? row.divisionId ?? null,
                            positionId: position?.id ?? row.positionId!,
                            managerId: row.managerId ?? null,
                            joinDate: asDate(row.joinDate)!,
                            employmentStartDate: asDate(row.employmentStartDate ?? row.joinDate),
                            employmentEndDate: asDate(row.employmentEndDate),
                            probationEndDate: asDate(row.probationEndDate),
                            totalLeave: row.totalLeave ?? 12,
                            usedLeave: 0,
                            isActive: row.isActive ?? true,
                            statusChangedAt: row.isActive === false ? new Date() : null,
                            bypassLocation: false,
                            basicSalary: row.basicSalary ?? 0,
                        },
                    });
                    await applyEmployeePrivateData(tx, employee.employeeId, row, performedBy);
                    await tx.userAccount.create({
                        data: {
                            username: row.employeeId,
                            displayName: row.name!,
                            email: row.email!,
                            passwordHash: credential.passwordHash,
                            employeeId: row.employeeId,
                            isActive: row.isActive ?? true,
                            createdByUserId: performedBy.userId ?? null,
                            roles: { create: { roleId: employeeRole.id, assignedByUserId: performedBy.userId ?? null } },
                        },
                    });
                    if (row.isActive === false) {
                        await tx.employeeStatusHistory.create({
                            data: {
                                employeeId: row.employeeId,
                                wasActive: true,
                                isActive: false,
                                reason: row.statusReason!,
                                effectiveDate: asDate(row.statusEffectiveDate ?? row.joinDate)!,
                                changedByUserId: performedBy.userId ?? null,
                                changedByIdentifier: performedBy.identifier,
                                changedByName: performedBy.name ?? null,
                                changedByRole: performedBy.role ?? null,
                            },
                        });
                    } else {
                        emailQueue.push({ email: row.email!, name: row.name!, password: credential.plainPassword, employeeId: row.employeeId });
                    }
                    created += 1;
                    continue;
                }

                const current = await tx.employee.findUnique({ where: { employeeId: row.employeeId }, select: { isActive: true } });
                if (!current) throw new Error(`Karyawan ${row.employeeId} tidak ditemukan saat eksekusi.`);
                const coreUpdate: Prisma.EmployeeUncheckedUpdateInput = {};
                if (row.name !== undefined) coreUpdate.name = row.name!;
                if (row.academicTitle !== undefined) coreUpdate.academicTitle = row.academicTitle;
                if (row.preferredName !== undefined) coreUpdate.preferredName = row.preferredName;
                if (row.email !== undefined) coreUpdate.email = row.email!;
                if (row.phone !== undefined) coreUpdate.phone = row.phone!;
                if (row.alternatePhone !== undefined) coreUpdate.alternatePhone = row.alternatePhone;
                if (row.gender !== undefined && row.gender !== null) coreUpdate.gender = row.gender;
                if (row.employmentType !== undefined && row.employmentType !== null) coreUpdate.employmentType = row.employmentType;
                if (row.department !== undefined) coreUpdate.departmentId = department?.id;
                if (row.division !== undefined) coreUpdate.divisionId = division?.id ?? null;
                else if (row.department !== undefined && department) coreUpdate.divisionId = department.divisionId;
                if (row.position !== undefined) coreUpdate.positionId = position?.id;
                if (row.managerId !== undefined) coreUpdate.managerId = row.managerId;
                if (row.joinDate !== undefined) coreUpdate.joinDate = asDate(row.joinDate)!;
                if (row.employmentStartDate !== undefined) coreUpdate.employmentStartDate = asDate(row.employmentStartDate);
                if (row.employmentEndDate !== undefined) coreUpdate.employmentEndDate = asDate(row.employmentEndDate);
                if (row.probationEndDate !== undefined) coreUpdate.probationEndDate = asDate(row.probationEndDate);
                if (row.totalLeave !== undefined && row.totalLeave !== null) coreUpdate.totalLeave = row.totalLeave;
                if (row.basicSalary !== undefined && row.basicSalary !== null) coreUpdate.basicSalary = row.basicSalary;
                const statusChanged = typeof row.isActive === "boolean" && row.isActive !== current.isActive;
                if (typeof row.isActive === "boolean") coreUpdate.isActive = row.isActive;
                if (statusChanged) coreUpdate.statusChangedAt = new Date();

                await tx.employee.update({ where: { employeeId: row.employeeId }, data: coreUpdate });
                await applyEmployeePrivateData(tx, row.employeeId, row, performedBy);
                if (row.name !== undefined || row.email !== undefined || statusChanged) {
                    await tx.userAccount.updateMany({
                        where: { employeeId: row.employeeId },
                        data: {
                            ...(row.name !== undefined && { displayName: row.name! }),
                            ...(row.email !== undefined && { email: row.email! }),
                            ...(typeof row.isActive === "boolean" && { isActive: row.isActive }),
                            ...(statusChanged && { sessionVersion: { increment: 1 } }),
                        },
                    });
                }
                if (statusChanged) {
                    const user = await tx.userAccount.findUnique({ where: { employeeId: row.employeeId }, select: { id: true } });
                    if (user && row.isActive === false) await tx.pushSubscription.deleteMany({ where: { userId: user.id } });
                    await tx.employeeStatusHistory.create({
                        data: {
                            employeeId: row.employeeId,
                            wasActive: current.isActive,
                            isActive: row.isActive!,
                            reason: row.statusReason ?? (row.isActive ? "Diaktifkan melalui impor massal" : "Dinonaktifkan melalui impor massal"),
                            effectiveDate: asDate(row.statusEffectiveDate) ?? new Date(),
                            changedByUserId: performedBy.userId ?? null,
                            changedByIdentifier: performedBy.identifier,
                            changedByName: performedBy.name ?? null,
                            changedByRole: performedBy.role ?? null,
                        },
                    });
                }
                updated += 1;
            }

            const resultWithoutJob: Omit<ImportResult, "jobId"> = {
                created,
                updated,
                unchanged: report.counts.UNCHANGED,
                failedRows: report.failedRows,
                issueCount: report.issueCount,
                errors: report.errors,
            };
            await tx.employeeImportJob.update({
                where: { id: job.id },
                data: {
                    status: "COMPLETED",
                    createdRows: created,
                    updatedRows: updated,
                    unchangedRows: report.counts.UNCHANGED,
                    failedRows: report.failedRows,
                    resultJson: JSON.stringify(resultWithoutJob),
                    completedAt: new Date(),
                },
            });
            return { jobId: job.id, emailQueue, ...resultWithoutJob };
        }, { timeout: 120_000 });

        const { sendPasswordEmail } = await import("../emailService");
        for (const item of transactionResult.emailQueue) {
            sendPasswordEmail(item.email, item.name, item.password).catch(() => {
                logger.warn("Bulk import: gagal kirim email password", { employeeId: item.employeeId });
            });
        }
        const { emailQueue: _emailQueue, ...result } = transactionResult;
        void _emailQueue;
        logger.info("Bulk import V2 berhasil", { jobId: result.jobId, created: result.created, updated: result.updated, performedBy: performedBy.identifier });
        return result;
    } catch (error) {
        if ((error as { code?: string })?.code === "P2002") {
            const existing = await prisma.employeeImportJob.findUnique({
                where: { checksum_mode_optionsHash: { checksum, mode: options.mode, optionsHash } },
                select: { id: true },
            });
            if (existing) throw new DuplicateImportError(existing.id);
        }
        logger.error("Bulk import V2 gagal", { error: error instanceof Error ? error.message : String(error), performedBy: performedBy.identifier });
        throw error;
    }
}
