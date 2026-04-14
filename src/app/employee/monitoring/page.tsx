"use client";

import { useEffect, useState } from "react";
import { Users, Search, ChevronRight, Activity, Layers } from "lucide-react";
import Link from "next/link";

interface Employee {
    id: string;
    employeeId: string;
    name: string;
    department: string;
    division?: string | null;
    position: string;
    level: string;
    isActive: boolean;
}



export default function MonitoringPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/employees")
            .then((r) => r.json())
            .then((data) => {
                setEmployees(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const filtered = employees.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.employeeId.toLowerCase().includes(search.toLowerCase()) ||
        e.department.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                    <h1 className="page-title">Monitoring Tim</h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "14px", marginTop: "4px" }}>
                        Monitoring performa dan aktivitas anggota tim Anda secara real-time.
                    </p>
                </div>
                <Activity style={{ width: "32px", height: "32px", color: "var(--primary)" }} />
            </div>

            {/* Search */}
            <div style={{ position: "relative", maxWidth: "400px" }}>
                <Search style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", width: "16px", height: "16px", color: "var(--text-muted)" }} />
                <input
                    type="text"
                    className="form-input"
                    style={{ paddingLeft: "40px" }}
                    placeholder="Cari anggota tim..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Grid kartu karyawan */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
                {filtered.length > 0 ? filtered.map((e) => (
                    <div
                        key={e.id}
                        className="card"
                        style={{ borderLeft: "4px solid var(--primary)", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}
                    >
                        {/* Card Header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                <div style={{
                                    width: "40px", height: "40px", borderRadius: "50%",
                                    background: "var(--secondary)", color: "var(--primary)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    fontWeight: "700", fontSize: "16px", flexShrink: 0
                                }}>
                                    {e.name.charAt(0)}
                                </div>
                                <div>
                                    <p style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-primary)" }}>{e.name}</p>
                                    <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>{e.position}</p>
                                </div>
                            </div>
                            {/* Badge status aktif */}
                            <span style={{
                                fontSize: "10px", fontWeight: "600", padding: "2px 8px", borderRadius: "9999px",
                                background: e.isActive ? "#d1fae5" : "#fee2e2",
                                color: e.isActive ? "#065f46" : "#991b1b",
                            }}>
                                {e.isActive ? "Active" : "Inactive"}
                            </span>
                        </div>

                        {/* Card Content */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "var(--text-muted)" }}>Department</span>
                                <span style={{ fontWeight: "500", color: "var(--text-primary)" }}>{e.department}</span>
                            </div>

                        </div>

                        {/* Action */}
                        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                            <Link
                                href={`/employee/monitoring/${e.id}`}
                                className="btn btn-secondary"
                                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "12px", width: "100%" }}
                            >
                                <Layers style={{ width: "14px", height: "14px" }} />
                                Lihat Profil 360°
                            </Link>
                        </div>
                    </div>
                )) : (
                    <div style={{
                        gridColumn: "1 / -1", padding: "48px", textAlign: "center",
                        color: "var(--text-muted)", background: "var(--secondary)",
                        borderRadius: "12px", border: "2px dashed var(--border)"
                    }}>
                        <Users style={{ width: "32px", height: "32px", margin: "0 auto 8px", opacity: 0.4 }} />
                        <p>Tidak ada anggota tim yang ditemukan.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
