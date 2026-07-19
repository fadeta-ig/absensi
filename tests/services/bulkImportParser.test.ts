import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseExcel } from "@/lib/services/bulk-import/parser";

function workbookBuffer(rows: unknown[][]): ArrayBuffer {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Juli 2026");
    return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("Bulk Import V2 parser", () => {
    it("detects a header after a title row and maps the WIG source aliases", () => {
        const rows = parseExcel(workbookBuffer([
            ["DATABASE KARYAWAN WIG 2026"],
            ["NIP", "Nama Karyawan", "Status Karyawan", "Jenis Kelamin", "Tanggal Lahir", "Tanggal Masuk", "Status Pernikahan", "", "No. Rekening Mandiri", "Alamat Email", "No. HP"],
            ["ID-25020044", "Budi Santoso", "Magang", "Laki-laki", "2000-02-03", "2026-07-01", "Belum Kawin", "TK", "0012345678", "budi@wig.co.id", "081234567890"],
        ]));

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            rowNumber: 3,
            employeeId: "ID-25020044",
            name: "Budi Santoso",
            employmentType: "INTERN",
            gender: "Laki-Laki",
            birthDate: "2000-02-03",
            joinDate: "2026-07-01",
            maritalStatus: "Belum Kawin",
            ptkpStatus: "TK",
            bankName: "Mandiri",
            bankAccountNumber: "0012345678",
        });
    });

    it("does not turn blank update cells into null or zero", () => {
        const [row] = parseExcel(workbookBuffer([
            ["NIP", "Nama Karyawan", "Alamat Email", "Gaji Pokok", "Cuti Tahunan"],
            ["EMP001", "", "", "", ""],
        ]));
        expect(row.employeeId).toBe("EMP001");
        expect(Object.prototype.hasOwnProperty.call(row, "name")).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(row, "email")).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(row, "basicSalary")).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(row, "totalLeave")).toBe(false);
    });

    it("supports the explicit clear marker for optional fields", () => {
        const [row] = parseExcel(workbookBuffer([
            ["NIP", "Nama Karyawan", "No. HP Lain", "Alamat Domisili"],
            ["EMP001", "", "[HAPUS]", "[HAPUS]"],
        ]));
        expect(row.alternatePhone).toBeNull();
        expect(row.domicileAddress).toBeNull();
    });
});
