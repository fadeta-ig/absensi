import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface CleaningPdfSignatureEntry {
    employeeName: string;
    employeeId: string;
    position?: string | null;
    signedAt: string | null;
    signaturePayload?: string | null;
    signaturePath?: string | null;
}

export interface CleaningPdfExportData {
    roomName: string;
    monthWib: string; // "YYYY-MM"
    daysInMonth: number;
    items: Array<{ id: string; name: string; sortOrder: number }>;
    matrix: Array<{
        itemName: string;
        days: Array<{ day: number; isComplete: boolean; isFuture: boolean; isUnavailable?: boolean; checkedBy?: string | null }>;
    }>;
    inspectedBy: CleaningPdfSignatureEntry;
    knownBy: CleaningPdfSignatureEntry;
    latestChange?: {
        timestamp: string;
        actorName?: string | null;
    } | null;
}

/**
 * Dual-read untuk embed TTD (Gel.2c):
 * server sudah menyelesaikan signaturePath disk menjadi data URL pada signaturePayload,
 * sehingga klien hanya perlu memakai payload valid; path mentah tidak diunduh langsung.
 * Kembalikan data URL PNG bila valid, selain itu null (area TTD dibiarkan kosong).
 */
export function selectSignatureImageForPdf(
    entry: Pick<CleaningPdfSignatureEntry, "signaturePayload" | "signaturePath"> | null | undefined
): string | null {
    if (!entry) return null;
    const payload = entry.signaturePayload;
    if (typeof payload === "string" && payload.startsWith("data:image/png;base64,")) {
        return payload;
    }
    return null;
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

/**
 * Singkatan deterministik untuk nama petugas penanda checklist pada PDF rekap:
 * nama satu kata memakai 2 huruf pertama (Heri → HE), nama multi-kata memakai inisial
 * dua token pertama (Andi Saputra → AS). Bila dua nama menghasilkan kode sama,
 * kode diperpanjang dari huruf nama sampai unik. DAFTAR ini dikembalikan untuk
 * dicetakan sebagai foot note legenda.
 */
export function buildCheckerCodeList(data: Pick<CleaningPdfExportData, "matrix">): Array<{ code: string; name: string }> {
    const names = new Set<string>();
    for (const row of data.matrix) {
        for (const day of row.days) {
            const name = day.checkedBy?.trim();
            if (day.isComplete && name) names.add(name);
        }
    }
    const ordered = Array.from(names).sort((a, b) => a.localeCompare(b, "id"));
    const used = new Set<string>();
    const entries: Array<{ code: string; name: string }> = [];
    for (const name of ordered) {
        const tokens = name.toUpperCase().replace(/[^A-Z\s]/g, " ").split(/\s+/).filter(Boolean);
        const letters = tokens.join("");
        let code =
            tokens.length === 0
                ? "??"
                : tokens.length === 1
                    ? tokens[0].slice(0, 2)
                    : `${tokens[0][0]}${tokens[1][0]}`;
        let cursor = 2;
        while (used.has(code)) {
            cursor += 1;
            const extended = letters.slice(0, cursor);
            code = extended || `${code}?`;
        }
        used.add(code);
        entries.push({ code, name });
    }
    return entries;
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
    // Sel "selesai" memakai singkatan nama petugas (legenda di kaki PDF),
    // bukan simbol v — agar terlihat siapa yang menandai setiap item.
    const checkerCodes = buildCheckerCodeList(data);
    const codeByName = new Map(checkerCodes.map((c) => [c.name, c.code]));
    const headers = ["Tanggal", ...Array.from({ length: data.daysInMonth }, (_, i) => String(i + 1))];
    const body = data.matrix.map((row) => [
        row.itemName,
        ...row.days.map((d) => {
            if (d.isComplete) {
                // Data lama tanpa aktor tetap ditandai "v".
                const name = d.checkedBy?.trim();
                return (name && codeByName.get(name)) || "v";
            }
            if (d.isUnavailable) return "TA";
            if (d.isFuture) return "-";
            return "";
        }),
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
    const inspectedImage = selectSignatureImageForPdf(data.inspectedBy);
    if (inspectedImage) {
        try {
            doc.addImage(
                inspectedImage,
                "PNG",
                sigTableX + 5,
                sigTableY + headerHeight + 1.5,
                colWidth - 10,
                sigAreaHeight - 3
            );
        } catch {
            // If image fails, leave clean area
        }
    } else if (data.inspectedBy.signedAt) {
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "italic");
        doc.text("gambar tidak tersedia", sigTableX + colWidth / 2, sigTableY + headerHeight + sigAreaHeight / 2, { align: "center" });
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
    const knownImage = selectSignatureImageForPdf(data.knownBy);
    if (knownImage) {
        try {
            doc.addImage(
                knownImage,
                "PNG",
                sigTableX2 + 5,
                sigTableY + headerHeight + 1.5,
                colWidth - 10,
                sigAreaHeight - 3
            );
        } catch {
            // If image fails, leave clean area
        }
    } else if (data.knownBy.signedAt) {
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "italic");
        doc.text("gambar tidak tersedia", sigTableX2 + colWidth / 2, sigTableY + headerHeight + sigAreaHeight / 2, { align: "center" });
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

    // Lebar kolom kiri sebelum kotak TTD kanan (sigTableX=157): bungkus teks
    // agar tidak melebar ke area TTD bila nama petugas panjang.
    const leftNotesWidth = sigTableX - 10 - 4;
    const LINE_STEP = 3.5;

    let noteY = sigTableY + 4;
    doc.text("Keterangan:", 10, noteY);
    const legendLines = [
        checkerCodes.length > 0
            ? "• Kode singkat = Selesai dibersihkan & disanitasi (petugas tercantum di bawah)"
            : "• v = Selesai dibersihkan & disanitasi",
        "• (kosong) = Belum dikerjakan",
        "• TA = Tidak ada di ruangan",
        "• - = Belum jadwal / tanggal mendatang",
    ];
    for (const line of legendLines) {
        const wrapped = doc.splitTextToSize(line, leftNotesWidth) as string[];
        for (const sub of wrapped) {
            noteY += LINE_STEP;
            doc.text(sub, 10, noteY);
        }
    }

    // Foot note: siapa siapa (kode → nama lengkap), kelompok 3 entri per baris.
    // Jeda seksi 5mm (bukan 1.5mm) agar tidak timpa baris legenda di atasnya.
    if (checkerCodes.length > 0) {
        noteY += 5;
        doc.setFont("helvetica", "bold");
        doc.text("Catatan singkatan petugas:", 10, noteY);
        doc.setFont("helvetica", "normal");
        for (let i = 0; i < checkerCodes.length; i += 3) {
            const rowText =
                "• " + checkerCodes.slice(i, i + 3).map((c) => `${c.code} = ${c.name}`).join("  ·  ");
            const wrapped = doc.splitTextToSize(rowText, leftNotesWidth) as string[];
            for (const sub of wrapped) {
                noteY += LINE_STEP;
                doc.text(sub, 10, noteY);
            }
        }
    }

    if (data.latestChange) {
        const changeText =
            `* Pembaruan data checklist terakhir: ${formatDateTimeDisplay(data.latestChange.timestamp)}${
                data.latestChange.actorName ? ` oleh ${data.latestChange.actorName}` : ""
            }`;
        const wrapped = doc.splitTextToSize(changeText, leftNotesWidth) as string[];
        // Baris pertama diberi jeda seksi 6mm, lanjutannya rapat normal.
        let first = true;
        for (const sub of wrapped) {
            noteY += first ? 6 : LINE_STEP;
            first = false;
            doc.text(sub, 10, noteY);
        }
    }

    // Footer: tetap di 202 bila muat, turun mengikuti catatan bila panjang,
    // pindah halaman baru bila sudah mepet batas bawah (tinggi halaman 210).
    let footerY = Math.max(202, noteY + 8);
    if (footerY > 205) {
        doc.addPage();
        footerY = 20;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 100, 100);
    }
    doc.text(
        `Dicetak: ${formatDateTimeDisplay(new Date().toISOString())} | PT Wijaya Inovasi Gemilang`,
        10,
        footerY
    );

    // Save PDF
    const cleanRoomName = data.roomName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `Checklist_Kebersihan_${cleanRoomName}_${data.monthWib}.pdf`;
    doc.save(filename);
}
