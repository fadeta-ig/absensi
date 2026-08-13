"use client";

import { useState, useCallback } from "react";
import {
    Calculator, Info, ArrowRight, TrendingDown, Wallet,
    FileText, HelpCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

// ─── Types (mirroring pph21Service types for client) ─────────────────

type PtkpStatus = "TK/0" | "TK/1" | "TK/2" | "TK/3" | "K/0" | "K/1" | "K/2" | "K/3";

interface ProgressiveItem {
    bracket: string;
    rate: string;
    taxable: number;
    tax: number;
}

interface MonthlyResult {
    grossMonthlyIncome: number;
    ptkpStatus: PtkpStatus;
    terCategory: string;
    terRate: number;
    terRatePercent: string;
    pph21Monthly: number;
    month: number;
    isDecember: boolean;
}

interface DecemberResult {
    grossMonthlyIncome: number;
    ptkpStatus: PtkpStatus;
    grossAnnualIncome: number;
    biayaJabatan: number;
    netAnnualIncome: number;
    ptkpAmount: number;
    pkp: number;
    pph21Annual: number;
    pph21JanToNov: number;
    pph21December: number;
    progressiveBreakdown: ProgressiveItem[];
}

interface CalculationResult {
    monthly: MonthlyResult;
    december: DecemberResult;
    annualSummary: {
        totalPph21: number;
        effectiveAnnualRate: string;
    };
}

// ─── Constants ───────────────────────────────────────────────────────

const PTKP_OPTIONS: { value: PtkpStatus; label: string }[] = [
    { value: "TK/0", label: "TK/0 — Tidak Kawin, Tanpa Tanggungan" },
    { value: "TK/1", label: "TK/1 — Tidak Kawin, 1 Tanggungan" },
    { value: "TK/2", label: "TK/2 — Tidak Kawin, 2 Tanggungan" },
    { value: "TK/3", label: "TK/3 — Tidak Kawin, 3 Tanggungan" },
    { value: "K/0", label: "K/0 — Kawin, Tanpa Tanggungan" },
    { value: "K/1", label: "K/1 — Kawin, 1 Tanggungan" },
    { value: "K/2", label: "K/2 — Kawin, 2 Tanggungan" },
    { value: "K/3", label: "K/3 — Kawin, 3 Tanggungan" },
];

const MONTH_NAMES = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const TER_CATEGORY_INFO: Record<string, { statuses: string; color: string }> = {
    A: { statuses: "TK/0, TK/1, K/0", color: "bg-blue-100 text-blue-800 border-blue-200" },
    B: { statuses: "TK/2, TK/3, K/1, K/2", color: "bg-amber-100 text-amber-800 border-amber-200" },
    C: { statuses: "K/3", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

// ─── Component ───────────────────────────────────────────────────────

export default function Pph21CalculatorPage() {
    const [grossIncome, setGrossIncome] = useState<string>("");
    const [ptkpStatus, setPtkpStatus] = useState<PtkpStatus>("TK/0");
    const [month, setMonth] = useState<number>(1);
    const [result, setResult] = useState<CalculationResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [showDetail, setShowDetail] = useState(false);
    const [showInfo, setShowInfo] = useState(false);

    const fmt = useCallback(
        (n: number) =>
            new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
            }).format(n),
        []
    );

    const fmtNum = useCallback(
        (n: number) =>
            new Intl.NumberFormat("id-ID").format(n),
        []
    );

    const handleCalculate = async () => {
        const income = Number(grossIncome.replace(/\D/g, ""));
        if (!income || income <= 0) {
            setError("Masukkan penghasilan bruto yang valid");
            return;
        }

        setLoading(true);
        setError("");
        setResult(null);

        try {
            const res = await fetch("/api/pph21/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    grossMonthlyIncome: income,
                    ptkpStatus,
                    month,
                }),
            });

            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Perhitungan PPh 21 belum berhasil diproses."));

            const data: CalculationResult = await res.json();
            setResult(data);
            setShowDetail(false);
        } catch (err) {
            reportClientError("Pph21CalculatorPage", "Gagal menghitung PPh 21", err, { ptkpStatus, month, grossIncome: income });
            setError(err instanceof Error ? err.message : "Perhitungan PPh 21 belum berhasil diproses. Periksa nominal gaji lalu coba lagi.");
        } finally {
            setLoading(false);
        }
    };

    const handleIncomeChange = (value: string) => {
        const raw = value.replace(/\D/g, "");
        if (raw === "") {
            setGrossIncome("");
            return;
        }
        setGrossIncome(fmtNum(Number(raw)));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleCalculate();
        }
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-[var(--primary)]" />
                    Kalkulator PPh 21
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Hitung Pajak Penghasilan Pasal 21 dengan skema TER (PP 58/2023)
                </p>
            </div>

            {/* Info Toggle */}
            <button
                onClick={() => setShowInfo(!showInfo)}
                className="flex items-center gap-2 text-sm text-[var(--primary)] font-medium hover:underline transition-colors"
            >
                <HelpCircle className="w-4 h-4" />
                {showInfo ? "Sembunyikan" : "Tentang"} Skema TER PPh 21
                {showInfo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showInfo && (
                <div className="card p-5 space-y-3 border-l-4 border-l-[var(--primary)] bg-[var(--primary)]/5">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Info className="w-4 h-4 text-[var(--primary)]" />
                        Tentang Tarif Efektif Rata-rata (TER)
                    </h3>
                    <div className="text-xs text-[var(--text-secondary)] space-y-2 leading-relaxed">
                        <p>
                            Berdasarkan <strong>PP 58/2023</strong> dan <strong>PMK 168/2023</strong>, pemerintah Indonesia
                            menerapkan skema TER untuk menyederhanakan perhitungan PPh 21 mulai 1 Januari 2024.
                        </p>
                        <p>
                            <strong>Cara kerja:</strong> Penghasilan bruto bulanan dikalikan langsung dengan tarif TER
                            yang sesuai kategori PTKP karyawan (Januari–November). Di bulan Desember, dilakukan
                            perhitungan ulang dengan tarif progresif Pasal 17 UU PPh.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {Object.entries(TER_CATEGORY_INFO).map(([cat, info]) => (
                                <span
                                    key={cat}
                                    className={`px-2 py-1 rounded-md text-[10px] font-bold border ${info.color}`}
                                >
                                    Kategori {cat}: {info.statuses}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Input Form */}
            <div className="card p-6 space-y-5">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Data Perhitungan
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="form-group !mb-0 md:col-span-1">
                        <label className="form-label">Penghasilan Bruto Bulanan</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] font-medium">
                                Rp
                            </span>
                            <input
                                type="text"
                                className="form-input !pl-9"
                                placeholder="10.000.000"
                                value={grossIncome}
                                onChange={(e) => handleIncomeChange(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                        </div>
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label">Status PTKP</label>
                        <select
                            className="form-select"
                            value={ptkpStatus}
                            onChange={(e) => setPtkpStatus(e.target.value as PtkpStatus)}
                        >
                            {PTKP_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label">Masa Pajak</label>
                        <select
                            className="form-select"
                            value={month}
                            onChange={(e) => setMonth(Number(e.target.value))}
                        >
                            {MONTH_NAMES.map((name, i) => (
                                <option key={i} value={i + 1}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-medium">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleCalculate}
                    disabled={loading || !grossIncome}
                    className="btn btn-primary w-full btn-lg"
                >
                    {loading ? (
                        <span className="spinner w-4 h-4" />
                    ) : (
                        <Calculator className="w-4 h-4" />
                    )}
                    {loading ? "Menghitung..." : "Hitung PPh 21"}
                </button>
            </div>

            {/* Results */}
            {result && (
                <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
                    {/* Primary Result Card */}
                    <div className="card overflow-hidden">
                        <div className="bg-[var(--primary)] p-5 text-white">
                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <div>
                                    <p className="text-xs font-medium opacity-80 uppercase tracking-wider">
                                        PPh 21 Bulan {MONTH_NAMES[month - 1]}
                                    </p>
                                    <p className="text-2xl md:text-3xl font-extrabold mt-1">
                                        {fmt(month === 12 ? result.december.pph21December : result.monthly.pph21Monthly)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className={`inline-block px-3 py-1.5 rounded-full text-xs font-bold border ${TER_CATEGORY_INFO[result.monthly.terCategory]?.color || "bg-[var(--secondary)]"}`}>
                                        TER Kategori {result.monthly.terCategory}
                                    </span>
                                    <p className="text-xs mt-2 opacity-80">
                                        Tarif: {result.monthly.terRatePercent}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 space-y-3">
                            {/* Summary Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <SummaryCard
                                    icon={<Wallet className="w-4 h-4" />}
                                    label="Bruto / Bulan"
                                    value={fmt(result.monthly.grossMonthlyIncome)}
                                    color="text-[var(--text-primary)]"
                                />
                                <SummaryCard
                                    icon={<TrendingDown className="w-4 h-4" />}
                                    label="PPh 21 / Bulan"
                                    value={fmt(result.monthly.pph21Monthly)}
                                    color="text-red-600"
                                    subtitle="(Jan–Nov)"
                                />
                                <SummaryCard
                                    icon={<FileText className="w-4 h-4" />}
                                    label="PPh 21 Desember"
                                    value={fmt(result.december.pph21December)}
                                    color="text-amber-600"
                                    subtitle="(Tarif Progresif)"
                                />
                                <SummaryCard
                                    icon={<ArrowRight className="w-4 h-4" />}
                                    label="Total PPh 21 / Tahun"
                                    value={fmt(result.annualSummary.totalPph21)}
                                    color="text-[var(--primary)]"
                                    subtitle={`Effective: ${result.annualSummary.effectiveAnnualRate}`}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Detail Toggle */}
                    <button
                        onClick={() => setShowDetail(!showDetail)}
                        className="w-full card p-3 flex items-center justify-center gap-2 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--secondary)] transition-colors"
                    >
                        {showDetail ? "Sembunyikan" : "Lihat"} Rincian Perhitungan
                        {showDetail ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {showDetail && (
                        <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
                            {/* TER Monthly Detail */}
                            <div className="card p-5 space-y-3">
                                <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                                    Perhitungan Bulanan (Jan–Nov) — Metode TER
                                </h3>
                                <div className="space-y-2">
                                    <DetailRow label="Penghasilan Bruto Bulanan" value={fmt(result.monthly.grossMonthlyIncome)} />
                                    <DetailRow label={`Kategori TER`} value={`Kategori ${result.monthly.terCategory}`} />
                                    <DetailRow label="Tarif Efektif Rata-rata" value={result.monthly.terRatePercent} highlight />
                                    <div className="border-t-2 border-[var(--primary)] pt-2 mt-2">
                                        <DetailRow
                                            label="PPh 21 / Bulan"
                                            value={fmt(result.monthly.pph21Monthly)}
                                            bold
                                            formula={`${fmt(result.monthly.grossMonthlyIncome)} × ${result.monthly.terRatePercent}`}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Annual Recalculation */}
                            <div className="card p-5 space-y-3">
                                <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                                    Perhitungan Desember — Tarif Progresif Pasal 17
                                </h3>
                                <div className="space-y-2">
                                    <DetailRow label="Penghasilan Bruto Setahun" value={fmt(result.december.grossAnnualIncome)} formula={`${fmt(result.monthly.grossMonthlyIncome)} × 12`} />
                                    <DetailRow label="Biaya Jabatan (5%, max 6jt/th)" value={`-${fmt(result.december.biayaJabatan)}`} color="text-red-600" />
                                    <DetailRow label="Penghasilan Neto Setahun" value={fmt(result.december.netAnnualIncome)} />
                                    <DetailRow label={`PTKP (${result.december.ptkpStatus})`} value={`-${fmt(result.december.ptkpAmount)}`} color="text-red-600" />
                                    <DetailRow label="Penghasilan Kena Pajak (PKP)" value={fmt(result.december.pkp)} bold highlight />
                                </div>

                                {/* Progressive Tax Breakdown */}
                                {result.december.progressiveBreakdown.length > 0 && (
                                    <div className="mt-4">
                                        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">
                                            Rincian Tarif Progresif
                                        </p>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                                                        <th className="text-left py-1.5 pr-2">Lapisan PKP</th>
                                                        <th className="text-center py-1.5 px-2">Tarif</th>
                                                        <th className="text-right py-1.5 px-2">PKP Dikenakan</th>
                                                        <th className="text-right py-1.5 pl-2">Pajak</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {result.december.progressiveBreakdown.map((item, i) => (
                                                        <tr key={i} className="border-b border-[var(--border)]/50">
                                                            <td className="py-1.5 pr-2 text-[var(--text-secondary)]">{item.bracket}</td>
                                                            <td className="py-1.5 px-2 text-center font-semibold text-[var(--primary)]">{item.rate}</td>
                                                            <td className="py-1.5 px-2 text-right">{fmt(item.taxable)}</td>
                                                            <td className="py-1.5 pl-2 text-right font-semibold text-red-600">{fmt(item.tax)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2 mt-3 pt-3 border-t border-[var(--border)]">
                                    <DetailRow label="PPh 21 Setahun (Progresif)" value={fmt(result.december.pph21Annual)} bold />
                                    <DetailRow label="PPh 21 Jan–Nov (TER)" value={`-${fmt(result.december.pph21JanToNov)}`} color="text-red-600" formula={`${fmt(result.monthly.pph21Monthly)} × 11`} />
                                    <div className="border-t-2 border-[var(--primary)] pt-2 mt-2">
                                        <DetailRow
                                            label="PPh 21 Desember"
                                            value={fmt(result.december.pph21December)}
                                            bold
                                            highlight
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Disclaimer */}
                            <div className="card p-4 bg-amber-50/50 border-amber-200/50">
                                <p className="text-[10px] text-amber-700 leading-relaxed">
                                    <strong>Disclaimer:</strong> Kalkulator ini bersifat estimasi berdasarkan PP 58/2023 dan PMK 168/2023.
                                    Perhitungan mengasumsikan penghasilan bruto tetap setiap bulan. Untuk perhitungan resmi,
                                    silakan konsultasikan dengan konsultan pajak profesional atau gunakan{" "}
                                    <a
                                        href="https://kalkulator.pajak.go.id/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline font-semibold"
                                    >
                                        kalkulator resmi DJP
                                    </a>.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────

function SummaryCard({
    icon,
    label,
    value,
    color,
    subtitle,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    color: string;
    subtitle?: string;
}) {
    return (
        <div className="p-3 rounded-lg bg-[var(--secondary)]/50 border border-[var(--border)]/50">
            <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-1">
                {icon}
                <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
            </div>
            <p className={`text-sm font-bold ${color}`}>{value}</p>
            {subtitle && (
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>
            )}
        </div>
    );
}

function DetailRow({
    label,
    value,
    bold,
    color,
    highlight,
    formula,
}: {
    label: string;
    value: string;
    bold?: boolean;
    color?: string;
    highlight?: boolean;
    formula?: string;
}) {
    return (
        <div className={`flex items-start justify-between gap-3 text-sm py-1 ${highlight ? "bg-[var(--primary)]/5 px-3 rounded-lg -mx-1" : ""}`}>
            <div className="flex-1 min-w-0">
                <span className={`${bold ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                    {label}
                </span>
                {formula && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{formula}</p>
                )}
            </div>
            <span className={`font-semibold whitespace-nowrap ${color || (bold ? "text-[var(--primary)]" : "text-[var(--text-primary)]")}`}>
                {value}
            </span>
        </div>
    );
}
