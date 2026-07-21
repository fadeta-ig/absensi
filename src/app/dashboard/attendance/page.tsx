"use client";

import { useEffect, useState, useMemo } from "react";
import { AlertCircle, ClipboardList, Download, FileSpreadsheet, Loader2, X } from "lucide-react";
import { exportToExcel, exportToPdfTable } from "@/lib/export";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage } from "@/lib/clientErrors";

import { AttendanceSummary } from "./components/AttendanceSummary";
import { AttendanceFilters } from "./components/AttendanceFilters";
import { AttendanceLogTab } from "./components/AttendanceLogTab";
import { AttendanceCorrectionTab } from "./components/AttendanceCorrectionTab";
import { Employee, AttendanceRecord, MasterData, AttendanceCorrection } from "./types";
import { useCallback } from "react";

export default function AttendanceMonitorPage() {
    const toast = useToast();
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<MasterData[]>([]);
    const [divisions, setDivisions] = useState<MasterData[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

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
    const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
    const [correctionsLoading, setCorrectionsLoading] = useState(true);
    const [correctionsError, setCorrectionsError] = useState("");

    // Correction modal
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Photo preview modal
    const [photoPreview, setPhotoPreview] = useState<{ url: string; label: string } | null>(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const loadAttendanceRecords = useCallback(async () => {
        const res = await fetch("/api/attendance");
        if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat data absensi."));
        const data = await res.json();
        if (Array.isArray(data)) setRecords(data);
    }, []);

    const loadCorrections = useCallback(async () => {
        setCorrectionsLoading(true);
        setCorrectionsError("");
        try {
            const res = await fetch("/api/attendance/correction");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat pengajuan koreksi."));
            const data = await res.json();
            setCorrections(Array.isArray(data) ? data : []);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Gagal memuat pengajuan koreksi.";
            setCorrectionsError(message);
            toast(message, "error");
        } finally {
            setCorrectionsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        const loadInitialData = async () => {
            setInitialLoading(true);
            setLoadError("");
            try {
                const [employeeRes, departmentRes, divisionRes] = await Promise.all([
                    fetch("/api/employees"),
                    fetch("/api/master/departments"),
                    fetch("/api/master/divisions"),
                ]);

                const failedResponse = [employeeRes, departmentRes, divisionRes].find((res) => !res.ok);
                if (failedResponse) throw new Error(await getResponseErrorMessage(failedResponse, "Gagal memuat data absensi."));

                await loadAttendanceRecords();
                const [employeeData, departmentData, divisionData] = await Promise.all([
                    employeeRes.json(),
                    departmentRes.json(),
                    divisionRes.json(),
                ]);

                if (Array.isArray(employeeData)) setEmployees(employeeData);
                if (Array.isArray(departmentData)) setDepartments(departmentData);
                if (Array.isArray(divisionData)) setDivisions(divisionData);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Gagal memuat data absensi.";
                setLoadError(message);
                toast(message, "error");
            } finally {
                setInitialLoading(false);
            }
        };

        void loadInitialData();
        void loadCorrections();
    }, [loadAttendanceRecords, loadCorrections, toast]);

    // Reset page to 1 on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [startDate, endDate, statusFilter, deptFilter, divFilter, search]);

    const getEmpInfo = useCallback((empId: string) => {
        const emp = employees.find((e) => e.employeeId === empId);
        return {
            name: emp?.name || empId,
            department: emp?.department || "-",
            division: emp?.division || "-",
        };
    }, [employees]);

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
                toast(s === "APPROVED" ? "Pengajuan koreksi disetujui." : "Pengajuan koreksi ditolak.", "success");
                await loadAttendanceRecords();
            } else {
                throw new Error(await getResponseErrorMessage(res, "Gagal memproses pengajuan koreksi."));
            }
        } catch (error) {
            toast(error instanceof Error ? error.message : "Gagal memproses pengajuan koreksi.", "error");
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

            {loadError && (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-3 text-sm text-[var(--destructive)]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{loadError}</span>
                </div>
            )}

            {/* Tab Navigators */}
            <div className="flex space-x-1 bg-[var(--secondary)] p-1 rounded-lg w-max">
                <button
                    onClick={() => setActiveTab("log")}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === "log" ? "bg-[var(--card)] text-[var(--primary)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"}`}
                >
                    Log Absensi Utama
                </button>
                <button
                    onClick={() => setActiveTab("corrections")}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${activeTab === "corrections" ? "bg-[var(--card)] text-[var(--primary)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"}`}
                >
                    Persetujuan Koreksi
                    {corrections.filter(c => c.status === "PENDING").length > 0 && (
                        <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{corrections.filter(c => c.status === "PENDING").length}</span>
                    )}
                </button>
            </div>

            {activeTab === "log" && (
                initialLoading ? (
                    <div className="card p-12 text-center text-[var(--text-muted)]">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--primary)] opacity-50" />
                        <p className="text-sm font-medium">Memuat data absensi...</p>
                    </div>
                ) : (
                <>
                    <AttendanceSummary
                        present={summaryData.present}
                        late={summaryData.late}
                        total={summaryData.total}
                    />

                    <AttendanceFilters
                        search={search} setSearch={setSearch}
                        startDate={startDate} setStartDate={setStartDate}
                        endDate={endDate} setEndDate={setEndDate}
                        deptFilter={deptFilter} setDeptFilter={setDeptFilter}
                        divFilter={divFilter} setDivFilter={setDivFilter}
                        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
                        departments={departments} divisions={divisions}
                    />

                    <AttendanceLogTab
                        paginatedRecords={paginatedRecords}
                        filteredLength={filtered.length}
                        currentPage={currentPage}
                        itemsPerPage={itemsPerPage}
                        totalPages={totalPages}
                        setCurrentPage={setCurrentPage}
                        getEmpInfo={getEmpInfo}
                        formatTime={formatTime}
                        statusLabel={statusLabel}
                        setPhotoPreview={setPhotoPreview}
                    />
                </>
                )
            )}

            {activeTab === "corrections" && (
                <AttendanceCorrectionTab
                    corrections={corrections}
                    loading={correctionsLoading}
                    error={correctionsError}
                    processingId={processingId}
                    getEmpInfo={getEmpInfo}
                    handleCorrectionAction={handleCorrectionAction}
                />
            )}

            {/* Photo Preview Modal */}
            {photoPreview && (
                <div className="modal-overlay" onClick={() => setPhotoPreview(null)}>
                    <div className="modal-content !max-w-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title text-sm">{photoPreview.label}</h2>
                            <button className="modal-close" onClick={() => setPhotoPreview(null)}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex justify-center">
                            <img
                                src={photoPreview.url}
                                alt={photoPreview.label}
                                className="max-w-full max-h-[60vh] rounded-xl object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
