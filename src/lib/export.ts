import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ============== Excel Export ==============
export function exportToExcel(
    data: Record<string, string | number>[],
    headers: { key: string; label: string }[],
    filename: string,
    sheetName = "Sheet1"
) {
    const rows = data.map((row) =>
        headers.reduce((obj, h) => ({ ...obj, [h.label]: row[h.key] ?? "" }), {} as Record<string, string | number>)
    );
    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto-size columns
    const colWidths = headers.map((h) => {
        const maxLen = Math.max(
            h.label.length,
            ...rows.map((r) => String(r[h.label] ?? "").length)
        );
        return { wch: Math.min(maxLen + 2, 40) };
    });
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ============== PDF Table Export ==============
export function exportToPdfTable(
    data: (string | number)[][],
    headers: string[],
    title: string,
    filename: string,
    subtitle?: string
) {
    const doc = new jsPDF("l", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("PT Wijaya Inovasi Gemilang", pageWidth / 2, 15, { align: "center" });

    doc.setFontSize(11);
    doc.text(title, pageWidth / 2, 22, { align: "center" });

    if (subtitle) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(subtitle, pageWidth / 2, 28, { align: "center" });
    }

    autoTable(doc, {
        head: [headers],
        body: data,
        startY: subtitle ? 33 : 28,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: {
            fillColor: [128, 0, 32], // maroon
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 8,
        },
        alternateRowStyles: { fillColor: [250, 245, 245] },
        theme: "grid",
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.text(
            `Dicetak: ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} | Halaman ${i} / ${pageCount}`,
            pageWidth / 2,
            pageHeight - 8,
            { align: "center" }
        );
    }

    doc.save(`${filename}.pdf`);
}

// ============== Payslip PDF ==============
interface PayslipItem { name: string; amount: number; }
interface PayslipData {
    employeeId: string;
    employeeName?: string;
    period: string;
    basicSalary: number;
    overtime: number;
    allowances: PayslipItem[];
    deductions: PayslipItem[];
    netSalary: number;
    issuedDate: string;
    notes?: string;
}

export function exportPayslipPdf(payslip: PayslipData) {
    const doc = new jsPDF("p", "mm", "a4");
    const w = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

    // Company header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("PT Wijaya Inovasi Gemilang", w / 2, y, { align: "center" });
    y += 7;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("SLIP GAJI KARYAWAN", w / 2, y, { align: "center" });
    y += 5;

    // Line
    doc.setDrawColor(128, 0, 32);
    doc.setLineWidth(0.8);
    doc.line(margin, y, w - margin, y);
    y += 8;

    // Employee info
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`ID Karyawan`, margin, y);
    doc.text(`: ${payslip.employeeId}`, margin + 35, y);
    if (payslip.employeeName) {
        y += 5;
        doc.text(`Nama`, margin, y);
        doc.text(`: ${payslip.employeeName}`, margin + 35, y);
    }
    y += 5;
    doc.text(`Periode`, margin, y);
    doc.text(`: ${payslip.period}`, margin + 35, y);
    y += 5;
    doc.text(`Tanggal Cetak`, margin, y);
    doc.text(`: ${new Date(payslip.issuedDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`, margin + 35, y);
    y += 8;

    // Salary table
    const tableBody: (string | number)[][] = [];

    tableBody.push(["Gaji Pokok", "", fmt(payslip.basicSalary)]);

    if (payslip.allowances.length > 0) {
        tableBody.push([{ content: "TUNJANGAN", colSpan: 3, styles: { fontStyle: "bold", fillColor: [240, 240, 240] } } as unknown as string]);
        payslip.allowances.forEach((a) => {
            tableBody.push([`  ${a.name}`, "", fmt(a.amount)]);
        });
        const totalAllow = payslip.allowances.reduce((s, a) => s + a.amount, 0);
        tableBody.push(["  Subtotal Tunjangan", "", fmt(totalAllow)]);
    }

    if (payslip.overtime > 0) {
        tableBody.push(["Lembur", "", fmt(payslip.overtime)]);
    }

    if (payslip.deductions.length > 0) {
        tableBody.push([{ content: "POTONGAN", colSpan: 3, styles: { fontStyle: "bold", fillColor: [240, 240, 240] } } as unknown as string]);
        payslip.deductions.forEach((d) => {
            tableBody.push([`  ${d.name}`, "", `(${fmt(d.amount)})`]);
        });
        const totalDed = payslip.deductions.reduce((s, d) => s + d.amount, 0);
        tableBody.push(["  Subtotal Potongan", "", `(${fmt(totalDed)})`]);
    }

    autoTable(doc, {
        body: tableBody,
        startY: y,
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 30 },
            2: { cellWidth: 50, halign: "right" },
        },
        theme: "plain",
        margin: { left: margin, right: margin },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 3;

    // Net salary
    doc.setFillColor(128, 0, 32);
    doc.rect(margin, y, w - margin * 2, 12, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("TAKE HOME PAY", margin + 5, y + 8);
    doc.text(fmt(payslip.netSalary), w - margin - 5, y + 8, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 18;

    // Notes
    if (payslip.notes) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.text(`Catatan: ${payslip.notes}`, margin, y);
        y += 8;
    }

    // Signature area
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Diterima oleh,", margin + 10, y);
    doc.text("Disetujui oleh,", w - margin - 45, y);
    y += 25;
    doc.text("(_________________)", margin + 5, y);
    doc.text("(_________________)", w - margin - 50, y);
    y += 5;
    doc.setFontSize(7);
    doc.text("Karyawan", margin + 14, y);
    doc.text("HR Manager", w - margin - 42, y);

    // Footer
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.text("Dokumen ini dicetak secara otomatis oleh sistem WIG Attendance.", w / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });

    doc.save(`Slip_Gaji_${payslip.employeeId}_${payslip.period}.pdf`);
}
