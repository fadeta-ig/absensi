"use client";

import { useEffect, useState } from "react";
import styles from "./att.module.css";

interface AttendanceRecord {
    id: string;
    employeeId: string;
    date: string;
    clockIn?: string;
    clockOut?: string;
    status: string;
}

export default function AttendanceMonitorPage() {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);

    useEffect(() => {
        fetch("/api/attendance").then((r) => r.json()).then(setRecords);
    }, []);

    const formatTime = (iso?: string) => {
        if (!iso) return "--:--";
        return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    };

    const getStatusLabel = (s: string) => {
        switch (s) {
            case "present": return "Hadir";
            case "late": return "Terlambat";
            case "absent": return "Absen";
            case "leave": return "Cuti";
            default: return s;
        }
    };

    const getStatusBadge = (s: string) => {
        switch (s) {
            case "present": return "success";
            case "late": return "warning";
            case "absent": return "error";
            case "leave": return "info";
            default: return "primary";
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>📋 Monitor Absensi</h1>
                <p className={styles.subtitle}>Pantau kehadiran karyawan secara real-time</p>
            </div>

            <div className={`glass-card ${styles.tableWrap}`}>
                {records.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-state-icon">📋</span>
                        <p className="empty-state-title">Belum ada data absensi</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Tanggal</th>
                                <th>ID Karyawan</th>
                                <th>Clock In</th>
                                <th>Clock Out</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.map((r) => (
                                <tr key={r.id}>
                                    <td>{r.date}</td>
                                    <td><span className="badge badge-primary">{r.employeeId}</span></td>
                                    <td>{formatTime(r.clockIn)}</td>
                                    <td>{formatTime(r.clockOut)}</td>
                                    <td><span className={`badge badge-${getStatusBadge(r.status)}`}>{getStatusLabel(r.status)}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
