import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { getAssets } from "@/lib/services/assetService";
import ExcelJS from "exceljs";

export async function GET(request: NextRequest) {
    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "ga" && session.role !== "hr") return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get("category") ?? undefined;
        const excludeCategory = searchParams.get("excludeCategory") ?? undefined;
        const status = searchParams.get("status") ?? undefined;
        const kondisi = searchParams.get("kondisi") ?? undefined;
        const search = searchParams.get("search") ?? undefined;

        // Fetch all matching data (no pagination)
        const includeCompanyOwned = session.role === "ga";
        const result = await getAssets({
            includeCompanyOwned,
            category,
            excludeCategory,
            status,
            kondisi,
            search,
            limit: 100000 // A safe high number for export
        });

        const assets = result.data;

        // Create workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "WIG IT System";
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet("Data Aset", {
            views: [{ showGridLines: false }]
        });

        // 1. Add Title / Report Header
        worksheet.mergeCells("A1:K1");
        const titleCell = worksheet.getCell("A1");
        titleCell.value = "LAPORAN DATA INVENTARIS ASET WIG";
        titleCell.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
        titleCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF1E293B" } // slate-800
        };
        titleCell.alignment = { vertical: "middle", horizontal: "center" };

        worksheet.mergeCells("A2:K2");
        const subtitleCell = worksheet.getCell("A2");
        subtitleCell.value = `Tanggal Cetak: ${new Date().toLocaleDateString("id-ID")} | Total Aset: ${assets.length}`;
        subtitleCell.font = { name: "Arial", size: 10, italic: true };
        subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
        
        worksheet.addRow([]); // empty row A3

        // 2. Define Table Header
        const headers = ["No", "Kode Aset", "Nama Aset", "Kategori", "Manufaktur", "S/N", "Kondisi", "Status", "Lokasi/Pemegang", "Tgl Beli", "Harga (Rp)"];
        const headerRow = worksheet.addRow(headers);
        
        headerRow.eachCell((cell) => {
            cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
            cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF475569" } // slate-600
            };
            cell.alignment = { vertical: "middle", horizontal: "center" };
            cell.border = {
                top: { style: "thin", color: { argb: "FFCBD5E1" } },
                left: { style: "thin", color: { argb: "FFCBD5E1" } },
                bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
                right: { style: "thin", color: { argb: "FFCBD5E1" } }
            };
        });

        // 3. Add Data Rows
        assets.forEach((a, index) => {
            const dipegangOleh = a.holderType === "GA_POOL" ? "GA Pool (Tersedia)" :
                                 a.holderType === "COMPANY_OWNED" ? "Milik Perusahaan (Disimpan)" :
                                 a.assignedEmployee?.name || a.assignedToName || a.holderType;
            
            const dept = a.assignedEmployee?.department ? ` (${a.assignedEmployee.department})` : "";

            const row = worksheet.addRow([
                index + 1,
                a.assetCode,
                a.name,
                a.category?.name || "-",
                a.manufacturer || "-",
                a.serialNumber || "-",
                a.kondisi,
                a.status,
                `${dipegangOleh}${dept}`,
                a.purchaseDate ? new Date(a.purchaseDate).toLocaleDateString("id-ID") : "-",
                a.purchasePrice || 0
            ]);

            row.eachCell((cell, colNumber) => {
                cell.font = { name: "Arial", size: 10 };
                cell.border = {
                    top: { style: "thin", color: { argb: "FFCBD5E1" } },
                    left: { style: "thin", color: { argb: "FFCBD5E1" } },
                    bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
                    right: { style: "thin", color: { argb: "FFCBD5E1" } }
                };
                
                // Alignment
                if ([1, 10].includes(colNumber)) { // No, Tgl Beli
                    cell.alignment = { vertical: "middle", horizontal: "center" };
                } else if (colNumber === 11) { // Harga
                    cell.alignment = { vertical: "middle", horizontal: "right" };
                    cell.numFmt = '"Rp"#,##0.00';
                } else {
                    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
                }

                // Alternate row color
                if (index % 2 === 1) {
                    cell.fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: "FFF8FAFC" } // slate-50
                    };
                }
            });
        });

        // 4. Adjust Column Widths
        worksheet.columns = [
            { width: 5 },  // No
            { width: 15 }, // Kode
            { width: 30 }, // Nama
            { width: 15 }, // Kategori
            { width: 15 }, // Manufaktur
            { width: 20 }, // S/N
            { width: 15 }, // Kondisi
            { width: 15 }, // Status
            { width: 35 }, // Pemegang
            { width: 15 }, // Tgl
            { width: 20 }  // Harga
        ];

        // 5. Generate Response Buffer
        const buffer = await workbook.xlsx.writeBuffer();

        const response = new NextResponse(buffer);
        response.headers.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.headers.set("Content-Disposition", `attachment; filename="Data_Aset_WIG_${new Date().toISOString().split("T")[0]}.xlsx"`);

        return response;

    } catch (err) {
        return serverErrorResponse("AssetsExportGET", err);
    }
}
