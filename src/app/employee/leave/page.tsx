"use client";

import { useEffect, useState } from "react";
import styles from "./leave.module.css";

interface LeaveRequest {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: string;
    createdAt: string;
}

interface User {
    totalLeave: number;
    usedLeave: number;
}

export default function LeavePage() {
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [user, setUser] = useState<User | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        type: "annual",
        startDate: "",
        endDate: "",
        reason: "",
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch("/api/leave").then((r) => r.json()).then(setLeaves);
        fetch("/api/auth/me").then((r) => r.json()).then(setUser);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const res = await fetch("/api/leave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
        });

        if (res.ok) {
            const newLeave = await res.json();
            setLeaves((prev) => [newLeave, ...prev]);
            setShowForm(false);
            setForm({ type: "annual", startDate: "", endDate: "", reason: "" });
        }
        setLoading(false);
    };

    const remaining = user ? user.totalLeave - user.usedLeave : 0;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "approved": return "success";
            case "rejected": return "error";
            default: return "warning";
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case "approved": return "Disetujui";
            case "rejected": return "Ditolak";
            default: return "Menunggu";
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case "annual": return "Tahunan";
            case "sick": return "Sakit";
            case "personal": return "Pribadi";
            case "maternity": return "Melahirkan";
            default: return type;
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>🏖️ Manajemen Cuti</h1>
                    <p className={styles.subtitle}>Ajukan dan pantau status cuti Anda</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                    + Ajukan Cuti
                </button>
            </div>

            {/* Leave Balance */}
            <div className={styles.balanceGrid}>
                <div className={`glass-card ${styles.balanceCard}`}>
                    <div className={`${styles.balanceIcon} ${styles.balanceIconTotal}`}>📅</div>
                    <p className={styles.balanceValue}>{user?.totalLeave || 0}</p>
                    <p className={styles.balanceLabel}>Total Cuti</p>
                </div>
                <div className={`glass-card ${styles.balanceCard}`}>
                    <div className={`${styles.balanceIcon} ${styles.balanceIconUsed}`}>✈️</div>
                    <p className={styles.balanceValue}>{user?.usedLeave || 0}</p>
                    <p className={styles.balanceLabel}>Terpakai</p>
                </div>
                <div className={`glass-card ${styles.balanceCard}`}>
                    <div className={`${styles.balanceIcon} ${styles.balanceIconRemain}`}>🎯</div>
                    <p className={styles.balanceValueHighlight}>{remaining}</p>
                    <p className={styles.balanceLabel}>Sisa Cuti</p>
                </div>
            </div>

            {/* Leave History */}
            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Riwayat Pengajuan</h2>
                {leaves.length === 0 ? (
                    <div className="glass-card empty-state">
                        <span className="empty-state-icon">🏖️</span>
                        <p className="empty-state-title">Belum ada pengajuan cuti</p>
                    </div>
                ) : (
                    <div className={styles.leaveList}>
                        {leaves.map((leave) => (
                            <div key={leave.id} className={`glass-card ${styles.leaveCard}`}>
                                <div className={styles.leaveCardHeader}>
                                    <span className={`badge badge-${getStatusBadge(leave.status)}`}>
                                        {getStatusLabel(leave.status)}
                                    </span>
                                    <span className="badge badge-info">{getTypeLabel(leave.type)}</span>
                                </div>
                                <p className={styles.leaveDates}>
                                    {leave.startDate} — {leave.endDate}
                                </p>
                                <p className={styles.leaveReason}>{leave.reason}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Request Form Modal */}
            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Ajukan Cuti</h2>
                            <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label className="form-label">Jenis Cuti</label>
                                <select
                                    className="form-select"
                                    value={form.type}
                                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                                >
                                    <option value="annual">Tahunan</option>
                                    <option value="sick">Sakit</option>
                                    <option value="personal">Pribadi</option>
                                    <option value="maternity">Melahirkan</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Tanggal Mulai</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={form.startDate}
                                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Tanggal Selesai</label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={form.endDate}
                                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Alasan</label>
                                <textarea
                                    className="form-textarea"
                                    value={form.reason}
                                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                                    required
                                    placeholder="Jelaskan alasan cuti Anda..."
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary btn-lg w-full"
                                disabled={loading}
                            >
                                {loading ? "Mengirim..." : "Ajukan Cuti"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
