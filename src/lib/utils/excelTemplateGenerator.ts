type CategoryInfo = { prefix: string; name: string };

/**
 * Generates a beautifully styled Excel (.xlsx) template for bulk asset import.
 * Uses ExcelJS with custom cell styling, column widths, and an info sheet.
 */
export async function generateBulkImportTemplate(categories: CategoryInfo[]) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "WIG IT System";
    
    // ─── Sheet 1: DATA IMPORT ───────────────────────────────────────────
    const ws = wb.addWorksheet("📋 Data Import", {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] // freeze first row
    });

    const headers = [
        "Prefix Kategori *",
        "Nama Aset *",
        "Kondisi *",
        "Manufaktur (Brand)",
        "Model Spesifik",
        "Serial Number (S/N)",
        "Keterangan / Catatan",
    ];

    const headerRow = ws.addRow(headers);
    headerRow.height = 30;

    headerRow.eachCell((cell, colNumber) => {
        cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
        // Required columns 1,2,3 -> indigo-950 (FF312E81), others slate-800 (FF1E293B)
        const isRequired = colNumber <= 3;
        cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: isRequired ? "FF312E81" : "FF1E293B" }
        };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = {
            top: { style: "thin", color: { argb: "FF334155" } },
            bottom: { style: "medium", color: { argb: "FF6366F1" } },
            left: { style: "thin", color: { argb: "FF334155" } },
            right: { style: "thin", color: { argb: "FF334155" } }
        };
    });

    // Sample Rows
    const sampleRows = [
        ["LAP", "MacBook Pro M2 13 Inch", "BAIK", "Apple", "MacBook Pro 13 M2", "C02XG123JKLM", "Pembelian Q2 2025"],
        ["HP", "Samsung Galaxy S23 Ultra", "BAIK", "Samsung", "SM-S918B", "R9BT123456789", "Untuk Direktur Marketing"],
        ["LAP", "ThinkPad E14 Gen 4", "KURANG_BAIK", "Lenovo", "E14 Gen4 AMD", "PF-0A12345", "Baterai mulai drop"],
    ];

    sampleRows.forEach(rowData => {
        const row = ws.addRow(rowData);
        row.height = 22;
        row.eachCell(cell => {
            cell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF475569" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
            cell.alignment = { vertical: "middle" };
            cell.border = {
                top: { style: "thin", color: { argb: "FFE2E8F0" } },
                bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
                left: { style: "thin", color: { argb: "FFE2E8F0" } },
                right: { style: "thin", color: { argb: "FFE2E8F0" } },
            };
        });
    });

    // Column widths
    ws.columns = [
        { width: 22 }, // Prefix Kategori
        { width: 38 }, // Nama Aset
        { width: 18 }, // Kondisi
        { width: 25 }, // Manufaktur
        { width: 28 }, // Model
        { width: 26 }, // Serial Number
        { width: 40 }, // Keterangan
    ];


    // ─── Sheet 2: PANDUAN & REFERENSI ──────────────────────────────────
    const wsGuide = wb.addWorksheet("🔖 Panduan & Referensi");

    wsGuide.columns = [
        { width: 42 }, 
        { width: 48 }, 
        { width: 12 }, 
        { width: 12 }
    ];

    const addGuideRow = (data: any[], styleType: "title" | "section" | "labelValue" | "prefix" | "normal" | "empty") => {
        const row = wsGuide.addRow(data);
        if (styleType === "title") {
            wsGuide.mergeCells(`A${row.number}:D${row.number}`);
            row.height = 30;
            const cell = row.getCell(1);
            cell.font = { name: "Arial", bold: true, size: 14, color: { argb: "FF1E293B" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
            cell.border = { bottom: { style: "medium", color: { argb: "FF6366F1" } } };
            cell.alignment = { vertical: "middle" };
        } else if (styleType === "section") {
            row.height = 24;
            const cell = row.getCell(1);
            cell.font = { name: "Arial", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF475569" } };
            cell.alignment = { vertical: "middle" };
        } else if (styleType === "labelValue") {
            row.height = 20;
            const cellLabel = row.getCell(1);
            cellLabel.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF334155" } };
            cellLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
            cellLabel.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
            cellLabel.alignment = { vertical: "middle" };

            const cellValue = row.getCell(2);
            cellValue.font = { name: "Arial", size: 10, color: { argb: "FF475569" } };
            cellValue.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
            cellValue.alignment = { vertical: "middle", wrapText: true };
        } else if (styleType === "prefix") {
            row.height = 20;
            const cellLabel = row.getCell(1); // Prefix
            cellLabel.font = { name: "Arial", bold: true, size: 10, color: { argb: "FFFFFFFF" } };
            cellLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
            cellLabel.alignment = { vertical: "middle", horizontal: "center" };

            const cellValue = row.getCell(2); // Name
            cellValue.font = { name: "Arial", bold: true, size: 10, color: { argb: "FF1E293B" } };
            cellValue.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
            cellValue.alignment = { vertical: "middle" };
        } else if (styleType === "normal") {
            row.eachCell(cell => { cell.font = { name: "Arial", size: 10 }; });
        }
    };

    addGuideRow(["🗂️ PANDUAN PENGGUNAAN TEMPLATE IMPORT ASET — WIG HRIS", "", "", ""], "title");
    addGuideRow(["", "", "", ""], "empty");
    addGuideRow(["ATURAN PENGISIAN", "", "", ""], "section");
    addGuideRow(["Kolom Wajib", "Prefix Kategori, Nama Aset, Kondisi", "", ""], "labelValue");
    addGuideRow(["Nilai Kondisi Valid", "BAIK  |  KURANG_BAIK  |  RUSAK", "", ""], "labelValue");
    addGuideRow(["Batas Maksimum", "300 baris data per satu kali import", "", ""], "labelValue");
    addGuideRow(["Format File Diterima", "CSV (.csv) atau Excel (.xlsx) — sistem akan membaca baris pertama sebagai header", "", ""], "labelValue");
    addGuideRow(["Baris Contoh", "Baris berwarna abu-abu adalah CONTOH. Silahkan hapus sebelum import.", "", ""], "labelValue");
    addGuideRow(["", "", "", ""], "empty");
    addGuideRow(["REFERENSI PREFIX KATEGORI", "", "", ""], "section");
    addGuideRow(["Prefix", "Nama Kategori", "", ""], "labelValue");
    
    if (categories.length === 0) {
        addGuideRow(["(Tidak ada data)", "", "", ""], "labelValue");
    } else {
        categories.forEach(c => {
            addGuideRow([c.prefix, c.name, "", ""], "prefix");
        });
    }

    addGuideRow(["", "", "", ""], "empty");
    addGuideRow(["TANDA BINTANG (*)", "", "", ""], "section");
    addGuideRow(["Kolom header yang mengandung tanda (*)", "WAJIB diisi. Jangan biarkan kosong!", "", ""], "labelValue");
    addGuideRow(["", "", "", ""], "empty");
    addGuideRow(["© WIG HRIS — General Affairs Portal", "", "", ""], "normal");

    // ─── Write to buffer & trigger download ────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Template_Import_Aset_WIG_${new Date().toISOString().split("T")[0]}.xlsx`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
