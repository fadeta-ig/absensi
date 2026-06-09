import * as XLSX from "xlsx";
import { COLUMN_MAP } from "./types";

export function parseExcel(buffer: ArrayBuffer): Record<string, unknown>[] {
    const wb = XLSX.read(buffer, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("File Excel tidak memiliki sheet data.");

    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    return rawRows;
}

export function mapRow(raw: Record<string, unknown>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    for (const [header, field] of Object.entries(COLUMN_MAP)) {
        const value = raw[header];

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
