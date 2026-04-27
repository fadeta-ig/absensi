"use client";

import { useEffect, useState, useMemo } from "react";
import { ClipboardList, Search, Calendar, Filter, UserCheck, UserX, Download, FileSpreadsheet, Building2, Layers, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock, Check } from "lucide-react";
import { exportToExcel, exportToPdfTable } from "@/lib/export";

interface Employee {
    id: string;
    employeeId: string;
    name: string;
    department: string;
    division?: string | null;
}

interface AttendanceRecord {
    id: string;
    employeeId: string;
    date: string;
    clockIn?: string;
    clockOut?: string;
    status: string;
}

interface MasterData {
    id: string;
    name: string;
}

export default function AttendanceMonitorPage() {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<MasterData[]>([]);
    const [divisions, setDivisions] = useState<MasterData[]>([]);

    // Filter states
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
    });
    const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
    const [statusFilter, setStatusFilter] = useState("all");
    const [deptFilter, setDeptFilter] = useState("all");
    const [divFilter, setDivFilter] = useState("all");
    const [search, setSearch] = useState("");

    // Tabs
    const [activeTab, setActiveTab] = useState<"log" | "corrections">("log");
    const [corrections, setCorrections] = useState<any[]>([]);

    // Correction modal
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        fetch("/api/attendance").then((r) => r.json()).then((d) => {
            if (Array.isArray(d)) setRecords(d);
        });
        fetch("/api/attendance/correction").then((r) => r.json()).then((d) => {
            if (Array.isArray(d)) setCorrections(d);
        });
        fetch("/api/employees").then((r) => r.json()).then((d) => {
            if (Array.isArray(d)) setEmployees(d);
        });
        fetch("/api/master/departments").then((r) => r.json()).then((d) => {
            if (Array.isArray(d)) setDepartments(d);
        });
        fetch("/api/master/divisions").then((r) => r.json()).then((d) => {
            if (Array.isArray(d)) setDivisions(d);
        });
    }, []);

    // Reset page to 1 on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [startDate, endDate, statusFilter, deptFilter, divFilter, search]);

    const getEmpInfo = (empId: string) => {
        const emp = employees.find((e) => e.employeeId === empId);
        return {
            name: emp?.name || empId,
            department: emp?.department || "-",
            division: emp?.division || "-",
        };
    };

    const formatTime = (timeStr?: string) => {
        if (!timeStr) return "--:--";
        // If it's already HH:mm or HH:mm:ss
        if (timeStr.includes(":") && !timeStr.includes("T") && timeStr.length <= 8) {
            return timeStr.substring(0, 5);
        }
        // If it's ISO string
        try {
            const date = new Date(timeStr);
            if (isNaN(date.getTime())) return timeStr; // Fallback if it's some other string
            return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
        } catch {
            return timeStr;
        }
    };

    const statusLabel = (s: string) => {
        const map: Record<string, string> = {
            present: "Hadir",
            late: "Terlambat",
            absent: "Alpa",
            leave: "Cuti",
            sick: "Sakit",
        };
        return map[s] || s;
    };

    const filtered = useMemo(() => {
        return records.filter((r) => {
            const empInfo = getEmpInfo(r.employeeId);

            // Date Range check
            const withinDate = r.date >= startDate && r.date <= endDate;

            const matchStatus = statusFilter === "all" || r.status === statusFilter;
            const matchDept = deptFilter === "all" || empInfo.department === deptFilter;
            const matchDiv = divFilter === "all" || empInfo.division === divFilter;

            const matchSearch = r.employeeId.toLowerCase().includes(search.toLowerCase()) ||
                empInfo.name.toLowerCase().includes(search.toLowerCase());

            return withinDate && matchStatus && matchDept && matchDiv && matchSearch;
        });
    }, [records, employees, startDate, endDate, statusFilter, deptFilter, divFilter, search]);

    // Paginated records
    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filtered.slice(start, start + itemsPerPage);
    }, [filtered, currentPage]);

    const totalPages = Math.ceil(filtered.length / itemsPerPage);

    // Summary counts based on filtered date range (but not other filters for global stats)
    const summaryData = useMemo(() => {
        const forRange = records.filter(r => r.date >= startDate && r.date <= endDate);
        return {
            present: forRange.filter(r => r.status === "present").length,
            late: forRange.filter(r => r.status === "late").length,
            total: forRange.length
        };
    }, [records, startDate, endDate]);

    const handleExportExcel = () => {
        const data = filtered.map((r) => {
            const info = getEmpInfo(r.employeeId);
            return {
                employeeId: r.employeeId,
                name: info.name,
                department: info.department,
                division: info.division,
                date: r.date,
                clockIn: formatTime(r.clockIn),
                clockOut: formatTime(r.clockOut),
                status: statusLabel(r.status),
            };
        });
        exportToExcel(data, [
            { key: "employeeId", label: "ID Karyawan" },
            { key: "name", label: "Nama" },
            { key: "department", label: "Departemen" },
            { key: "division", label: "Divisi" },
            { key: "date", label: "Tanggal" },
            { key: "clockIn", label: "Clock In" },
            { key: "clockOut", label: "Clock Out" },
            { key: "status", label: "Status" },
        ], `Laporan_Absensi_${startDate}_to_${endDate}`, "Absensi");
    };

    const handleExportPdf = () => {
        const data = filtered.map((r) => {
            const info = getEmpInfo(r.employeeId);
            return [
                r.employeeId,
                info.name,
                info.department,
                r.date,
                formatTime(r.clockIn),
                formatTime(r.clockOut),
                statusLabel(r.status),
            ];
        });
        exportToPdfTable(
            data,
            ["ID", "Nama", "Dept", "Tanggal", "In", "Out", "Status"],
            "Laporan Absensi Karyawan",
            `Laporan_Absensi_${startDate}_to_${endDate}`,
            `Periode: ${startDate} s/d ${endDate} • Total: ${filtered.length} baris`
        );
    };

    const handleCorrectionAction = async (id: string, s: "APPROVED" | "REJECTED") => {
        setProcessingId(id);
        try {
            const res = await fetch("/api/attendance/correction", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, status: s })
            });
            if (res.ok) {
                // Refresh data
                setCorrections(prev => prev.map(c => c.id === id ? { ...c, status: s } : c));
                fetch("/api/attendance").then((r) => r.json()).then((d) => {
                    if (Array.isArray(d)) setRecords(d);
                });
            } else {
                alert("Gagal memproses pengajuan");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setProcessingId(null);
        }
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

            {/* Tab Navigators */}
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-max">
                <button
                    onClick={() => setActiveTab("log")}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === "log" ? "bg-white text-[var(--primary)] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                    Log Absensi Utama
                </button>
                <button
                    onClick={() => setActiveTab("corrections")}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${activeTab === "corrections" ? "bg-white text-[var(--primary)] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                    Persetujuan Koreksi
                    {corrections.filter(c => c.status === "PENDING").length > 0 && (
                        <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{corrections.filter(c => c.status === "PENDING").length}</span>
                    )}
                </button>
            </div>

            {activeTab === "log" && (
                <>
                {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
                <div className="card p-4 text-center">
                    <UserCheck className="w-5 h-5 text-green-600 mx-auto mb-2" />
                    <p className="text-2xl font-extrabold text-green-600">{summaryData.present}</p>
                    <p className="text-xs text-[var(--text-muted)]">Hadir</p>
                </div>
                <div className="card p-4 text-center">
                    <UserX className="w-5 h-5 text-orange-500 mx-auto mb-2" />
                    <p className="text-2xl font-extrabold text-orange-500">{summaryData.late}</p>
                    <p className="text-xs text-[var(--text-muted)]">Terlambat</p>
                </div>
                <div className="card p-4 text-center">
                    <ClipboardList className="w-5 h-5 text-blue-600 mx-auto mb-2" />
                    <p className="text-2xl font-extrabold text-blue-600">{summaryData.total}</p>
                    <p className="text-xs text-[var(--text-muted)]">Total Record</p>
                </div>
            </div>

            {/* Filters Section */}
            <div className="card p-5 space-y-4">
                <div className="flex flex-wrap gap-4">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <input
                            className="form-input pl-10 h-11"
                            placeholder="Cari ID atau nama karyawan..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    {/* Date Range */}
                    <div className="flex items-center gap-2 flex-1 min-w-[300px]">
                        <div className="relative flex-1">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                            <input
                                type="date"
                                className="form-input pl-10 h-11"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                title="Tanggal Mulai"
                            />
                        </div>
                        <span className="text-[var(--text-muted)] font-medium">s/d</span>
                        <div className="relative flex-1">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                            <input
                                type="date"
                                className="form-input pl-10 h-11"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                title="Tanggal Selesai"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-4">
                    {/* Dept Filter */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <select
                            className="form-select pl-10 h-11"
                            value={deptFilter}
                            onChange={(e) => setDeptFilter(e.target.value)}
                        >
                            <option value="all">Semua Departemen</option>
                            {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                        </select>
                    </div>

                    {/* Div Filter */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <select
                            className="form-select pl-10 h-11"
                            value={divFilter}
                            onChange={(e) => setDivFilter(e.target.value)}
                        >
                            <option value="all">Semua Divisi</option>
                            {divisions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                        <select
                            className="form-select pl-10 h-11"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="all">Semua Status</option>
                            <option value="present">Hadir</option>
                            <option value="late">Terlambat</option>
                            <option value="absent">Alpa</option>
                            <option value="leave">Cuti</option>
                            <option value="sick">Sakit</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="card overflow-hidden border border-[var(--border)] shadow-sm">
                <div className="overflow-x-auto">
                    <table className="data-table">
                        <thead className="bg-[#F9FAFB]">
                            <tr>
                                <th className="w-32">ID Karyawan</th>
                                <th>Nama</th>
                                <th className="hidden lg:table-cell">Departemen</th>
                                <th className="w-32">Tanggal</th>
                                <th className="w-24">Clock In</th>
                                <th className="w-24">Clock Out</th>
                                <th className="w-32 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                            {paginatedRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-12 text-[var(--text-muted)] italic">
                                        Tidak ada data absensi ditemukan untuk kriteria ini.
                                    </td>
                                </tr>
                            ) : (
                                paginatedRecords.map((r) => {
                                    const info = getEmpInfo(r.employeeId);
                                    return (
                                        <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                                                {r.employeeId}
                                            </td>
                                            <td className="font-medium text-[var(--text-primary)]">
                                                {info.name}
                                            </td>
                                            <td className="hidden lg:table-cell text-xs text-[var(--text-secondary)]">
                                                {info.department}
                                            </td>
                                            <td className="text-sm text-[var(--text-secondary)]">
                                                {r.date}
                                            </td>
                                            <td className="text-sm font-medium text-blue-600">
                                                {formatTime(r.clockIn)}
                                            </td>
                                            <td className="text-sm font-medium text-orange-600">
                                                {formatTime(r.clockOut)}
                                            </td>
                                            <td className="text-center">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${r.status === "present" ? "bg-green-100 text-green-700" :
                                                    r.status === "late" ? "bg-orange-100 text-orange-700" :
                                                        r.status === "absent" ? "bg-red-100 text-red-700" :
                                                            "bg-blue-100 text-blue-700"
                                                    }`}>
                                                    {statusLabel(r.status)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="px-6 py-4 bg-[#F9FAFB] border-t border-[var(--border)] flex items-center justify-between">
                    <div className="text-xs font-medium text-[var(--text-muted)]">
                        Menampilkan <span className="text-[var(--text-primary)]">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-[var(--text-primary)]">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> dari <span className="text-[var(--text-primary)] font-bold">{filtered.length}</span> data
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-md hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:hover:bg-transparent transition-all border border-transparent hover:border-[var(--border)]"
                                title="Halaman Sebelumnya"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>

                            <div className="flex items-center">
                                {[...Array(totalPages)].map((_, i) => {
                                    const page = i + 1;
                                    // Only show current, first, last, and neighbors
                                    if (
                                        page === 1 ||
                                        page === totalPages ||
                                        (page >= currentPage - 1 && page <= currentPage + 1)
                                    ) {
                                        return (
                                            <button
                                                key={page}
                                                onClick={() => setCurrentPage(page)}
                                                className={`min-w-[32px] h-8 flex items-center justify-center rounded-md text-sm font-bold transition-all ${currentPage === page
                                                    ? "bg-[var(--primary)] text-white shadow-md"
                                                    : "text-[var(--text-muted)] hover:bg-white hover:text-[var(--primary)] border border-transparent hover:border-[var(--border)]"
                                                    }`}
                                            >
                                                {page}
                                            </button>
                                        );
                                    } else if (
                                        page === currentPage - 2 ||
                                        page === currentPage + 2
                                    ) {
                                        return <span key={page} className="px-1 text-[var(--text-muted)]">...</span>;
                                    }
                                    return null;
                                })}
                            </div>

                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-md hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:hover:bg-transparent transition-all border border-transparent hover:border-[var(--border)]"
                                title="Halaman Selanjutnya"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
            </>
            )}

            {activeTab === "corrections" && (
                <div className="card overflow-hidden shadow-sm">
                    <div className="p-4 border-b bg-gray-50/50">
                        <h2 className="text-lg font-bold">Daftar Pengajuan Susulan Karyawan</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead className="bg-[#F9FAFB]">
                                <tr>
                                    <th>Karyawan</th>
                                    <th>Target Tanggal</th>
                                    <th>Waktu Pengajuan</th>
                                    <th>Alasan</th>
                                    <th>Status</th>
                                    <th className="text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {corrections.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-10 text-gray-400 italic">Tidak ada pengajuan koreksi masuk.</td></tr>
                                ) : (
                                    corrections.map(c => {
                                        const ei = getEmpInfo(c.employeeId);
                                        return (
                                            <tr key={c.id}>
                                                <td><div className="font-bold">{ei.name}</div><div className="text-xs text-gray-500">{c.employeeId}</div></td>
                                                <td className="font-medium text-sm">{c.targetDate}</td>
                                                <td className="font-mono text-sm tracking-tight text-blue-600">
                                                    {(c.proposedClockIn ? new Date(c.proposedClockIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit'}) : '--:--')}
                                                    {" - "}
                                                    {(c.proposedClockOut ? new Date(c.proposedClockOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit'}) : '--:--')}
                                                </td>
                                                <td className="text-sm max-w-[200px] truncate" title={c.reason}>{c.reason}</td>
                                                <td>
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${c.status === "PENDING" ? "bg-orange-100 text-orange-700" : c.status === "APPROVED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                                        {c.status}
                                                    </span>
                                                </td>
                                                <td className="text-center">
                                                    {c.status === "PENDING" ? (
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button 
                                                                onClick={() => handleCorrectionAction(c.id, "APPROVED")} 
                                                                disabled={processingId === c.id}
                                                                className="p-1 px-3 bg-green-500 text-white rounded-md text-xs font-bold hover:bg-green-600 disabled:opacity-50"
                                                            >
                                                                Terima
                                                            </button>
                                                            <button 
                                                                onClick={() => handleCorrectionAction(c.id, "REJECTED")} 
                                                                disabled={processingId === c.id}
                                                                className="p-1 px-3 bg-red-500 text-white rounded-md text-xs font-bold hover:bg-red-600 disabled:opacity-50"
                                                            >
                                                                Tolak
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-gray-400 italic">Selesai</span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
