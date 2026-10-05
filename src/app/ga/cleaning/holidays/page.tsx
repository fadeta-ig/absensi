"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, Plus, Trash2, X, CalendarOff } from "lucide-react";
import { useToast } from "@/components/Toast";
import { reportClientError, getResponseErrorMessage } from "@/lib/clientErrors";
import AccessibleModal from "@/components/ui/AccessibleModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CleaningHoliday {
    id: string;
    wibDate: string;
    description: string;
    createdAt: string;
}

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 1, label: "Senin" },
    { value: 2, label: "Selasa" },
    { value: 3, label: "Rabu" },
    { value: 4, label: "Kamis" },
    { value: 5, label: "Jumat" },
    { value: 6, label: "Sabtu" },
    { value: 0, label: "Minggu" },
];

export default function CleaningHolidaysPage() {
    const toast = useToast();
    const [holidays, setHolidays] = useState<CleaningHoliday[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showAddModal, setShowAddModal] = useState(false);
    const [wibDate, setWibDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [description, setDescription] = useState("");
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([0, 6]);
    const [weeklySaving, setWeeklySaving] = useState(false);

    const fetchHolidays = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/cleaning/holidays");
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal memuat hari libur."));
            const json = await res.json();
            setHolidays(json.data ?? []);
            if (Array.isArray(json.weeklyOffDays)) {
                const parsed = (json.weeklyOffDays as unknown[]).filter(
                    (d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6
                );
                setWeeklyOffDays([...new Set(parsed)].sort((a, b) => a - b));
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal memuat hari libur.";
            setError(msg);
            reportClientError("CleaningHolidays", msg, err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchHolidays();
    }, [fetchHolidays]);

    const isStartValid = /^\d{4}-\d{2}-\d{2}$/.test(wibDate);
    const isEndValid = endDate === "" || /^\d{4}-\d{2}-\d{2}$/.test(endDate);
    const isRangeOrderValid = endDate === "" || endDate >= wibDate;
    const isFormValid =
        isStartValid && isEndValid && isRangeOrderValid && description.trim().length >= 3;

    const handleAdd = useCallback(async () => {
        if (saving || !isFormValid) return;
        setSaving(true);
        try {
            const trimmedDescription = description.trim();
            const isRange = endDate !== "" && endDate !== wibDate;
            const payload = isRange
                ? { startDate: wibDate, endDate, description: trimmedDescription }
                : { wibDate, description: trimmedDescription };
            const res = await fetch("/api/cleaning/holidays", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menambah hari libur."));
            if (isRange) {
                const json = await res.json().catch(() => null);
                const createdCount = json?.data?.created?.length;
                const skippedCount = json?.data?.skipped?.length;
                if (typeof createdCount === "number") {
                    toast(
                        skippedCount > 0
                            ? `${createdCount} hari ditambahkan, ${skippedCount} dilewati (sudah ada). Rentang tersebut bebas paraf.`
                            : `${createdCount} hari ditambahkan. Rentang tersebut bebas paraf.`,
                        "success"
                    );
                } else {
                    toast("Rentang libur berhasil ditambahkan. Tanggal tersebut bebas paraf.", "success");
                }
            } else {
                toast("Hari libur berhasil ditambahkan. Tanggal tersebut bebas paraf.", "success");
            }
            setShowAddModal(false);
            setWibDate("");
            setEndDate("");
            setDescription("");
            await fetchHolidays();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal menambah hari libur.";
            toast(msg, "error");
            reportClientError("CleaningHolidays", msg, err);
        } finally {
            setSaving(false);
        }
    }, [saving, isFormValid, wibDate, endDate, description, toast, fetchHolidays]);

    const handleWeeklySave = useCallback(async () => {
        if (weeklySaving) return;
        setWeeklySaving(true);
        try {
            const res = await fetch("/api/cleaning/holidays", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ weeklyOffDays }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan pola mingguan."));
            const json = await res.json().catch(() => null);
            if (Array.isArray(json?.data?.value)) setWeeklyOffDays(json.data.value);
            toast("Pola libur mingguan tersimpan. Paraf mengikuti pola baru.", "success");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Gagal menyimpan pola mingguan.";
            toast(msg, "error");
            reportClientError("CleaningHolidays", msg, err);
        } finally {
            setWeeklySaving(false);
        }
    }, [weeklySaving, weeklyOffDays, toast]);

    const handleDelete = useCallback(
        async (holiday: CleaningHoliday) => {
            if (deletingId) return;
            if (!confirm(`Hapus libur ${holiday.wibDate} (${holiday.description})? Tanggal tersebut akan kembali wajib paraf.`)) {
                return;
            }
            setDeletingId(holiday.id);
            try {
                const res = await fetch(`/api/cleaning/holidays?id=${holiday.id}`, { method: "DELETE" });
                if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus hari libur."));
                toast("Hari libur berhasil dihapus.", "success");
                await fetchHolidays();
            } catch (err) {
                toast(err instanceof Error ? err.message : "Gagal menghapus hari libur.", "error");
            } finally {
                setDeletingId(null);
            }
        },
        [deletingId, toast, fetchHolidays]
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-6">
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 text-center">
                    <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
                    <p className="text-destructive">{error}</p>
                    <button onClick={() => void fetchHolidays()} className="mt-3 text-sm text-primary hover:underline">
                        Coba lagi
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground mb-1 flex items-center gap-2">
                        <CalendarOff className="h-6 w-6 text-amber-600" /> Libur Cleaning
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Tanggal libur bebas paraf. Pada tanggal libur petugas tidak perlu paraf. Pola mingguan
                        di bawah bebas paraf tanpa perlu didaftarkan per tanggal.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setWibDate("");
                        setEndDate("");
                        setDescription("");
                        setShowAddModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 self-start sm:self-auto"
                >
                    <Plus className="h-4 w-4" /> Tambah Libur
                </button>
            </div>

            <div className="bg-card border border-border rounded-lg p-4 mb-6">
                <h2 className="text-sm font-semibold text-foreground mb-1">Pola libur mingguan</h2>
                <p className="text-xs text-muted-foreground mb-3">
                    Centang hari yang bebas paraf setiap pekan. Contoh Rabu–Minggu: centang Rabu,
                    Kamis, Jumat, Sabtu, Minggu.
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                    {WEEKDAY_OPTIONS.map((day) => {
                        const checked = weeklyOffDays.includes(day.value);
                        return (
                            <label
                                key={day.value}
                                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border cursor-pointer hover:bg-accent"
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                        setWeeklyOffDays((prev) =>
                                            e.target.checked
                                                ? [...new Set([...prev, day.value])].sort((a, b) => a - b)
                                                : prev.filter((d) => d !== day.value)
                                        );
                                    }}
                                    aria-label={day.label}
                                />
                                {day.label}
                            </label>
                        );
                    })}
                </div>
                <button
                    type="button"
                    onClick={() => void handleWeeklySave()}
                    disabled={weeklySaving}
                    className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                    {weeklySaving ? "Menyimpan pola..." : "Simpan Pola Mingguan"}
                </button>
            </div>

            {holidays.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm border border-dashed border-border rounded-lg">
                    Belum ada hari libur khusus. Tambahkan tanggal atau rentang beserta alasannya.
                </p>
            ) : (
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tanggal (waktu Jakarta)</TableHead>
                                <TableHead>Alasan</TableHead>
                                <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {holidays.map((holiday) => (
                                <TableRow key={holiday.id}>
                                    <TableCell className="font-medium whitespace-nowrap">{holiday.wibDate}</TableCell>
                                    <TableCell>{holiday.description}</TableCell>
                                    <TableCell className="text-right">
                                        <button
                                            type="button"
                                            onClick={() => void handleDelete(holiday)}
                                            disabled={deletingId === holiday.id}
                                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                            title={`Hapus libur ${holiday.wibDate}`}
                                        >
                                            {deletingId === holiday.id ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-3.5 w-3.5" />
                                            )}
                                            Hapus
                                        </button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {showAddModal && (
                <AccessibleModal ariaLabel="Tambah Hari Libur" onClose={() => !saving && setShowAddModal(false)}>
                    <div className="modal-header !mb-4 pb-4 border-b border-[var(--border)]">
                        <div>
                            <h2 className="modal-title">Tambah Hari Libur</h2>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                Tanggal yang ditambahkan akan bebas paraf harian.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="modal-close"
                            onClick={() => setShowAddModal(false)}
                            disabled={saving}
                            aria-label="Tutup modal tambah libur"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-3">
                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="holiday-wibDate">
                                Tanggal (waktu Jakarta)
                            </label>
                            <input
                                id="holiday-wibDate"
                                type="date"
                                value={wibDate}
                                onChange={(e) => setWibDate(e.target.value)}
                                className="form-input"
                                required
                            />
                        </div>
                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="holiday-endDate">
                                Sampai (opsional)
                            </label>
                            <input
                                id="holiday-endDate"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="form-input"
                                min={wibDate || undefined}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Kosongkan untuk satu tanggal. Isi untuk rentang (maks 62 hari, tanggal sudah ada
                                dilewati).
                            </p>
                        </div>
                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="holiday-description">
                                Alasan libur
                            </label>
                            <input
                                id="holiday-description"
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="cth: Libur nasional Idul Fitri"
                                className="form-input"
                                required
                                minLength={3}
                            />
                        </div>
                        {!isFormValid && (
                            <p className="text-xs text-muted-foreground">
                                Pilih tanggal mulai, tanggal akhir tidak boleh lebih awal, alasan min. 3 huruf.
                            </p>
                        )}
                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => void handleAdd()}
                                disabled={!isFormValid || saving}
                                className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                            >
                                {saving ? "Menyimpan..." : "Simpan"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                disabled={saving}
                                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                            >
                                Batal
                            </button>
                        </div>
                    </div>
                </AccessibleModal>
            )}
        </div>
    );
}
