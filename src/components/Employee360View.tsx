"use client";

import { Employee, AttendanceRecord, VisitReport, LeaveRequest, PayslipRecord } from "@/types";
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
    ArrowUpRight
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

interface Employee360ViewProps {
    employee: Employee;
    stats: {
        attendanceRate: number;
        lateCount: number;
        visitCount: number;
        leaveUsed: number;
        leaveRemaining: number;
    };
    recentAttendance: AttendanceRecord[];
    recentVisits: VisitReport[];
    recentLeaves: LeaveRequest[];
    recentPayslips: PayslipRecord[];
    backLink: string;
}

export function Employee360View({
    employee,
    stats,
    recentAttendance,
    recentVisits,
    recentLeaves,
    recentPayslips,
    backLink
}: Employee360ViewProps) {
    const [activeTab, setActiveTab] = useState("attendance");

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <Link
                        href={backLink}
                        className="p-2 hover:bg-[var(--secondary)] rounded-lg transition-colors"
                    >
                        <ChevronLeft className="h-5 w-5 text-[var(--text-muted)]" />
                    </Link>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xl font-bold text-slate-800">{employee.name}</p>
                            <p className="text-sm font-medium text-slate-500">{employee.positionRel?.name} • {employee.departmentRel?.name}</p>
                            <span className={`badge ${employee.isActive ? "badge-success" : "badge-error"}`}>
                                {employee.isActive ? "Active" : "Inactive"}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right hidden md:block">
                        <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Level</p>
                        <p className="text-sm font-bold text-[var(--text-primary)]">{employee.levelRel?.name}</p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold">
                        {employee.name.charAt(0)}
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Kehadiran" value={`${stats.attendanceRate.toFixed(1)}%`} sub="Rata-rata" icon={Activity} color="text-blue-600" bg="bg-blue-500/10" />
                <StatCard label="Terlambat" value={stats.lateCount.toString()} sub="Kejadian" icon={Clock} color="text-orange-600" bg="bg-orange-500/10" />
                <StatCard label="Kunjungan" value={stats.visitCount.toString()} sub="Laporan" icon={MapPin} color="text-green-600" bg="bg-green-500/10" />
                <StatCard label="Sisa Cuti" value={`${stats.leaveRemaining} Hari`} sub={`${stats.leaveUsed} hari terpakai`} icon={CalendarDays} color="text-[var(--primary)]" bg="bg-[var(--primary)]/10" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Info */}
                <div className="lg:col-span-4 space-y-4">
                    {/* Personalia Card */}
                    <div className="card overflow-hidden">
                        <div className="bg-[var(--secondary)]/50 px-5 py-3 border-b border-[var(--border)]">
                            <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                                <UserCheck className="w-3.5 h-3.5" /> Personalia
                            </h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <InfoRow label="Employee ID" value={employee.employeeId} icon={UserIcon} />
                            <InfoRow label="Department" value={employee.departmentRel?.name || "-"} icon={Building2} />
                            <InfoRow label="Division" value={employee.divisionRel?.name || "-"} />
                            <InfoRow label="Position" value={employee.positionRel?.name || "-"} />
                            <InfoRow label="Reports To" value={(employee as any).manager?.name || "None"} />
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
                <div className="lg:col-span-8">
                    {/* Tab Buttons */}
                    <div className="flex gap-1 mb-4 bg-[var(--secondary)] p-1 rounded-lg w-fit">
                        {[
                            { id: "attendance", label: "Absensi" },
                            { id: "visits", label: "Kunjungan" },
                            { id: "leave", label: "Cuti" },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${activeTab === tab.id
                                        ? "bg-white text-[var(--text-primary)] shadow-sm"
                                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content: Attendance */}
                    {activeTab === "attendance" && (
                        <div className="card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Tanggal</th>
                                            <th>Masuk / Keluar</th>
                                            <th className="text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentAttendance.length > 0 ? recentAttendance.map(att => (
                                            <tr key={att.id}>
                                                <td className="font-medium text-[var(--text-primary)]">{att.date}</td>
                                                <td>
                                                    <div className="flex items-center gap-2 text-xs font-medium">
                                                        <span className="bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded">{att.clockIn || "--:--"}</span>
                                                        <span className="text-[var(--text-muted)]">→</span>
                                                        <span className="bg-[var(--secondary)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded">{att.clockOut || "--:--"}</span>
                                                    </div>
                                                </td>
                                                <td className="text-right">
                                                    <span className={`badge ${att.status === "present" ? "badge-success" : att.status === "late" ? "badge-warning" : "badge-error"}`}>
                                                        {att.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan={3} className="text-center py-8 text-sm text-[var(--text-muted)]">Belum ada data absensi</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Tab Content: Visits */}
                    {activeTab === "visits" && (
                        <div className="card p-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {recentVisits.length > 0 ? recentVisits.map(v => (
                                    <div key={v.id} className="p-4 rounded-lg border border-[var(--border)] hover:border-[var(--primary)]/30 hover:shadow-md transition-all space-y-2 group">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-xs font-bold text-[var(--primary)] uppercase tracking-tight">{v.clientName}</p>
                                                <p className="text-[10px] text-[var(--text-muted)] font-medium">{v.date}</p>
                                            </div>
                                            <MapPin className="h-4 w-4 text-[var(--border)] group-hover:text-[var(--primary)] transition-colors" />
                                        </div>
                                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">{v.purpose}</p>
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
                    {activeTab === "leave" && (
                        <div className="card overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Durasi</th>
                                            <th>Tipe</th>
                                            <th className="text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentLeaves.length > 0 ? recentLeaves.map(l => (
                                            <tr key={l.id}>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="h-3.5 w-3.5 text-[var(--primary)]" />
                                                        <span className="font-medium text-[var(--text-primary)]">{l.startDate}</span>
                                                        <span className="text-[var(--text-muted)]">»</span>
                                                        <span className="font-medium text-[var(--text-primary)]">{l.endDate}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="badge badge-info">{l.type}</span>
                                                </td>
                                                <td className="text-right">
                                                    <span className={`badge ${l.status === "approved" ? "badge-success" : l.status === "pending" ? "badge-warning" : "badge-error"}`}>
                                                        {l.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan={3} className="text-center py-8 text-sm text-[var(--text-muted)]">Belum ada riwayat cuti</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, sub, icon: Icon, color, bg }: { label: string, value: string, sub: string, icon: any, color: string, bg: string }) {
    return (
        <div className="card p-4">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div>
                    <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">{label}</p>
                    <h3 className="text-xl font-bold text-[var(--text-primary)]">{value}</h3>
                    <p className="text-[10px] text-[var(--text-muted)]">{sub}</p>
                </div>
            </div>
        </div>
    );
}

function InfoRow({ label, value, icon: Icon }: { label: string, value: string, icon?: any }) {
    return (
        <div className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-[var(--secondary)] border border-[var(--border)] flex items-center justify-center shrink-0 group-hover:bg-white transition-all">
                {Icon ? <Icon className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]" /> : <div className="h-1 w-1 rounded-full bg-[var(--text-muted)]" />}
            </div>
            <div>
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-tight">{label}</p>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{value}</p>
            </div>
        </div>
    );
}
