"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Search, Calendar, Filter, UserCheck, UserX, Download, FileSpreadsheet } from "lucide-react";
import { exportToExcel, exportToPdfTable } from "@/lib/export";

interface Employee { id: string; employeeId: string; name: string; }
interface AttendanceRecord {
    id: string; employeeId: string; date: string;
    clockIn?: string; clockOut?: string; status: string;
}

export default function AttendanceMonitorPage() {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);
    const [statusFilter, setStatusFilter] = useState("all");
    const [search, setSearch] = useState("");

    useEffect(() => {
        fetch("/api/attendance").then((r) => r.json()).then(setRecords);
        fetch("/api/employees").then((r) => r.json()).then((d: Employee[]) => { if (Array.isArray(d)) setEmployees(d); });
    }, []);

    const getEmpName = (empId: string) => employees.find((e) => e.employeeId === empId)?.name || empId;

    const filtered = records.filter((r) => {
        const matchDate = r.date === dateFilter;
        const matchStatus = statusFilter === "all" || r.status === statusFilter;
        const matchSearch = r.employeeId.toLowerCase().includes(search.toLowerCase()) ||
            getEmpName(r.employeeId).toLowerCase().includes(search.toLowerCase());
        return matchDate && matchStatus && matchSearch;
    });

    const allForDate = records.filter((r) => r.date === dateFilter);
    const presentCount = allForDate.filter((r) => r.status === "present").length;
    const lateCount = allForDate.filter((r) => r.status === "late").length;

    const formatTime = (iso?: string) => {
        if (!iso) return "--:--";
        return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    };

    const statusLabel = (s: string) => s === "present" ? "Hadir" : s === "late" ? "Terlambat" : s === "absent" ? "Absen" : s;

    const handleExportExcel = () => {
        const data = filtered.map((r) => ({
            employeeId: r.employeeId,
            name: getEmpName(r.employeeId),
            date: r.date,
            clockIn: formatTime(r.clockIn),
            clockOut: formatTime(r.clockOut),
            status: statusLabel(r.status),
        }));
        exportToExcel(data, [
            { key: "employeeId", label: "ID Karyawan" },
            { key: "name", label: "Nama" },
            { key: "date", label: "Tanggal" },
            { key: "clockIn", label: "Clock In" },
            { key: "clockOut", label: "Clock Out" },
            { key: "status", label: "Status" },
        ], `Laporan_Absensi_${dateFilter}`, "Absensi");
    };

    const handleExportPdf = () => {
        const data = filtered.map((r) => [
            r.employeeId,
            getEmpName(r.employeeId),
            r.date,
            formatTime(r.clockIn),
            formatTime(r.clockOut),
            statusLabel(r.status),
        ]);
        exportToPdfTable(
            data,
            ["ID Karyawan", "Nama", "Tanggal", "Clock In", "Clock Out", "Status"],
            "Laporan Absensi Karyawan",
            `Laporan_Absensi_${dateFilter}`,
            `Tanggal: ${dateFilter} • Total: ${filtered.length} record`
        );
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-[var(--primary)]" />
                        Monitoring Absensi
                    </h1>
                    <p className="text-sm text-[var(--text-muted)] mt-1">Pantau kehadiran karyawan</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleExportExcel} className="btn btn-secondary btn-sm" disabled={filtered.length === 0}>
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                    </button>
                    <button onClick={handleExportPdf} className="btn btn-secondary btn-sm" disabled={filtered.length === 0}>
                        <Download className="w-3.5 h-3.5" /> PDF
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
                <div className="card p-4 text-center">
                    <UserCheck className="w-5 h-5 text-green-600 mx-auto mb-2" />
                    <p className="text-2xl font-extrabold text-green-600">{presentCount}</p>
                    <p className="text-xs text-[var(--text-muted)]">Hadir</p>
                </div>
                <div className="card p-4 text-center">
                    <UserX className="w-5 h-5 text-orange-500 mx-auto mb-2" />
                    <p className="text-2xl font-extrabold text-orange-500">{lateCount}</p>
                    <p className="text-xs text-[var(--text-muted)]">Terlambat</p>
                </div>
                <div className="card p-4 text-center">
                    <ClipboardList className="w-5 h-5 text-blue-600 mx-auto mb-2" />
                    <p className="text-2xl font-extrabold text-blue-600">{allForDate.length}</p>
                    <p className="text-xs text-[var(--text-muted)]">Total</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input className="form-input pl-10" placeholder="Cari ID atau nama karyawan..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input type="date" className="form-input pl-10" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
                </div>
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <select className="form-select pl-10 min-w-[140px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">Semua Status</option>
                        <option value="present">Hadir</option>
                        <option value="late">Terlambat</option>
                        <option value="absent">Absen</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>ID Karyawan</th>
                                <th className="hidden sm:table-cell">Nama</th>
                                <th>Tanggal</th>
                                <th>Clock In</th>
                                <th>Clock Out</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-8 text-sm text-[var(--text-muted)]">Tidak ada data untuk tanggal ini</td></tr>
                            ) : (
                                filtered.map((r) => (
                                    <tr key={r.id}>
                                        <td className="font-mono text-xs font-medium text-[var(--text-primary)]">{r.employeeId}</td>
                                        <td className="hidden sm:table-cell">{getEmpName(r.employeeId)}</td>
                                        <td>{r.date}</td>
                                        <td>{formatTime(r.clockIn)}</td>
                                        <td>{formatTime(r.clockOut)}</td>
                                        <td><span className={`badge badge-${r.status === "present" ? "success" : r.status === "late" ? "warning" : "error"}`}>{statusLabel(r.status)}</span></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
