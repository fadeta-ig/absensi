"use client";

import { useEffect, useState } from "react";
import styles from "./payroll.module.css";

interface Employee {
    id: string;
    employeeId: string;
    name: string;
}

export default function PayrollPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({
        employeeId: "",
        period: "",
        basicSalary: 0,
        allowances: 0,
        deductions: 0,
        overtime: 0,
        notes: "",
    });
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        fetch("/api/employees").then((r) => r.json()).then(setEmployees);
    }, []);

    const netSalary = form.basicSalary + form.allowances + form.overtime - form.deductions;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const res = await fetch("/api/payslips", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...form, netSalary }),
        });

        if (res.ok) {
            setSuccess(true);
            setTimeout(() => {
                setShowModal(false);
                setSuccess(false);
                setForm({ employeeId: "", period: "", basicSalary: 0, allowances: 0, deductions: 0, overtime: 0, notes: "" });
            }, 1500);
        }
        setLoading(false);
    };

    const formatCurrency = (n: number) =>
        new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(n);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>💰 Payroll & Slip Gaji</h1>
                    <p className={styles.subtitle}>Buat dan kelola slip gaji karyawan</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    + Buat Slip Gaji
                </button>
            </div>

            {/* Employee Payroll Quick View */}
            <div className={styles.cardGrid}>
                {employees.map((emp) => (
                    <div key={emp.id} className={`glass-card ${styles.empCard}`}>
                        <div className={styles.empAvatar}>{emp.name.charAt(0)}</div>
                        <div>
                            <p className={styles.empName}>{emp.name}</p>
                            <p className={styles.empId}>{emp.employeeId}</p>
                        </div>
                        <button
                            className="btn btn-secondary btn-sm"
                            style={{ marginLeft: "auto" }}
                            onClick={() => {
                                setForm({ ...form, employeeId: emp.id });
                                setShowModal(true);
                            }}
                        >
                            Buat Slip
                        </button>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Buat Slip Gaji</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>

                        {success ? (
                            <div className={styles.successMsg}>✅ Slip gaji berhasil dibuat!</div>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label className="form-label">Karyawan</label>
                                    <select className="form-select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required>
                                        <option value="">Pilih karyawan</option>
                                        {employees.map((e) => (
                                            <option key={e.id} value={e.id}>{e.name} ({e.employeeId})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Periode (e.g. 2026-02)</label>
                                    <input className="form-input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="2026-02" required />
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Gaji Pokok</label>
                                        <input className="form-input" type="number" value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: Number(e.target.value) })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Tunjangan</label>
                                        <input className="form-input" type="number" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: Number(e.target.value) })} />
                                    </div>
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Lembur</label>
                                        <input className="form-input" type="number" value={form.overtime} onChange={(e) => setForm({ ...form, overtime: Number(e.target.value) })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Potongan</label>
                                        <input className="form-input" type="number" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: Number(e.target.value) })} />
                                    </div>
                                </div>
                                <div className={styles.netPreview}>
                                    <span>Gaji Bersih</span>
                                    <span className={styles.netValue}>{formatCurrency(netSalary)}</span>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Catatan (opsional)</label>
                                    <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                                </div>
                                <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
                                    {loading ? "Memproses..." : "Terbitkan Slip Gaji"}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
