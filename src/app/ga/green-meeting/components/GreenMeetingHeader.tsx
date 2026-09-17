"use client";

import { useState } from "react";
import {
    Calendar,
    MapPin,
    Clock,
    RefreshCw,
    Edit3,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import AccessibleModal from "@/components/ui/AccessibleModal";
import type { GreenMeetingSession } from "../types";

interface GreenMeetingHeaderProps {
    session: GreenMeetingSession | null;
    currentDateStr: string;
    onDateChange: (dateStr: string) => void;
    onRefresh: () => void;
    onUpdateRoom: (newRoom: string) => Promise<void>;
    onUpdateTime?: (newTime: string) => Promise<void>;
    offDayInfo?: { isOffDay: boolean; reason?: string };
    loading?: boolean;
}

export default function GreenMeetingHeader({
    session,
    currentDateStr,
    onDateChange,
    onRefresh,
    onUpdateRoom,
    onUpdateTime,
    offDayInfo,
    loading = false,
}: GreenMeetingHeaderProps) {
    const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState(session?.room || "Ruang Rapat Utama Lt. 2");
    const [savingRoom, setSavingRoom] = useState(false);
    const [updatingTime, setUpdatingTime] = useState(false);

    // Format tanggal ramah pengguna (contoh: Kamis, 17 September 2026)
    const formattedDate = new Date(`${currentDateStr}T00:00:00`).toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    const handlePrevDay = () => {
        const d = new Date(`${currentDateStr}T00:00:00`);
        d.setDate(d.getDate() - 1);
        onDateChange(d.toISOString().split("T")[0]);
    };

    const handleNextDay = () => {
        const d = new Date(`${currentDateStr}T00:00:00`);
        d.setDate(d.getDate() + 1);
        onDateChange(d.toISOString().split("T")[0]);
    };

    const handleToday = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        onDateChange(`${y}-${m}-${d}`);
    };

    const handleSaveRoom = async () => {
        if (!selectedRoom.trim()) return;
        setSavingRoom(true);
        try {
            await onUpdateRoom(selectedRoom.trim());
            setIsRoomModalOpen(false);
        } finally {
            setSavingRoom(false);
        }
    };

    return (
        <div className="bg-card border border-border rounded-xl p-4 sm:p-6 shadow-sm mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                {/* Judul & Info Modul */}
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Green Meeting
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            PIC: General Affairs (WIG002)
                        </span>
                        {offDayInfo?.isOffDay && (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                                <AlertCircle size={12} />
                                {offDayInfo.reason || "Hari Libur"}
                            </span>
                        )}
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-1 text-foreground">
                        Rapat Koordinasi Rutin Harian
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Pencatatan presensi perwakilan departemen, notulensi dua arah, dan pelacakan tindak lanjut perusahaan.
                    </p>
                </div>

                {/* Kontrol Tanggal & Ruangan */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Date Navigation with Pick Date */}
                    <div className="flex items-center bg-muted/60 border border-border rounded-lg p-1">
                        <button
                            type="button"
                            onClick={handlePrevDay}
                            className="p-1.5 hover:bg-background rounded-md text-foreground transition-colors"
                            title="Hari Sebelumnya"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <label
                            className="relative flex items-center gap-1.5 px-2.5 py-1 text-xs sm:text-sm font-medium text-foreground hover:bg-background/80 rounded-md cursor-pointer transition-colors group"
                            title="Klik untuk memilih tanggal dari kalender"
                            onClick={(e) => {
                                try {
                                    const input = e.currentTarget.querySelector("input[type='date']") as HTMLInputElement | null;
                                    input?.showPicker?.();
                                } catch {}
                            }}
                        >
                            <Calendar size={14} className="text-primary group-hover:scale-110 transition-transform" />
                            <span className="select-none font-semibold">{formattedDate}</span>
                            <input
                                type="date"
                                value={currentDateStr}
                                onChange={(e) => {
                                    if (e.target.value) onDateChange(e.target.value);
                                }}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                aria-label="Pilih tanggal rapat"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={handleNextDay}
                            className="p-1.5 hover:bg-background rounded-md text-foreground transition-colors"
                            title="Hari Berikutnya"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleToday}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors"
                    >
                        Hari Ini
                    </button>

                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={loading}
                        className="p-2 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        title="Muat Ulang Data"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* Sub-bar Ruangan & Jam */}
            <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
                <div className="flex items-center gap-4 flex-wrap">
                    {/* Jam Mulai dengan Pick Clock */}
                    <div className="flex items-center gap-1.5 text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-lg border border-border">
                        <Clock size={14} className="text-primary" />
                        <span>Jam Mulai:</span>
                        <input
                            type="time"
                            value={session?.startTime || "08:30"}
                            disabled={updatingTime || !onUpdateTime}
                            onChange={async (e) => {
                                const val = e.target.value;
                                if (!val || !onUpdateTime) return;
                                setUpdatingTime(true);
                                try {
                                    await onUpdateTime(val);
                                } finally {
                                    setUpdatingTime(false);
                                }
                            }}
                            className="px-2 py-0.5 text-xs font-bold rounded border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer disabled:opacity-50"
                            title="Klik ikon jam untuk memilih jam rapat (Pick Clock)"
                        />
                        <span className="font-semibold text-foreground">WIB</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin size={14} className="text-primary" />
                        <span>Ruangan: <strong className="text-foreground">{session?.room || "Ruang Rapat Utama Lt. 2"}</strong></span>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedRoom(session?.room || "Ruang Rapat Utama Lt. 2");
                                setIsRoomModalOpen(true);
                            }}
                            className="ml-1 text-primary hover:underline font-semibold inline-flex items-center gap-0.5"
                        >
                            <Edit3 size={12} />
                            Ubah
                        </button>
                    </div>
                </div>

                <div className="text-xs text-muted-foreground">
                    Status: <span className="font-semibold text-emerald-600 dark:text-emerald-400">● Rapat Aktif</span>
                </div>
            </div>

            {/* Modal Ubah Ruangan */}
            {isRoomModalOpen && (
                <AccessibleModal
                    ariaLabel="Ubah Ruangan Rapat"
                    onClose={() => setIsRoomModalOpen(false)}
                    className="max-w-md w-full p-6 bg-card border border-border rounded-xl shadow-xl"
                >
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-semibold text-foreground">Ubah Lokasi Ruangan Rapat</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                Ubah lokasi ruangan jika ruangan utama sedang digunakan atau dipindahkan.
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-foreground mb-1.5">
                                Nama Ruangan / Lokasi
                            </label>
                            <input
                                type="text"
                                value={selectedRoom}
                                onChange={(e) => setSelectedRoom(e.target.value)}
                                placeholder="Contoh: Ruang Rapat Lt. 1 / Ruang Training"
                                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                maxLength={100}
                                autoFocus
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setIsRoomModalOpen(false)}
                                disabled={savingRoom}
                                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted text-foreground transition-colors"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveRoom}
                                disabled={savingRoom || !selectedRoom.trim()}
                                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-white shadow-sm transition-colors disabled:opacity-50"
                            >
                                {savingRoom ? "Menyimpan..." : "Simpan Ruangan"}
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
