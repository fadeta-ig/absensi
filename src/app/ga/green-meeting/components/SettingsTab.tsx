"use client";

import { useState } from "react";
import {
    Settings,
    Calendar,
    Building2,
    Plus,
    Trash2,
    Save,
    CheckCircle2,
    Shield,
} from "lucide-react";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table";
import type { GreenMeetingConfig, GreenMeetingHoliday, GreenMeetingUnit } from "../types";

interface SettingsTabProps {
    config: GreenMeetingConfig | null;
    holidays: GreenMeetingHoliday[];
    units: GreenMeetingUnit[];
    onUpdateConfig: (data: {
        defaultRoom?: string;
        defaultTime?: string;
        maxDeadlineExtensions?: number;
        offDaysWeekly?: string;
    }) => Promise<void>;
    onUpdateUnit: (
        unitId: string,
        data: { isActiveInMeeting?: boolean; isDefaultRequired?: boolean }
    ) => Promise<void>;
    onAddHoliday: (data: { date: string; description: string; isRecurring?: boolean }) => Promise<void>;
    onDeleteHoliday: (id: string) => Promise<void>;
    loading?: boolean;
}

const DAYS_MAP = [
    { value: 0, label: "Minggu" },
    { value: 1, label: "Senin" },
    { value: 2, label: "Selasa" },
    { value: 3, label: "Rabu" },
    { value: 4, label: "Kamis" },
    { value: 5, label: "Jumat" },
    { value: 6, label: "Sabtu" },
];

export default function SettingsTab({
    config,
    holidays,
    units,
    onUpdateConfig,
    onUpdateUnit,
    onAddHoliday,
    onDeleteHoliday,
}: SettingsTabProps) {
    // Config Form
    const [defaultRoom, setDefaultRoom] = useState(config?.defaultRoom || "Ruang Rapat Utama Lt. 2");
    const [defaultTime, setDefaultTime] = useState(config?.defaultTime || "08:30");
    const [maxExtensions, setMaxExtensions] = useState(config?.maxDeadlineExtensions || 3);
    const [offDays, setOffDays] = useState<number[]>(
        (config?.offDaysWeekly || "0,6").split(",").map(Number)
    );
    const [savingConfig, setSavingConfig] = useState(false);
    const [configSavedToast, setConfigSavedToast] = useState(false);

    // Holiday Form
    const [holidayDate, setHolidayDate] = useState("");
    const [holidayDesc, setHolidayDesc] = useState("");
    const [addingHoliday, setAddingHoliday] = useState(false);

    const handleToggleOffDay = (dayValue: number) => {
        setOffDays((prev) =>
            prev.includes(dayValue) ? prev.filter((d) => d !== dayValue) : [...prev, dayValue]
        );
    };

    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingConfig(true);
        setConfigSavedToast(false);
        try {
            await onUpdateConfig({
                defaultRoom: defaultRoom.trim(),
                defaultTime: defaultTime.trim(),
                maxDeadlineExtensions: Number(maxExtensions),
                offDaysWeekly: offDays.join(","),
            });
            setConfigSavedToast(true);
            setTimeout(() => setConfigSavedToast(false), 3000);
        } finally {
            setSavingConfig(false);
        }
    };

    const handleCreateHoliday = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!holidayDate || !holidayDesc.trim()) return;

        setAddingHoliday(true);
        try {
            await onAddHoliday({
                date: holidayDate,
                description: holidayDesc.trim(),
            });
            setHolidayDate("");
            setHolidayDesc("");
        } finally {
            setAddingHoliday(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Section 1: Konfigurasi Parameter Rapat & Libur Mingguan */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Settings size={18} className="text-primary" />
                        <h4 className="text-base font-bold text-foreground">Parameter Operasional Rapat</h4>
                    </div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Shield size={12} className="text-emerald-500" />
                        Dikelola Permanen oleh GA (WIG002)
                    </span>
                </div>

                {configSavedToast && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                        <CheckCircle2 size={14} />
                        Konfigurasi berhasil disimpan.
                    </div>
                )}

                <form onSubmit={handleSaveConfig} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-foreground mb-1.5">
                                Ruangan Default
                            </label>
                            <input
                                type="text"
                                value={defaultRoom}
                                onChange={(e) => setDefaultRoom(e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                maxLength={100}
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-foreground mb-1.5">
                                Jam Mulai Default (WIB)
                            </label>
                            <input
                                type="time"
                                value={defaultTime}
                                onChange={(e) => setDefaultTime(e.target.value)}
                                className="w-full px-3 py-2 text-sm font-bold rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-foreground mb-1.5">
                                Batas Toleransi Perpanjangan Deadline
                            </label>
                            <select
                                value={maxExtensions}
                                onChange={(e) => setMaxExtensions(Number(e.target.value))}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <option value={1}>1 Kali Perpanjangan</option>
                                <option value={2}>2 Kali Perpanjangan</option>
                                <option value={3}>3 Kali Perpanjangan (Rekomendasi)</option>
                                <option value={4}>4 Kali Perpanjangan</option>
                                <option value={5}>5 Kali Perpanjangan</option>
                            </select>
                        </div>
                    </div>

                    {/* Checkbox Hari Libur Rutin Mingguan */}
                    <div>
                        <label className="block text-xs font-semibold text-foreground mb-2">
                            Hari Libur Rutin Mingguan (Otomatis Tidak Diagendakan Rapat)
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                            {DAYS_MAP.map((day) => {
                                const isChecked = offDays.includes(day.value);
                                return (
                                    <label
                                        key={day.value}
                                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${isChecked
                                            ? "bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400 font-semibold"
                                            : "bg-background border-border text-foreground hover:bg-muted"
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => handleToggleOffDay(day.value)}
                                            className="rounded border-border text-rose-600 focus:ring-rose-500 h-3.5 w-3.5"
                                        />
                                        <span>{day.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button
                            type="submit"
                            disabled={savingConfig}
                            className="inline-flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-primary hover:bg-primary/90 text-white shadow-sm transition-colors disabled:opacity-50"
                        >
                            <Save size={14} />
                            <span>{savingConfig ? "Menyimpan..." : "Simpan Parameter Rapat"}</span>
                        </button>
                    </div>
                </form>
            </div>

            {/* Section 2: Kalender Hari Libur Khusus / Nasional */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Calendar size={18} className="text-primary" />
                        <h4 className="text-base font-bold text-foreground">Kalender Hari Libur Khusus & Nasional</h4>
                    </div>
                    <span className="text-xs text-muted-foreground">Otomatis meniadakan jadwal rapat</span>
                </div>

                {/* Form Tambah Hari Libur */}
                <form onSubmit={handleCreateHoliday} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-4">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Tanggal Libur</label>
                        <input
                            type="date"
                            value={holidayDate}
                            onChange={(e) => setHolidayDate(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            required
                        />
                    </div>
                    <div className="sm:col-span-6">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Keterangan / Nama Hari Libur</label>
                        <input
                            type="text"
                            value={holidayDesc}
                            onChange={(e) => setHolidayDesc(e.target.value)}
                            placeholder="Contoh: Cuti Bersama Idul Fitri / Libur Pabrik"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            maxLength={200}
                            required
                        />
                    </div>
                    <div className="sm:col-span-2 flex items-end">
                        <button
                            type="submit"
                            disabled={addingHoliday || !holidayDate || !holidayDesc.trim()}
                            className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                            <Plus size={14} />
                            <span>{addingHoliday ? "..." : "Tambah"}</span>
                        </button>
                    </div>
                </form>

                {/* Tabel Daftar Hari Libur Khusus */}
                <div className="border border-border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tanggal</TableHead>
                                <TableHead>Keterangan Libur</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {holidays.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-4 text-xs text-muted-foreground">
                                        Belum ada hari libur khusus yang didaftarkan.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                holidays.map((h) => (
                                    <TableRow key={h.id}>
                                        <TableCell className="text-xs font-semibold text-foreground">
                                            {new Date(h.date).toLocaleDateString("id-ID", {
                                                weekday: "long",
                                                day: "numeric",
                                                month: "long",
                                                year: "numeric",
                                            })}
                                        </TableCell>
                                        <TableCell className="text-xs text-foreground">
                                            {h.description}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <button
                                                type="button"
                                                onClick={() => onDeleteHoliday(h.id)}
                                                className="p-1 text-rose-600 hover:bg-rose-500/10 rounded transition-colors"
                                                title="Hapus Hari Libur"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Section 3: Fleksibilitas Organisasi & Pengaturan Departemen */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Building2 size={18} className="text-primary" />
                        <h4 className="text-base font-bold text-foreground">Pengaturan Departemen Partisipan Rapat</h4>
                    </div>
                    <span className="text-xs text-muted-foreground">Aktifkan/nonaktifkan departemen sesuai struktur organisasi</span>
                </div>

                <div className="border border-border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Departemen</TableHead>
                                <TableHead>Divisi</TableHead>
                                <TableHead className="text-center">Ikut Rapat (Aktif)</TableHead>
                                <TableHead className="text-center">Wajib Hadir Default</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {units.map((u) => (
                                <TableRow key={u.id}>
                                    <TableCell>
                                        <div className="font-semibold text-foreground text-xs">
                                            {u.department.name}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {u.department.division?.name || "-"}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={u.isActiveInMeeting}
                                                onChange={(e) =>
                                                    onUpdateUnit(u.id, { isActiveInMeeting: e.target.checked })
                                                }
                                                className="sr-only peer"
                                            />
                                            <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                                        </label>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={u.isDefaultRequired}
                                                onChange={(e) =>
                                                    onUpdateUnit(u.id, { isDefaultRequired: e.target.checked })
                                                }
                                                className="sr-only peer"
                                            />
                                            <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                                        </label>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
