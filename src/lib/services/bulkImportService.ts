import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import logger from "@/lib/logger";

// ─── Zod Schema per Row ────────────────────────────────────
const bulkRowSchema = z.object({
    employeeId: z.string().min(1, "ID Karyawan wajib diisi"),
    name: z.string().min(1, "Nama wajib diisi"),
    email: z.string().email("Format email tidak valid"),
    phone: z.string().min(1, "No. Telepon wajib diisi"),
    gender: z.enum(["Laki-Laki", "Perempuan"], { message: "Gender harus Laki-Laki / Perempuan" }),
    department: z.string().min(1, "Departemen wajib diisi"),
    division: z.string().nullable().optional(),
    position: z.string().min(1, "Posisi wajib diisi"),
    role: z.enum(["employee", "hr", "ga"], { message: "Role harus employee / hr / ga" }),
    level: z.string().min(1, "Level wajib diisi"),
    joinDate: z.string().min(1, "Tanggal bergabung wajib diisi"),
    basicSalary: z.number().min(0).optional().default(0),
    totalLeave: z.number().min(0).optional().default(12),
    managerId: z.string().nullable().optional(),
    isActive: z.boolean().optional().default(true),
});

export type BulkRowInput = z.infer<typeof bulkRowSchema>;

export interface RowError {
    row: number;
    field: string;
    message: string;
}

export interface ValidationReport {
    validRows: BulkRowInput[];
    errors: RowError[];
    totalRows: number;
}

export interface ImportResult {
    created: number;
    failed: number;
    errors: RowError[];
}

// ─── Column Header Mapping ─────────────────────────────────
const COLUMN_MAP: Record<string, keyof BulkRowInput> = {
    "ID Karyawan": "employeeId",
    "Nama": "name",
    "Email": "email",
    "No. Telepon": "phone",
    "Jenis Kelamin": "gender",
    "Departemen": "department",
    "Divisi": "division",
    "Posisi": "position",
    "Role": "role",
    "Level": "level",
    "Tanggal Bergabung": "joinDate",
    "Gaji Pokok": "basicSalary",
    "Cuti Tahunan": "totalLeave",
    "Atasan (ID)": "managerId",
    "Status Aktif": "isActive",
};

const TEMPLATE_HEADERS = Object.keys(COLUMN_MAP);

// ─── Parse Excel → Raw Rows ────────────────────────────────
function parseExcel(buffer: ArrayBuffer): Record<string, unknown>[] {
    const wb = XLSX.read(buffer, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("File Excel tidak memiliki sheet data.");

    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    return rawRows;
}

// ─── Map Raw Row → Typed Row ────────────────────────────────
function mapRow(raw: Record<string, unknown>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    for (const [header, field] of Object.entries(COLUMN_MAP)) {
        let value = raw[header];

        // Handle number columns
        if (field === "basicSalary" || field === "totalLeave") {
            const num = Number(value);
            mapped[field] = isNaN(num) ? 0 : num;
            continue;
        }

        // Handle boolean (Status Aktif)
        if (field === "isActive") {
            if (typeof value === "string") {
                mapped[field] = value.toLowerCase() !== "tidak";
            } else {
                mapped[field] = value !== false;
            }
            continue;
        }

        // Handle date — Excel serial number or string
        if (field === "joinDate") {
            if (typeof value === "number") {
                // Excel date serial → JS date
                const date = XLSX.SSF.parse_date_code(value);
                mapped[field] = `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
                continue;
            }
            mapped[field] = String(value || "").trim();
            continue;
        }

        // Handle empty strings → null for optional string fields
        if (field === "division" || field === "managerId") {
            const str = String(value || "").trim();
            mapped[field] = str === "" ? null : str;
            continue;
        }

        mapped[field] = String(value || "").trim();
    }

    return mapped;
}

// ─── Validate All Rows ──────────────────────────────────────
export async function validateImport(buffer: ArrayBuffer): Promise<ValidationReport> {
    const rawRows = parseExcel(buffer);
    const errors: RowError[] = [];
    const validRows: BulkRowInput[] = [];

    if (rawRows.length === 0) {
        return { validRows: [], errors: [{ row: 0, field: "-", message: "File tidak berisi data." }], totalRows: 0 };
    }

    // Fetch reference data for cross-validation
    const [departments, divisions, positions, existingEmployees] = await Promise.all([
        prisma.department.findMany({ where: { isActive: true }, select: { name: true } }),
        prisma.division.findMany({ where: { isActive: true }, select: { name: true } }),
        prisma.position.findMany({ where: { isActive: true }, select: { name: true } }),
        prisma.employee.findMany({ select: { employeeId: true, email: true } }),
    ]);

    const deptNames = new Set(departments.map(d => d.name));
    const divNames = new Set(divisions.map(d => d.name));
    const posNames = new Set(positions.map(p => p.name));
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
        if (!deptNames.has(row.department)) {
            errors.push({ row: rowNum, field: "department", message: `Departemen "${row.department}" tidak ada di master data.` });
            hasError = true;
        }
        if (row.division && !divNames.has(row.division)) {
            errors.push({ row: rowNum, field: "division", message: `Divisi "${row.division}" tidak ada di master data.` });
            hasError = true;
        }
        if (!posNames.has(row.position)) {
            errors.push({ row: rowNum, field: "position", message: `Posisi "${row.position}" tidak ada di master data.` });
            hasError = true;
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

// ─── Execute Import ─────────────────────────────────────────
export async function executeImport(buffer: ArrayBuffer, performedBy: string): Promise<ImportResult> {
    const report = await validateImport(buffer);

    if (report.validRows.length === 0) {
        return { created: 0, failed: report.totalRows, errors: report.errors };
    }

    const DEFAULT_PASSWORD = "wig-absensi-default-pass";
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 12);

    try {
        const result = await prisma.$transaction(async (tx) => {
            const createPromises = report.validRows.map((row) =>
                tx.employee.create({
                    data: {
                        employeeId: row.employeeId,
                        name: row.name,
                        email: row.email,
                        phone: row.phone,
                        gender: row.gender,
                        department: row.department,
                        division: row.division || null,
                        position: row.position,
                        role: row.role,
                        level: row.level,
                        joinDate: new Date(row.joinDate + "T00:00:00.000Z"),
                        basicSalary: row.basicSalary ?? 0,
                        totalLeave: row.totalLeave ?? 12,
                        usedLeave: 0,
                        managerId: row.managerId || null,
                        isActive: row.isActive ?? true,
                        password: hashedPassword,
                        bypassLocation: false,
                    },
                })
            );

            return Promise.all(createPromises);
        });

        logger.info("Bulk import berhasil", { count: result.length, performedBy });
        return { created: result.length, failed: report.errors.length, errors: report.errors };
    } catch (err) {
        logger.error("Bulk import gagal", { error: err, performedBy });
        throw err;
    }
}

// ─── Generate Template Excel ────────────────────────────────
export async function generateTemplate(): Promise<Buffer> {
    // Fetch reference data for dropdown sheet
    const [departments, divisions, positions] = await Promise.all([
        prisma.department.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
        prisma.division.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
        prisma.position.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } }),
    ]);

    const workbook = new ExcelJS.Workbook();

    // ── Sheet 1: Data Karyawan ─────────────────────────────
    const ws = workbook.addWorksheet("Data Karyawan", { views: [{ state: "frozen", ySplit: 1 }] });

    // Define columns
    ws.columns = TEMPLATE_HEADERS.map((header) => ({
        header,
        key: header,
        width: Math.max(header.length + 5, 18),
    }));

    // Style the header row
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0f172a" } }; // Dark slate color
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.eachCell((cell) => {
        cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
        };
    });

    // Add Example Row
    const exampleRow = ws.addRow({
        "ID Karyawan": "WIG-001",
        "Nama": "Budi Santoso",
        "Email": "budi@company.com",
        "No. Telepon": "081234567890",
        "Jenis Kelamin": "Laki-Laki",
        "Departemen": departments[0]?.name ?? "IT",
        "Divisi": divisions[0]?.name ?? "",
        "Posisi": positions[0]?.name ?? "Staff",
        "Role": "employee",
        "Level": "STAFF",
        "Tanggal Bergabung": "2026-01-15",
        "Gaji Pokok": 5000000,
        "Cuti Tahunan": 12,
        "Atasan (ID)": "",
        "Status Aktif": "Ya",
    });

    // Style the example row data
    exampleRow.font = { color: { argb: "FF64748B" }, italic: true }; // Muted text for example

    // Add Data Validation
    // Apply validations to 1000 rows
    for (let i = 2; i <= 1000; i++) {
        // Departemen (F) -> Panduan A2:A1000
        ws.getCell(`F${i}`).dataValidation = {
            type: "list", allowBlank: false, formulae: ['Panduan!$A$2:$A$1000'],
            showErrorMessage: true, errorTitle: "Nilai tidak valid", error: "Pilih departemen dari daftar panduan"
        };
        // Divisi (G) -> Panduan B2:B1000
        ws.getCell(`G${i}`).dataValidation = {
            type: "list", allowBlank: true, formulae: ['Panduan!$B$2:$B$1000'],
            showErrorMessage: true, errorTitle: "Nilai tidak valid", error: "Pilih divisi dari daftar panduan"
        };
        // Posisi (H) -> Panduan C2:C1000
        ws.getCell(`H${i}`).dataValidation = {
            type: "list", allowBlank: false, formulae: ['Panduan!$C$2:$C$1000'],
            showErrorMessage: true, errorTitle: "Nilai tidak valid", error: "Pilih posisi dari daftar panduan"
        };
        // Gender (E) -> Panduan D2:D1000
        ws.getCell(`E${i}`).dataValidation = {
            type: "list", allowBlank: false, formulae: ['Panduan!$D$2:$D$1000'],
            showErrorMessage: true, errorTitle: "Nilai tidak valid", error: "Pilih Laki-Laki atau Perempuan dari daftar panduan"
        };
        // Role (I) -> Panduan E2:E1000
        ws.getCell(`I${i}`).dataValidation = {
            type: "list", allowBlank: false, formulae: ['Panduan!$E$2:$E$1000'],
            showErrorMessage: true, errorTitle: "Nilai tidak valid", error: "Pilih role dari daftar panduan"
        };
        // Level (J) -> Panduan F2:F1000
        ws.getCell(`J${i}`).dataValidation = {
            type: "list", allowBlank: false, formulae: ['Panduan!$F$2:$F$1000'],
            showErrorMessage: true, errorTitle: "Nilai tidak valid", error: "Pilih level dari daftar panduan"
        };
        // Status Aktif (O) -> Panduan G2:G1000
        ws.getCell(`O${i}`).dataValidation = {
            type: "list", allowBlank: true, formulae: ['Panduan!$G$2:$G$1000'],
            showErrorMessage: true, errorTitle: "Nilai tidak valid", error: "Pilih status aktif dari daftar panduan"
        };
    }

    // ── Sheet 2: Panduan ───────────────────────────────────
    const guideSheet = workbook.addWorksheet("Panduan");

    const guideColumns = [
        { header: "Departemen", key: "dept", width: 25 },
        { header: "Divisi", key: "div", width: 25 },
        { header: "Posisi", key: "pos", width: 25 },
        { header: "Jenis Kelamin", key: "gender", width: 20 },
        { header: "Role", key: "role", width: 20 },
        { header: "Level", key: "level", width: 20 },
        { header: "Status Aktif", key: "status", width: 20 },
    ];
    guideSheet.columns = guideColumns;

    // Style Guide Headers
    const guideHeaderRow = guideSheet.getRow(1);
    guideHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    guideHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3b82f6" } }; // Blue color
    guideHeaderRow.alignment = { vertical: "middle", horizontal: "center" };

    const maxRows = Math.max(departments.length, divisions.length, positions.length, 6);
    const genderVal = ["Laki-Laki", "Perempuan"];
    const roleVal = ["employee", "hr", "ga"];
    const levelVal = ["STAFF", "SUPERVISOR", "MANAGER", "GM", "HR", "CEO"];
    const statusVal = ["Ya", "Tidak"];

    for (let i = 0; i < maxRows; i++) {
        guideSheet.addRow({
            dept: departments[i]?.name ?? "",
            div: divisions[i]?.name ?? "",
            pos: positions[i]?.name ?? "",
            gender: genderVal[i] ?? "",
            role: roleVal[i] ?? "",
            level: levelVal[i] ?? "",
            status: statusVal[i] ?? "",
        });
    }

    // ── Generate buffer ────────────────────────────────────
    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
}
