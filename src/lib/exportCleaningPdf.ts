import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface CleaningPdfExportData {
    roomName: string;
    monthWib: string; // "YYYY-MM"
    daysInMonth: number;
    items: Array<{ id: string; name: string; sortOrder: number }>;
    matrix: Array<{
        itemName: string;
        days: Array<{ day: number; isComplete: boolean; isFuture: boolean }>;
    }>;
    inspectedBy: {
        employeeName: string;
        employeeId: string;
        position?: string | null;
        signedAt: string | null;
        signaturePayload?: string | null;
    };
    knownBy: {
        employeeName: string;
        employeeId: string;
        position?: string | null;
        signedAt: string | null;
        signaturePayload?: string | null;
    };
    latestChange?: {
        timestamp: string;
        actorName?: string | null;
    } | null;
}

const MONTH_NAMES = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

function formatMonthYear(monthWib: string): { monthName: string; year: string } {
    const [y, m] = monthWib.split("-");
    const monthName = MONTH_NAMES[parseInt(m, 10) - 1] || m;
    return { monthName, year: y };
}

function formatDateDisplay(isoString: string | null | undefined): string {
    if (!isoString) return "-";
    const d = new Date(isoString);
    return d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Jakarta",
    });
}

function formatDateTimeDisplay(isoString: string | null | undefined): string {
    if (!isoString) return "-";
    const d = new Date(isoString);
    return d.toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
    }) + " WIB";
}

export function exportCleaningMatrixPdf(data: CleaningPdfExportData) {
    const doc = new jsPDF("l", "mm", "a4");
    const pageWidth = 297;
    const { monthName, year } = formatMonthYear(data.monthWib);

    // 1. Header (Centered, bold, all caps) matching image 2
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("CATATAN PEMBERSIHAN DAN SANITASI GREY AREA", pageWidth / 2, 12, { align: "center" });

    doc.setFontSize(10);
    doc.text(`Ruangan : ${data.roomName}`, pageWidth / 2, 17.5, { align: "center" });
    doc.text(`Bulan / Tahun : ${monthName} / ${year}`, pageWidth / 2, 22.5, { align: "center" });

    // Double line separator below header
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.line(10, 25.5, 287, 25.5);
    doc.setLineWidth(0.2);
    doc.line(10, 26.5, 287, 26.5);

    // 2. Table Grid matching image 1
    const headers = ["Tanggal", ...Array.from({ length: data.daysInMonth }, (_, i) => String(i + 1))];
    const body = data.matrix.map((row) => [
        row.itemName,
        ...row.days.map((d) => (d.isComplete ? "v" : d.isFuture ? "-" : "")),
    ]);

    // Calculate dynamic column width
    const itemColWidth = 44;
    const dayColWidth = (277 - itemColWidth) / data.daysInMonth;

    const columnStyles: Record<number, { cellWidth: number; halign: "left" | "center"; fontStyle?: "bold" | "normal" }> = {
        0: { cellWidth: itemColWidth, halign: "left", fontStyle: "bold" },
    };
    for (let i = 1; i <= data.daysInMonth; i++) {
        columnStyles[i] = { cellWidth: dayColWidth, halign: "center" };
    }

    autoTable(doc, {
        head: [headers],
        body,
        startY: 28.5,
        theme: "grid",
        margin: { left: 10, right: 10 },
        styles: {
            fontSize: 7,
            cellPadding: 1,
            halign: "center",
            valign: "middle",
            lineColor: [0, 0, 0],
            lineWidth: 0.15,
            textColor: [0, 0, 0],
            font: "helvetica",
        },
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: "bold",
            lineWidth: 0.2,
            lineColor: [0, 0, 0],
            fontSize: 7,
        },
        alternateRowStyles: {
            fillColor: [255, 255, 255],
        },
        columnStyles,
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

    // 3. Signature Block matching image 3
    const sigTableWidth = 130;
    const colWidth = sigTableWidth / 2; // 65mm each
    const sigTableX = 287 - sigTableWidth; // right-aligned
    const sigTableY = finalY + 4;
    const headerHeight = 6.5;
    const sigAreaHeight = 25;
    const infoHeight = 13;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);

    // Box 1: Diperiksa Oleh
    // Header
    doc.rect(sigTableX, sigTableY, colWidth, headerHeight);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Diperiksa Oleh ,", sigTableX + colWidth / 2, sigTableY + 4.5, { align: "center" });

    // Signature canvas area
    doc.rect(sigTableX, sigTableY + headerHeight, colWidth, sigAreaHeight);
    if (data.inspectedBy.signaturePayload && data.inspectedBy.signaturePayload.startsWith("data:image/png;base64,")) {
        try {
            doc.addImage(
                data.inspectedBy.signaturePayload,
                "PNG",
                sigTableX + 5,
                sigTableY + headerHeight + 1.5,
                colWidth - 10,
                sigAreaHeight - 3
            );
        } catch {
            // If image fails, leave clean area
        }
    }

    // Info area (Name, NIP, Tanggal)
    const infoY1 = sigTableY + headerHeight + sigAreaHeight;
    doc.rect(sigTableX, infoY1, colWidth, infoHeight);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(`( ${data.inspectedBy.employeeName} )`, sigTableX + colWidth / 2, infoY1 + 4, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(`NIP: ${data.inspectedBy.employeeId}`, sigTableX + colWidth / 2, infoY1 + 7.5, { align: "center" });
    doc.text(`Tgl: ${formatDateDisplay(data.inspectedBy.signedAt)}`, sigTableX + colWidth / 2, infoY1 + 11, { align: "center" });

    // Box 2: Mengetahui
    const sigTableX2 = sigTableX + colWidth;
    // Header
    doc.rect(sigTableX2, sigTableY, colWidth, headerHeight);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Mengetahui", sigTableX2 + colWidth / 2, sigTableY + 4.5, { align: "center" });

    // Signature canvas area
    doc.rect(sigTableX2, sigTableY + headerHeight, colWidth, sigAreaHeight);
    if (data.knownBy.signaturePayload && data.knownBy.signaturePayload.startsWith("data:image/png;base64,")) {
        try {
            doc.addImage(
                data.knownBy.signaturePayload,
                "PNG",
                sigTableX2 + 5,
                sigTableY + headerHeight + 1.5,
                colWidth - 10,
                sigAreaHeight - 3
            );
        } catch {
            // If image fails, leave clean area
        }
    }

    // Info area (Name, NIP, Tanggal)
    const infoY2 = sigTableY + headerHeight + sigAreaHeight;
    doc.rect(sigTableX2, infoY2, colWidth, infoHeight);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.text(`( ${data.knownBy.employeeName} )`, sigTableX2 + colWidth / 2, infoY2 + 4, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(`NIP: ${data.knownBy.employeeId}`, sigTableX2 + colWidth / 2, infoY2 + 7.5, { align: "center" });
    doc.text(`Tgl: ${formatDateDisplay(data.knownBy.signedAt)}`, sigTableX2 + colWidth / 2, infoY2 + 11, { align: "center" });

    // 4. Notes & Print timestamp on Bottom Left
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);

    let noteY = sigTableY + 4;
    doc.text("Keterangan:", 10, noteY);
    doc.text("• v = Selesai dibersihkan & disanitasi", 10, noteY + 3.5);
    doc.text("• - = Belum jadwal / tanggal mendatang", 10, noteY + 7);

    if (data.latestChange) {
        noteY += 12;
        doc.text(
            `* Pembaruan data checklist terakhir: ${formatDateTimeDisplay(data.latestChange.timestamp)}${
                data.latestChange.actorName ? ` oleh ${data.latestChange.actorName}` : ""
            }`,
            10,
            noteY
        );
    }

    // Footer bottom
    doc.text(
        `Dicetak: ${formatDateTimeDisplay(new Date().toISOString())} | PT Wijaya Inovasi Gemilang`,
        10,
        202
    );

    // Save PDF
    const cleanRoomName = data.roomName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `Checklist_Kebersihan_${cleanRoomName}_${data.monthWib}.pdf`;
    doc.save(filename);
}
