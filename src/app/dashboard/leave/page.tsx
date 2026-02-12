"use client";

import { useEffect, useState } from "react";
import styles from "./lv.module.css";

interface LeaveRequest {
    id: string;
    employeeId: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
    createdAt: string;
}

export default function LeaveManagementPage() {
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);

    useEffect(() => {
        fetch("/api/leave").then((r) => r.json()).then(setLeaves);
    }, []);

    const handleAction = async (id: string, status: "approved" | "rejected") => {
        await fetch("/api/leave", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status }),
        });
        setLeaves((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    };

    const getTypeLabel = (t: string) => {
        switch (t) { case "annual": return "Tahunan"; case "sick": return "Sakit"; case "personal": return "Pribadi"; case "maternity": return "Melahirkan"; default: return t; }
    };

    const getStatusBadge = (s: string) => {
        switch (s) { case "approved": return "success"; case "rejected": return "error"; default: return "warning"; }
    };

    const getStatusLabel = (s: string) => {
        switch (s) { case "approved": return "Disetujui"; case "rejected": return "Ditolak"; default: return "Menunggu"; }
    };

    const pending = leaves.filter((l) => l.status === "pending");
    const processed = leaves.filter((l) => l.status !== "pending");

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>🏖️ Kelola Cuti</h1>
                <p className={styles.subtitle}>Approval dan monitoring pengajuan cuti</p>
            </div>

            {/* Pending */}
            {pending.length > 0 && (
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>⏳ Menunggu Persetujuan ({pending.length})</h2>
                    <div className={styles.list}>
                        {pending.map((l) => (
                            <div key={l.id} className={`glass-card ${styles.card}`}>
                                <div className={styles.cardHeader}>
                                    <span className="badge badge-info">{getTypeLabel(l.type)}</span>
                                    <span className={`badge badge-${getStatusBadge(l.status)}`}>{getStatusLabel(l.status)}</span>
                                </div>
                                <p className={styles.dates}>{l.startDate} — {l.endDate}</p>
                                <p className={styles.reason}>{l.reason}</p>
                                <div className={styles.cardActions}>
                                    <button className="btn btn-success btn-sm" onClick={() => handleAction(l.id, "approved")}>✅ Setujui</button>
                                    <button className="btn btn-danger btn-sm" onClick={() => handleAction(l.id, "rejected")}>❌ Tolak</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Processed */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>📋 Riwayat</h2>
                {processed.length === 0 && pending.length === 0 ? (
                    <div className="glass-card empty-state">
                        <span className="empty-state-icon">🏖️</span>
                        <p className="empty-state-title">Belum ada pengajuan cuti</p>
                    </div>
                ) : (
                    <div className={`glass-card ${styles.tableWrap}`}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Tanggal</th>
                                    <th>Jenis</th>
                                    <th>Alasan</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {processed.map((l) => (
                                    <tr key={l.id}>
                                        <td>{l.startDate} — {l.endDate}</td>
                                        <td>{getTypeLabel(l.type)}</td>
                                        <td>{l.reason}</td>
                                        <td><span className={`badge badge-${getStatusBadge(l.status)}`}>{getStatusLabel(l.status)}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
