import * as XLSX from "xlsx";
import { CLEAR_MARKER, COLUMN_DEFINITIONS, type BulkRowInput, type ColumnDefinition } from "./types";

function normalizedHeader(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}

const headerLookup = new Map<string, ColumnDefinition>();
for (const definition of COLUMN_DEFINITIONS) {
    for (const header of [definition.header, ...definition.aliases]) {
        headerLookup.set(normalizedHeader(header), definition);
    }
}

function parseDateValue(value: unknown): string | undefined | null {
    if (value === null || value === undefined || value === "") return undefined;
    if (String(value).trim().toUpperCase() === CLEAR_MARKER) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === "number") {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (!parsed) return String(value);
        return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    return text;
}

function parseTextValue(value: unknown, unsafeFields: string[], field: string): string | undefined | null {
    if (value === null || value === undefined || value === "") return undefined;
    const text = String(value).trim();
    if (!text) return undefined;
    if (text.toUpperCase() === CLEAR_MARKER) return null;
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value)) unsafeFields.push(field);
        return value.toLocaleString("fullwide", { useGrouping: false, maximumSignificantDigits: 21 });
    }
    return text;
}

function parseEmploymentType(value: unknown): BulkRowInput["employmentType"] | undefined {
    const text = String(value ?? "").trim().toLowerCase();
    if (!text) return undefined;
    if (text === CLEAR_MARKER.toLowerCase()) return null;
    const values: Record<string, NonNullable<BulkRowInput["employmentType"]>> = {
        tetap: "PERMANENT",
        permanent: "PERMANENT",
        kontrak: "CONTRACT",
        contract: "CONTRACT",
        probation: "PROBATION",
        percobaan: "PROBATION",
        magang: "INTERN",
        intern: "INTERN",
        internship: "INTERN",
    };
    return values[text] ?? (String(value).trim().toUpperCase() as NonNullable<BulkRowInput["employmentType"]>);
}

function parseGender(value: unknown): BulkRowInput["gender"] | undefined | string {
    const text = String(value ?? "").trim().toLowerCase();
    if (!text) return undefined;
    if (["laki-laki", "laki laki", "l", "male", "pria"].includes(text)) return "Laki-Laki";
    if (["perempuan", "p", "female", "wanita"].includes(text)) return "Perempuan";
    return String(value).trim();
}

function parseBoolean(value: unknown): boolean | undefined | null | string {
    const text = String(value ?? "").trim().toLowerCase();
    if (!text) return undefined;
    if (text === CLEAR_MARKER.toLowerCase()) return null;
    if (["ya", "aktif", "true", "1", "yes"].includes(text)) return true;
    if (["tidak", "nonaktif", "non-aktif", "false", "0", "no"].includes(text)) return false;
    return String(value).trim();
}

export function parseExcel(buffer: ArrayBuffer): BulkRowInput[] {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("File Excel tidak memiliki sheet data.");
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: false });

    let headerIndex = -1;
    for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 10); rowIndex++) {
        const recognized = new Set(matrix[rowIndex].map((cell) => headerLookup.get(normalizedHeader(cell))?.field).filter(Boolean));
        if (recognized.has("employeeId") && recognized.has("name")) {
            headerIndex = rowIndex;
            break;
        }
    }
    if (headerIndex < 0) throw new Error("Header NIP dan Nama Karyawan tidak ditemukan pada 10 baris pertama.");

    const rawHeaders = matrix[headerIndex];
    const columns = rawHeaders.map((header, index) => {
        const direct = headerLookup.get(normalizedHeader(header));
        if (direct) return direct;
        // Source template merges Status Pernikahan across AC:AD; the blank adjacent
        // column contains PTKP values, so infer it positionally.
        const previous = index > 0 ? headerLookup.get(normalizedHeader(rawHeaders[index - 1])) : undefined;
        if (!normalizedHeader(header) && previous?.field === "maritalStatus") return headerLookup.get(normalizedHeader("PTKP"));
        return undefined;
    });
    const legacyMandiri = rawHeaders.some((header) => normalizedHeader(header) === normalizedHeader("No. Rekening Mandiri"));

    const rows: BulkRowInput[] = [];
    for (let index = headerIndex + 1; index < matrix.length; index++) {
        const source = matrix[index];
        if (!source.some((value) => String(value ?? "").trim() !== "")) continue;
        const output: Record<string, unknown> = { rowNumber: index + 1 };
        const unsafeNumericFields: string[] = [];

        columns.forEach((definition, columnIndex) => {
            if (!definition) return;
            const value = source[columnIndex];
            let parsed: unknown;
            if (definition.field === "employmentType") parsed = parseEmploymentType(value);
            else if (definition.field === "gender") parsed = parseGender(value);
            else if (definition.kind === "date") parsed = parseDateValue(value);
            else if (definition.kind === "number") {
                if (value === "" || value === null || value === undefined) parsed = undefined;
                else if (String(value).trim().toUpperCase() === CLEAR_MARKER) parsed = null;
                else parsed = Number(value);
            } else if (definition.kind === "boolean") parsed = parseBoolean(value);
            else parsed = parseTextValue(value, unsafeNumericFields, String(definition.field));
            if (parsed !== undefined) output[definition.field] = parsed;
        });

        if (legacyMandiri && output.bankAccountNumber && !output.bankName) output.bankName = "Mandiri";
        if (unsafeNumericFields.length) output.unsafeNumericFields = unsafeNumericFields;
        output.employeeId = String(output.employeeId ?? "").trim();
        rows.push(output as unknown as BulkRowInput);
    }
    return rows;
}

// Kept for compatibility with earlier callers/tests; parseExcel already returns mapped rows.
export function mapRow(raw: Record<string, unknown>): Record<string, unknown> {
    return raw;
}
