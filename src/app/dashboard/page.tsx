"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, ClipboardList, CalendarOff, FileText, TrendingUp, ArrowRight, Clock } from "lucide-react";

interface Employee { id: string; name: string; department: string; position: string; isActive: boolean; }
interface AttendanceRecord { employeeId: string; date: string; status: string; clockIn?: string; }

export default function DashboardPage() {
    const router = useRouter();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [leaveCount, setLeaveCount] = useState(0);

    useEffect(() => {
        fetch("/api/employees").then((r) => r.json()).then(setEmployees);
        fetch("/api/attendance").then((r) => r.json()).then(setAttendance);
        fetch("/api/leave").then((r) => r.json()).then((data) => {
            if (Array.isArray(data)) setLeaveCount(data.filter((l: { status: string }) => l.status === "pending").length);
        });
    }, []);

    const today = new Date().toISOString().split("T")[0];
    const todayAttendance = attendance.filter((a) => a.date === today);
    const activeEmployees = employees.filter((e) => e.isActive);

    const stats = [
        { label: "Total Karyawan", value: activeEmployees.length, icon: Users, color: "text-[var(--primary)]", bg: "bg-[var(--primary)]/10" },
        { label: "Hadir Hari Ini", value: todayAttendance.length, icon: ClipboardList, color: "text-green-600", bg: "bg-green-500/10" },
        { label: "Pengajuan Cuti", value: leaveCount, icon: CalendarOff, color: "text-orange-600", bg: "bg-orange-500/10" },
        { label: "Persentase Hadir", value: `${activeEmployees.length > 0 ? Math.round((todayAttendance.length / activeEmployees.length) * 100) : 0}%`, icon: TrendingUp, color: "text-blue-600", bg: "bg-blue-500/10" },
    ];

    const quickActions = [
        { label: "Kelola Karyawan", href: "/dashboard/employees", icon: Users },
        { label: "Monitor Absensi", href: "/dashboard/attendance", icon: ClipboardList },
        { label: "Buat Slip Gaji", href: "/dashboard/payroll", icon: FileText },
        { label: "Kelola Cuti", href: "/dashboard/leave", icon: CalendarOff },
    ];

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)]">Dashboard</h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Ringkasan aktivitas hari ini — {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((s, i) => {
                    const Icon = s.icon;
                    return (
                        <div key={i} className="card p-5 flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl ${s.bg} flex items-center justify-center`}>
                                <Icon className={`w-6 h-6 ${s.color}`} />
                            </div>
                            <div>
                                <p className="text-2xl font-extrabold text-[var(--text-primary)]">{s.value}</p>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.label}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Quick Actions */}
            <div className="space-y-3">
                <h2 className="text-base font-bold text-[var(--text-primary)]">Aksi Cepat</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {quickActions.map((a) => {
                        const Icon = a.icon;
                        return (
                            <button
                                key={a.href}
                                onClick={() => router.push(a.href)}
                                className="card p-4 flex flex-col items-center gap-3 hover:shadow-md transition-shadow group cursor-pointer"
                            >
                                <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center group-hover:bg-[var(--primary)] transition-colors">
                                    <Icon className="w-5 h-5 text-[var(--primary)] group-hover:text-white transition-colors" />
                                </div>
                                <span className="text-xs font-medium text-[var(--text-secondary)]">{a.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Employee Preview */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-[var(--text-primary)]">Karyawan</h2>
                    <button onClick={() => router.push("/dashboard/employees")} className="text-xs font-medium text-[var(--primary)] flex items-center gap-1 hover:underline">
                        Lihat Semua <ArrowRight className="w-3 h-3" />
                    </button>
                </div>
                <div className="card overflow-hidden">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Nama</th>
                                <th className="hidden sm:table-cell">Departemen</th>
                                <th className="hidden sm:table-cell">Jabatan</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-8 text-sm text-[var(--text-muted)]">Belum ada data</td></tr>
                            ) : (
                                employees.slice(0, 5).map((e) => (
                                    <tr key={e.id}>
                                        <td className="font-medium text-[var(--text-primary)]">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">{e.name.charAt(0)}</div>
                                                {e.name}
                                            </div>
                                        </td>
                                        <td className="hidden sm:table-cell">{e.department}</td>
                                        <td className="hidden sm:table-cell">{e.position}</td>
                                        <td><span className={`badge ${e.isActive ? "badge-success" : "badge-error"}`}>{e.isActive ? "Aktif" : "Nonaktif"}</span></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Today's Attendance */}
            <div className="space-y-3">
                <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[var(--primary)]" />
                    Absensi Hari Ini
                </h2>
                <div className="card overflow-hidden">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Karyawan</th>
                                <th>Clock In</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {todayAttendance.length === 0 ? (
                                <tr><td colSpan={3} className="text-center py-8 text-sm text-[var(--text-muted)]">Belum ada kehadiran</td></tr>
                            ) : (
                                todayAttendance.map((a, i) => (
                                    <tr key={i}>
                                        <td className="font-medium text-[var(--text-primary)]">{a.employeeId}</td>
                                        <td>{a.clockIn ? new Date(a.clockIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</td>
                                        <td><span className={`badge badge-${a.status === "present" ? "success" : "warning"}`}>{a.status === "present" ? "Hadir" : "Terlambat"}</span></td>
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
