"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Search, Calendar, Filter, UserCheck, UserX } from "lucide-react";

interface AttendanceRecord {
    id: string; employeeId: string; date: string;
    clockIn?: string; clockOut?: string; status: string;
}

export default function AttendanceMonitorPage() {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);
    const [statusFilter, setStatusFilter] = useState("all");
    const [search, setSearch] = useState("");

    useEffect(() => {
        fetch("/api/attendance").then((r) => r.json()).then(setRecords);
    }, []);

    const filtered = records.filter((r) => {
        const matchDate = r.date === dateFilter;
        const matchStatus = statusFilter === "all" || r.status === statusFilter;
        const matchSearch = r.employeeId.toLowerCase().includes(search.toLowerCase());
        return matchDate && matchStatus && matchSearch;
    });

    const allForDate = records.filter((r) => r.date === dateFilter);
    const presentCount = allForDate.filter((r) => r.status === "present").length;
    const lateCount = allForDate.filter((r) => r.status === "late").length;

    const formatTime = (iso?: string) => {
        if (!iso) return "--:--";
        return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-[var(--primary)]" />
                    Monitoring Absensi
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Pantau kehadiran karyawan</p>
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
                    <input className="form-input pl-10" placeholder="Cari ID karyawan..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                                <th>Tanggal</th>
                                <th>Clock In</th>
                                <th>Clock Out</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-8 text-sm text-[var(--text-muted)]">Tidak ada data untuk tanggal ini</td></tr>
                            ) : (
                                filtered.map((r) => (
                                    <tr key={r.id}>
                                        <td className="font-mono text-xs font-medium text-[var(--text-primary)]">{r.employeeId}</td>
                                        <td>{r.date}</td>
                                        <td>{formatTime(r.clockIn)}</td>
                                        <td>{formatTime(r.clockOut)}</td>
                                        <td><span className={`badge badge-${r.status === "present" ? "success" : r.status === "late" ? "warning" : "error"}`}>{r.status === "present" ? "Hadir" : r.status === "late" ? "Terlambat" : r.status}</span></td>
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
