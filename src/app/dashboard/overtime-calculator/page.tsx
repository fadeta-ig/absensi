"use client";

import { useState, useMemo } from "react";
import {
    Calculator, Clock4, CalendarCheck, DollarSign,
    Info, ArrowRight
} from "lucide-react";

type WorkDaySystem = 5 | 6;

interface HourBreakdown {
    hourNumber: number;
    multiplier: number;
    amount: number;
}

function getMultipliers(hours: number, isHoliday: boolean, workDaySystem: WorkDaySystem): number[] {
    const fullHours = Math.ceil(hours);
    const multipliers: number[] = [];
    for (let h = 1; h <= fullHours; h++) {
        if (!isHoliday) {
            multipliers.push(h === 1 ? 1.5 : 2);
        } else if (workDaySystem === 5) {
            if (h <= 8) multipliers.push(2);
            else if (h === 9) multipliers.push(3);
            else multipliers.push(4);
        } else {
            if (h <= 7) multipliers.push(2);
            else if (h === 8) multipliers.push(3);
            else multipliers.push(4);
        }
    }
    return multipliers;
}

function calculate(monthlySalary: number, hours: number, isHoliday: boolean, workDaySystem: WorkDaySystem) {
    if (hours <= 0 || monthlySalary <= 0) return { hourlyRate: 0, breakdown: [] as HourBreakdown[], totalPay: 0 };
    const hourlyRate = monthlySalary / 173;
    const multipliers = getMultipliers(hours, isHoliday, workDaySystem);
    let totalPay = 0;
    const breakdown: HourBreakdown[] = [];
    for (let i = 0; i < multipliers.length; i++) {
        const isLast = i === multipliers.length - 1;
        const fraction = isLast ? hours - Math.floor(hours) : 0;
        const effectiveHour = isLast && fraction > 0 ? fraction : 1;
        const amount = Math.round(multipliers[i] * hourlyRate * effectiveHour);
        breakdown.push({ hourNumber: i + 1, multiplier: multipliers[i], amount });
        totalPay += amount;
    }
    return { hourlyRate: Math.round(hourlyRate), breakdown, totalPay };
}

const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

export default function OvertimeCalculatorPage() {
    const [monthlySalary, setMonthlySalary] = useState(5000000);
    const [hours, setHours] = useState(3);
    const [isHoliday, setIsHoliday] = useState(false);
    const [workDaySystem, setWorkDaySystem] = useState<WorkDaySystem>(5);

    const result = useMemo(
        () => calculate(monthlySalary, hours, isHoliday, workDaySystem),
        [monthlySalary, hours, isHoliday, workDaySystem]
    );

    return (
        <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
            <div>
                <h1 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-[var(--primary)]" />
                    Kalkulator Lembur
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">Simulasi perhitungan upah lembur sesuai PP No. 35 Tahun 2021</p>
            </div>

            {/* Info Card */}
            <div className="card p-4 bg-blue-50 border-blue-200 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800 space-y-1">
                    <p><strong>Upah Sejam</strong> = 1/173 × (Gaji Pokok + Tunjangan Tetap)</p>
                    <p><strong>Hari Kerja:</strong> Jam ke-1 = 1.5×, Jam ke-2+ = 2×</p>
                    <p><strong>Hari Libur (5 hari):</strong> Jam 1–8 = 2×, Jam 9 = 3×, Jam 10–12 = 4×</p>
                    <p><strong>Hari Libur (6 hari):</strong> Jam 1–7 = 2×, Jam 8 = 3×, Jam 9–11 = 4×</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Input */}
                <div className="card p-6 space-y-5">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Clock4 className="w-4 h-4 text-[var(--primary)]" /> Input Simulasi
                    </h2>

                    <div className="form-group !mb-0">
                        <label className="form-label">Gaji Pokok + Tunjangan Tetap (per bulan)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] font-semibold">Rp</span>
                            <input
                                type="number"
                                className="form-input pl-10"
                                value={monthlySalary}
                                onChange={(e) => setMonthlySalary(Number(e.target.value))}
                                min={0}
                            />
                        </div>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">Upah Sejam: {fmt(result.hourlyRate)}</p>
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label">Jumlah Jam Lembur</label>
                        <input
                            type="number"
                            className="form-input"
                            value={hours}
                            onChange={(e) => setHours(Number(e.target.value))}
                            min={0.5}
                            max={12}
                            step={0.5}
                        />
                    </div>

                    <div className="form-group !mb-0">
                        <label className="form-label">Tipe Hari</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setIsHoliday(false)}
                                className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold border transition-all ${!isHoliday
                                    ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                                    : "bg-[var(--card)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]"
                                    }`}
                            >
                                Hari Kerja
                            </button>
                            <button
                                onClick={() => setIsHoliday(true)}
                                className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold border transition-all ${isHoliday
                                    ? "bg-orange-500 text-white border-orange-500"
                                    : "bg-[var(--card)] text-[var(--text-secondary)] border-[var(--border)] hover:border-orange-500"
                                    }`}
                            >
                                Hari Libur / Istirahat
                            </button>
                        </div>
                    </div>

                    {isHoliday && (
                        <div className="form-group !mb-0">
                            <label className="form-label">Sistem Hari Kerja</label>
                            <div className="flex gap-2">
                                {([5, 6] as const).map((sys) => (
                                    <button
                                        key={sys}
                                        onClick={() => setWorkDaySystem(sys)}
                                        className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold border transition-all ${workDaySystem === sys
                                            ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                                            : "bg-[var(--card)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]"
                                            }`}
                                    >
                                        {sys} Hari Kerja
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Result */}
                <div className="card p-6 space-y-5">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-green-600" /> Hasil Perhitungan
                    </h2>

                    {result.breakdown.length === 0 ? (
                        <div className="p-8 text-center text-sm text-[var(--text-muted)]">
                            Masukkan data untuk melihat hasil
                        </div>
                    ) : (
                        <>
                            {/* Breakdown Table */}
                            <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-[var(--secondary)]">
                                            <th className="px-3 py-2 text-left font-bold text-[var(--text-primary)]">Jam</th>
                                            <th className="px-3 py-2 text-center font-bold text-[var(--text-primary)]">Multiplier</th>
                                            <th className="px-3 py-2 text-left font-bold text-[var(--text-primary)]">Rumus</th>
                                            <th className="px-3 py-2 text-right font-bold text-[var(--text-primary)]">Upah</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.breakdown.map((row) => (
                                            <tr key={row.hourNumber} className="border-t border-[var(--border)]">
                                                <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                                                    <CalendarCheck className="w-3 h-3 inline mr-1.5 text-[var(--primary)]" />
                                                    Jam ke-{row.hourNumber}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${row.multiplier <= 2 ? "bg-green-100 text-green-700" : row.multiplier === 3 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                                                        {row.multiplier}×
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-[var(--text-muted)]">
                                                    {row.multiplier}× <ArrowRight className="w-2.5 h-2.5 inline" /> {fmt(result.hourlyRate)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-[var(--text-primary)]">
                                                    {fmt(row.amount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Total */}
                            <div className="flex justify-between items-center py-4 px-4 bg-[var(--primary)]/5 rounded-xl border-2 border-[var(--primary)]/20">
                                <div>
                                    <p className="text-xs text-[var(--text-muted)]">Total Upah Lembur</p>
                                    <p className="text-[10px] text-[var(--text-muted)]">{hours} jam × {isHoliday ? "Hari Libur" : "Hari Kerja"}</p>
                                </div>
                                <p className="text-xl font-extrabold text-[var(--primary)]">{fmt(result.totalPay)}</p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
