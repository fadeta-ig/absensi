import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

interface ExportRow {
    [key: string]: string | number | null | undefined;
}

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session || session.role !== "hr") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type");
        const period = searchParams.get("period"); // YYYY-MM
        const format = searchParams.get("format") || "excel";

        if (!type || !period) {
            return NextResponse.json({ error: "Parameter type dan period harus diisi" }, { status: 400 });
        }

        const employees = await prisma.employee.findMany({
            select: { employeeId: true, name: true, department: true, position: true },
        });
        const empMap = new Map(employees.map((e) => [e.employeeId, e]));

        let rows: ExportRow[] = [];
        let sheetName = "";

        if (type === "attendance") {
            const records = await prisma.attendanceRecord.findMany({
                where: { date: { startsWith: period } },
                orderBy: { date: "asc" },
            });
            sheetName = "Laporan Absensi";
            rows = records.map((r) => {
                const emp = empMap.get(r.employeeId);
                return {
                    "ID Karyawan": r.employeeId,
                    "Nama": emp?.name || "-",
                    "Departemen": emp?.department || "-",
                    "Tanggal": r.date,
                    "Jam Masuk": r.clockIn || "-",
                    "Jam Pulang": r.clockOut || "-",
                    "Status": r.status === "present" ? "Hadir" : r.status === "late" ? "Terlambat" : r.status === "absent" ? "Tidak Hadir" : "Cuti",
                    "Catatan": r.notes || "-",
                };
            });
        } else if (type === "visits") {
            const records = await prisma.visitReport.findMany({
                where: { date: { startsWith: period } },
                orderBy: { date: "asc" },
            });
            sheetName = "Laporan Kunjungan";
            rows = records.map((r) => {
                const emp = empMap.get(r.employeeId);
                return {
                    "ID Karyawan": r.employeeId,
                    "Nama": emp?.name || "-",
                    "Tanggal": r.date,
                    "Nama Klien": r.clientName,
                    "Alamat": r.clientAddress,
                    "Tujuan": r.purpose,
                    "Hasil": r.result || "-",
                    "Status": r.status === "approved" ? "Disetujui" : r.status === "rejected" ? "Ditolak" : "Menunggu",
                };
            });
        } else if (type === "overtime") {
            const records = await prisma.overtimeRequest.findMany({
                where: { date: { startsWith: period } },
                orderBy: { date: "asc" },
            });
            sheetName = "Laporan Lembur";
            rows = records.map((r) => {
                const emp = empMap.get(r.employeeId);
                return {
                    "ID Karyawan": r.employeeId,
                    "Nama": emp?.name || "-",
                    "Tanggal": r.date,
                    "Jam Mulai": r.startTime,
                    "Jam Selesai": r.endTime,
                    "Durasi (Jam)": r.hours,
                    "Alasan": r.reason,
                    "Status": r.status === "approved" ? "Disetujui" : r.status === "rejected" ? "Ditolak" : "Menunggu",
                };
            });
        } else {
            return NextResponse.json({ error: "Tipe tidak valid. Gunakan: attendance, visits, overtime" }, { status: 400 });
        }

        if (rows.length === 0) {
            return NextResponse.json({ error: "Tidak ada data untuk periode ini" }, { status: 404 });
        }

        if (format === "excel") {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(rows);

            // Auto-width columns
            const colWidths = Object.keys(rows[0]).map((key) => {
                const maxLen = Math.max(key.length, ...rows.map((r) => String(r[key] || "").length));
                return { wch: Math.min(maxLen + 2, 40) };
            });
            ws["!cols"] = colWidths;

            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

            return new NextResponse(buffer, {
                headers: {
                    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Content-Disposition": `attachment; filename="${sheetName}_${period}.xlsx"`,
                },
            });
        } else if (format === "json") {
            return NextResponse.json({ sheetName, period, totalRecords: rows.length, data: rows });
        } else {
            return NextResponse.json({ error: "Format harus excel atau json" }, { status: 400 });
        }
    } catch (error) {
        console.error("[Export API Error]:", error);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
