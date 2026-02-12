"use client";

import { useEffect, useState } from "react";
import styles from "./overview.module.css";

interface Employee {
    id: string;
    name: string;
    department: string;
    isActive: boolean;
}

export default function DashboardHomePage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [attendance, setAttendance] = useState<{ date: string; status: string }[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<{ status: string }[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        fetch("/api/employees").then((r) => r.json()).then(setEmployees);
        fetch("/api/attendance").then((r) => r.json()).then(setAttendance);
        fetch("/api/leave").then((r) => r.json()).then(setLeaveRequests);

        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const today = new Date().toISOString().split("T")[0];
    const todayAttendance = attendance.filter((a) => a.date === today);
    const activeEmployees = employees.filter((e) => e.isActive);
    const pendingLeaves = leaveRequests.filter((l) => l.status === "pending");

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>📊 Dashboard HR</h1>
                    <p className={styles.subtitle}>
                        {currentTime.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </p>
                </div>
                <div className={styles.liveTime}>
                    {currentTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
            </div>

            {/* Stats Cards */}
            <div className={styles.statsGrid}>
                <div className={`glass-card stat-card`}>
                    <div className="stat-icon" style={{ background: "rgba(99, 102, 241, 0.12)" }}>👥</div>
                    <p className="stat-value">{activeEmployees.length}</p>
                    <p className="stat-label">Total Karyawan Aktif</p>
                </div>
                <div className={`glass-card stat-card`}>
                    <div className="stat-icon" style={{ background: "rgba(16, 185, 129, 0.12)" }}>✅</div>
                    <p className="stat-value">{todayAttendance.length}</p>
                    <p className="stat-label">Hadir Hari Ini</p>
                </div>
                <div className={`glass-card stat-card`}>
                    <div className="stat-icon" style={{ background: "rgba(245, 158, 11, 0.12)" }}>⏳</div>
                    <p className="stat-value">{pendingLeaves.length}</p>
                    <p className="stat-label">Pengajuan Cuti Pending</p>
                </div>
                <div className={`glass-card stat-card`}>
                    <div className="stat-icon" style={{ background: "rgba(6, 182, 212, 0.12)" }}>📊</div>
                    <p className="stat-value">
                        {activeEmployees.length > 0 ? Math.round((todayAttendance.length / activeEmployees.length) * 100) : 0}%
                    </p>
                    <p className="stat-label">Tingkat Kehadiran</p>
                </div>
            </div>

            {/* Quick Actions */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>⚡ Aksi Cepat</h2>
                <div className={styles.actionsGrid}>
                    <a href="/dashboard/employees" className={`glass-card ${styles.actionCard}`}>
                        <span className={styles.actionIcon}>👤</span>
                        <span className={styles.actionLabel}>Tambah Karyawan</span>
                    </a>
                    <a href="/dashboard/payroll" className={`glass-card ${styles.actionCard}`}>
                        <span className={styles.actionIcon}>💰</span>
                        <span className={styles.actionLabel}>Buat Slip Gaji</span>
                    </a>
                    <a href="/dashboard/leave" className={`glass-card ${styles.actionCard}`}>
                        <span className={styles.actionIcon}>📋</span>
                        <span className={styles.actionLabel}>Kelola Cuti</span>
                    </a>
                    <a href="/dashboard/news" className={`glass-card ${styles.actionCard}`}>
                        <span className={styles.actionIcon}>📢</span>
                        <span className={styles.actionLabel}>Posting Berita</span>
                    </a>
                </div>
            </div>

            {/* Employee List Preview */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>👥 Karyawan Terbaru</h2>
                <div className={`glass-card ${styles.tableWrap}`}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Nama</th>
                                <th>Departemen</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.slice(0, 5).map((emp) => (
                                <tr key={emp.id}>
                                    <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{emp.name}</td>
                                    <td>{emp.department}</td>
                                    <td>
                                        <span className={`badge badge-${emp.isActive ? "success" : "error"}`}>
                                            {emp.isActive ? "Aktif" : "Nonaktif"}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
