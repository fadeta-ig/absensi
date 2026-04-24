import * as XLSX from "xlsx";

type CategoryInfo = { prefix: string; name: string };

/**
 * Generates a beautifully styled Excel (.xlsx) template for bulk asset import.
 * Uses SheetJS with custom cell styling, column widths, and an info sheet.
 */
export function generateBulkImportTemplate(categories: CategoryInfo[]) {
    const wb = XLSX.utils.book_new();

    // ─── Sheet 1: DATA IMPORT ───────────────────────────────────────────

    const headers = [
        "Prefix Kategori *",
        "Nama Aset *",
        "Kondisi *",
        "Manufaktur (Brand)",
        "Model Spesifik",
        "Serial Number (S/N)",
        "Keterangan / Catatan",
    ];

    const sampleRows = [
        ["LAP", "MacBook Pro M2 13 Inch", "BAIK", "Apple", "MacBook Pro 13 M2", "C02XG123JKLM", "Pembelian Q2 2025"],
        ["HP", "Samsung Galaxy S23 Ultra", "BAIK", "Samsung", "SM-S918B", "R9BT123456789", "Untuk Direktur Marketing"],
        ["LAP", "ThinkPad E14 Gen 4", "KURANG_BAIK", "Lenovo", "E14 Gen4 AMD", "PF-0A12345", "Baterai mulai drop"],
    ];

    const sheetData = [headers, ...sampleRows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Column widths (in character width)
    ws["!cols"] = [
        { wch: 20 }, // Prefix Kategori
        { wch: 35 }, // Nama Aset
        { wch: 16 }, // Kondisi
        { wch: 22 }, // Manufaktur
        { wch: 26 }, // Model
        { wch: 24 }, // Serial Number
        { wch: 36 }, // Keterangan
    ];

    // Freeze the header row
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };

    // Apply cell styles using SheetJS cell objects
    const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
        fill: { fgColor: { rgb: "1E293B" } }, // slate-800
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: {
            top: { style: "thin", color: { rgb: "334155" } },
            bottom: { style: "medium", color: { rgb: "6366F1" } }, // indigo accent
            left: { style: "thin", color: { rgb: "334155" } },
            right: { style: "thin", color: { rgb: "334155" } },
        },
    };

    const requiredHeaderStyle = {
        ...headerStyle,
        fill: { fgColor: { rgb: "312E81" } }, // indigo-950 for required cols
    };

    const dataStyle = {
        font: { sz: 10, name: "Calibri" },
        alignment: { vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "E2E8F0" } },
            bottom: { style: "thin", color: { rgb: "E2E8F0" } },
            left: { style: "thin", color: { rgb: "E2E8F0" } },
            right: { style: "thin", color: { rgb: "E2E8F0" } },
        },
    };

    const sampleRowStyle = {
        ...dataStyle,
        fill: { fgColor: { rgb: "F8FAFC" } }, // slate-50
        font: { ...dataStyle.font, color: { rgb: "475569" }, italic: true },
    };

    // Apply header styles
    const colLetters = ["A", "B", "C", "D", "E", "F", "G"];
    const requiredCols = new Set([0, 1, 2]); // first 3 cols are required

    colLetters.forEach((col, colIdx) => {
        const cellAddr = `${col}1`;
        if (!ws[cellAddr]) ws[cellAddr] = {};
        ws[cellAddr].s = requiredCols.has(colIdx) ? requiredHeaderStyle : headerStyle;
    });

    // Apply sample row styles
    sampleRows.forEach((_, rowIdx) => {
        colLetters.forEach((col) => {
            const cellAddr = `${col}${rowIdx + 2}`;
            if (!ws[cellAddr]) ws[cellAddr] = {};
            ws[cellAddr].s = sampleRowStyle;
        });
    });

    // Set row heights
    ws["!rows"] = [
        { hpt: 30 }, // Header row height (pts)
        { hpt: 22 },
        { hpt: 22 },
        { hpt: 22 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "📋 Data Import");

    // ─── Sheet 2: PANDUAN & REFERENSI ──────────────────────────────────

    const guideData = [
        ["🗂️ PANDUAN PENGGUNAAN TEMPLATE IMPORT ASET — WIG HRIS", "", "", ""],
        ["", "", "", ""],
        ["ATURAN PENGISIAN", "", "", ""],
        ["Kolom Wajib", "Prefix Kategori, Nama Aset, Kondisi", "", ""],
        ["Nilai Kondisi Valid", "BAIK  |  KURANG_BAIK  |  RUSAK", "", ""],
        ["Batas Maksimum", "300 baris data per satu kali import", "", ""],
        ["Format File Diterima", "CSV (.csv) atau Excel (.xlsx) — sistem akan membaca kolom pertama sebagai header", "", ""],
        ["Baris Contoh", "Baris berwarna abu-abu adalah CONTOH. Silahkan hapus sebelum import.", "", ""],
        ["", "", "", ""],
        ["REFERENSI PREFIX KATEGORI", "", "", ""],
        ["Prefix", "Nama Kategori", "", ""],
        ...categories.map(c => [c.prefix, c.name, "", ""]),
        ...(categories.length === 0 ? [["(Tidak ada data, pastikan server aktif saat build)", "", "", ""]] : []),
        ["", "", "", ""],
        ["TANDA BINTANG (*)", "", "", ""],
        ["Kolom header yang mengandung tanda (*)", "WAJIB diisi. Jangan biarkan kosong!", "", ""],
        ["", "", "", ""],
        ["© WIG HRIS — General Affairs Portal", "", "", ""],
    ];

    const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
    wsGuide["!cols"] = [{ wch: 40 }, { wch: 45 }, { wch: 10 }, { wch: 10 }];

    // Style the title cell
    const titleStyle = {
        font: { bold: true, sz: 14, color: { rgb: "1E293B" }, name: "Calibri" },
        fill: { fgColor: { rgb: "EEF2FF" } }, // indigo-50
        border: { bottom: { style: "medium", color: { rgb: "6366F1" } } },
    };

    const sectionStyle = {
        font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { fgColor: { rgb: "475569" } }, // slate-600
    };

    const labelStyle = {
        font: { bold: true, sz: 10, color: { rgb: "334155" } },
        fill: { fgColor: { rgb: "F1F5F9" } }, // slate-100
        border: { bottom: { style: "thin", color: { rgb: "CBD5E1" } } },
    };

    const valueStyle = {
        font: { sz: 10, color: { rgb: "475569" } },
        border: { bottom: { style: "thin", color: { rgb: "E2E8F0" } } },
    };

    const accentStyle = {
        font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "4F46E5" } }, // indigo-600
        alignment: { horizontal: "center" },
    };

    if (wsGuide["A1"]) wsGuide["A1"].s = titleStyle;

    // Mark section headers
    const sectionRows = [3, 10, 15];
    sectionRows.forEach(row => {
        const cellAddr = `A${row}`;
        if (wsGuide[cellAddr]) wsGuide[cellAddr].s = sectionStyle;
    });

    // Style label/value pairs
    const labelRows = [4, 5, 6, 7, 8, 11, 16];
    labelRows.forEach(row => {
        if (wsGuide[`A${row}`]) wsGuide[`A${row}`].s = labelStyle;
        if (wsGuide[`B${row}`]) wsGuide[`B${row}`].s = valueStyle;
    });

    // Style prefix cells in the table
    const prefixStartRow = 12;
    categories.forEach((_, idx) => {
        const row = prefixStartRow + idx;
        if (wsGuide[`A${row}`]) wsGuide[`A${row}`].s = accentStyle;
        if (wsGuide[`B${row}`]) wsGuide[`B${row}`].s = { ...valueStyle, font: { sz: 10, bold: true, color: { rgb: "1E293B" } } };
    });

    XLSX.utils.book_append_sheet(wb, wsGuide, "🔖 Panduan & Referensi");

    // ─── Write to buffer & trigger download ────────────────────────────

    const wbOut = XLSX.write(wb, {
        bookType: "xlsx",
        type: "array",
        cellStyles: true,
    });

    const blob = new Blob([wbOut], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Template_Import_Aset_WIG_${new Date().toISOString().split("T")[0]}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
}
