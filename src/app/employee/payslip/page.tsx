"use client";

import { useEffect, useState } from "react";
import styles from "./payslip.module.css";

interface Payslip {
    id: string;
    period: string;
    basicSalary: number;
    allowances: number;
    deductions: number;
    overtime: number;
    netSalary: number;
    issuedDate: string;
    notes?: string;
}

export default function PayslipPage() {
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [selected, setSelected] = useState<Payslip | null>(null);

    useEffect(() => {
        fetch("/api/payslips")
            .then((r) => r.json())
            .then(setPayslips);
    }, []);

    const formatCurrency = (n: number) =>
        new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(n);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.title}>💰 Slip Gaji & Payroll</h1>
                <p className={styles.subtitle}>Riwayat slip gaji Anda</p>
            </div>

            {payslips.length === 0 ? (
                <div className="glass-card empty-state">
                    <span className="empty-state-icon">💰</span>
                    <p className="empty-state-title">Belum ada slip gaji</p>
                    <p className="empty-state-text">Slip gaji akan muncul setelah HR memproses payroll</p>
                </div>
            ) : (
                <div className={styles.list}>
                    {payslips.map((slip) => (
                        <div
                            key={slip.id}
                            className={`glass-card ${styles.slipCard}`}
                            onClick={() => setSelected(slip)}
                        >
                            <div className={styles.slipHeader}>
                                <span className={styles.slipPeriod}>{slip.period}</span>
                                <span className="badge badge-success">Terbit</span>
                            </div>
                            <p className={styles.slipAmount}>{formatCurrency(slip.netSalary)}</p>
                            <p className={styles.slipDate}>
                                Diterbitkan: {new Date(slip.issuedDate).toLocaleDateString("id-ID")}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* Detail Modal */}
            {selected && (
                <div className="modal-overlay" onClick={() => setSelected(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Slip Gaji — {selected.period}</h2>
                            <button className="modal-close" onClick={() => setSelected(null)}>
                                ✕
                            </button>
                        </div>

                        <div className={styles.detailGrid}>
                            <div className={styles.detailRow}>
                                <span>Gaji Pokok</span>
                                <span className={styles.detailValue}>{formatCurrency(selected.basicSalary)}</span>
                            </div>
                            <div className={styles.detailRow}>
                                <span>Tunjangan</span>
                                <span className={`${styles.detailValue} ${styles.positive}`}>
                                    +{formatCurrency(selected.allowances)}
                                </span>
                            </div>
                            <div className={styles.detailRow}>
                                <span>Lembur</span>
                                <span className={`${styles.detailValue} ${styles.positive}`}>
                                    +{formatCurrency(selected.overtime)}
                                </span>
                            </div>
                            <div className={styles.detailRow}>
                                <span>Potongan</span>
                                <span className={`${styles.detailValue} ${styles.negative}`}>
                                    -{formatCurrency(selected.deductions)}
                                </span>
                            </div>
                            <div className={`${styles.detailRow} ${styles.totalRow}`}>
                                <span>Gaji Bersih</span>
                                <span className={styles.totalValue}>{formatCurrency(selected.netSalary)}</span>
                            </div>
                        </div>

                        {selected.notes && (
                            <div className={styles.notes}>
                                <p className={styles.notesLabel}>Catatan:</p>
                                <p>{selected.notes}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
