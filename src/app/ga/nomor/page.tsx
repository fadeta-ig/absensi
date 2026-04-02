"use client";

import { useEffect, useState } from "react";
import { Phone, AlertTriangle, Clock, CheckCircle } from "lucide-react";

type NomorAsset = {
    id: string; assetCode: string; name: string;
    nomorIndosat: string | null; expiredDate: string | null;
    assignedToName: string | null; holderType: string;
    kondisi: string; status: string;
};

export default function NomorPage() {
    const [nomor, setNomor] = useState<NomorAsset[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/assets?category=NOMOR_HP")
            .then(r => r.json()).then(setNomor).finally(() => setLoading(false));
    }, []);

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const getStatus = (exp: string | null) => {
        if (!exp) return "unknown";
        const d = new Date(exp);
        if (d < now) return "expired";
        if (d < in30) return "soon";
        return "ok";
    };

    const expired = nomor.filter(n => getStatus(n.expiredDate) === "expired");
    const soon = nomor.filter(n => getStatus(n.expiredDate) === "soon");
    const ok = nomor.filter(n => getStatus(n.expiredDate) === "ok" || getStatus(n.expiredDate) === "unknown");

    return (
        <div className="space-y-6">
            <div>
                <h1 style={{ fontSize: 22, fontWeight: 700 }}>Kartu SIM Indosat</h1>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>Monitoring masa aktif nomor Indosat perusahaan</p>
            </div>

            {/* Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                <SummaryCard icon={<AlertTriangle size={20} color="#ef4444" />} label="Sudah Expired" count={expired.length} bg="#fee2e2" />
                <SummaryCard icon={<Clock size={20} color="#f59e0b" />} label="Akan Expired (30hr)" count={soon.length} bg="#fef3c7" />
                <SummaryCard icon={<CheckCircle size={20} color="#10b981" />} label="Aktif" count={ok.length} bg="#d1fae5" />
            </div>

            {loading ? <div style={{ textAlign: "center", padding: 40 }}><div className="spinner" /></div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* Expired */}
                    {expired.length > 0 && <SectionHeader label="🔴 Sudah Expired" />}
                    {expired.map(n => <NomorRow key={n.id} asset={n} urgency="expired" />)}

                    {/* Soon */}
                    {soon.length > 0 && <SectionHeader label="🟡 Akan Expired dalam 30 Hari" />}
                    {soon.map(n => <NomorRow key={n.id} asset={n} urgency="soon" />)}

                    {/* OK */}
                    {ok.length > 0 && <SectionHeader label="🟢 Masih Aktif" />}
                    {ok.map(n => <NomorRow key={n.id} asset={n} urgency="ok" />)}
                </div>
            )}
        </div>
    );
}

function SectionHeader({ label }: { label: string }) {
    return <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-secondary)", marginTop: 8, marginBottom: 4 }}>{label}</h2>;
}

function SummaryCard({ icon, label, count, bg }: { icon: React.ReactNode; label: string; count: number; bg: string }) {
    return (
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
            <div>
                <p style={{ fontSize: 22, fontWeight: 700 }}>{count}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</p>
            </div>
        </div>
    );
}

function NomorRow({ asset, urgency }: { asset: NomorAsset; urgency: string }) {
    const borderColor = urgency === "expired" ? "#ef4444" : urgency === "soon" ? "#f59e0b" : "#e5e7eb";
    const expDate = asset.expiredDate ? new Date(asset.expiredDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";

    return (
        <div style={{ background: "white", border: `1px solid ${borderColor}`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Phone size={16} color="#6b7280" />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{asset.nomorIndosat ?? asset.name}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{asset.assignedToName ?? "GA Pool"}</p>
            </div>
            <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Expired</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: urgency === "expired" ? "#ef4444" : urgency === "soon" ? "#d97706" : "var(--text-primary)" }}>{expDate}</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: urgency === "expired" ? "#fee2e2" : urgency === "soon" ? "#fef3c7" : "#d1fae5", color: urgency === "expired" ? "#ef4444" : urgency === "soon" ? "#d97706" : "#10b981" }}>
                {urgency === "expired" ? "Expired" : urgency === "soon" ? "Segera Expired" : "Aktif"}
            </span>
        </div>
    );
}
