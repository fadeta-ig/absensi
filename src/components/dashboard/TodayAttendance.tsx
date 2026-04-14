"use client";

import { useRouter } from "next/navigation";
import {
    ClipboardList, UserCheck, UserX, ArrowRight,
    Users, Megaphone,
} from "lucide-react";

interface Employee {
    id: string;
    employeeId: string;
    name: string;
    department: string;
    position: string;
    isActive: boolean;
}

interface AttendanceRecord {
    employeeId: string;
    date: string;
    status: string;
    clockIn?: string;
    clockOut?: string;
}

interface NewsItem {
    id: string;
    title: string;
    category: string;
    createdAt: string;
}

interface TodayAttendanceProps {
    todayAttendance: AttendanceRecord[];
    activeEmployees: Employee[];
    employees: Employee[];
    news: NewsItem[];
    getEmployeeName: (empId: string) => string;
}

export default function TodayAttendance({ todayAttendance, activeEmployees, employees, news, getEmployeeName }: TodayAttendanceProps) {
    const router = useRouter();
    const presentIds = new Set(todayAttendance.map((a) => a.employeeId));
    const absent = activeEmployees.filter((e) => !presentIds.has(e.employeeId));

    return (
        <>
            {/* Today's Attendance + Not Yet Present */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[12px] font-bold text-[#800020] uppercase tracking-wider flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-[#16a34a]" /> Absensi Hari Ini
                        </h2>
                        <button onClick={() => router.push("/dashboard/attendance")} className="text-[10px] font-bold text-[#800020] flex items-center gap-1 hover:underline">
                            Detail <ArrowRight className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="card flex-1 flex flex-col overflow-hidden">
                        {todayAttendance.length === 0 ? (
                            <div className="p-8 text-center flex-1 flex flex-col justify-center">
                                <ClipboardList className="w-8 h-8 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)]">Belum ada kehadiran hari ini</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--border)] flex-1 overflow-y-auto min-h-[150px]">
                                {todayAttendance.slice(0, 5).map((a, i) => (
                                    <div key={i} className="p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${a.status === "present" ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"}`}>
                                                {getEmployeeName(a.employeeId).charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-[var(--text-primary)]">{getEmployeeName(a.employeeId)}</p>
                                                <p className="text-[10px] text-[var(--text-muted)]">
                                                    Masuk: {a.clockIn ? new Date(a.clockIn).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                                                    {a.clockOut && ` • Pulang: ${new Date(a.clockOut).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`}
                                                </p>
                                            </div>
                                        </div>
                                        <span className={`badge ${a.status === "present" ? "badge-success" : "badge-warning"}`}>
                                            {a.status === "present" ? "Hadir" : "Terlambat"}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Not Yet Present */}
                <div className="flex flex-col gap-3">
                    <h2 className="text-[12px] font-bold text-[#800020] uppercase tracking-wider flex items-center gap-2">
                        <UserX className="w-4 h-4 text-[#ef4444]" /> Belum Hadir Hari Ini
                    </h2>
                    <div className="card flex-1 flex flex-col">
                        {absent.length === 0 ? (
                            <div className="p-8 text-center flex-1 flex flex-col justify-center">
                                <UserCheck className="w-8 h-8 text-[#16a34a] opacity-30 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)]">Semua karyawan sudah hadir 🎉</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--border)] flex-1 overflow-y-auto min-h-[150px]">
                                {absent.slice(0, 5).map((e) => (
                                    <div key={e.id} className="p-3 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold">
                                            {e.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-[var(--text-primary)]">{e.name}</p>
                                            <p className="text-[10px] text-[var(--text-muted)]">{e.department} • {e.position}</p>
                                        </div>
                                    </div>
                                ))}
                                {absent.length > 5 && <p className="text-xs text-center py-2 text-[var(--text-muted)]">+{absent.length - 5} lainnya</p>}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* News + Employee Table */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                <div className="flex flex-col gap-3">
                    <h2 className="text-[12px] font-bold text-[#800020] uppercase tracking-wider flex items-center gap-2">
                        <Megaphone className="w-4 h-4 text-[#800020]" /> Berita Terbaru
                    </h2>
                    <div className="card flex-1 divide-y divide-[var(--border)] flex flex-col overflow-hidden">
                        {news.length === 0 ? (
                            <div className="p-8 text-center flex-1 flex flex-col justify-center">
                                <Megaphone className="w-8 h-8 text-[var(--text-muted)] opacity-30 mx-auto mb-2" />
                                <p className="text-xs text-[var(--text-muted)]">Belum ada berita</p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto min-h-[150px]">
                                {news.slice(0, 3).map((n) => (
                                    <div key={n.id} className="p-3">
                                        <p className="text-sm font-medium text-[var(--text-primary)]">{n.title}</p>
                                        <p className="text-[10px] text-[var(--text-muted)] mt-1">{n.category} • {new Date(n.createdAt).toLocaleDateString("id-ID")}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[12px] font-bold text-[#800020] uppercase tracking-wider flex items-center gap-2">
                            <Users className="w-4 h-4 text-[#800020]" /> Data Karyawan
                        </h2>
                        <button onClick={() => router.push("/dashboard/employees")} className="text-[10px] font-bold text-[#800020] flex items-center gap-1 hover:underline">
                            Lihat Semua <ArrowRight className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="card flex-1 flex flex-col overflow-hidden">
                        <div className="overflow-x-auto flex-1">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Nama</th>
                                        <th className="hidden sm:table-cell">Departemen</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-8 text-sm text-[var(--text-muted)]">Belum ada data</td></tr>
                                    ) : (
                                        employees.slice(0, 5).map((e) => (
                                            <tr key={e.id}>
                                                <td className="font-mono text-xs">{e.employeeId}</td>
                                                <td className="font-medium text-[var(--text-primary)]">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">{e.name.charAt(0)}</div>
                                                        {e.name}
                                                    </div>
                                                </td>
                                                <td className="hidden sm:table-cell">{e.department}</td>
                                                <td><span className={`badge ${e.isActive ? "badge-success" : "badge-error"}`}>{e.isActive ? "Aktif" : "Nonaktif"}</span></td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
