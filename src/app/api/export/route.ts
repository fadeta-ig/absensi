import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorizedResponse, forbiddenResponse, serverErrorResponse } from "@/lib/middleware/apiGuard";
import { checkApiRateLimit } from "@/lib/middleware/rateLimit";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import logger from "@/lib/logger";
import { toDateDisplay, toTimeString } from "@/lib/utils";

interface ExportRow {
    [key: string]: string | number | null | undefined;
}

// Date/time helpers now imported from @/lib/utils (toDateDisplay, toTimeString)
// Alias for backward compatibility within this file
const toDateStr = toDateDisplay;

/** Buat Date range dari string periode YYYY-MM */
const periodToRange = (period: string) => {
    const [year, month] = period.split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1); // exclusive
    return { gte: start, lt: end };
};

export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type");
        const period = searchParams.get("period"); // YYYY-MM
        const format = searchParams.get("format") || "excel";
        const isGrouped = searchParams.get("grouped") === "true";
        const mode = searchParams.get("mode"); // matrix

        if (!type || !period) {
            return NextResponse.json({ error: "Parameter tipe data dan periode harus diisi." }, { status: 400 });
        }

        const [year, month] = period.split("-").map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();

        const employees = await prisma.employee.findMany({
            select: { employeeId: true, name: true, department: true, position: true },
            orderBy: { name: "asc" }
        });
        const empMap = new Map(employees.map((e) => [e.employeeId, e]));

        let rows: ExportRow[] = [];
        let sheetName = "";
        let finalHeaders: string[] = [];

        if (type === "attendance") {
            const records = await prisma.attendanceRecord.findMany({
                where: { date: periodToRange(period) },
                orderBy: { date: "asc" },
            });
            sheetName = "Laporan Absensi";

            if (mode === "matrix") {
                finalHeaders = ["Nama Karyawan", "ID Karyawan", "Departemen"];
                for (let i = 1; i <= daysInMonth; i++) finalHeaders.push(String(i));
                finalHeaders.push("Hadir", "Lambat", "Alpa");

                // Horizontal Matrix: Employees as Rows, Dates as Columns
                rows = employees.map((emp) => {
                    const empRecords = records.filter((r) => r.employeeId === emp.employeeId);
                    const row: ExportRow = {
                        "Nama Karyawan": emp.name,
                        "ID Karyawan": emp.employeeId,
                        "Departemen": emp.department || "-",
                    };

                    // Fill days 1 to daysInMonth
                    for (let d = 1; d <= daysInMonth; d++) {
                        const dateStr = `${period}-${String(d).padStart(2, "0")}`;
                        const record = empRecords.find((r) => toDateStr(r.date) === dateStr);

                        if (record) {
                            // Use time format (HH:MM) for clock-in/out display
                            const clockIn = record.clockIn ? toTimeString(record.clockIn) : "-";
                            const clockOut = record.clockOut ? toTimeString(record.clockOut) : "-";
                            row[String(d)] = `${clockIn}\n${clockOut}`;
                        } else {
                            row[String(d)] = "-\n-";
                        }
                    }

                    // Add Summary
                    row["Hadir"] = empRecords.filter(r => r.status === "present" || r.status === "late").length;
                    row["Lambat"] = empRecords.filter(r => r.status === "late").length;
                    row["Alpa"] = empRecords.filter(r => r.status === "absent").length;

                    return row;
                });
                sheetName = `Rekap_Absensi_${period}`;
            } else if (isGrouped) {
                // Group by employee
                const groupedMap = new Map<string, typeof records>();
                records.forEach((r) => {
                    const group = groupedMap.get(r.employeeId) || [];
                    group.push(r);
                    groupedMap.set(r.employeeId, group);
                });

                // Convert to rows with headers and summaries
                const sortedEmpIds = Array.from(groupedMap.keys()).sort((a, b) => {
                    const nameA = empMap.get(a)?.name || "";
                    const nameB = empMap.get(b)?.name || "";
                    return nameA.localeCompare(nameB);
                });

                const finalRows: ExportRow[] = [];
                sortedEmpIds.forEach((empId) => {
                    const emp = empMap.get(empId);
                    const empRecords = groupedMap.get(empId)!;

                    // Header for Employee
                    finalRows.push({
                        "Nama": emp?.name || "-",
                        "ID Karyawan": `KARYAWAN: ${empId}`,
                        "Departemen": emp?.department || "-", "Tanggal": "", "Jam Masuk": "", "Jam Pulang": "", "Status": "", "Catatan": ""
                    });

                    let totalPresent = 0;
                    let totalLate = 0;

                    empRecords.forEach((r) => {
                        if (r.status === "present" || r.status === "late") totalPresent++;
                        if (r.status === "late") totalLate++;

                        finalRows.push({
                            "Nama": emp?.name || "-",
                            "ID Karyawan": r.employeeId,
                            "Departemen": emp?.department || "-",
                            "Tanggal": toDateStr(r.date),
                            "Jam Masuk": r.clockIn ? toTimeString(r.clockIn) : "-",
                            "Jam Pulang": r.clockOut ? toTimeString(r.clockOut) : "-",
                            "Status": r.status === "present" ? "Hadir" : r.status === "late" ? "Terlambat" : r.status === "absent" ? "Alpa" : "Cuti/Sakit",
                            "Catatan": r.notes || "-",
                        });
                    });

                    // Summary for Employee
                    finalRows.push({
                        "ID Karyawan": "RINGKASAN:",
                        "Nama": `Total: ${empRecords.length} Hari`,
                        "Departemen": `Hadir: ${totalPresent}`,
                        "Tanggal": `Terlambat: ${totalLate}`,
                        "Jam Masuk": "", "Jam Pulang": "", "Status": "", "Catatan": ""
                    });
                    finalRows.push({}); // Empty row separator
                });
                rows = finalRows;
            } else {
                finalHeaders = ["Nama", "ID Karyawan", "Departemen", "Tanggal", "Jam Masuk", "Jam Pulang", "Status", "Catatan"];
                rows = records.map((r) => {
                    const emp = empMap.get(r.employeeId);
                    return {
                        "Nama": emp?.name || "-",
                        "ID Karyawan": r.employeeId,
                        "Departemen": emp?.department || "-",
                        "Tanggal": toDateStr(r.date),
                        "Jam Masuk": r.clockIn ? toTimeString(r.clockIn) : "-",
                        "Jam Pulang": r.clockOut ? toTimeString(r.clockOut) : "-",
                        "Status": r.status === "present" ? "Hadir" : r.status === "late" ? "Terlambat" : r.status === "absent" ? "Tidak Hadir" : "Cuti",
                        "Catatan": r.notes || "-",
                    };
                });
            }
        } else if (type === "visits") {
            finalHeaders = ["Nama", "ID Karyawan", "Tanggal", "Nama Klien", "Alamat", "Tujuan", "Hasil", "Status"];
            const records = await prisma.visitReport.findMany({
                where: { date: periodToRange(period) },
                orderBy: { date: "asc" },
            });
            sheetName = "Laporan Kunjungan";
            rows = records.map((r) => {
                const emp = empMap.get(r.employeeId);
                return {
                    "Nama": emp?.name || "-",
                    "ID Karyawan": r.employeeId,
                    "Tanggal": toDateStr(r.date),
                    "Nama Klien": r.clientName,
                    "Alamat": r.clientAddress,
                    "Tujuan": r.purpose,
                    "Hasil": r.result || "-",
                    "Status": r.status === "approved" ? "Disetujui" : r.status === "rejected" ? "Ditolak" : "Menunggu",
                };
            });
        } else if (type === "overtime") {
            finalHeaders = ["Nama", "ID Karyawan", "Tanggal", "Jam Mulai", "Jam Selesai", "Durasi (Jam)", "Alasan", "Status"];
            const records = await prisma.overtimeRequest.findMany({
                where: { date: periodToRange(period) },
                orderBy: { date: "asc" },
            });
            sheetName = "Laporan Lembur";
            rows = records.map((r) => {
                const emp = empMap.get(r.employeeId);
                return {
                    "Nama": emp?.name || "-",
                    "ID Karyawan": r.employeeId,
                    "Tanggal": toDateStr(r.date),
                    "Jam Mulai": toDateStr(r.startTime),
                    "Jam Selesai": toDateStr(r.endTime),
                    "Durasi (Jam)": r.hours,
                    "Alasan": r.reason,
                    "Status": r.status === "approved" ? "Disetujui" : r.status === "rejected" ? "Ditolak" : "Menunggu",
                };
            });
        } else {
            return NextResponse.json({ error: "Tipe laporan tidak valid. Gunakan: attendance, visits, atau overtime." }, { status: 400 });
        }

        if (rows.length === 0) {
            return NextResponse.json({ error: "Tidak ditemukan data untuk periode ini." }, { status: 404 });
        }

        if (format === "preview" || format === "json") {
            return NextResponse.json({
                sheetName,
                period,
                totalRecords: rows.length,
                data: rows,
                headers: finalHeaders
            });
        }

        if (format === "excel") {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(rows, { header: finalHeaders });

            // Professional column widths logic
            ws["!cols"] = finalHeaders.map(h => {
                if (h === "Nama" || h === "Nama Karyawan") return { wch: 25 };
                if (h === "Departemen") return { wch: 18 };
                if (h === "No") return { wch: 5 };
                if (h === "ID Karyawan") return { wch: 15 };
                if (!isNaN(Number(h))) return { wch: 8 };
                return { wch: 12 };
            });

            XLSX.utils.book_append_sheet(wb, ws, "Laporan");
            const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

            return new NextResponse(excelBuffer, {
                headers: {
                    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "Content-Disposition": `attachment; filename="${sheetName}_${period}.xlsx"`,
                },
            });
        } else {
            return NextResponse.json({ error: "Format yang didukung hanya excel atau json/preview." }, { status: 400 });
        }
    } catch (err) {
        return serverErrorResponse("ExportGET", err);
    }
}
