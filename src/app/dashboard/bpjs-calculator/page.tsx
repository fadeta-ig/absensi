"use client";

import { useState, useCallback } from "react";
import {
    Shield, Heart, HardHat, Info, ChevronDown, ChevronUp,
    HelpCircle, Building2, User, ArrowRight,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────

type JkkRiskLevel = 1 | 2 | 3 | 4 | 5;

interface ContributionSplit { company: number; employee: number; total: number; }

interface ProgramResult {
    programName: string;
    baseSalary: number;
    isCapped: boolean;
    rate: { company: number; employee: number; total: number };
    contribution: ContributionSplit;
}

interface CalculationResult {
    grossMonthlyIncome: number;
    jkkRiskLevel: JkkRiskLevel;
    kesehatan: {
        baseSalary: number;
        isCapped: boolean;
        rate: { company: number; employee: number; total: number };
        contribution: ContributionSplit;
    };
    ketenagakerjaan: {
        jht: ProgramResult;
        jkk: ProgramResult;
        jkm: ProgramResult;
        jp: ProgramResult;
        totalCompany: number;
        totalEmployee: number;
        totalAll: number;
    };
    grandTotal: { company: number; employee: number; total: number };
    takeHomePay: number;
}

// ─── Constants ───────────────────────────────────────────────────────

const RISK_OPTIONS: { value: JkkRiskLevel; label: string }[] = [
    { value: 1, label: "1 — Sangat Rendah (0,24%)" },
    { value: 2, label: "2 — Rendah (0,54%)" },
    { value: 3, label: "3 — Sedang (0,89%)" },
    { value: 4, label: "4 — Tinggi (1,27%)" },
    { value: 5, label: "5 — Sangat Tinggi (1,74%)" },
];

// ─── Component ───────────────────────────────────────────────────────

export default function BpjsCalculatorPage() {
    const [grossIncome, setGrossIncome] = useState<string>("");
    const [jkkRisk, setJkkRisk] = useState<JkkRiskLevel>(1);
    const [result, setResult] = useState<CalculationResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [showInfo, setShowInfo] = useState(false);

    const fmt = useCallback(
        (n: number) =>
            new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n),
        []
    );

    const fmtNum = useCallback(
        (n: number) => new Intl.NumberFormat("id-ID").format(n),
        []
    );

    const pctStr = (rate: number) => `${(rate * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

    const handleCalculate = async () => {
        const income = Number(grossIncome.replace(/\D/g, ""));
        if (!income || income <= 0) {
            setError("Masukkan gaji bruto yang valid");
            return;
        }

        setLoading(true);
        setError("");
        setResult(null);

        try {
            const res = await fetch("/api/bpjs/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grossMonthlyIncome: income, jkkRiskLevel: jkkRisk }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Gagal menghitung");
            }

            setResult(await res.json());
        } catch (err) {
            setError(err instanceof Error ? err.message : "Terjadi kesalahan");
        } finally {
            setLoading(false);
        }
    };

    const handleIncomeChange = (value: string) => {
        const raw = value.replace(/\D/g, "");
        setGrossIncome(raw === "" ? "" : fmtNum(Number(raw)));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); handleCalculate(); }
    };

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Shield className="w-5 h-5 text-[var(--primary)]" />
                    Kalkulator BPJS
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                    Hitung iuran BPJS Kesehatan & Ketenagakerjaan untuk payroll karyawan
                </p>
            </div>

            {/* Info Toggle */}
            <button
                onClick={() => setShowInfo(!showInfo)}
                className="flex items-center gap-2 text-sm text-[var(--primary)] font-medium hover:underline transition-colors"
            >
                <HelpCircle className="w-4 h-4" />
                {showInfo ? "Sembunyikan" : "Tentang"} Iuran BPJS
                {showInfo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showInfo && (
                <div className="card p-5 space-y-4 border-l-4 border-l-[var(--primary)] bg-[var(--primary)]/5">
                    <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Info className="w-4 h-4 text-[var(--primary)]" />
                        Dasar Hukum & Tarif Iuran
                    </h3>

                    <div className="space-y-3 text-xs text-[var(--text-secondary)] leading-relaxed">
                        {/* BPJS Kesehatan */}
                        <div className="p-3 rounded-lg bg-[var(--card)]/60 border border-[var(--border)]/50">
                            <p className="font-bold text-[var(--text-primary)] flex items-center gap-1.5 mb-1">
                                <Heart className="w-3.5 h-3.5 text-red-500" /> BPJS Kesehatan
                            </p>
                            <p>Perpres 64/2020 — PPU: <strong>5%</strong> dari gaji (4% perusahaan + 1% karyawan). Batas upah: <strong>Rp12.000.000</strong>.</p>
                        </div>

                        {/* BPJS Ketenagakerjaan */}
                        <div className="p-3 rounded-lg bg-[var(--card)]/60 border border-[var(--border)]/50">
                            <p className="font-bold text-[var(--text-primary)] flex items-center gap-1.5 mb-1">
                                <HardHat className="w-3.5 h-3.5 text-amber-600" /> BPJS Ketenagakerjaan
                            </p>
                            <div className="overflow-x-auto mt-2">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                                            <th className="text-left py-1 pr-2">Program</th>
                                            <th className="text-center py-1 px-2">Perusahaan</th>
                                            <th className="text-center py-1 px-2">Karyawan</th>
                                            <th className="text-left py-1 pl-2">Dasar Hukum</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-[var(--text-secondary)]">
                                        <tr className="border-b border-[var(--border)]/30">
                                            <td className="py-1 pr-2">JHT</td>
                                            <td className="py-1 px-2 text-center font-semibold">3,7%</td>
                                            <td className="py-1 px-2 text-center font-semibold">2%</td>
                                            <td className="py-1 pl-2">PP 46/2015</td>
                                        </tr>
                                        <tr className="border-b border-[var(--border)]/30">
                                            <td className="py-1 pr-2">JKK</td>
                                            <td className="py-1 px-2 text-center font-semibold">0,24–1,74%</td>
                                            <td className="py-1 px-2 text-center">—</td>
                                            <td className="py-1 pl-2">PP 44/2015</td>
                                        </tr>
                                        <tr className="border-b border-[var(--border)]/30">
                                            <td className="py-1 pr-2">JKM</td>
                                            <td className="py-1 px-2 text-center font-semibold">0,3%</td>
                                            <td className="py-1 px-2 text-center">—</td>
                                            <td className="py-1 pl-2">PP 44/2015</td>
                                        </tr>
                                        <tr>
                                            <td className="py-1 pr-2">JP</td>
                                            <td className="py-1 px-2 text-center font-semibold">2%</td>
                                            <td className="py-1 px-2 text-center font-semibold">1%</td>
                                            <td className="py-1 pl-2">PP 45/2015</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mt-2">
                                * JP: batas upah Rp10.547.400/bulan (2025) · JKK: tarif tergantung tingkat risiko kerja
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Input Form */}
            <div className="card p-6 space-y-5">
                <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Data Perhitungan
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="form-group !mb-0">
                        <label className="form-label">Gaji Bruto Bulanan</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] font-medium">Rp</span>
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
                        <label className="form-label">Tingkat Risiko JKK</label>
                        <select
                            className="form-select"
                            value={jkkRisk}
                            onChange={(e) => setJkkRisk(Number(e.target.value) as JkkRiskLevel)}
                        >
                            {RISK_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-medium">{error}</div>
                )}

                <button
                    onClick={handleCalculate}
                    disabled={loading || !grossIncome}
                    className="btn btn-primary w-full btn-lg"
                >
                    {loading ? <span className="spinner w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    {loading ? "Menghitung..." : "Hitung Iuran BPJS"}
                </button>
            </div>

            {/* Results */}
            {result && (
                <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
                    {/* Grand Total Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <TotalCard
                            icon={<Building2 className="w-5 h-5" />}
                            label="Beban Perusahaan"
                            value={fmt(result.grandTotal.company)}
                            color="text-amber-600"
                            bgColor="bg-amber-50 border-amber-200"
                        />
                        <TotalCard
                            icon={<User className="w-5 h-5" />}
                            label="Potongan Karyawan"
                            value={fmt(result.grandTotal.employee)}
                            color="text-red-600"
                            bgColor="bg-red-50 border-red-200"
                        />
                        <TotalCard
                            icon={<ArrowRight className="w-5 h-5" />}
                            label="Take Home Pay"
                            value={fmt(result.takeHomePay)}
                            color="text-[var(--primary)]"
                            bgColor="bg-[var(--primary)]/5 border-[var(--primary)]/20"
                            subtitle={`Gaji bruto − potongan karyawan`}
                        />
                    </div>

                    {/* BPJS Kesehatan Detail */}
                    <ProgramCard
                        title="BPJS Kesehatan"
                        icon={<Heart className="w-4 h-4 text-red-500" />}
                        programs={[{
                            name: "Jaminan Kesehatan (JKN)",
                            baseSalary: result.kesehatan.baseSalary,
                            isCapped: result.kesehatan.isCapped,
                            capLabel: "Rp12.000.000",
                            rateCompany: pctStr(result.kesehatan.rate.company),
                            rateEmployee: pctStr(result.kesehatan.rate.employee),
                            company: result.kesehatan.contribution.company,
                            employee: result.kesehatan.contribution.employee,
                            total: result.kesehatan.contribution.total,
                        }]}
                        totalCompany={result.kesehatan.contribution.company}
                        totalEmployee={result.kesehatan.contribution.employee}
                        fmt={fmt}
                    />

                    {/* BPJS Ketenagakerjaan Detail */}
                    <ProgramCard
                        title="BPJS Ketenagakerjaan"
                        icon={<HardHat className="w-4 h-4 text-amber-600" />}
                        programs={[
                            {
                                name: "Jaminan Hari Tua (JHT)",
                                baseSalary: result.ketenagakerjaan.jht.baseSalary,
                                isCapped: false,
                                rateCompany: pctStr(result.ketenagakerjaan.jht.rate.company),
                                rateEmployee: pctStr(result.ketenagakerjaan.jht.rate.employee),
                                company: result.ketenagakerjaan.jht.contribution.company,
                                employee: result.ketenagakerjaan.jht.contribution.employee,
                                total: result.ketenagakerjaan.jht.contribution.total,
                            },
                            {
                                name: "Jaminan Kecelakaan Kerja (JKK)",
                                baseSalary: result.ketenagakerjaan.jkk.baseSalary,
                                isCapped: false,
                                rateCompany: pctStr(result.ketenagakerjaan.jkk.rate.company),
                                rateEmployee: "—",
                                company: result.ketenagakerjaan.jkk.contribution.company,
                                employee: 0,
                                total: result.ketenagakerjaan.jkk.contribution.total,
                            },
                            {
                                name: "Jaminan Kematian (JKM)",
                                baseSalary: result.ketenagakerjaan.jkm.baseSalary,
                                isCapped: false,
                                rateCompany: pctStr(result.ketenagakerjaan.jkm.rate.company),
                                rateEmployee: "—",
                                company: result.ketenagakerjaan.jkm.contribution.company,
                                employee: 0,
                                total: result.ketenagakerjaan.jkm.contribution.total,
                            },
                            {
                                name: "Jaminan Pensiun (JP)",
                                baseSalary: result.ketenagakerjaan.jp.baseSalary,
                                isCapped: result.ketenagakerjaan.jp.isCapped,
                                capLabel: "Rp10.547.400",
                                rateCompany: pctStr(result.ketenagakerjaan.jp.rate.company),
                                rateEmployee: pctStr(result.ketenagakerjaan.jp.rate.employee),
                                company: result.ketenagakerjaan.jp.contribution.company,
                                employee: result.ketenagakerjaan.jp.contribution.employee,
                                total: result.ketenagakerjaan.jp.contribution.total,
                            },
                        ]}
                        totalCompany={result.ketenagakerjaan.totalCompany}
                        totalEmployee={result.ketenagakerjaan.totalEmployee}
                        fmt={fmt}
                    />

                    {/* Disclaimer */}
                    <div className="card p-4 bg-amber-50/50 border-amber-200/50">
                        <p className="text-[10px] text-amber-700 leading-relaxed">
                            <strong>Disclaimer:</strong> Kalkulator ini menggunakan tarif resmi berdasarkan Perpres 64/2020 (BPJS Kesehatan),
                            PP 44–46/2015 (JKK, JKM, JHT), PP 45/2015 (JP, batas upah 2025). Untuk perhitungan resmi, silakan
                            hubungi kantor BPJS terdekat atau kunjungi{" "}
                            <a href="https://www.bpjsketenagakerjaan.go.id/" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                                bpjsketenagakerjaan.go.id
                            </a>{" "}dan{" "}
                            <a href="https://www.bpjs-kesehatan.go.id/" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                                bpjs-kesehatan.go.id
                            </a>.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────

function TotalCard({ icon, label, value, color, bgColor, subtitle }: {
    icon: React.ReactNode; label: string; value: string; color: string; bgColor: string; subtitle?: string;
}) {
    return (
        <div className={`card p-5 border ${bgColor}`}>
            <div className="flex items-center gap-2 text-[var(--text-muted)] mb-2">
                {icon}
                <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
            </div>
            <p className={`text-xl font-extrabold ${color}`}>{value}</p>
            {subtitle && <p className="text-[10px] text-[var(--text-muted)] mt-1">{subtitle}</p>}
        </div>
    );
}

interface ProgramRow {
    name: string;
    baseSalary: number;
    isCapped: boolean;
    capLabel?: string;
    rateCompany: string;
    rateEmployee: string;
    company: number;
    employee: number;
    total: number;
}

function ProgramCard({ title, icon, programs, totalCompany, totalEmployee, fmt }: {
    title: string;
    icon: React.ReactNode;
    programs: ProgramRow[];
    totalCompany: number;
    totalEmployee: number;
    fmt: (n: number) => string;
}) {
    return (
        <div className="card overflow-hidden">
            <div className="px-5 py-3 bg-[var(--secondary)]/50 border-b border-[var(--border)]">
                <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                    {icon} {title}
                </h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-[var(--text-muted)] border-b border-[var(--border)]">
                            <th className="text-left py-2.5 px-4">Program</th>
                            <th className="text-center py-2.5 px-2">Tarif ER</th>
                            <th className="text-center py-2.5 px-2">Tarif EE</th>
                            <th className="text-right py-2.5 px-2">Perusahaan</th>
                            <th className="text-right py-2.5 px-2">Karyawan</th>
                            <th className="text-right py-2.5 px-4">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {programs.map((p) => (
                            <tr key={p.name} className="border-b border-[var(--border)]/50 hover:bg-[var(--secondary)]/30 transition-colors">
                                <td className="py-2.5 px-4">
                                    <span className="font-medium text-[var(--text-primary)]">{p.name}</span>
                                    {p.isCapped && (
                                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                            Cap {p.capLabel}
                                        </span>
                                    )}
                                </td>
                                <td className="py-2.5 px-2 text-center font-semibold text-amber-600">{p.rateCompany}</td>
                                <td className="py-2.5 px-2 text-center font-semibold text-red-600">{p.rateEmployee}</td>
                                <td className="py-2.5 px-2 text-right text-amber-700">{fmt(p.company)}</td>
                                <td className="py-2.5 px-2 text-right text-red-600">{p.employee > 0 ? fmt(p.employee) : "—"}</td>
                                <td className="py-2.5 px-4 text-right font-semibold">{fmt(p.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-[var(--secondary)]/30 font-bold text-[var(--text-primary)]">
                            <td className="py-2.5 px-4" colSpan={3}>Subtotal {title}</td>
                            <td className="py-2.5 px-2 text-right text-amber-700">{fmt(totalCompany)}</td>
                            <td className="py-2.5 px-2 text-right text-red-600">{fmt(totalEmployee)}</td>
                            <td className="py-2.5 px-4 text-right text-[var(--primary)]">{fmt(totalCompany + totalEmployee)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}
