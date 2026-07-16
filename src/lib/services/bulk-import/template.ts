import ExcelJS from "exceljs";
import { prisma } from "../../prisma";
import { TEMPLATE_HEADERS } from "./types";

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
        "ID Karyawan": "ID25000000 (HAPUS BARIS INI)",
        "Nama": "Budi Santoso",
        "Email": "budi@company.com",
        "No. Telepon": "081234567890",
        "Jenis Kelamin": "Laki-Laki",
        "Departemen": departments[0]?.name ?? "",
        "Divisi": divisions[0]?.name ?? "",
        "Posisi": positions[0]?.name ?? "",
        "Tanggal Bergabung": "2026-01-15",
        "Gaji Pokok": 5000000,
        "Cuti Tahunan": 12,
        "Atasan (ID)": "",
        "Status Aktif": "Ya",
        "Alasan Status": "Isi minimal 5 karakter jika Status Aktif = Tidak",
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
        // Status Aktif (M) -> Panduan E2:E1000
        ws.getCell(`M${i}`).dataValidation = {
            type: "list", allowBlank: true, formulae: ['Panduan!$E$2:$E$1000'],
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
        { header: "Status Aktif", key: "status", width: 20 },
    ];
    guideSheet.columns = guideColumns;

    // Style Guide Headers
    const guideHeaderRow = guideSheet.getRow(1);
    guideHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    guideHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3b82f6" } }; // Blue color
    guideHeaderRow.alignment = { vertical: "middle", horizontal: "center" };

    const maxRows = Math.max(departments.length, divisions.length, positions.length, 3);
    const genderVal = ["Laki-Laki", "Perempuan"];
    const statusVal = ["Ya", "Tidak"];

    for (let i = 0; i < maxRows; i++) {
        guideSheet.addRow({
            dept: departments[i]?.name ?? "",
            div: divisions[i]?.name ?? "",
            pos: positions[i]?.name ?? "",
            gender: genderVal[i] ?? "",
            status: statusVal[i] ?? "",
        });
    }

    // ── Generate buffer ────────────────────────────────────
    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
}
