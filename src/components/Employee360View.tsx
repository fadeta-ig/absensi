"use client";

import { Employee, AttendanceRecord, VisitReport, LeaveRequest, PayslipRecord, EmployeeStatusHistory } from "@/types";
import {
    Activity,
    Calendar,
    MapPin,
    CreditCard,
    ChevronLeft,
    UserCheck,
    Clock,
    User as UserIcon,
    Building2,
    CalendarDays,
    ArrowUpRight,
    Package,
    Smartphone,
    Laptop,
    Phone,
    History
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { AssetWithHistory } from "@/lib/types/asset";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

import { formatDisplayDate, formatDisplayDateTime, formatDisplayTime, toDateString } from "@/lib/utils";

interface Employee360ViewProps {
    employee: Employee;
    stats: {
        attendanceRate: number;
        lateCount: number;
        visitCount: number;
        leaveUsed: number;
        leaveRemaining: number;
    };
    effectiveShift?: { name: string | null; source: "assignment" | "fallback" | "default" | "none" };
    recentAttendance: AttendanceRecord[];
    recentVisits: VisitReport[];
    recentLeaves: LeaveRequest[];
    recentPayslips: PayslipRecord[];
    assignedAssets: AssetWithHistory[];
    statusHistory?: EmployeeStatusHistory[];
    backLink: string;
    compact?: boolean;
}

export function Employee360View({
    employee,
    stats,
    effectiveShift,
    recentAttendance,
    recentVisits,
    recentLeaves,
    recentPayslips,
    assignedAssets,
    statusHistory,
    backLink,
    compact = false
}: Employee360ViewProps) {
    const [activeTab, setActiveTab] = useState("attendance");
    const effectiveShiftTitle = effectiveShift?.source === "assignment"
        ? "Roster yang berlaku hari ini"
        : effectiveShift?.source === "fallback"
            ? "Shift dasar karyawan yang berlaku hari ini"
            : "Shift default sistem yang berlaku hari ini";

    return (
        <div className="min-w-0 space-y-5 sm:space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <Link
                        href={backLink}
                        aria-label="Kembali ke daftar karyawan"
                        className="shrink-0 p-2 hover:bg-[var(--secondary)] rounded-lg transition-colors"
                    >
                        <ChevronLeft className="h-5 w-5 text-[var(--text-muted)]" />
                    </Link>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="break-words text-xl font-bold text-[var(--text-primary)]">{employee.name}</p>
                            <p className="text-sm font-medium text-[var(--text-secondary)]">{employee.positionRel?.name} • {employee.departmentRel?.name}</p>
                            <span className={`badge ${employee.isActive ? "badge-success" : "badge-error"}`}>
                                {employee.isActive ? "Aktif" : "Nonaktif"}
                            </span>
                            {effectiveShift?.name && (
                                <span className="badge badge-info" title={effectiveShiftTitle}>
                                    Shift hari ini: {effectiveShift.name}{effectiveShift.source === "assignment" ? " (roster)" : ""}
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Cuti disetujui dihitung per hari sesuai roster yang berlaku pada tanggal cuti.</p>
                    </div>
                </div>
                <div className={compact ? "hidden" : "hidden shrink-0 items-center gap-3 md:flex"}>
                    <div className="text-right">
                        <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Level</p>
                        <p className="text-sm font-bold text-[var(--text-primary)]">{employee.levelRel?.name}</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold">
                        {employee.name.charAt(0)}
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className={compact ? "grid grid-cols-2 gap-2.5 [&>div:last-child]:col-span-2" : "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 [&>div:last-child]:col-span-2 md:[&>div:last-child]:col-span-1"}>
                <StatCard label="Kehadiran" value={`${stats.attendanceRate.toFixed(1)}%`} sub="Rata-rata" icon={Activity} color="text-blue-600" bg="bg-blue-500/10" />
                <StatCard label="Terlambat" value={stats.lateCount.toString()} sub="Kejadian" icon={Clock} color="text-orange-600" bg="bg-orange-500/10" />
                <StatCard label="Kunjungan" value={stats.visitCount.toString()} sub="Laporan" icon={MapPin} color="text-green-600" bg="bg-green-500/10" />
                <StatCard label="Sisa Cuti" value={`${stats.leaveRemaining} Hari`} sub={`${stats.leaveUsed} hari cuti disetujui`} icon={CalendarDays} color="text-[var(--primary)]" bg="bg-[var(--primary)]/10" />
                <StatCard label="Aset Dipegang" value={assignedAssets.length.toString()} sub="Aset aktif" icon={Package} color="text-purple-600" bg="bg-purple-500/10" />
            </div>

            <div className={compact ? "grid grid-cols-1 gap-6" : "grid grid-cols-1 xl:grid-cols-12 gap-6"}>
                {/* Left: Info */}
                <div className={compact ? "order-2 min-w-0 space-y-4" : "order-2 min-w-0 space-y-4 xl:order-1 xl:col-span-4"}>
                    {/* Personalia Card */}
                    <div className="card overflow-hidden">
                        <div className="bg-[var(--secondary)]/50 px-5 py-3 border-b border-[var(--border)]">
                            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                                <UserCheck className="w-3.5 h-3.5" /> Personalia
                            </h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <InfoRow label="NIP" value={employee.employeeId} icon={UserIcon} />
                            <InfoRow label="Departemen" value={employee.departmentRel?.name || "-"} icon={Building2} />
                            <InfoRow label="Divisi" value={employee.divisionRel?.name || "-"} />
                            <InfoRow label="Jabatan" value={employee.positionRel?.name || "-"} />
                            <InfoRow label="Atasan" value={employee.manager?.name || "-"} />
                        </div>
                    </div>

                    {/* Payroll Card */}
                    <div className="card overflow-hidden">
                        <div className="bg-[var(--secondary)]/50 px-5 py-3 border-b border-[var(--border)]">
                            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                                <CreditCard className="w-3.5 h-3.5" /> Payroll Terakhir
                            </h3>
                        </div>
                        <div className="p-5">
                            {recentPayslips.length > 0 ? (
                                <div className="space-y-3">
                                    {recentPayslips.map(ps => (
                                        <div key={ps.id} className="group p-3 rounded-lg border border-dashed border-[var(--border)] hover:border-green-200 hover:bg-green-50/30 transition-all flex justify-between items-center">
                                            <div>
                                                <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-tight">{ps.period}</p>
                                                <span className="text-xs font-semibold text-blue-700">Level 360</span>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-green-600">Rp {ps.netSalary.toLocaleString()}</p>
                                                <ArrowUpRight className="h-3 w-3 inline ml-1 text-green-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-6">
                                    <p className="text-sm text-[var(--text-muted)]">Belum ada data penggajian</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Activity Tabs */}
                <div className={compact ? "order-1 min-w-0 space-y-4" : "order-1 min-w-0 space-y-4 xl:order-2 xl:col-span-8"}>
                    {/* Tab Buttons */}
                    <div role="group" aria-label="Riwayat karyawan" className="flex w-full flex-wrap gap-1 rounded-xl bg-[var(--secondary)] p-1">
                        {[
                            { id: "attendance", label: "Presensi" },
                            { id: "visits", label: "Kunjungan" },
                            { id: "leaves", label: "Cuti" },
                            { id: "assets", label: "Aset" },
                            ...(statusHistory ? [{ id: "status", label: "Status Kerja" }] : []),
                        ].map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                aria-pressed={activeTab === tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`min-h-11 flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${activeTab === tab.id
                                        ? "bg-[var(--card)] text-[var(--text-primary)] shadow-sm"
                                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content: Attendance */}
                    {activeTab === "attendance" && (
                        <ProfileHistoryTable
                            title="Riwayat presensi"
                            compact={compact}
                            description="Catatan terbaru · Jam dalam WIB"
                            headers={["Tanggal", "Masuk", "Pulang", "Status"]}
                            emptyMessage="Belum ada data presensi"
                            rows={recentAttendance.map(att => ({
                                id: att.id,
                                cells: [
                                    <span key="date" className="font-semibold text-[var(--text-primary)]">{formatDisplayDate(att.date)}</span>,
                                    <ProfileClock key="in" value={att.clockIn} recordDate={att.date} />,
                                    <ProfileClock key="out" value={att.clockOut} recordDate={att.date} />,
                                    <span key="status" className={`badge ${att.status === "present" ? "badge-success" : att.status === "late" ? "badge-warning" : "badge-error"}`}>
                                        {{ present: "Hadir", late: "Terlambat", absent: "Tidak hadir", leave: "Cuti" }[att.status] || att.status}
                                    </span>,
                                ],
                            }))}
                        />
                    )}

                    {/* Tab Content: Visits */}
                    {activeTab === "visits" && (
                        <div className="card p-5">
                            <div className={compact ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
                                {recentVisits.length > 0 ? recentVisits.map(v => (
                                    <div key={v.id} className="p-4 rounded-lg border border-[var(--border)] hover:border-[var(--primary)]/30 hover:shadow-md transition-all space-y-2 group">
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="min-w-0">
                                                <p className="break-words text-sm font-semibold text-[var(--text-primary)]">{v.clientName}</p>
                                                <p className="mt-1 text-xs text-[var(--text-muted)]">{formatDisplayDate(v.date)}</p>
                                            </div>
                                            <MapPin className="h-4 w-4 text-[var(--border)] group-hover:text-[var(--primary)] transition-colors" />
                                        </div>
                                        <p className="break-words text-sm text-[var(--text-secondary)] leading-relaxed">{v.purpose}</p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                                            <span>Masuk: {formatDisplayTime(v.clockInTime)} WIB</span>
                                            <span>Pulang: {v.clockOutTime ? `${formatDisplayTime(v.clockOutTime)} WIB` : "Belum tercatat"}</span>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="col-span-full py-12 text-center">
                                        <p className="text-sm text-[var(--text-muted)]">Tidak ada riwayat kunjungan</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tab Content: Leave */}
                    {activeTab === "leaves" && (
                        <ProfileHistoryTable
                            title="Riwayat cuti"
                            compact={compact}
                            headers={["Periode", "Tipe", "Status"]}
                            emptyMessage="Belum ada riwayat cuti"
                            rows={recentLeaves.map(l => ({
                                id: l.id,
                                cells: [
                                    <div key="dates" className="flex items-start gap-2">
                                        <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                                        <div className="font-medium text-[var(--text-primary)]">
                                            <p>{formatDisplayDate(l.startDate)}</p>
                                            <p className="text-xs text-[var(--text-muted)]">s/d {formatDisplayDate(l.endDate)}</p>
                                        </div>
                                    </div>,
                                    <span key="type" className="badge badge-info">{{ annual: "Tahunan", sick: "Sakit", personal: "Izin", maternity: "Melahirkan", paternity: "Pendampingan istri" }[l.type] || l.type}</span>,
                                    <span key="status" className={`badge ${l.status === "approved" ? "badge-success" : l.status === "pending" ? "badge-warning" : "badge-error"}`}>
                                        {{ approved: "Disetujui", pending: "Menunggu", rejected: "Ditolak" }[l.status] || l.status}
                                    </span>,
                                ],
                            }))}
                        />
                    )}

                    {/* Tab Content: Assets */}
                    {activeTab === "assets" && (
                        <ProfileHistoryTable
                            title="Aset yang dipegang"
                            compact={compact}
                            primaryFullWidth
                            headers={["Aset", "Kategori", "Kondisi"]}
                            emptyMessage="Karyawan ini tidak memegang aset perusahaan"
                            rows={assignedAssets.map(a => ({
                                id: a.id,
                                cells: [
                                    <div key="asset" className="flex min-w-0 items-center gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--secondary)] text-[var(--text-secondary)]">
                                            {a.category?.prefix === "HANDPHONE" ? <Smartphone size={16} /> :
                                             a.category?.prefix === "LAPTOP" ? <Laptop size={16} /> :
                                             a.category?.prefix === "NOMOR_HP" ? <Phone size={16} /> :
                                             <Package size={16} />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="break-words text-sm font-semibold text-[var(--text-primary)]">{a.name}</p>
                                            <p className="mt-0.5 break-all font-mono text-xs text-[var(--text-muted)]">{a.assetCode}</p>
                                        </div>
                                    </div>,
                                    <span key="category" className="badge badge-info">{a.category?.name || "Lainnya"}</span>,
                                    <span key="condition" className={`badge ${a.kondisi === "BAIK" ? "badge-success" : a.kondisi === "KURANG_BAIK" ? "badge-warning" : "badge-error"}`}>
                                        {a.kondisi.replaceAll("_", " ")}
                                    </span>,
                                ],
                            }))}
                        />
                    )}

                    {activeTab === "status" && statusHistory && (
                        <div className="card overflow-hidden">
                            <div className="border-b border-[var(--border)] bg-[var(--secondary)]/40 px-5 py-4">
                                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                                    <History className="h-4 w-4" /> Riwayat Status Kepegawaian
                                </h3>
                            </div>
                            <div className="divide-y divide-[var(--border)]">
                                {statusHistory.length > 0 ? statusHistory.map((item) => (
                                    <div key={item.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`badge ${item.isActive ? "badge-success" : "badge-error"}`}>
                                                    {item.isActive ? "Diaktifkan" : "Dinonaktifkan"}
                                                </span>
                                                <span className="text-xs text-[var(--text-muted)]">
                                                    oleh {item.actor?.displayName || item.changedByName || item.changedByIdentifier}
                                                </span>
                                            </div>
                                            <p className="mt-2 break-words text-sm text-[var(--text-primary)]">{item.reason}</p>
                                        </div>
                                        <div className="shrink-0 text-left text-xs text-[var(--text-muted)] sm:text-right">
                                            <p>Efektif {formatDisplayDate(item.effectiveDate)}</p>
                                            <p>Dicatat {formatDisplayDateTime(item.createdAt)}</p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="p-10 text-center text-sm text-[var(--text-muted)]">Belum ada perubahan status yang tercatat.</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, sub, icon: Icon, color, bg }: { label: string, value: string, sub: string, icon: LucideIcon, color: string, bg: string }) {
    return (
        <div className="card min-w-0 p-3 sm:p-4">
            <div className="flex items-start gap-2 sm:items-center sm:gap-3">
                <div className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${bg}`}>
                    <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${color}`} />
                </div>
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
                    <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">{value}</h3>
                    <p className="text-xs text-[var(--text-muted)]">{sub}</p>
                </div>
            </div>
        </div>
    );
}

function InfoRow({ label, value, icon: Icon }: { label: string, value: string, icon?: LucideIcon }) {
    return (
        <div className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-center shrink-0 group-hover:bg-[var(--card)] transition-all">
                {Icon ? <Icon className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]" /> : <div className="h-1 w-1 rounded-full bg-[var(--text-muted)]" />}
            </div>
            <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-tight">{label}</p>
                <p className="break-words text-sm font-semibold text-[var(--text-primary)]">{value}</p>
            </div>
        </div>
    );
}

function ProfileClock({ value, recordDate }: { value?: string | null; recordDate: string }) {
    const time = formatDisplayTime(value);
    const clockDate = value ? toDateString(value) : "";
    return (
        <div className="space-y-1">
            <span className="whitespace-nowrap font-semibold tabular-nums text-[var(--text-primary)]">
                {time === "-" ? "Belum tercatat" : `${time} WIB`}
            </span>
            {clockDate && clockDate !== toDateString(recordDate) && (
                <p className="text-xs text-[var(--text-muted)]">{formatDisplayDate(value)}</p>
            )}
        </div>
    );
}

function ProfileHistoryTable({ title, description, headers, rows, emptyMessage, compact = false, primaryFullWidth = false }: {
    compact?: boolean;
    primaryFullWidth?: boolean;
    title: string;
    description?: string;
    headers: string[];
    rows: { id: string; cells: ReactNode[] }[];
    emptyMessage: string;
}) {
    return (
        <section aria-label={title} className="card min-w-0 overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
                {description && <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>}
            </div>
            {rows.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">{emptyMessage}</p>
            ) : (
                <>
                    <ul className={`divide-y divide-[var(--border)] ${compact ? "" : "sm:hidden"}`}>
                        {rows.map(row => (
                            <li key={row.id} className="space-y-3 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">{row.cells[0]}</div>
                                    {!primaryFullWidth && <div>{row.cells.at(-1)}</div>}
                                </div>
                                <dl className="grid grid-cols-2 gap-3 rounded-lg bg-[var(--secondary)] p-3">
                                    {row.cells.slice(1, primaryFullWidth ? undefined : -1).map((cell, index) => (
                                        <div key={headers[index + 1]} className="min-w-0 space-y-1">
                                            <dt className="text-xs text-[var(--text-muted)]">{headers[index + 1]}</dt>
                                            <dd className="break-words text-sm">{cell}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </li>
                        ))}
                    </ul>
                    <div className={compact ? "hidden" : "hidden sm:block"}>
                        <Table>
                            <TableHeader>
                                <TableRow>{headers.map((header, index) => <TableHead key={header} className={index === headers.length - 1 ? "text-right" : ""}>{header}</TableHead>)}</TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map(row => (
                                    <TableRow key={row.id}>
                                        {row.cells.map((cell, index) => <TableCell key={headers[index]} className={index === headers.length - 1 ? "text-right" : ""}>{cell}</TableCell>)}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}
        </section>
    );
}
