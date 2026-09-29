"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { AlertCircle, ClipboardList, Download, FileSpreadsheet, Loader2, X } from "lucide-react";
import { exportToExcel, exportToPdfTable } from "@/lib/export";
import { useToast } from "@/components/Toast";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

import { AttendanceSummary } from "./components/AttendanceSummary";
import { AttendanceFilters } from "./components/AttendanceFilters";
import { AttendanceLogTab } from "./components/AttendanceLogTab";
import { AttendanceCorrectionTab } from "./components/AttendanceCorrectionTab";
import { AttendanceAbsentTab } from "./components/AttendanceAbsentTab";
import { Employee, AttendanceRecord, MasterData, AttendanceCorrection, AbsentEmployee, LeaveRecordLite, WorkShiftInfo, formatWibTime, getWibDatePresets } from "./types";
import { resolveAbsentEmployees } from "@/lib/services/attendanceAbsentResolver";
import { useSearchParams } from "next/navigation";
import { addCalendarDays, isValidCalendarDate } from "@/lib/timezone";

const EMPTY_SHIFT_OVERRIDES: Record<string, string | null> = {};

export default function AttendanceMonitorPage() {
    const toast = useToast();
    const searchParams = useSearchParams();
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<MasterData[]>([]);
    const [divisions, setDivisions] = useState<MasterData[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [authoritativeDate, setAuthoritativeDate] = useState("");
    const [authoritativeNow, setAuthoritativeNow] = useState<Date | null>(null);
    const [absentRefreshing, setAbsentRefreshing] = useState(false);

    // Filter states
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
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
    const [targetDateAbsent, setTargetDateAbsent] = useState("");
    const [targetDateShiftOverrides, setTargetDateShiftOverrides] = useState<Record<string, string | null>>({});
    const [previousDateShiftOverrides, setPreviousDateShiftOverrides] = useState<Record<string, string | null>>({});
    const [shiftOverrideDate, setShiftOverrideDate] = useState("");
    const targetDateAbsentRef = useRef("");
    const rosterRequestIdRef = useRef(0);

    const handleTargetDateAbsentChange = useCallback((date: string) => {
        if (date === targetDateAbsentRef.current) return;
        // Invalidate the in-flight request and clear both maps before committing the new date.
        rosterRequestIdRef.current += 1;
        targetDateAbsentRef.current = date;
        setShiftOverrideDate(date);
        setTargetDateShiftOverrides({});
        setPreviousDateShiftOverrides({});
        setTargetDateAbsent(date);
    }, []);

    // Correction modal
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
    const processingIdsRef = useRef(new Set<string>());

    // Photo preview modal
    const [photoPreview, setPhotoPreview] = useState<{ url: string; label: string } | null>(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        const tab = searchParams.get("tab");
        if (tab === "log" || tab === "absent" || tab === "corrections") setActiveTab(tab);
    }, [searchParams]);

    const loadAttendanceRecords = useCallback(async () => {
        const res = await fetch("/api/attendance");
        if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat data presensi."));
        const data = await res.json();
        if (Array.isArray(data)) setRecords(data);
    }, []);

    const loadAbsentDependencies = useCallback(async (initializeDates = false) => {
        const contextRes = await fetch("/api/attendance/network", { cache: "no-store" });
        if (!contextRes.ok) throw new Error(await getResponseErrorMessage(contextRes, "Gagal memuat waktu server."));
        const context = await contextRes.json();
        if (typeof context.serverWibDate !== "string" || typeof context.serverWibNow !== "string") {
            throw new Error("Konteks waktu server tidak tersedia.");
        }

        const serverNow = new Date(context.serverWibNow);
        if (Number.isNaN(serverNow.getTime())) throw new Error("Waktu server tidak valid.");
        const serverDate = context.serverWibDate;
        const currentYear = Number(serverDate.slice(0, 4));
        const [attendanceRes, leaveRes, shiftRes, holidayRes] = await Promise.all([
            fetch("/api/attendance", { cache: "no-store" }),
            fetch("/api/leave", { cache: "no-store" }),
            fetch("/api/shifts", { cache: "no-store" }),
            fetch(`/api/holidays?year=${currentYear}`, { cache: "no-store" }),
        ]);
        const failedResponse = [attendanceRes, leaveRes, shiftRes, holidayRes].find((res) => !res.ok);
        if (failedResponse) throw new Error(await getResponseErrorMessage(failedResponse, "Gagal memuat data evaluasi presensi."));

        const [attendanceData, leaveData, shiftData, holidayPayload] = await Promise.all([
            attendanceRes.json(), leaveRes.json(), shiftRes.json(), holidayRes.json(),
        ]);
        if (!Array.isArray(attendanceData) || !Array.isArray(leaveData) || !Array.isArray(shiftData) || !Array.isArray(holidayPayload?.data)) {
            throw new Error("Format data evaluasi presensi tidak sesuai.");
        }

        setRecords(attendanceData);
        setLeaves(leaveData);
        setShifts(shiftData);
        setHolidays(holidayPayload.data);
        setAuthoritativeDate(serverDate);
        setAuthoritativeNow(serverNow);
        if (initializeDates) {
            const presets = getWibDatePresets(serverDate);
            setStartDate(presets.thisMonth.start);
            setEndDate(serverDate);
            handleTargetDateAbsentChange(serverDate);
        } else {
            const current = targetDateAbsentRef.current;
            handleTargetDateAbsentChange(!current || current > serverDate ? serverDate : current);
        }
    }, [handleTargetDateAbsentChange]);

    const refreshAbsentData = useCallback(async () => {
        setAbsentRefreshing(true);
        try {
            await loadAbsentDependencies(false);
            setLoadError("");
            toast("Data evaluasi presensi berhasil diperbarui.", "success");
        } catch (error) {
            reportClientError("AttendanceMonitorPage", "Gagal memperbarui data evaluasi presensi", error);
            const message = error instanceof Error ? error.message : "Gagal memperbarui data evaluasi presensi.";
            setLoadError(message);
            toast(message, "error");
        } finally {
            setAbsentRefreshing(false);
        }
    }, [loadAbsentDependencies, toast]);

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
                const [employeeRes, departmentRes, divisionRes] = await Promise.all([
                    fetch("/api/employees"),
                    fetch("/api/master/departments"),
                    fetch("/api/master/divisions"),
                ]);

                const failedResponse = [employeeRes, departmentRes, divisionRes].find((res) => !res.ok);
                if (failedResponse) throw new Error(await getResponseErrorMessage(failedResponse, "Gagal memuat data presensi."));

                const [employeeData, departmentData, divisionData] = await Promise.all([
                    employeeRes.json(),
                    departmentRes.json(),
                    divisionRes.json(),
                ]);

                if (Array.isArray(employeeData)) setEmployees(employeeData);
                if (Array.isArray(departmentData)) setDepartments(departmentData);
                if (Array.isArray(divisionData)) setDivisions(divisionData);
                await loadAbsentDependencies(true);
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
    }, [loadAbsentDependencies, loadCorrections, toast]);

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
            return formatWibTime(timeStr);
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
    }, [records, getEmpInfo, startDate, endDate, statusFilter, typeFilter, deptFilter, divFilter, search]);

    // Paginated records
    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filtered.slice(start, start + itemsPerPage);
    }, [filtered, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filtered.length / itemsPerPage);

    // Summary counts based on filtered date range (but not other filters for global stats)
    const summaryData = useMemo(() => {
        return {
            present: filtered.filter(r => r.status === "present").length,
            late: filtered.filter(r => r.status === "late").length,
            total: filtered.length
        };
    }, [filtered]);

    // Roster overrides for the evaluation date and H-1 are intentionally separate:
    // an open overnight record must be evaluated with the shift that started on H-1.
    useEffect(() => {
        const requestId = ++rosterRequestIdRef.current;
        setShiftOverrideDate(targetDateAbsent);
        setTargetDateShiftOverrides({});
        setPreviousDateShiftOverrides({});
        if (!isValidCalendarDate(targetDateAbsent)) return;

        const controller = new AbortController();
        const previousDate = addCalendarDays(targetDateAbsent, -1);
        const toOverrideMap = (payload: unknown): Record<string, string | null> => {
            if (!payload || typeof payload !== "object" || !Array.isArray((payload as { roster?: unknown }).roster)) {
                throw new Error("Format roster shift tidak sesuai.");
            }
            const map: Record<string, string | null> = {};
            for (const row of (payload as { roster: Array<{ employeeId?: unknown; shiftId?: unknown }> }).roster) {
                if (typeof row.employeeId === "string" && (typeof row.shiftId === "string" || row.shiftId === null)) {
                    map[row.employeeId] = row.shiftId;
                }
            }
            return map;
        };

        void Promise.all([
            fetch(`/api/shifts/assignments?date=${targetDateAbsent}`, { cache: "no-store", signal: controller.signal }),
            fetch(`/api/shifts/assignments?date=${previousDate}`, { cache: "no-store", signal: controller.signal }),
        ]).then(async ([targetResponse, previousResponse]) => {
            if (!targetResponse.ok || !previousResponse.ok) {
                throw new Error("Gagal memuat roster shift untuk evaluasi presensi.");
            }
            const [targetPayload, previousPayload] = await Promise.all([
                targetResponse.json(),
                previousResponse.json(),
            ]);
            if (rosterRequestIdRef.current !== requestId) return;
            const targetOverrides = toOverrideMap(targetPayload);
            const previousOverrides = toOverrideMap(previousPayload);
            setTargetDateShiftOverrides(targetOverrides);
            setPreviousDateShiftOverrides(previousOverrides);
        }).catch((error) => {
            if (controller.signal.aborted || rosterRequestIdRef.current !== requestId) return;
            setTargetDateShiftOverrides({});
            setPreviousDateShiftOverrides({});
            reportClientError("AttendanceMonitorPage", "Gagal memuat roster shift presensi", error, {
                targetDate: targetDateAbsent,
                previousDate,
            });
        });

        return () => {
            controller.abort();
            if (rosterRequestIdRef.current === requestId) rosterRequestIdRef.current += 1;
        };
    }, [targetDateAbsent]);

    // Calculate absent employees for target evaluation date using centralized resolver
    const absentEmployeesList = useMemo<AbsentEmployee[]>(() => {
        if (!targetDateAbsent) return [];
        return resolveAbsentEmployees({
            targetDate: targetDateAbsent,
            employees,
            records,
            leaves,
            shifts,
            holidays,
            now: authoritativeNow ?? undefined,
            targetDateShiftOverrides: shiftOverrideDate === targetDateAbsent
                ? targetDateShiftOverrides
                : EMPTY_SHIFT_OVERRIDES,
            previousDateShiftOverrides: shiftOverrideDate === targetDateAbsent
                ? previousDateShiftOverrides
                : EMPTY_SHIFT_OVERRIDES,
        });
    }, [records, employees, leaves, shifts, holidays, targetDateAbsent, authoritativeNow, shiftOverrideDate, targetDateShiftOverrides, previousDateShiftOverrides]);

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
            { key: "clockIn", label: "Clock In (WIB)" },
            { key: "clockOut", label: "Clock Out (WIB)" },
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
            ["ID", "Nama", "Dept", "Tanggal", "In (WIB)", "Out (WIB)", "Tipe Kehadiran", "Status"],
            "Laporan Presensi Karyawan",
            `Laporan_Presensi_${startDate}_to_${endDate}`,
            `Periode: ${startDate} s/d ${endDate} • Total: ${filtered.length} baris`
        );
    };

    const handleCorrectionAction = async (id: string, s: "APPROVED" | "REJECTED", options?: { silent?: boolean }): Promise<boolean> => {
        if (processingIdsRef.current.has(id)) return false;
        processingIdsRef.current.add(id);
        setProcessingIds(new Set(processingIdsRef.current));
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
            processingIdsRef.current.delete(id);
            setProcessingIds(new Set(processingIdsRef.current));
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
            {!initialLoading && activeTab === "log" && (
                <AttendanceSummary
                    present={summaryData.present}
                    late={summaryData.late}
                    total={summaryData.total}
                    scopeLabel={`Periode ${startDate} s/d ${endDate} • mengikuti filter aktif`}
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
                            {authoritativeDate ? (
                                <AttendanceFilters
                                    search={search} setSearch={setSearch}
                                    startDate={startDate} setStartDate={setStartDate}
                                    endDate={endDate} setEndDate={setEndDate}
                                    deptFilter={deptFilter} setDeptFilter={setDeptFilter}
                                    divFilter={divFilter} setDivFilter={setDivFilter}
                                    statusFilter={statusFilter} setStatusFilter={setStatusFilter}
                                    typeFilter={typeFilter} setTypeFilter={setTypeFilter}
                                    departments={departments} divisions={divisions}
                                    authoritativeDate={authoritativeDate}
                                />
                            ) : (
                                <div className="card p-4 text-xs text-[var(--text-muted)]">
                                    Tanggal server belum tersedia — filter tanggal nonaktif.
                                </div>
                            )}

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
                            onTargetDateChange={handleTargetDateAbsentChange}
                            maxDate={authoritativeDate}
                            absentEmployees={absentEmployeesList}
                            departments={departments}
                            divisions={divisions}
                            onRefresh={refreshAbsentData}
                            refreshing={absentRefreshing}
                        />
                    )}

                    {activeTab === "corrections" && (
                        <AttendanceCorrectionTab
                            corrections={corrections}
                            loading={correctionsLoading}
                            error={correctionsError}
                            processingIds={processingIds}
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
