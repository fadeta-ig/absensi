import { prisma } from "../../prisma";
import { bulkRowSchema, BulkRowInput, RowError, ValidationReport } from "./types";
import { parseExcel, mapRow } from "./parser";

export async function validateImport(buffer: ArrayBuffer): Promise<ValidationReport> {
    const rawRows = parseExcel(buffer);
    const errors: RowError[] = [];
    const validRows: BulkRowInput[] = [];

    if (rawRows.length === 0) {
        return { validRows: [], errors: [{ row: 0, field: "-", message: "File tidak berisi data." }], totalRows: 0 };
    }

    // Fetch reference data for cross-validation
    const [departments, divisions, positions, existingEmployees] = await Promise.all([
        prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
        prisma.division.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
        prisma.position.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
        prisma.employee.findMany({ select: { employeeId: true, email: true } }),
    ]);

    const existingIds = new Set(existingEmployees.map(e => e.employeeId));
    const existingEmails = new Set(existingEmployees.map(e => e.email.toLowerCase()));

    // Track duplicates within the file
    const fileIds = new Set<string>();
    const fileEmails = new Set<string>();

    for (let i = 0; i < rawRows.length; i++) {
        const rowNum = i + 2; // +2 because row 1 is header
        const mapped = mapRow(rawRows[i]);

        // Zod validation
        const parseResult = bulkRowSchema.safeParse(mapped);
        if (!parseResult.success) {
            for (const issue of parseResult.error.issues) {
                errors.push({
                    row: rowNum,
                    field: issue.path.join(".") || "unknown",
                    message: issue.message,
                });
            }
            continue;
        }

        const row = parseResult.data;
        let hasError = false;

        // Check duplicate employeeId in file
        if (fileIds.has(row.employeeId)) {
            errors.push({ row: rowNum, field: "employeeId", message: `ID "${row.employeeId}" duplikat dalam file.` });
            hasError = true;
        }

        // Check duplicate email in file
        if (fileEmails.has(row.email.toLowerCase())) {
            errors.push({ row: rowNum, field: "email", message: `Email "${row.email}" duplikat dalam file.` });
            hasError = true;
        }

        // Check against existing DB
        if (existingIds.has(row.employeeId)) {
            errors.push({ row: rowNum, field: "employeeId", message: `ID "${row.employeeId}" sudah terdaftar di database.` });
            hasError = true;
        }
        if (existingEmails.has(row.email.toLowerCase())) {
            errors.push({ row: rowNum, field: "email", message: `Email "${row.email}" sudah terdaftar di database.` });
            hasError = true;
        }

        // Referential checks
        const deptRecord = departments.find(d => d.name.toLowerCase() === row.department.toLowerCase());
        if (!deptRecord) {
            errors.push({ row: rowNum, field: "department", message: `Departemen "${row.department}" tidak ada di master data.` });
            hasError = true;
        } else {
            row.departmentId = deptRecord.id;
        }

        const divRecord = row.division ? divisions.find(d => d.name.toLowerCase() === row.division?.toLowerCase()) : null;
        if (row.division && !divRecord) {
            errors.push({ row: rowNum, field: "division", message: `Divisi "${row.division}" tidak ada di master data.` });
            hasError = true;
        } else if (divRecord) {
            row.divisionId = divRecord.id;
        }

        const posRecord = positions.find(p => p.name.toLowerCase() === row.position.toLowerCase());
        if (!posRecord) {
            errors.push({ row: rowNum, field: "position", message: `Posisi "${row.position}" tidak ada di master data.` });
            hasError = true;
        } else {
            row.positionId = posRecord.id;
        }

        if (row.managerId && !existingIds.has(row.managerId) && !fileIds.has(row.managerId)) {
            errors.push({ row: rowNum, field: "managerId", message: `Atasan ID "${row.managerId}" tidak ditemukan.` });
            hasError = true;
        }

        // Validate joinDate format (YYYY-MM-DD)
        if (row.joinDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.joinDate)) {
            errors.push({ row: rowNum, field: "joinDate", message: `Format tanggal harus YYYY-MM-DD, ditemukan "${row.joinDate}".` });
            hasError = true;
        }

        if (!hasError) {
            validRows.push(row);
            fileIds.add(row.employeeId);
            fileEmails.add(row.email.toLowerCase());
        }
    }

    return { validRows, errors, totalRows: rawRows.length };
}
