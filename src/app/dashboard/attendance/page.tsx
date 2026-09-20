"use client";

import { useEffect, useState, useMemo } from "react";
import { AlertCircle, ClipboardList, Download, FileSpreadsheet, Loader2, X } from "lucide-react";
import { exportToExcel, exportToPdfTable } from "@/lib/export";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

import { AttendanceSummary } from "./components/AttendanceSummary";
import { AttendanceFilters } from "./components/AttendanceFilters";
import { AttendanceLogTab } from "./components/AttendanceLogTab";
import { AttendanceCorrectionTab } from "./components/AttendanceCorrectionTab";
import { AttendanceAbsentTab } from "./components/AttendanceAbsentTab";
import { Employee, AttendanceRecord, MasterData, AttendanceCorrection, AbsentEmployee, LeaveRecordLite, WorkShiftInfo } from "./types";
import { resolveAbsentEmployees } from "@/lib/services/attendanceAbsentResolver";
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
    const [typeFilter, setTypeFilter] = useState("all");
    const [deptFilter, setDeptFilter] = useState("all");
    const [divFilter, setDivFilter] = useState("all");
    const [search, setSearch] = useState("");

    // Tabs
    const [activeTab, setActiveTab] = useState<"log" | "absent" | "corrections">("log");
    const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
    const [correctionsLoading, setCorrectionsLoading] = useState(true);
    const [correctionsError, setCorrectionsError] = useState("");

    // Absent / Leaves / Shift state
    const [leaves, setLeaves] = useState<LeaveRecordLite[]>([]);
    const [shifts, setShifts] = useState<WorkShiftInfo[]>([]);
    const [holidays, setHolidays] = useState<Array<{ date: string; name: string }>>([]);
    const [targetDateAbsent, setTargetDateAbsent] = useState(() => new Date().toISOString().split("T")[0]);

    // Correction modal
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Photo preview modal
    const [photoPreview, setPhotoPreview] = useState<{ url: string; label: string } | null>(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const loadAttendanceRecords = useCallback(async () => {
        const res = await fetch("/api/attendance");
        if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat data presensi."));
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
            reportClientError("AttendanceMonitorPage", "Gagal memuat pengajuan koreksi", error);
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
                const currentYear = new Date().getFullYear();
                const [employeeRes, departmentRes, divisionRes, leaveRes, shiftRes, holidayRes] = await Promise.all([
                    fetch("/api/employees"),
                    fetch("/api/master/departments"),
                    fetch("/api/master/divisions"),
                    fetch("/api/leave").catch(() => null),
                    fetch("/api/shifts").catch(() => null),
                    fetch(`/api/holidays?year=${currentYear}`).catch(() => null),
                ]);

                const failedResponse = [employeeRes, departmentRes, divisionRes].find((res) => !res.ok);
                if (failedResponse) throw new Error(await getResponseErrorMessage(failedResponse, "Gagal memuat data presensi."));

                await loadAttendanceRecords();
                const [employeeData, departmentData, divisionData] = await Promise.all([
                    employeeRes.json(),
                    departmentRes.json(),
                    divisionRes.json(),
                ]);

                if (Array.isArray(employeeData)) setEmployees(employeeData);
                if (Array.isArray(departmentData)) setDepartments(departmentData);
                if (Array.isArray(divisionData)) setDivisions(divisionData);

                if (leaveRes && leaveRes.ok) {
                    const leaveData = await leaveRes.json();
                    if (Array.isArray(leaveData)) {
                        setLeaves(leaveData);
                    }
                }

                if (shiftRes && shiftRes.ok) {
                    const shiftData = await shiftRes.json();
                    if (Array.isArray(shiftData)) {
                        setShifts(shiftData);
                    }
                }

                if (holidayRes && holidayRes.ok) {
                    const holidayPayload = await holidayRes.json();
                    if (holidayPayload && Array.isArray(holidayPayload.data)) {
                        setHolidays(holidayPayload.data);
                    }
                }
            } catch (error) {
                reportClientError("AttendanceMonitorPage", "Gagal memuat data presensi awal", error);
                const message = error instanceof Error ? error.message : "Gagal memuat data presensi.";
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
    }, [startDate, endDate, statusFilter, typeFilter, deptFilter, divFilter, search]);

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
            const matchType = typeFilter === "all" || (typeFilter === "off_day" ? Boolean(r.isOffDay) : !r.isOffDay);
            const matchDept = deptFilter === "all" || empInfo.department === deptFilter;
            const matchDiv = divFilter === "all" || empInfo.division === divFilter;

            const matchSearch = r.employeeId.toLowerCase().includes(search.toLowerCase()) ||
                empInfo.name.toLowerCase().includes(search.toLowerCase());

            return withinDate && matchStatus && matchType && matchDept && matchDiv && matchSearch;
        });
    }, [records, employees, startDate, endDate, statusFilter, typeFilter, deptFilter, divFilter, search]);

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

    // Calculate absent employees for target evaluation date using centralized resolver
    const absentEmployeesList = useMemo<AbsentEmployee[]>(() => {
        return resolveAbsentEmployees({
            targetDate: targetDateAbsent,
            employees,
            records,
            leaves,
            shifts,
            holidays,
        });
    }, [records, employees, leaves, shifts, holidays, targetDateAbsent]);

    // Count only employees who are scheduled to work today but have not clocked in (True Alpa/Belum Hadir)
    const unpresentCount = useMemo(() => {
        return absentEmployeesList.filter(e => e.statusType === "unpresent").length;
    }, [absentEmployeesList]);

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
                attendanceType: r.isOffDay ? (r.offDayReason ? `Hari Libur (${r.offDayReason})` : "Hari Libur") : "Normal",
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
            { key: "attendanceType", label: "Tipe Kehadiran" },
            { key: "status", label: "Status" },
        ], `Laporan_Presensi_${startDate}_to_${endDate}`, "Presensi");
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
                r.isOffDay ? (r.offDayReason ? `Hari Libur (${r.offDayReason})` : "Hari Libur") : "Normal",
                statusLabel(r.status),
            ];
        });
        exportToPdfTable(
            data,
            ["ID", "Nama", "Dept", "Tanggal", "In", "Out", "Tipe Kehadiran", "Status"],
            "Laporan Presensi Karyawan",
            `Laporan_Presensi_${startDate}_to_${endDate}`,
            `Periode: ${startDate} s/d ${endDate} • Total: ${filtered.length} baris`
        );
    };

    const handleCorrectionAction = async (id: string, s: "APPROVED" | "REJECTED", options?: { silent?: boolean }): Promise<boolean> => {
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
                if (!options?.silent) {
                    toast(s === "APPROVED" ? "Pengajuan koreksi disetujui." : "Pengajuan koreksi ditolak.", "success");
                }
                await loadAttendanceRecords();
                return true;
            } else {
                throw new Error(await getResponseErrorMessage(res, "Gagal memproses pengajuan koreksi."));
            }
        } catch (error) {
            reportClientError("AttendanceMonitorPage", "Gagal memproses pengajuan koreksi", error, { correctionId: id, status: s });
            if (!options?.silent) {
                toast(error instanceof Error ? error.message : "Gagal memproses pengajuan koreksi.", "error");
            }
            return false;
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
                        Monitoring Presensi
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

            {/* Summary Cards */}
            {!initialLoading && (
                <AttendanceSummary
                    present={summaryData.present}
                    late={summaryData.late}
                    absent={unpresentCount}
                    total={summaryData.total}
                    onSelectAbsentTab={() => setActiveTab("absent")}
                />
            )}

            {/* Tab Navigators */}
            <div className="flex space-x-1 bg-[var(--secondary)] p-1 rounded-lg w-max flex-wrap gap-1">
                <button
                    onClick={() => setActiveTab("log")}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === "log" ? "bg-[var(--card)] text-[var(--primary)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                >
                    Log Presensi Utama
                </button>
                <button
                    onClick={() => setActiveTab("absent")}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${activeTab === "absent" ? "bg-[var(--card)] text-[var(--primary)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                >
                    Belum Hadir
                    {unpresentCount > 0 ? (
                        <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold" title={`${unpresentCount} karyawan wajib hadir belum presensi`}>
                            {unpresentCount}
                        </span>
                    ) : absentEmployeesList.length > 0 ? (
                        <span className="bg-[var(--card)] text-[var(--text-muted)] text-[10px] px-2 py-0.5 rounded-full font-semibold border border-[var(--border)]" title="Tidak ada alpa. Karyawan berstatus libur shift / cuti.">
                            0
                        </span>
                    ) : null}
                </button>
                <button
                    onClick={() => setActiveTab("corrections")}
                    className={`px-4 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${activeTab === "corrections" ? "bg-[var(--card)] text-[var(--primary)] shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                >
                    Persetujuan Koreksi
                    {corrections.filter(c => c.status === "PENDING").length > 0 && (
                        <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{corrections.filter(c => c.status === "PENDING").length}</span>
                    )}
                </button>
            </div>

            {initialLoading ? (
                <div className="card p-12 text-center text-[var(--text-muted)]">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--primary)] opacity-50" />
                    <p className="text-sm font-medium">Memuat data presensi...</p>
                </div>
            ) : (
                <>
                    {activeTab === "log" && (
                        <>
                            <AttendanceFilters
                                search={search} setSearch={setSearch}
                                startDate={startDate} setStartDate={setStartDate}
                                endDate={endDate} setEndDate={setEndDate}
                                deptFilter={deptFilter} setDeptFilter={setDeptFilter}
                                divFilter={divFilter} setDivFilter={setDivFilter}
                                statusFilter={statusFilter} setStatusFilter={setStatusFilter}
                                typeFilter={typeFilter} setTypeFilter={setTypeFilter}
                                departments={departments} divisions={divisions}
                            />

                            <AttendanceLogTab
                                paginatedRecords={paginatedRecords}
                                filteredRecords={filtered}
                                filteredLength={filtered.length}
                                currentPage={currentPage}
                                itemsPerPage={itemsPerPage}
                                totalPages={totalPages}
                                setCurrentPage={setCurrentPage}
                                setItemsPerPage={setItemsPerPage}
                                getEmpInfo={getEmpInfo}
                                formatTime={formatTime}
                                statusLabel={statusLabel}
                                setPhotoPreview={setPhotoPreview}
                            />
                        </>
                    )}

                    {activeTab === "absent" && (
                        <AttendanceAbsentTab
                            targetDate={targetDateAbsent}
                            onTargetDateChange={setTargetDateAbsent}
                            absentEmployees={absentEmployeesList}
                            departments={departments}
                            divisions={divisions}
                            onRefresh={loadAttendanceRecords}
                        />
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
                </>
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
