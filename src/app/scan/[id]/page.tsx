"use client";

import { useEffect, useState, use, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    CheckCircle, AlertCircle, Smartphone, Laptop, Phone,
    Package, ClipboardCheck, X, LogIn, ShieldCheck, User, Clock,
    ChevronRight, Cpu, Tag, Loader2
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";
import { notifyAuthChanged } from "@/lib/authEvents";
import FeedbackMessage from "@/components/ui/FeedbackMessage";

// ─── Types ──────────────────────────────────────────────────────

type AssetCondition = "BAIK" | "KURANG_BAIK" | "RUSAK";
type AssetStatus = "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "RETIRED";
type HolderType = "EMPLOYEE" | "FORMER_EMPLOYEE" | "TEAM" | "GA_POOL" | "COMPANY_OWNED";

type PublicAssetInfo = {
    id: string;
    assetCode: string;
    name: string;
    categoryName: string | null;
    status: AssetStatus;
    kondisi: AssetCondition;
    holderType: HolderType;
    assignedToName: string | null;
    manufacturer: string | null;
    modelName: string | null;
    lastInspection: { inspectedAt: string; kondisiSaat: AssetCondition } | null;
};

// ─── Checklist ──────────────────────────────────────────────────

const CHECKLIST_CONFIG: Record<string, { key: string; label: string }[]> = {
    HANDPHONE: [
        { key: "layar", label: "Layar Normal" },
        { key: "body", label: "Body Mulus" },
        { key: "charging", label: "Charging OK" },
        { key: "speaker", label: "Audio OK" },
        { key: "kamera", label: "Kamera OK" },
        { key: "baterai", label: "Baterai Normal" },
    ],
    LAPTOP: [
        { key: "layar", label: "LCD Normal" },
        { key: "keyboard", label: "Keyboard OK" },
        { key: "charging", label: "Charger OK" },
        { key: "port", label: "USB Ports OK" },
        { key: "baterai", label: "Battery Hold" },
        { key: "body", label: "Fisik Mulus" },
    ],
    DEFAULT: [
        { key: "fisik", label: "Kondisi Fisik Normal" },
        { key: "fungsi", label: "Fungsi OK" },
    ],
};

function getChecklist(cat: string | null) {
    if (!cat) return CHECKLIST_CONFIG.DEFAULT;
    return CHECKLIST_CONFIG[cat] ?? CHECKLIST_CONFIG.DEFAULT;
}

// ─── Design Helpers ─────────────────────────────────────────────

function CategoryIcon({ name, size = 14 }: { name: string | null; size?: number }) {
    if (name === "HANDPHONE") return <Smartphone size={size} />;
    if (name === "LAPTOP") return <Laptop size={size} />;
    if (name === "NOMOR_HP") return <Phone size={size} />;
    return <Package size={size} />;
}

const STATUS_MAP: Record<AssetStatus, { label: string; color: string; bg: string }> = {
    AVAILABLE: { label: "Tersedia", color: "var(--success)", bg: "var(--success-bg)" },
    IN_USE: { label: "Digunakan", color: "var(--info)", bg: "var(--info-bg)" },
    MAINTENANCE: { label: "Perbaikan", color: "var(--warning)", bg: "var(--warning-bg)" },
    RETIRED: { label: "Retired", color: "var(--neutral)", bg: "var(--neutral-bg)" },
};

const KONDISI_MAP: Record<AssetCondition, { label: string; color: string; bg: string }> = {
    BAIK: { label: "Baik", color: "var(--success)", bg: "var(--success-bg)" },
    KURANG_BAIK: { label: "Kurang Baik", color: "var(--warning)", bg: "var(--warning-bg)" },
    RUSAK: { label: "Rusak", color: "var(--destructive)", bg: "var(--destructive-bg)" },
};

function holderLabel(type: HolderType, name: string | null): string {
    if (name) return name;
    const map: Record<HolderType, string> = {
        EMPLOYEE: "Karyawan",
        FORMER_EMPLOYEE: "Ex-Karyawan",
        TEAM: "Tim",
        GA_POOL: "GA Pool",
        COMPANY_OWNED: "Perusahaan",
    };
    return map[type] ?? type;
}

// ─── Small Badge (identical to system badges) ───────────────────

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
    return (
        <span
            className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ color, backgroundColor: bg }}
        >
            {label}
        </span>
    );
}

// ─── Row Component (matches GA detail page SpecRow) ─────────────

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon?: LucideIcon }) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-[var(--border)] last:border-0">
            <span className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                {Icon && <Icon size={13} className="text-[var(--text-muted)]" />}
                {label}
            </span>
            <span className="text-sm font-medium text-[var(--text-primary)] text-right max-w-[55%] truncate">
                {value || <span className="text-[var(--text-muted)] italic font-normal">—</span>}
            </span>
        </div>
    );
}

// ─── Login Modal ────────────────────────────────────────────────

function LoginModal({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
    const [employeeId, setEmployeeId] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Login gagal");
            if (!data.permissions?.includes("ga.manage")) throw new Error("Akses terbatas untuk tim General Affairs.");
            notifyAuthChanged("login");
            onSuccess();
        } catch (err: unknown) {
            reportClientError("PublicAssetScanLogin", "Login GA untuk inspeksi aset gagal", err);
            setError(err instanceof Error ? err.message : "Login gagal");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full sm:max-w-sm bg-[var(--card)] rounded-t-2xl sm:rounded-xl shadow-xl p-6 animate-in slide-in-from-bottom duration-200">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[var(--secondary)] rounded-lg flex items-center justify-center border border-[var(--border)]">
                            <ShieldCheck size={18} className="text-[var(--text-secondary)]" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-[var(--text-primary)]">Login GA</h3>
                            <p className="text-[11px] text-[var(--text-secondary)]">Masuk untuk inspeksi aset</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                        <X size={18} />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-[var(--destructive-bg)] border border-[var(--destructive-border)] rounded-lg text-xs font-medium text-[var(--destructive)]" role="alert">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                    <div>
                        <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">ID Karyawan</label>
                        <input
                            type="text"
                            value={employeeId}
                            onChange={e => setEmployeeId(e.target.value)}
                            required
                            placeholder="WIG-XXX"
                            className="w-full px-3.5 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm font-medium focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--ring)] outline-none transition-all placeholder:text-[var(--text-muted)]"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            placeholder="••••••••"
                            className="w-full px-3.5 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm font-medium focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--ring)] outline-none transition-all placeholder:text-[var(--text-muted)]"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 w-full py-2.5 bg-[var(--foreground)] text-[var(--background)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary-light)] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? "Memverifikasi..." : <><LogIn size={15} /> Masuk</>}
                    </button>
                </form>
            </div>
        </div>
    );
}

// ─── Inspection Sheet ───────────────────────────────────────────

function InspectionSheet({ asset, onClose, onSuccess }: {
    asset: PublicAssetInfo;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const checklistItems = getChecklist(asset.categoryName);
    const [checklist, setChecklist] = useState<Record<string, boolean>>(
        Object.fromEntries(checklistItems.map(i => [i.key, true]))
    );
    const [kondisi, setKondisi] = useState<AssetCondition>("BAIK");
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleItem = (key: string) => {
        setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`/api/assets/${asset.id}/inspect`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kondisiSaat: kondisi, checklist, notes: notes || null }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Inspeksi gagal disimpan."));
            onSuccess();
        } catch (err) {
            reportClientError("PublicAssetInspection", "Inspeksi aset gagal disimpan", err, { assetId: asset.id });
            setError(err instanceof Error ? err.message : "Inspeksi gagal disimpan.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-[var(--card)] rounded-t-2xl shadow-xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-200">
                {/* Header */}
                <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0">
                    <div>
                        <h3 className="text-sm font-bold text-[var(--text-primary)]">Formulir Inspeksi</h3>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                            {asset.assetCode} · {asset.name}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <form id="asset-inspection-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-5">
                    {/* Checklist */}
                    <div>
                        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-3">Checklist Komponen</span>
                        <div className="space-y-2">
                            {checklistItems.map(item => (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => toggleItem(item.key)}
                                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-lg border text-sm font-medium transition-colors ${
                                        checklist[item.key]
                                            ? "bg-[var(--success-bg)] border-[var(--success-border)] text-[var(--success)]"
                                            : "bg-[var(--destructive-bg)] border-[var(--destructive-border)] text-[var(--destructive)]"
                                    }`}
                                >
                                    <span>{item.label}</span>
                                    {checklist[item.key]
                                        ? <CheckCircle size={16} className="text-[var(--success)]" />
                                        : <AlertCircle size={16} className="text-[var(--destructive)]" />
                                    }
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Kondisi */}
                    <div>
                        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-3">Penilaian Kondisi</span>
                        <div className="flex gap-2">
                            {(["BAIK", "KURANG_BAIK", "RUSAK"] as AssetCondition[]).map(k => {
                                const cfg = KONDISI_MAP[k];
                                const selected = kondisi === k;
                                return (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => setKondisi(k)}
                                        className={`flex-1 py-2.5 rounded-lg text-xs font-semibold border-2 transition-colors ${
                                            selected
                                                ? "text-white shadow-sm"
                                                : "bg-[var(--card)] text-[var(--text-secondary)] border-[var(--border)]"
                                        }`}
                                        style={selected ? { backgroundColor: cfg.color, borderColor: cfg.color } : undefined}
                                    >
                                        {cfg.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block mb-3">Catatan</span>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Opsional — temuan fisik, rekomendasi, dll."
                            rows={3}
                            className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--ring)] placeholder:text-[var(--text-muted)] transition-all resize-none"
                        />
                    </div>

                    {error && (
                        <FeedbackMessage variant="error">
                            {error}
                        </FeedbackMessage>
                    )}
                </form>

                {/* Submit */}
                <div className="p-5 border-t flex-shrink-0 bg-[var(--secondary)]/50">
                    <button
                        type="submit"
                        form="asset-inspection-form"
                        disabled={submitting}
                        className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {submitting ? <><Loader2 size={16} className="animate-spin" /> Menyimpan...</> : <><ClipboardCheck size={16} /> Simpan Inspeksi</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page Content ──────────────────────────────────────────

function ScanPageInner({ id }: { id: string }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [asset, setAsset] = useState<PublicAssetInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [showLogin, setShowLogin] = useState(false);
    const [showSheet, setShowSheet] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        const loadAsset = async () => {
            setLoading(true);
            setLoadError(null);
            try {
                const res = await fetch(`/api/public/assets/${id}`);
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "QR Code ini tidak terhubung ke aset aktif manapun."));
                setAsset(await res.json());
            } catch (error) {
                reportClientError("PublicAssetScanPage", "Gagal memuat data aset publik", error, { assetId: id });
                setAsset(null);
                setLoadError(error instanceof Error ? error.message : "Gagal memuat data aset.");
            } finally {
                setLoading(false);
            }
        };

        void loadAsset();
    }, [id]);

    useEffect(() => {
        if (searchParams.get("inspect") !== "true" || !asset) return;
        const timer = setTimeout(() => setShowSheet(true), 0);
        return () => clearTimeout(timer);
    }, [searchParams, asset]);

    const handleInspect = async () => {
        try {
            const res = await fetch("/api/auth/me");
            const data = res.ok ? await res.json() : null;
            if (data?.permissions?.includes("ga.manage")) setShowSheet(true);
            else setShowLogin(true);
        } catch (error) {
            reportClientError("PublicAssetScanPage", "Gagal memeriksa sesi GA sebelum inspeksi", error, { assetId: asset?.id ?? id });
            setShowLogin(true);
        }
    };

    // ─ Loading
    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--card)] flex items-center justify-center">
                <div className="spinner" />
            </div>
        );
    }

    // ─ Not Found
    if (!asset) {
        return (
            <div className="min-h-screen bg-[var(--card)] flex flex-col items-center justify-center p-6 text-center">
                <Package size={40} className="text-slate-200 mb-4" />
                <h1 className="text-lg font-bold text-[var(--text-primary)]">{loadError ? "Data Aset Tidak Dapat Dimuat" : "Aset Tidak Ditemukan"}</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-xs">{loadError || "QR Code ini tidak terhubung ke aset aktif manapun."}</p>
            </div>
        );
    }

    const sts = STATUS_MAP[asset.status];
    const knd = KONDISI_MAP[asset.kondisi];

    return (
        <div className="min-h-screen bg-[var(--secondary)] flex flex-col">
            {/* ── Compact Header ── */}
            <div className="bg-[var(--card)] border-b px-5 py-4 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/Logo WIG.png" alt="WIG" className="h-6 w-auto object-contain" />
                <div className="h-4 w-px bg-slate-200" />
                <span className="text-xs font-semibold text-[var(--text-secondary)]">Asset Management</span>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 p-4 pb-28 max-w-lg mx-auto w-full space-y-3">

                {/* Card 1: Identity */}
                <div className="bg-[var(--card)] border rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-[var(--secondary)] rounded-lg flex items-center justify-center border border-[var(--border)]">
                                <CategoryIcon name={asset.categoryName} size={16} />
                            </div>
                            <div>
                                <h1 className="text-sm font-bold text-[var(--text-primary)] leading-tight">{asset.name}</h1>
                                <span className="text-[11px] font-mono text-[var(--text-secondary)]">{asset.assetCode}</span>
                            </div>
                        </div>
                        {asset.categoryName && (
                            <span className="text-[10px] font-semibold text-[var(--text-secondary)] bg-[var(--secondary)] px-2 py-0.5 rounded-full border border-[var(--border)] uppercase tracking-wider">
                                {asset.categoryName.replace("_", " ")}
                            </span>
                        )}
                    </div>

                    {/* Status Row */}
                    <div className="px-5 py-3 flex items-center gap-2 border-b border-slate-50 bg-[var(--secondary)]/30">
                        <Badge label={sts.label} color={sts.color} bg={sts.bg} />
                        <Badge label={knd.label} color={knd.color} bg={knd.bg} />
                    </div>

                    {/* Detail Rows */}
                    <div className="px-5 py-2">
                        {asset.manufacturer && (
                            <InfoRow icon={Cpu} label="Brand" value={asset.manufacturer} />
                        )}
                        {asset.modelName && (
                            <InfoRow icon={Tag} label="Model" value={asset.modelName} />
                        )}
                        <InfoRow icon={User} label="Pemegang" value={holderLabel(asset.holderType, asset.assignedToName)} />
                        <InfoRow
                            icon={Clock}
                            label="Inspeksi Terakhir"
                            value={
                                asset.lastInspection
                                    ? new Date(asset.lastInspection.inspectedAt).toLocaleDateString("id-ID", {
                                        day: "numeric", month: "short", year: "numeric"
                                    })
                                    : "Belum pernah"
                            }
                        />
                    </div>
                </div>

                {/* Card 2: Actions */}
                <div className="bg-[var(--card)] border rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-3">
                        <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Aksi</span>
                    </div>

                    {!isSuccess ? (
                        <button
                            onClick={handleInspect}
                            className="w-full px-5 py-3.5 border-t flex items-center justify-between hover:bg-[var(--secondary)] transition-colors group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-[var(--category-1-bg)] rounded-lg flex items-center justify-center border border-[var(--category-1)]/20">
                                    <ClipboardCheck size={15} className="text-[var(--category-1)]" />
                                </div>
                                <div className="text-left">
                                    <span className="text-sm font-semibold text-[var(--text-primary)] block">Inspeksi Fisik</span>
                                    <span className="text-[11px] text-[var(--text-secondary)]">Login GA diperlukan</span>
                                </div>
                            </div>
                            <ChevronRight size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors" />
                        </button>
                    ) : (
                        <div className="px-5 py-3.5 border-t flex items-center gap-3">
                            <div className="w-8 h-8 bg-[var(--success-bg)] rounded-lg flex items-center justify-center border border-[var(--success-border)]">
                                <CheckCircle size={15} className="text-[var(--success)]" />
                            </div>
                            <div>
                                <span className="text-sm font-semibold text-[var(--success)] block">Inspeksi Tersimpan</span>
                                <span className="text-[11px] text-[var(--text-secondary)]">Data berhasil tercatat</span>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={() => router.push(`/ga/assets/${asset.id}`)}
                        className="w-full px-5 py-3.5 border-t flex items-center justify-between hover:bg-[var(--secondary)] transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[var(--secondary)] rounded-lg flex items-center justify-center border border-[var(--border)]">
                                <Package size={15} className="text-[var(--text-secondary)]" />
                            </div>
                            <div className="text-left">
                                <span className="text-sm font-semibold text-[var(--text-primary)] block">Buka Detail</span>
                                <span className="text-[11px] text-[var(--text-secondary)]">Portal GA internal</span>
                            </div>
                        </div>
                        <ChevronRight size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors" />
                    </button>
                </div>
            </div>

            {/* ── Footer ── */}
            <div className="bg-[var(--card)] border-t px-5 py-3 text-center">
                <p className="text-[10px] text-[var(--text-muted)] font-medium">
                    PT Wijaya Inovasi Gemilang · Asset Management System © 2026
                </p>
            </div>

            {/* ── Overlays ── */}
            {showLogin && (
                <LoginModal
                    onClose={() => setShowLogin(false)}
                    onSuccess={() => { setShowLogin(false); setShowSheet(true); }}
                />
            )}
            {showSheet && (
                <InspectionSheet
                    asset={asset}
                    onClose={() => setShowSheet(false)}
                    onSuccess={() => { setShowSheet(false); setIsSuccess(true); }}
                />
            )}
        </div>
    );
}

// ─── Page Entry ─────────────────────────────────────────────────

export default function ScanPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return (
        <Suspense fallback={<div className="min-h-screen bg-[var(--card)] flex items-center justify-center"><div className="spinner" /></div>}>
            <ScanPageInner id={id} />
        </Suspense>
    );
}
