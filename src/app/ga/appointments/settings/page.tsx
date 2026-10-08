"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Pencil, Loader2, Trash2, X, BellRing } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmModal";
import FeedbackMessage from "@/components/ui/FeedbackMessage";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { getResponseErrorMessage, reportClientError } from "@/lib/clientErrors";

type Tab = "rooms" | "reminder";

interface Room {
    id: string;
    name: string;
    capacity: number | null;
    location: string | null;
    facilities: string | null;
    isActive: boolean;
}

export default function GaAppointmentSettingsPage() {
    const toast = useToast();
    const confirm = useConfirm();
    const [tab, setTab] = useState<Tab>("rooms");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchedRef = useRef(false);

    const [rooms, setRooms] = useState<Room[]>([]);
    const [roomName, setRoomName] = useState("");
    const [roomCapacity, setRoomCapacity] = useState("");
    const [roomLocation, setRoomLocation] = useState("");
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [savingRoom, setSavingRoom] = useState(false);

    const [offsets, setOffsets] = useState<number[]>([]);
    const [offsetsText, setOffsetsText] = useState("");
    const [savingOffsets, setSavingOffsets] = useState(false);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [roomsRes, reminderRes] = await Promise.all([
                fetch("/api/ga/meeting-rooms"),
                fetch("/api/ga/appointment-reminder"),
            ]);
            if (!roomsRes.ok) throw new Error(await getResponseErrorMessage(roomsRes, "Gagal memuat data ruang meeting."));
            const roomsJson = (await roomsRes.json()) as { data: Room[] };
            setRooms(Array.isArray(roomsJson.data) ? roomsJson.data : []);
            if (reminderRes.ok) {
                const reminderJson = (await reminderRes.json()) as { data: { offsets: number[] } };
                setOffsets(reminderJson.data.offsets);
                setOffsetsText(reminderJson.data.offsets.join(", "));
            }
        } catch (err) {
            reportClientError("GaAppointmentSettings", "Gagal memuat pengaturan", err);
            setError(err instanceof Error ? err.message : "Gagal memuat pengaturan.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;
        void fetchAll();
    }, [fetchAll]);

    async function handleSaveRoom(e: React.FormEvent) {
        e.preventDefault();
        if (savingRoom || !roomName.trim()) return;
        setSavingRoom(true);
        try {
            const res = await fetch("/api/ga/meeting-rooms", {
                method: editingRoom ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    editingRoom
                        ? { id: editingRoom.id, name: roomName.trim(), capacity: roomCapacity ? Number(roomCapacity) : null, location: roomLocation.trim() || null }
                        : { name: roomName.trim(), capacity: roomCapacity ? Number(roomCapacity) : null, location: roomLocation.trim() || null }
                ),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan data ruang meeting."));
            toast(editingRoom ? "Data ruang meeting berhasil diperbarui." : "Data ruang meeting berhasil ditambahkan.", "success");
            setRoomName("");
            setRoomCapacity("");
            setRoomLocation("");
            setEditingRoom(null);
            await fetchAll();
        } catch (err) {
            reportClientError("GaAppointmentSettings", "Gagal menyimpan data ruang rapat", err);
            toast(err instanceof Error ? err.message : "Gagal menyimpan data ruang meeting.", "error");
        } finally {
            setSavingRoom(false);
        }
    }

    async function handleToggleRoom(room: Room) {
        try {
            const res = await fetch("/api/ga/meeting-rooms", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: room.id, isActive: !room.isActive }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal mengubah status ruang meeting."));
            toast(room.isActive ? "Ruang meeting berhasil dinonaktifkan." : "Ruang meeting berhasil diaktifkan.", "success");
            await fetchAll();
        } catch (err) {
            reportClientError("GaAppointmentSettings", "Gagal mengubah status ruang rapat", err);
            toast(err instanceof Error ? err.message : "Gagal mengubah status ruang meeting.", "error");
        }
    }

    function handleDeleteRoom(room: Room) {
        confirm({
            title: "Hapus Ruang Meeting?",
            message: `Hapus ${room.name}? Hanya ruang meeting yang belum pernah digunakan yang dapat dihapus.`,
            confirmLabel: "Ya, Hapus Data",
            variant: "danger",
            onConfirm: () => {
                void (async () => {
                    try {
                        const res = await fetch(`/api/ga/meeting-rooms?id=${encodeURIComponent(room.id)}`, { method: "DELETE" });
                        if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menghapus data."));
                        toast("Ruang meeting berhasil dihapus.", "success");
                        await fetchAll();
                    } catch (err) {
                        reportClientError("GaAppointmentSettings", "Gagal menghapus ruang rapat", err);
                        toast(err instanceof Error ? err.message : "Gagal menghapus data.", "error");
                    }
                })();
            },
        });
    }

    async function handleSaveOffsets(e: React.FormEvent) {
        e.preventDefault();
        if (savingOffsets) return;
        const parsed = offsetsText.split(",").map((v) => Number(v.trim())).filter((v) => Number.isInteger(v) && v >= 15);
        if (parsed.length === 0 || parsed.length > 5) {
            toast("Masukkan 1–5 angka dalam satuan menit (minimal 15 menit), dipisahkan dengan koma. Contoh: 4320, 1440.", "error");
            return;
        }
        setSavingOffsets(true);
        try {
            const res = await fetch("/api/ga/appointment-reminder", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ offsets: parsed }),
            });
            if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Gagal menyimpan pengingat."));
            const json = (await res.json()) as { data: { offsets: number[] } };
            setOffsets(json.data.offsets);
            setOffsetsText(json.data.offsets.join(", "));
            toast("Pengaturan pengingat berhasil diperbarui dan berlaku untuk meeting baru.", "success");
        } catch (err) {
            reportClientError("GaAppointmentSettings", "Gagal simpan pengingat", err);
            toast(err instanceof Error ? err.message : "Gagal menyimpan.", "error");
        } finally {
            setSavingOffsets(false);
        }
    }

    if (loading) {
        return (
            <div className="card p-12 text-center">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--primary)] mx-auto" />
                <span className="sr-only">Memuat pengaturan</span>
            </div>
        );
    }

    return (
        <div className="w-full min-w-0 space-y-4">
            <div>
                <h1 className="text-lg font-extrabold text-[var(--text-primary)]">Ruang Meeting</h1>
                <p className="text-xs text-[var(--text-muted)]">Kelola data induk ruang meeting</p>
            </div>

            {error && (
                <FeedbackMessage variant="error" title="Gagal memuat">
                    {error}
                </FeedbackMessage>
            )}

            <div className="flex gap-1.5 border-b border-[var(--border)]">
                {([["rooms", "Ruang Meeting"], ["reminder", "Pengingat Otomatis"]] as [Tab, string][]).map(([key, label]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`px-4 py-2.5 text-sm font-semibold min-h-11 ${tab === key ? "border-b-2 border-[var(--primary)] text-[var(--primary)]" : "text-[var(--text-muted)]"}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === "rooms" && (
                <div className="space-y-4">
                    <form onSubmit={handleSaveRoom} className="card p-4 space-y-3">
                        <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                            {editingRoom ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            {editingRoom ? "Ubah Ruang Meeting" : "Tambah Ruang Meeting"}
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="form-group !mb-0">
                                <label className="form-label" htmlFor="room-name">Nama Ruangan *</label>
                                <input id="room-name" className="form-input" value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Contoh: Ruang Meeting Lantai 2 Gedung A" required />
                            </div>
                            <div className="form-group !mb-0">
                                <label className="form-label" htmlFor="room-cap">Kapasitas (orang)</label>
                                <input id="room-cap" type="number" min={1} className="form-input" value={roomCapacity} onChange={(e) => setRoomCapacity(e.target.value)} placeholder="Contoh: 10 orang" />
                            </div>
                        </div>
                        <div className="form-group !mb-0">
                            <label className="form-label" htmlFor="room-loc">Lokasi dan Lantai</label>
                            <input id="room-loc" className="form-input" value={roomLocation} onChange={(e) => setRoomLocation(e.target.value)} placeholder="Contoh: Gedung A Lantai 2" />
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" disabled={savingRoom || !roomName.trim()} className="btn btn-primary">
                                {savingRoom ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {savingRoom ? "Menyimpan…" : editingRoom ? "Simpan Perubahan" : "Tambahkan"}
                            </button>
                            {editingRoom && (
                                <button type="button" onClick={() => { setEditingRoom(null); setRoomName(""); setRoomCapacity(""); setRoomLocation(""); }} className="btn btn-secondary">
                                    <X className="w-4 h-4" /> Batalkan
                                </button>
                            )}
                        </div>
                    </form>

                    <div className="card overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nama Ruangan</TableHead>
                                    <TableHead>Kapasitas</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Tindakan</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rooms.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-[var(--text-muted)]">Belum ada data ruang meeting.</TableCell>
                                    </TableRow>
                                )}
                                {rooms.map((r) => (
                                    <TableRow key={r.id}>
                                        <TableCell>
                                            <span className="font-semibold">{r.name}</span>
                                            {r.location && <span className="block text-[11px] text-[var(--text-muted)]">{r.location}</span>}
                                        </TableCell>
                                        <TableCell>{r.capacity ?? "-"}</TableCell>
                                        <TableCell>
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                                                {r.isActive ? "Aktif" : "Nonaktif"}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="flex gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditingRoom(r); setRoomName(r.name); setRoomCapacity(r.capacity ? String(r.capacity) : ""); setRoomLocation(r.location ?? ""); }}
                                                    className="p-2 rounded-lg hover:bg-[var(--secondary)] min-w-9 min-h-9 flex items-center justify-center"
                                                    aria-label={`Edit ${r.name}`}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleRoom(r)}
                                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--secondary)] min-h-9"
                                                >
                                                    {r.isActive ? "Nonaktifkan" : "Aktifkan"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteRoom(r)}
                                                    className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 min-w-9 min-h-9 flex items-center justify-center"
                                                    aria-label={`Hapus ${r.name}`}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {tab === "reminder" && (
                <form onSubmit={handleSaveOffsets} className="card p-4 space-y-3">
                    <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <BellRing className="w-4 h-4" /> Pengingat Otomatis
                    </h2>
                    <p className="text-xs text-[var(--text-muted)]">
                        Pengaturan bawaan (diatur WIG002). Daftar waktu pengingat dalam satuan menit sebelum jadwal dimulai. Contoh: <span className="font-mono">4320, 1440</span> berarti 3 hari dan 1 hari sebelumnya. Berlaku hanya untuk meeting baru; pengingat yang telah terkirim tidak akan dikirim ulang.
                    </p>
                    <div className="form-group !mb-0">
                        <label className="form-label" htmlFor="reminder-offsets">Waktu Pengingat (menit, dipisahkan koma)</label>
                        <input id="reminder-offsets" className="form-input font-mono" value={offsetsText} onChange={(e) => setOffsetsText(e.target.value)} placeholder="Contoh: 1440, 4320" />
                    </div>
                    {offsets.length > 0 && (
                        <p className="text-xs text-[var(--text-secondary)]">Pengingat aktif: {offsets.map((o) => (o >= 1440 ? `H-${Math.round(o / 1440)}` : `${o} menit`)).join(", ")}</p>
                    )}
                    <button type="submit" disabled={savingOffsets} className="btn btn-primary">
                        {savingOffsets ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {savingOffsets ? "Menyimpan…" : "Simpan Pengingat"}
                    </button>
                </form>
            )}
        </div>
    );
}
