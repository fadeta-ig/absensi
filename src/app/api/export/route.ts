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



export async function GET(request: NextRequest) {
    const rateLimited = checkApiRateLimit(request.headers);
    if (rateLimited) return rateLimited;

    const session = await requireAuth();
    if (!session) return unauthorizedResponse();
    if (session.role !== "hr") return forbiddenResponse();

    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type");
        const startDateStr = searchParams.get("startDate");
        const endDateStr = searchParams.get("endDate");
        const divisionId = searchParams.get("divisionId") || undefined;
        const departmentId = searchParams.get("departmentId") || undefined;
        const employeeId = searchParams.get("employeeId") || undefined;
        const isGrouped = searchParams.get("grouped") === "true";
        const mode = searchParams.get("mode"); // matrix
        const format = searchParams.get("format") || "excel";

        if (!type || !startDateStr || !endDateStr) {
            return NextResponse.json({ error: "Parameter tipe data, tanggal mulai, dan selesai harus diisi." }, { status: 400 });
        }

        const startDate = new Date(`${startDateStr}T00:00:00`);
        const endDate = new Date(`${endDateStr}T23:59:59`);
        const dateRange = { gte: startDate, lte: endDate };

        // Buat list tanggal untuk matrix (max 31 hari)
        const dateList: string[] = [];
        let curr = new Date(startDate);
        while (curr <= endDate && dateList.length <= 31) {
            dateList.push(curr.toISOString().split("T")[0]); // YYYY-MM-DD
            curr.setDate(curr.getDate() + 1);
        }

        const employees = await prisma.employee.findMany({
            where: {
                ...(divisionId ? { divisionId } : {}),
                ...(departmentId ? { departmentId } : {}),
                ...(employeeId ? { employeeId } : {})
            },
            select: { employeeId: true, name: true, departmentRel: { select: { name: true } }, positionRel: { select: { name: true } } },
            orderBy: { name: "asc" }
        });
        const empMap = new Map(employees.map((e) => [e.employeeId, e]));
        const validEmpIds = employees.map(e => e.employeeId);

        let rows: ExportRow[] = [];
        let sheetName = "";
        let finalHeaders: string[] = [];

        if (type === "attendance") {
            const records = await prisma.attendanceRecord.findMany({
                where: { date: dateRange, employeeId: { in: validEmpIds } },
                orderBy: { date: "asc" },
            });
            sheetName = "Laporan Absensi";

            if (mode === "matrix") {
                finalHeaders = ["Nama Karyawan", "ID Karyawan", "Departemen"];
                for (const d of dateList) finalHeaders.push(d.split("-").slice(1).join("-")); // MM-DD
                finalHeaders.push("Hadir", "Lambat", "Alpa");

                // Horizontal Matrix: Employees as Rows, Dates as Columns
                rows = employees.map((emp) => {
                    const empRecords = records.filter((r) => r.employeeId === emp.employeeId);
                    const row: ExportRow = {
                        "Nama Karyawan": emp.name,
                        "ID Karyawan": emp.employeeId,
                        "Departemen": emp.departmentRel?.name || "-",
                    };

                    // Fill days from dateList
                    for (const d of dateList) {
                        const colKey = d.split("-").slice(1).join("-");
                        const record = empRecords.find((r) => toDateStr(r.date) === d);

                        if (record) {
                            // Use time format (HH:MM) for clock-in/out display
                            const clockIn = record.clockIn ? toTimeString(record.clockIn) : "-";
                            const clockOut = record.clockOut ? toTimeString(record.clockOut) : "-";
                            row[colKey] = `${clockIn}\n${clockOut}`;
                        } else {
                            row[colKey] = "-\n-";
                        }
                    }

                    // Add Summary
                    row["Hadir"] = empRecords.filter(r => r.status === "present" || r.status === "late").length;
                    row["Lambat"] = empRecords.filter(r => r.status === "late").length;
                    row["Alpa"] = empRecords.filter(r => r.status === "absent").length;

                    return row;
                });
                sheetName = `Rekap_Absensi_${startDateStr}_${endDateStr}`;
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
                        "Departemen": emp?.departmentRel?.name || "-", "Tanggal": "", "Jam Masuk": "", "Jam Pulang": "", "Status": "", "Catatan": ""
                    });

                    let totalPresent = 0;
                    let totalLate = 0;

                    empRecords.forEach((r) => {
                        if (r.status === "present" || r.status === "late") totalPresent++;
                        if (r.status === "late") totalLate++;

                        finalRows.push({
                            "Nama": emp?.name || "-",
                            "ID Karyawan": r.employeeId,
                            "Departemen": emp?.departmentRel?.name || "-",
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
                        "Departemen": emp?.departmentRel?.name || "-",
                        "Tanggal": toDateStr(r.date),
                        "Jam Masuk": r.clockIn ? toTimeString(r.clockIn) : "-",
                        "Jam Pulang": r.clockOut ? toTimeString(r.clockOut) : "-",
                        "Status": r.status === "present" ? "Hadir" : r.status === "late" ? "Terlambat" : r.status === "absent" ? "Tidak Hadir" : "Cuti",
                        "Catatan": r.notes || "-",
                    };
                });
            }
        } else if (type === "visits") {
            finalHeaders = ["Nama", "ID Karyawan", "Departemen", "Tanggal", "Jam Mulai", "Jam Selesai", "Nama Klien", "Alamat", "Tujuan", "Hasil", "Status"];
            const records = await prisma.visitReport.findMany({
                where: { date: dateRange, employeeId: { in: validEmpIds } },
                orderBy: { date: "asc" },
            });
            sheetName = "Laporan Kunjungan";
            rows = records.map((r) => {
                const emp = empMap.get(r.employeeId);
                return {
                    "Nama": emp?.name || "-",
                    "ID Karyawan": r.employeeId,
                    "Departemen": emp?.departmentRel?.name || "-",
                    "Tanggal": toDateStr(r.date),
                    "Jam Mulai": r.visitStartTime ? toTimeString(r.visitStartTime) : "-",
                    "Jam Selesai": r.visitEndTime ? toTimeString(r.visitEndTime) : "-",
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
                where: { date: dateRange, employeeId: { in: validEmpIds } },
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
                period: `${startDateStr} s/d ${endDateStr}`,
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
                    "Content-Disposition": `attachment; filename="${sheetName}.xlsx"`,
                },
            });
        } else {
            return NextResponse.json({ error: "Format yang didukung hanya excel atau json/preview." }, { status: 400 });
        }
    } catch (err) {
        return serverErrorResponse("ExportGET", err);
    }
}
