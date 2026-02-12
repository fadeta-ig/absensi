"use client";

import { useEffect, useState } from "react";
import styles from "./home.module.css";

interface User {
    name: string;
    employeeId: string;
    department: string;
    position: string;
    totalLeave: number;
    usedLeave: number;
}

interface AttendanceRecord {
    id: string;
    date: string;
    clockIn?: string;
    clockOut?: string;
    status: string;
}

interface NewsItem {
    id: string;
    title: string;
    content: string;
    category: string;
    createdAt: string;
    isPinned: boolean;
}

export default function EmployeeHomePage() {
    const [user, setUser] = useState<User | null>(null);
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        fetch("/api/auth/me").then((r) => r.json()).then(setUser);
        fetch("/api/attendance").then((r) => r.json()).then(setAttendance);
        fetch("/api/news").then((r) => r.json()).then(setNews);

        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const todayRecord = attendance.find(
        (a) => a.date === new Date().toISOString().split("T")[0]
    );

    const greeting = () => {
        const hour = currentTime.getHours();
        if (hour < 12) return "Selamat Pagi";
        if (hour < 15) return "Selamat Siang";
        if (hour < 18) return "Selamat Sore";
        return "Selamat Malam";
    };

    const formatTime = (iso?: string) => {
        if (!iso) return "--:--";
        return new Date(iso).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    if (!user) return null;

    return (
        <div className={styles.page}>
            {/* Welcome Section */}
            <div className={styles.welcomeCard}>
                <div className={styles.welcomeContent}>
                    <p className={styles.greeting}>{greeting()} 👋</p>
                    <h1 className={styles.welcomeName}>{user.name}</h1>
                    <p className={styles.welcomeSub}>
                        {user.position} — {user.department}
                    </p>
                </div>
                <div className={styles.clockDisplay}>
                    <p className={styles.clockTime}>
                        {currentTime.toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                        })}
                    </p>
                    <p className={styles.clockDate}>
                        {currentTime.toLocaleDateString("id-ID", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                        })}
                    </p>
                </div>
            </div>

            {/* Stats Grid */}
            <div className={styles.statsGrid}>
                <div className={`glass-card ${styles.statCard}`}>
                    <div className={`${styles.statIcon} ${styles.statIconPrimary}`}>📸</div>
                    <div className={styles.statInfo}>
                        <p className={styles.statValue}>
                            {todayRecord ? (todayRecord.clockOut ? "Selesai" : "Hadir") : "Belum"}
                        </p>
                        <p className={styles.statLabel}>Status Hari Ini</p>
                    </div>
                </div>

                <div className={`glass-card ${styles.statCard}`}>
                    <div className={`${styles.statIcon} ${styles.statIconSuccess}`}>⏰</div>
                    <div className={styles.statInfo}>
                        <p className={styles.statValue}>{formatTime(todayRecord?.clockIn)}</p>
                        <p className={styles.statLabel}>Clock In</p>
                    </div>
                </div>

                <div className={`glass-card ${styles.statCard}`}>
                    <div className={`${styles.statIcon} ${styles.statIconAccent}`}>🏁</div>
                    <div className={styles.statInfo}>
                        <p className={styles.statValue}>{formatTime(todayRecord?.clockOut)}</p>
                        <p className={styles.statLabel}>Clock Out</p>
                    </div>
                </div>

                <div className={`glass-card ${styles.statCard}`}>
                    <div className={`${styles.statIcon} ${styles.statIconWarning}`}>🏖️</div>
                    <div className={styles.statInfo}>
                        <p className={styles.statValue}>{user.totalLeave - user.usedLeave}</p>
                        <p className={styles.statLabel}>Sisa Cuti</p>
                    </div>
                </div>
            </div>

            {/* News Section */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>📢 WIG&apos;s News</h2>
                <div className={styles.newsList}>
                    {news.slice(0, 3).map((item) => (
                        <div key={item.id} className={`glass-card ${styles.newsCard}`}>
                            <div className={styles.newsHeader}>
                                {item.isPinned && <span className={styles.pinBadge}>📌 Pinned</span>}
                                <span className={`badge badge-${getCategoryBadge(item.category)}`}>
                                    {item.category}
                                </span>
                            </div>
                            <h3 className={styles.newsTitle}>{item.title}</h3>
                            <p className={styles.newsContent}>{item.content.slice(0, 120)}...</p>
                            <p className={styles.newsDate}>
                                {new Date(item.createdAt).toLocaleDateString("id-ID", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                })}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent Attendance */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>📋 Riwayat Absensi Terakhir</h2>
                <div className={`glass-card ${styles.tableWrap}`}>
                    {attendance.length > 0 ? (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Tanggal</th>
                                    <th>Clock In</th>
                                    <th>Clock Out</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {attendance.slice(0, 5).map((a) => (
                                    <tr key={a.id}>
                                        <td>{a.date}</td>
                                        <td>{formatTime(a.clockIn)}</td>
                                        <td>{formatTime(a.clockOut)}</td>
                                        <td>
                                            <span className={`badge badge-${getStatusBadge(a.status)}`}>
                                                {a.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="empty-state">
                            <span className="empty-state-icon">📋</span>
                            <p className="empty-state-title">Belum ada riwayat</p>
                            <p className="empty-state-text">Data absensi Anda akan muncul di sini</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function getStatusBadge(status: string): string {
    switch (status) {
        case "present": return "success";
        case "late": return "warning";
        case "absent": return "error";
        case "leave": return "info";
        default: return "primary";
    }
}

function getCategoryBadge(category: string): string {
    switch (category) {
        case "announcement": return "primary";
        case "event": return "info";
        case "policy": return "warning";
        default: return "primary";
    }
}
